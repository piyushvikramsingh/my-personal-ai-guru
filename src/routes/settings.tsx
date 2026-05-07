import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/NavRail";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MODELS, DEFAULT_SYSTEM_PROMPT, loadSettings, type VoidSettings } from "@/components/chat/Settings";
import { getAutoSpeak, setAutoSpeak } from "@/hooks/use-voice";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — void" },
      { name: "description", content: "Pick your model, tune void's personality, and toggle voice." },
    ],
  }),
  component: SettingsPage,
});

const KEY = "void.settings.v1";

const TEMPLATES = [
  { name: "Default", prompt: DEFAULT_SYSTEM_PROMPT },
  { name: "Code Reviewer", prompt: "You are a senior software engineer. Review code for bugs, security, performance, and clarity. Suggest concrete fixes with code snippets." },
  { name: "Socratic Tutor", prompt: "You are a Socratic tutor. Ask guiding questions, never give the answer immediately. Adapt to the learner's level." },
  { name: "Concise Analyst", prompt: "You are a concise analyst. Always answer in tight bullet points. End with a one-line takeaway." },
];

function SettingsPage() {
  const [s, setS] = useState<VoidSettings>(() => loadSettings());
  const [autoSpeakOn, setAutoSpeakOn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => { setAutoSpeakOn(getAutoSpeak()); }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
  }, []);

  function save() {
    localStorage.setItem(KEY, JSON.stringify(s));
    setAutoSpeak(autoSpeakOn);
    toast.success("Saved");
  }

  return (
    <PageShell title="Settings" subtitle="Tune void to fit you.">
      <div className="space-y-8">
        <Section title="Model">
          <Select value={s.model} onValueChange={(v) => setS({ ...s, model: v })}>
            <SelectTrigger className="bg-card max-w-md"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="mt-2 text-[12px] text-muted-foreground">Llama 3.1 via OpenRouter is coming once you add the API key.</p>
        </Section>

        <Section title="System prompt">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => setS({ ...s, systemPrompt: t.prompt })}
                className="text-[11px] px-2.5 py-1 rounded-md border border-border bg-card hover:bg-white hover:text-black transition-colors">
                {t.name}
              </button>
            ))}
          </div>
          <Textarea value={s.systemPrompt} onChange={(e) => setS({ ...s, systemPrompt: e.target.value })}
            rows={8} className="bg-card resize-none text-sm font-mono" />
        </Section>

        <Section title="Voice">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card/40">
            <div>
              <div className="text-[14px] font-medium">Speak replies aloud</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">When on, void reads each response using your browser voice.</div>
            </div>
            <Switch checked={autoSpeakOn} onCheckedChange={setAutoSpeakOn} />
          </div>
        </Section>

        <Section title="Account">
          <div className="text-[13px] text-muted-foreground">Signed in as <span className="text-white">{email ?? "—"}</span></div>
          <Button variant="outline" className="mt-3" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}>
            Sign out
          </Button>
        </Section>

        <div>
          <Button onClick={save} className="bg-white text-black hover:bg-neutral-200">Save changes</Button>
        </div>
      </div>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-3">{title}</h2>
      {children}
    </section>
  );
}
