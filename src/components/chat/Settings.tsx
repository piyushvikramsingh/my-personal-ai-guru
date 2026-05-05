import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

export const MODELS = [
  { id: "google/gemini-2.5-pro", label: "void-pro (Gemini 2.5 Pro)" },
  { id: "google/gemini-2.5-flash", label: "void-flash (Gemini 2.5 Flash)" },
  { id: "google/gemini-2.5-flash-lite", label: "void-lite (Gemini 2.5 Flash Lite)" },
  { id: "google/gemini-3-flash-preview", label: "void-3 (Gemini 3 Flash Preview)" },
  { id: "openai/gpt-5", label: "void-x (GPT-5)" },
  { id: "openai/gpt-5-mini", label: "void-x-mini (GPT-5 Mini)" },
];

export const DEFAULT_SYSTEM_PROMPT = `You are void — a deeply thoughtful, human-like AI. You think, reason, guess, and reflect like a curious, intelligent human. Be warm, precise, and willing to make educated guesses (clearly flagged). Use markdown. Show brief reasoning for hard problems, then a clear answer.`;

const TEMPLATES: { name: string; prompt: string }[] = [
  { name: "Default (void)", prompt: DEFAULT_SYSTEM_PROMPT },
  { name: "Senior Code Reviewer", prompt: "You are a senior software engineer. Review code for bugs, security, performance, and clarity. Suggest concrete fixes with code snippets." },
  { name: "Socratic Tutor", prompt: "You are a Socratic tutor. Ask guiding questions, never give the answer immediately. Adapt to the learner's level." },
  { name: "Sci-Fi Worldbuilder", prompt: "You are a science-fiction worldbuilder. Invent vivid, internally-consistent worlds, technologies and societies. Be imaginative but plausible." },
  { name: "Concise Analyst", prompt: "You are a concise analyst. Always answer in tight bullet points. No filler. End with a one-line takeaway." },
];

export type VoidSettings = { model: string; systemPrompt: string };

const KEY = "void.settings.v1";

export function loadSettings(): VoidSettings {
  if (typeof window === "undefined") return { model: MODELS[0].id, systemPrompt: DEFAULT_SYSTEM_PROMPT };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { model: MODELS[0].id, systemPrompt: DEFAULT_SYSTEM_PROMPT, ...JSON.parse(raw) };
  } catch {}
  return { model: MODELS[0].id, systemPrompt: DEFAULT_SYSTEM_PROMPT };
}

export function SettingsDialog({
  settings, onChange,
}: { settings: VoidSettings; onChange: (s: VoidSettings) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  useEffect(() => { setDraft(settings); }, [settings, open]);

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(draft));
    onChange(draft);
    setOpen(false);
    toast.success("Settings saved");
  };

  const currentLabel = MODELS.find((m) => m.id === settings.model)?.label ?? settings.model;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-card border-border hover:bg-white hover:text-black">
          <Settings2 className="size-3.5" />
          <span className="text-xs font-medium truncate max-w-[160px]">{currentLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl bg-background border-border">
        <DialogHeader>
          <DialogTitle>void · model & prompt</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Model</label>
            <Select value={draft.model} onValueChange={(v) => setDraft((d) => ({ ...d, model: v }))}>
              <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              System prompt builder
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setDraft((d) => ({ ...d, systemPrompt: t.prompt }))}
                  className="text-[11px] px-2 py-1 rounded-md border border-border bg-card hover:bg-white hover:text-black transition"
                >{t.name}</button>
              ))}
            </div>
            <Textarea
              value={draft.systemPrompt}
              onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
              rows={8}
              className="bg-card resize-none text-sm font-mono"
              placeholder="You are…"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Saved locally on this device. Applies to every new message.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} className="bg-white text-black hover:bg-gray-200">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
