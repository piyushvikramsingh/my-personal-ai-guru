import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/NavRail";
import { AuthGate } from "@/components/chat/AuthGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyMemory, updateMyMemory } from "@/lib/memory.functions";
import { Brain, Plus, X } from "lucide-react";

export const Route = createFileRoute("/memory")({
  head: () => ({ meta: [{ title: "Memory — void" }] }),
  component: () => (<AuthGate><MemoryPage /></AuthGate>),
});

function MemoryPage() {
  const get = useServerFn(getMyMemory);
  const update = useServerFn(updateMyMemory);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["memory"], queryFn: () => get() });
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const save = useMutation({
    mutationFn: (prefs: Record<string, unknown>) => update({ data: { preferences: prefs } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory"] }),
  });

  const prefs = (q.data?.preferences ?? {}) as Record<string, unknown>;
  const entries = Object.entries(prefs);

  const addPref = () => {
    if (!newKey.trim()) return;
    save.mutate({ ...prefs, [newKey.trim()]: newVal.trim() || true });
    setNewKey(""); setNewVal("");
  };

  const removePref = (k: string) => {
    const { [k]: _, ...rest } = prefs;
    save.mutate(rest);
  };

  return (
    <PageShell title="Memory" subtitle="What void remembers about you. Edit, add, or forget anything.">
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
        <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
          <Brain className="size-4" /> Preferences
        </div>

        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!q.isLoading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground mb-4">No memories yet. void will remember things as you chat, or add one below.</p>
        )}

        <ul className="space-y-2 mb-6">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium font-mono">{k}</div>
                <div className="text-xs text-muted-foreground break-all">{typeof v === "string" ? v : JSON.stringify(v)}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removePref(k)} disabled={save.isPending}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="border-t border-border/40 pt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Add a memory</div>
          <div className="flex gap-2">
            <Input placeholder="key (e.g. timezone)" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="flex-1" />
            <Input placeholder="value (e.g. America/New_York)" value={newVal} onChange={(e) => setNewVal(e.target.value)} className="flex-1" />
            <Button onClick={addPref} disabled={!newKey.trim() || save.isPending}>
              <Plus className="size-4 mr-1" /> Add
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
