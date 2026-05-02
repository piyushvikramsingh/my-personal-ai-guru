import { Paperclip, X, FileText, Image as ImageIcon, FileCode, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef } from "react";
import { toast } from "sonner";

export type LocalAttachment = {
  name: string;
  mime: string;
  size: number;
  dataUrl?: string;
  text?: string;
  source: "local" | "drive";
};

const MAX_BYTES = 8 * 1024 * 1024;

export async function readFileToAttachment(file: File): Promise<LocalAttachment> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 8MB.`);
  const mime = file.type || "application/octet-stream";
  const isText =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    /\.(md|txt|csv|tsv|json|ya?ml|toml|ini|log|js|jsx|ts|tsx|py|rb|go|rs|java|c|cc|cpp|h|hpp|cs|php|sh|sql|html|css)$/i.test(file.name);
  if (isText) {
    const text = await file.text();
    return { name: file.name, mime, size: file.size, text, source: "local" };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const dataUrl = `data:${mime};base64,${btoa(bin)}`;
  return { name: file.name, mime, size: file.size, dataUrl, source: "local" };
}

export function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("text/") || mime === "application/json") return FileCode;
  if (mime === "application/pdf") return FileText;
  return File;
}

export function AttachmentChip({ a, onRemove }: { a: LocalAttachment; onRemove?: () => void }) {
  const Icon = iconFor(a.mime);
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border bg-secondary px-2.5 py-1.5 text-xs max-w-[220px]">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <span className="truncate" title={a.name}>{a.name}</span>
      {a.source === "drive" && <span className="text-[10px] text-primary/80">Drive</span>}
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export function FilePicker({ onPick }: { onPick: (a: LocalAttachment) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.txt,.md,.csv,.json,.tsv,.yml,.yaml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.cc,.cpp,.h,.hpp,.cs,.php,.sh,.sql,.log,.xml,.toml,.ini"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          for (const f of files) {
            try { onPick(await readFileToAttachment(f)); }
            catch (err: any) { toast.error(err.message ?? "Failed to read file"); }
          }
          if (ref.current) ref.current.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        type="button"
        onClick={() => ref.current?.click()}
        title="Attach files"
      >
        <Paperclip className="size-4" />
      </Button>
    </>
  );
}
