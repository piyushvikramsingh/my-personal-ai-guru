import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "checking" | "ready" | "error";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      setStatus("checking");
      setErr(null);
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user?.id) {
          setUserId(data.session.user.id);
          setStatus("ready");
        } else {
          const { data: anon, error } = await supabase.auth.signInAnonymously();
          if (cancelled) return;
          if (error || !anon.session) {
            setErr(error?.message ?? "Could not start a guest session.");
            setStatus("error");
            return;
          }
          setUserId(anon.session.user.id);
          setStatus("ready");
        }
        const sub = supabase.auth.onAuthStateChange((_e, s) => {
          setUserId(s?.user?.id ?? null);
        });
        unsub = () => sub.data.subscription.unsubscribe();
      } catch (e: any) {
        if (!cancelled) { setErr(e?.message ?? "Auth init failed"); setStatus("error"); }
      }
    })();

    return () => { cancelled = true; unsub?.(); };
  }, [attempt]);

  if (status === "ready" && userId) return <>{children}</>;

  return (
    <div className="h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4 max-w-sm">
        <div className="size-14 mx-auto rounded-2xl bg-white flex items-center justify-center shadow-md">
          <Sparkles className="size-7 text-black" />
        </div>
        {status === "checking" ? (
          <>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Starting your secure session…
            </div>
            <p className="text-xs text-muted-foreground">This takes a moment on first load.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-destructive">{err}</p>
            <Button onClick={() => setAttempt((n) => n + 1)} variant="outline">Retry</Button>
            <p className="text-xs text-muted-foreground">
              If this keeps failing, anonymous sign-in may be disabled in Lovable Cloud.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
