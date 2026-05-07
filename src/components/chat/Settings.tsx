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
import {
  MODELS, PROMPT_TEMPLATES, DEFAULT_SYSTEM_PROMPT, VoidSettings, loadSettings, saveSettings,
} from "@/lib/void-config";

export function SettingsDialog({
  settings,
  onChange,
}: {
  settings: VoidSettings;
  onChange: (s: VoidSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  useEffect(() => { setDraft(settings); }, [settings, open]);

  const save = () => {
    saveSettings(draft);
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
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              Personality / system prompt
            </label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PROMPT_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setDraft((d) => ({ ...d, systemPrompt: t.prompt }))}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition ${
                    draft.systemPrompt === t.prompt
                      ? "bg-white text-black border-white"
                      : "border-border bg-card hover:bg-white hover:text-black"
                  }`}
                >
                  {t.name}
                </button>
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
              Saved locally. Applies to every new message in this session.
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
