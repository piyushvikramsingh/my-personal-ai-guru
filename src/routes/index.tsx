import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const nav = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/chat" });
      else nav({ to: "/auth" });
    });
  }, [nav]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      <div className="flex items-center gap-3">
        <Sparkles className="size-5 text-primary animate-pulse" />
        <span>Loading Nova…</span>
      </div>
    </div>
  );
}
