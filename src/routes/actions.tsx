import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/components/chat/AuthGate";
import { PageShell } from "@/components/NavRail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Trash2, Inbox } from "lucide-react";
import { listActions, setActionStatus, deleteAction } from "@/lib/actions.functions";
import { toast } from "sonner";

function ActionsPage() {
  const list = useServerFn(listActions);
  const setStatus = useServerFn(setActionStatus);
  const del = useServerFn(deleteAction);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["agent_actions"],
    queryFn: () => list(),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" | "done" }) =>
      setStatus({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agent_actions"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agent_actions"] }); },
  });

  const actions = data?.actions ?? [];
  const pending = actions.filter((a: any) => a.status === "pending");
  const done = actions.filter((a: any) => a.status !== "pending");

  return (
    <PageShell title="Action Inbox" subtitle="Proposed actions from your agent. Approve to act, reject to dismiss.">
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : actions.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Inbox className="size-10 mx-auto mb-3 opacity-40" />
          <p>No actions yet. When your agent proposes something, it'll land here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Pending</h2>
              <div className="space-y-3">
                {pending.map((a: any) => (
                  <div key={a.id} className="border border-border rounded-lg p-4 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] uppercase">{a.kind}</Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(a.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-medium">{a.title}</p>
                        {a.details && Object.keys(a.details).length > 0 && (
                          <pre className="mt-2 text-xs text-muted-foreground bg-background/50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(a.details, null, 2)}
                          </pre>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="default"
                          onClick={() => update.mutate({ id: a.id, status: "approved" }, {
                            onSuccess: () => toast.success("Approved")
                          })}>
                          <Check className="size-4" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => update.mutate({ id: a.id, status: "rejected" })}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">History</h2>
              <div className="space-y-2">
                {done.map((a: any) => (
                  <div key={a.id} className="border border-border/50 rounded p-3 flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary" className="text-[10px]">{a.status}</Badge>
                      <span className="truncate">{a.title}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}

export const Route = createFileRoute("/actions")({
  component: () => <AuthGate><ActionsPage /></AuthGate>,
});
