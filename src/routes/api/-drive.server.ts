import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function headers() {
  const lk = process.env.LOVABLE_API_KEY;
  const dk = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk) throw new Error("LOVABLE_API_KEY missing");
  if (!dk) throw new Error("GOOGLE_DRIVE_API_KEY missing — connect Google Drive");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": dk };
}

export const listDriveFiles = createServerFn({ method: "POST" })
  .inputValidator((d: { query?: string }) => z.object({ query: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      pageSize: "30",
      fields: "files(id,name,mimeType,size,modifiedTime,iconLink)",
      orderBy: "modifiedTime desc",
      q: `trashed=false${data.query ? ` and name contains '${data.query.replace(/'/g, "\\'")}'` : ""}`,
    });
    const res = await fetch(`${GATEWAY}/files?${params}`, { headers: headers() });
    if (!res.ok) {
      const t = await res.text();
      console.error("Drive list error", res.status, t);
      return { files: [] as any[], error: `Drive error (${res.status})` };
    }
    const json = await res.json();
    return { files: json.files ?? [], error: null };
  });

export const fetchDriveFile = createServerFn({ method: "POST" })
  .inputValidator((d: { fileId: string }) =>
    z.object({ fileId: z.string().min(1).max(200) }).parse(d)
  )
  .handler(async ({ data }) => {
    // Get metadata
    const metaRes = await fetch(`${GATEWAY}/files/${data.fileId}?fields=id,name,mimeType,size`, { headers: headers() });
    if (!metaRes.ok) return { error: `Failed to fetch file metadata (${metaRes.status})` } as const;
    const meta = await metaRes.json();

    // Google Workspace docs need export
    const exportMap: Record<string, string> = {
      "application/vnd.google-apps.document": "text/plain",
      "application/vnd.google-apps.spreadsheet": "text/csv",
      "application/vnd.google-apps.presentation": "text/plain",
    };
    const isGDoc = !!exportMap[meta.mimeType];
    const url = isGDoc
      ? `${GATEWAY}/files/${data.fileId}/export?mimeType=${encodeURIComponent(exportMap[meta.mimeType])}`
      : `${GATEWAY}/files/${data.fileId}?alt=media`;

    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return { error: `Failed to download (${res.status})` } as const;

    const finalMime = isGDoc ? exportMap[meta.mimeType] : meta.mimeType;
    const buf = new Uint8Array(await res.arrayBuffer());

    // Cap size at 8MB
    if (buf.byteLength > 8 * 1024 * 1024) return { error: "File too large (>8MB)" } as const;

    const isText = finalMime.startsWith("text/") || finalMime === "application/json" || finalMime === "application/xml";
    if (isText) {
      return {
        name: meta.name,
        mime: finalMime,
        text: new TextDecoder().decode(buf),
      } as const;
    }
    // base64
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    return {
      name: meta.name,
      mime: finalMime,
      dataUrl: `data:${finalMime};base64,${b64}`,
    } as const;
  });
