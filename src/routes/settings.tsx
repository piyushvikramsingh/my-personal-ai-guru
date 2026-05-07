import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/NavRail";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MODELS, DEFAULT_SYSTEM_PROMPT, loadSettings, type VoidSettings } from "@/components/chat/Settings";
import { getAutoSpeak, setAutoSpeak, getVoiceHotkey, setVoiceHotkey, getTTSSpeed, setTTSSpeed } from "@/hooks/use-voice";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getIntegrations, removeIntegration, notifyIntegrationChange,
  type IntegrationId, type IntegrationsStore,
} from "@/lib/integrations-store";
import { Mail, Calendar, MessageCircle, Send, Unlink, Keyboard, Volume2 } from "lucide-react";

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

const INTEGRATION_META: Record<IntegrationId, { name: string; icon: React.ElementType; color: string }> = {
  gmail: { name: "Gmail", icon: Mail, color: "text-red-400" },
  google_calendar: { name: "Google Calendar", icon: Calendar, color: "text-blue-400" },
  slack: { name: "Slack", icon: MessageCircle, color: "text-purple-400" },
  telegram: { name: "Telegram", icon: Send, color: "text-sky-400" },
};

const SPEED_OPTIONS = [0.7, 0.85, 1.0, 1.25, 1.5, 1.75, 2.0];

function SettingsPage() {
  const [s, setS] = useState<VoidSettings>({ model: "google/gemini-2.5-pro", systemPrompt: "" });
  const [autoSpeakOn, setAutoSpeakOn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsStore>({ gmail: null, google_calendar: null, slack: null, telegram: null });
  const [hotkey, setHotkeyState] = useState(" ");
  const [recordingKey, setRecordingKey] = useState(false);
  const [ttsSpeed, setTTSSpeedState] = useState(1.05);

  useEffect(() => {
    setS(loadSettings());
    setAutoSpeakOn(getAutoSpeak());
    setHotkeyState(getVoiceHotkey());
    setTTSSpeedState(getTTSSpeed());
    setIntegrations(getIntegrations());
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
  }, []);

  const refreshIntegrations = useCallback(() => setIntegrations(getIntegrations()), []);

  useEffect(() => {
    refreshIntegrations();
  }, [refreshIntegrations]);

  function save() {
    localStorage.setItem(KEY, JSON.stringify(s));
    setAutoSpeak(autoSpeakOn);
    setVoiceHotkey(hotkey);
    setTTSSpeed(ttsSpeed);
    toast.success("Saved");
  }

  const handleKeyCapture = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!recordingKey) return;
    const key = e.key;
    if (key === "Escape") { setRecordingKey(false); return; }
    setHotkeyState(key);
    setRecordingKey(false);
    toast.success(`Hotkey set to "${key === " " ? "Space" : key}"`);
  };

  const hotkeyLabel = hotkey === " " ? "Space" : hotkey || "None";

  const connectedIds = (Object.keys(integrations) as IntegrationId[]).filter((id) => !!integrations[id]);

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

        <Section title="Voice & TTS">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card/40">
              <div>
                <div className="text-[14px] font-medium flex items-center gap-2"><Volume2 className="size-4 text-muted-foreground" /> Speak replies aloud</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">void reads each response using your browser voice.</div>
              </div>
              <Switch checked={autoSpeakOn} onCheckedChange={setAutoSpeakOn} />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card/40">
              <div>
                <div className="text-[14px] font-medium">TTS Speed</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">Applies to per-message and auto-speak.</div>
              </div>
              <div className="flex items-center gap-1">
                {SPEED_OPTIONS.map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setTTSSpeedState(sp)}
                    className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                      Math.abs(ttsSpeed - sp) < 0.05
                        ? "bg-white text-black"
                        : "text-muted-foreground hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {sp.toFixed(2)}×
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card/40">
              <div>
                <div className="text-[14px] font-medium flex items-center gap-2">
                  <Keyboard className="size-4 text-muted-foreground" /> Push-to-talk hotkey
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Hold this key to record voice. Default: Space. Press a key to change it.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onKeyDown={handleKeyCapture}
                  onBlur={() => setRecordingKey(false)}
                  onClick={() => setRecordingKey(true)}
                  className={`min-w-[72px] px-3 py-1.5 rounded-lg border text-[13px] font-mono text-center transition-all focus:outline-none ${
                    recordingKey
                      ? "border-white bg-white/10 text-white animate-pulse"
                      : "border-border/60 bg-card text-white hover:border-white/30"
                  }`}
                >
                  {recordingKey ? "Press key…" : hotkeyLabel}
                </button>
                <button
                  onClick={() => { setHotkeyState(" "); toast.success("Hotkey reset to Space"); }}
                  className="text-[11px] text-muted-foreground hover:text-white underline-offset-2 hover:underline"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Integrations">
          {connectedIds.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No integrations connected. <a href="/integrations" className="text-white hover:underline">Connect one →</a></p>
          ) : (
            <div className="space-y-2">
              {connectedIds.map((id) => {
                const conn = integrations[id]!;
                const meta = INTEGRATION_META[id];
                const Icon = meta.icon;
                return (
                  <div key={id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card/40">
                    <Icon className={`size-4 shrink-0 ${meta.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">{meta.name}</div>
                      <div className="text-[11px] text-muted-foreground">Connected {new Date(conn.connectedAt).toLocaleDateString()}</div>
                    </div>
                    <button
                      onClick={() => {
                        removeIntegration(id);
                        notifyIntegrationChange();
                        refreshIntegrations();
                        toast.success(`${meta.name} disconnected.`);
                      }}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Unlink className="size-3" /> Disconnect
                    </button>
                  </div>
                );
              })}
              <a href="/integrations" className="block text-[12px] text-muted-foreground hover:text-white underline-offset-2 hover:underline pt-1">
                Manage integrations →
              </a>
            </div>
          )}
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
