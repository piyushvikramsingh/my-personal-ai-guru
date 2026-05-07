import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Edit3 } from "lucide-react";

type Props = {
  transcript: string;
  onConfirm: (text: string) => void;
  onDiscard: () => void;
  autoSendMs?: number | null;
};

export function TranscriptPreview({ transcript, onConfirm, onDiscard, autoSendMs }: Props) {
  const [edited, setEdited] = useState(transcript);
  const [countdown, setCountdown] = useState<number | null>(autoSendMs ? Math.ceil(autoSendMs / 1000) : null);

  useEffect(() => {
    setEdited(transcript);
  }, [transcript]);

  useEffect(() => {
    if (autoSendMs == null || autoSendMs <= 0) return;
    let ms = autoSendMs;
    setCountdown(Math.ceil(ms / 1000));
    const interval = setInterval(() => {
      ms -= 1000;
      if (ms <= 0) {
        clearInterval(interval);
        setCountdown(null);
        onConfirm(edited);
      } else {
        setCountdown(Math.ceil(ms / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [autoSendMs]);

  return (
    <div className="mb-2 rounded-xl border border-white/20 bg-card/80 p-3 animate-fadeInUp backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <Edit3 className="size-3.5 text-muted-foreground" />
        <span className="text-[12px] uppercase tracking-widest text-muted-foreground font-medium">Transcript preview</span>
        {countdown != null && (
          <span className="ml-auto text-[11px] text-muted-foreground">Auto-sending in {countdown}s…</span>
        )}
      </div>
      <Textarea
        value={edited}
        onChange={(e) => setEdited(e.target.value)}
        rows={2}
        className="bg-transparent border-white/10 text-sm resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="Your transcript…"
      />
      <div className="mt-2 flex gap-2 justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={onDiscard}
          className="gap-1.5 text-muted-foreground hover:text-red-400 h-8 text-xs"
        >
          <XCircle className="size-3.5" /> Discard
        </Button>
        <Button
          size="sm"
          onClick={() => onConfirm(edited)}
          className="gap-1.5 bg-white text-black hover:bg-neutral-200 h-8 text-xs"
        >
          <CheckCircle className="size-3.5" /> Send
        </Button>
      </div>
    </div>
  );
}
