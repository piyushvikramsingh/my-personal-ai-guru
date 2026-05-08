import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/" });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // If the session was created immediately (auto-confirmed), navigate to chat
        if (data.session) {
          nav({ to: "/" });
        } else {
          // Otherwise, show the confirmation message
          toast.success("Check your email to confirm your account.");
          // Auto-switch to sign-in mode after successful signup for smoother UX
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Wait briefly for the session to be persisted before navigating
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          nav({ to: "/" });
        } else {
          throw new Error("Session not established after sign-in");
        }
      }
    } catch (err: any) {
      let errorMsg = err.message ?? "Authentication failed";
      // Provide helpful guidance for common errors
      if (errorMsg.includes("CORS") || errorMsg.includes("Failed to fetch")) {
        errorMsg = "Authentication service unreachable. Ensure your Supabase project is configured with your domain in Authentication → URL Configuration.";
      }
      toast.error(errorMsg);
    } finally { setLoading(false); }
  };

  const google = async () => {
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="size-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Sparkles className="size-5 text-primary" />
          </div>
          <span className="text-xl font-semibold tracking-tight">void</span>
        </Link>
        <div className="rounded-2xl border bg-card p-7 shadow-xl">
          <h1 className="text-2xl font-semibold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-muted-foreground mt-1">Your personal AI, with files & memory.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px bg-border flex-1" /> OR <div className="h-px bg-border flex-1" />
          </div>

          <Button variant="outline" type="button" className="w-full" onClick={google}>
            Continue with Google
          </Button>

          <p className="text-sm text-center text-muted-foreground mt-6">
            {mode === "signin" ? "No account?" : "Have an account?"}{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin") }>
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
