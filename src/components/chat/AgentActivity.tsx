import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentStep =
  | { kind: "tool_call"; id: string; name: string; args: unknown; status: "running" }
  | { kind: "tool_result"; id: string; name: string; args: unknown; status: "ok" | "error"; preview: string };

export type AgentActivityState = {
  steps: AgentStep[];
};

function shorten(s: string, n = 200): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export function AgentActivity({ state }: { state: AgentActivityState }) {
  const [open, setOpen] = useState(false);
  if (!state.steps.length) return null;
  const total = state.steps.length;
  const running = state.steps.some((s) => s.status === "running");

  return (
    <div className="mb-2 rounded-lg border border-border/60 bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5" />
        <span className="font-medium">Agent activity</span>
        <span className="text-muted-foreground/70">· {total} step{total === 1 ? "" : "s"}</span>
        {running && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-border/40 px-3 py-2">
          {state.steps.map((s, i) => (
            <li key={s.id + "-" + i} className="flex gap-2">
              <span className="mt-0.5">
                {s.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                {s.status === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                {s.status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-foreground">{s.name}</div>
                <div className={cn("font-mono break-all text-muted-foreground/80")}>
                  args: {shorten(JSON.stringify(s.args ?? {}))}
                </div>
                {s.kind === "tool_result" && (
                  <div className="font-mono break-all text-muted-foreground/80">
                    → {shorten(s.preview, 280)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
