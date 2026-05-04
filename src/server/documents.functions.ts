import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_BYTES = 8 * 1024 * 1024;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 180;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return out;
}

async function extractTextFromDataUrl(name: string, mime: string, dataUrl: string): Promise<string> {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.byteLength > MAX_BYTES) throw new Error(`${name} exceeds 8MB`);

  if (mime === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : String(text ?? "");
  }
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    return new TextDecoder().decode(bytes);
  }
  if (mime.startsWith("image/")) {
    return `[Image file ${name} attached. Vision analysis is handled inline by the chat model.]`;
  }
  return new TextDecoder().decode(bytes);
}

async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || texts.length === 0) return texts.map(() => null);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: texts }),
    });
    if (!res.ok) {
      console.warn("Embeddings unavailable", res.status, await res.text().catch(() => ""));
      return texts.map(() => null);
    }
    const json = await res.json();
    return (json.data ?? []).map((d: any) => d.embedding ?? null);
  } catch (e) {
    console.warn("Embeddings failed", e);
    return texts.map(() => null);
  }
}

export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string; mime: string; size?: number; source?: "local" | "drive";
    dataUrl?: string; text?: string; conversationId?: string | null;
  }) => z.object({
    name: z.string().min(1).max(300),
    mime: z.string().min(1).max(200),
    size: z.number().int().min(0).max(MAX_BYTES).optional(),
    source: z.enum(["local", "drive"]).optional(),
    dataUrl: z.string().max(20_000_000).optional(),
    text: z.string().max(2_000_000).optional(),
    conversationId: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .insert({
        user_id: userId,
        conversation_id: data.conversationId ?? null,
        name: data.name,
        mime: data.mime,
        size: data.size ?? 0,
        source: data.source ?? "local",
        status: "processing",
      })
      .select("id")
      .single();
    if (docErr || !doc) throw new Error(docErr?.message || "Failed to create document");

    try {
      let raw = data.text ?? "";
      if (!raw && data.dataUrl) raw = await extractTextFromDataUrl(data.name, data.mime, data.dataUrl);
      const chunks = chunkText(raw);
      if (chunks.length === 0) {
        await supabaseAdmin.from("documents").update({ status: "ready", error: "No text extracted" }).eq("id", doc.id);
        return { documentId: doc.id, chunkCount: 0, status: "ready" as const };
      }

      const embeddings = await embedTexts(chunks);
      const rows = chunks.map((content, i) => ({
        document_id: doc.id,
        user_id: userId,
        chunk_index: i,
        content,
        embedding: embeddings[i] as any,
      }));
      for (let i = 0; i < rows.length; i += 50) {
        const slice = rows.slice(i, i + 50);
        const { error } = await supabaseAdmin.from("document_chunks").insert(slice);
        if (error) throw new Error(error.message);
      }
      await supabaseAdmin.from("documents").update({ status: "ready" }).eq("id", doc.id);
      return { documentId: doc.id, chunkCount: chunks.length, status: "ready" as const };
    } catch (e: any) {
      await supabaseAdmin.from("documents").update({ status: "error", error: e?.message ?? "ingest failed" }).eq("id", doc.id);
      throw e;
    }
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId?: string | null }) =>
    z.object({ conversationId: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("documents").select("id,name,mime,size,status,error,created_at,conversation_id")
      .order("created_at", { ascending: false });
    if (data.conversationId) q = q.eq("conversation_id", data.conversationId);
    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);
    return { documents: docs ?? [] };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
