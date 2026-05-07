import { useState } from "react";
import { speakMessage, pauseTTS, resumeTTS, stopTTS, useTTSState, getTTSSpeed, setTTSSpeed } from "@/hooks/use-voice";
import { Play, Pause, Square, Volume2 } from "lucide-react";

type Props = {
  msgId: string;
  content: string;
  className?: string;
};

export function MessageTTS({ msgId, content, className = "" }: Props) {
  const { isActive, speaking, paused } = useTTSState(msgId);
  const [speed, setSpeedState] = useState(getTTSSpeed());
  const [showSpeed, setShowSpeed] = useState(false);

  const handleSpeedChange = (v: number) => {
    setSpeedState(v);
    setTTSSpeed(v);
    if (isActive) {
      stopTTS();
      speakMessage(msgId, content, v);
    }
  };

  const handlePlay = () => {
    if (isActive && speaking) {
      pauseTTS();
    } else if (isActive && paused) {
      resumeTTS();
    } else {
      speakMessage(msgId, content, speed);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        title={isActive && speaking ? "Pause" : isActive && paused ? "Resume" : "Read aloud"}
        onClick={handlePlay}
        className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
      >
        {isActive && speaking ? (
          <Pause className="size-3.5" />
        ) : isActive && paused ? (
          <Play className="size-3.5 text-yellow-400" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
      </button>

      {isActive && (
        <button
          title="Stop"
          onClick={stopTTS}
          className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Square className="size-3.5" />
        </button>
      )}

      <button
        title="Speed"
        onClick={() => setShowSpeed((v) => !v)}
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
          showSpeed ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white hover:bg-white/5"
        }`}
      >
        {speed.toFixed(1)}×
      </button>

      {showSpeed && (
        <div className="flex items-center gap-1 bg-card border border-border/60 rounded-lg px-2 py-1">
          {[0.7, 1.0, 1.25, 1.5, 1.75, 2.0].map((s) => (
            <button
              key={s}
              onClick={() => { handleSpeedChange(s); setShowSpeed(false); }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                Math.abs(speed - s) < 0.05
                  ? "bg-white text-black"
                  : "text-muted-foreground hover:text-white hover:bg-white/10"
              }`}
            >
              {s.toFixed(1)}×
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
