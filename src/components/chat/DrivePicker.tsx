import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { listDriveFiles, fetchDriveFile } from "@/routes/api/-drive.server";
import { iconFor, type LocalAttachment } from "./Attachments";
import { Loader2, FolderOpen } from "lucide-react";
import { toast } from "sonner";

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string };

export function DrivePickerDialog({
  open, onOpenChange, onPick,
}: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (a: LocalAttachment) => void }) {
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  const list = useServerFn(listDriveFiles);
  const get = useServerFn(fetchDriveFile);

  const refresh = async (query: string) => {
    setLoading(true);
    try {
      const r = await list({ data: { query: query || undefined } });
      if (r.error) toast.error(r.error);
      setFiles(r.files);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) refresh(""); /* eslint-disable-next-line */ }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderOpen className="size-4 text-primary" /> Pick from Google Drive</DialogTitle>
          <DialogDescription>Browse and import any file from your connected Drive.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e)=>{e.preventDefault(); refresh(q);}} className="flex gap-2">
          <Input placeholder="Search by name…" value={q} onChange={e=>setQ(e.target.value)} />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          {loading && <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="size-4 inline animate-spin mr-2" />Loading…</div>}
          {!loading && files.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No files.</div>}
          {!loading && files.map((f) => {
            const Icon = iconFor(f.mimeType);
            return (
              <button
                key={f.id}
                disabled={fetchingId === f.id}
                onClick={async () => {
                  setFetchingId(f.id);
                  try {
                    const r = await get({ data: { fileId: f.id } });
                    if ("error" in r && r.error) { toast.error(r.error); return; }
                    onPick({
                      name: r.name, mime: r.mime, size: 0,
                      text: (r as any).text, dataUrl: (r as any).dataUrl,
                      source: "drive",
                    });
                    onOpenChange(false);
                    toast.success(`Added ${r.name}`);
                  } finally { setFetchingId(null); }
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent text-left text-sm border-b last:border-b-0 disabled:opacity-50"
              >
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                {fetchingId === f.id && <Loader2 className="size-3.5 animate-spin" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
