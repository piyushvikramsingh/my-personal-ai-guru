import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bug, X, RefreshCw } from "lucide-react";

export type DebugInfo = {
  lastStatus?: number;
  lastError?: string | null;
  lastConversationId?: string | null;
  lastCitations?: any[];
  lastSentAt?: string;
};

export function DebugPanel({ debug }: { debug: DebugInfo }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [rls, setRls] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const sub = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const runRlsCheck = async () => {
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const r = await fetch("/api/rls-check", { headers: { Authorization: `Bearer ${token ?? ""}` } });
      setRls(await r.json());
    } catch (e: any) {
      setRls({ error: e?.message ?? "request failed" });
    } finally { setLoading(false); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-50 rounded-full bg-black border border-white/40 text-white shadow-lg p-2 hover:scale-105 transition"
        title="Open debug panel"
      >
        <Bug className="size-4" />
      </button>
    );
  }

  const userId = session?.user?.id ?? null;
  const isAnon = (session?.user as any)?.is_anonymous ?? null;

  return (
    <div className="fixed bottom-3 right-3 z-50 w-[360px] max-h-[80vh] overflow-auto rounded-xl border border-white/20 bg-black/95 text-white shadow-2xl text-xs">
      <div className="sticky top-0 flex items-center justify-between p-3 border-b border-white/10 bg-black/95">
        <div className="flex items-center gap-2 font-semibold"><Bug className="size-3.5" /> Debug</div>
        <div className="flex items-center gap-1">
          <button onClick={runRlsCheck} className="p-1 hover:bg-white/10 rounded" title="Run RLS check">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-3 font-mono">
        <Section title="Session">
          <Row k="userId" v={userId ?? "—"} />
          <Row k="email" v={session?.user?.email ?? "—"} />
          <Row k="anonymous" v={String(isAnon)} />
          <Row k="hasToken" v={String(!!session?.access_token)} />
        </Section>

        <Section title="Last chat request">
          <Row k="status" v={String(debug.lastStatus ?? "—")} />
          <Row k="conversationId" v={debug.lastConversationId ?? "—"} />
          <Row k="sentAt" v={debug.lastSentAt ?? "—"} />
          <Row k="citations" v={String(debug.lastCitations?.length ?? 0)} />
          {debug.lastError && (
            <pre className="mt-1 p-2 bg-red-950/50 border border-red-800/40 rounded whitespace-pre-wrap text-red-300">
              {debug.lastError}
            </pre>
          )}
        </Section>

        <Section title="RLS probe">
          {!rls ? <p className="text-white/50">Click ↻ to test conversation/message/document inserts.</p> : (
            <pre className="p-2 bg-white/5 rounded whitespace-pre-wrap break-all">{JSON.stringify(rls, null, 2)}</pre>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-white/50 w-28 shrink-0">{k}</span>
      <span className="text-white break-all">{v}</span>
    </div>
  );
}
