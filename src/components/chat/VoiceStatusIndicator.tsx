import { VoiceStatus } from "@/hooks/use-voice";
import { Mic, Loader2, Send, MicOff, AlertCircle } from "lucide-react";

type Props = {
  status: VoiceStatus;
  transcript: string;
  onCancel: () => void;
  onConfirm?: () => void;
};

export function VoiceStatusIndicator({ status, transcript, onCancel, onConfirm }: Props) {
  if (status === "idle") return null;

  const configs: Record<VoiceStatus, { color: string; bg: string; border: string; icon: React.ReactNode; label: string } | null> = {
    idle: null,
    listening: {
      color: "text-red-200",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      icon: (
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full size-2.5 bg-red-500" />
        </span>
      ),
      label: "Listening… speak now.",
    },
    finalizing: {
      color: "text-yellow-200",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      icon: <Loader2 className="size-3.5 animate-spin text-yellow-400" />,
      label: "Finalizing transcript…",
    },
    sending: {
      color: "text-blue-200",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      icon: <Send className="size-3.5 text-blue-400" />,
      label: "Sending…",
    },
    error: {
      color: "text-orange-200",
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      icon: <AlertCircle className="size-3.5 text-orange-400" />,
      label: "Recognition error — tap mic to retry.",
    },
    denied: {
      color: "text-muted-foreground",
      bg: "bg-card/60",
      border: "border-border/60",
      icon: <MicOff className="size-3.5 text-muted-foreground" />,
      label: "Microphone access denied. Click reinitialize below.",
    },
  };

  const cfg = configs[status];
  if (!cfg) return null;

  return (
    <div className={`mb-2 flex items-center gap-3 rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-2.5 text-[13px] ${cfg.color} animate-fadeInUp`}>
      {cfg.icon}
      <div className="flex-1 min-w-0">
        <div className="font-medium">{cfg.label}</div>
        {transcript && (
          <div className="mt-0.5 text-[12px] opacity-80 truncate">"{transcript}"</div>
        )}
      </div>
      {onConfirm && (status === "finalizing") && transcript && (
        <button
          type="button"
          onClick={onConfirm}
          className="shrink-0 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-xs font-medium transition-colors"
        >
          Confirm
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 text-xs opacity-70 hover:opacity-100 underline-offset-2 hover:underline transition-opacity"
      >
        {status === "listening" ? "Cancel" : status === "finalizing" ? "Discard" : "Dismiss"}
      </button>
    </div>
  );
}
