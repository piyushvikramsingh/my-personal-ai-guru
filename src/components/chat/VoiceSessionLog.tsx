import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getVoiceSessions, clearVoiceSessions, type VoiceSession } from "@/hooks/use-voice";
import { History, CheckCircle, XCircle, MinusCircle, Trash2 } from "lucide-react";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function duration(start: string, end: string): string {
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return `${(ms / 1000).toFixed(1)}s`;
  } catch {
    return "";
  }
}

const statusIcon = {
  success: <CheckCircle className="size-3.5 text-green-400 shrink-0" />,
  failure: <XCircle className="size-3.5 text-red-400 shrink-0" />,
  cancelled: <MinusCircle className="size-3.5 text-muted-foreground shrink-0" />,
};

export function VoiceSessionLog() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [, refresh] = useState(0);

  const load = () => setSessions(getVoiceSessions());

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Voice session log"
          className="size-8 hover:bg-white/5 text-muted-foreground hover:text-white"
        >
          <History className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Voice Session Log</span>
            {sessions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-red-400 h-7 text-xs"
                onClick={() => { clearVoiceSessions(); setSessions([]); refresh((n) => n + 1); }}
              >
                <Trash2 className="size-3" /> Clear
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[420px]">
          {sessions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">No sessions recorded yet.</p>
          ) : (
            <div className="space-y-2 pr-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    {statusIcon[s.status]}
                    <span className="text-[12px] font-medium capitalize text-white/80">{s.status}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {formatDate(s.startedAt)} · {formatTime(s.startedAt)} · {duration(s.startedAt, s.endedAt)}
                    </span>
                  </div>
                  {s.transcript ? (
                    <p className="text-[13px] text-muted-foreground leading-relaxed pl-5">
                      "{s.transcript}"
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted-foreground/60 pl-5 italic">No transcript</p>
                  )}
                  {s.error && (
                    <p className="text-[11px] text-red-400 pl-5">Error: {s.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
