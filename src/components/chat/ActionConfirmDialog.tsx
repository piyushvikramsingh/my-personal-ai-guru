import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Calendar, MessageCircle, Send, AlertTriangle } from "lucide-react";

export type IntegrationAction = {
  type: "email" | "calendar" | "slack" | "telegram";
  to?: string;
  subject?: string;
  body: string;
  title?: string;
  startTime?: string;
};

type Props = {
  action: IntegrationAction | null;
  onConfirm: (action: IntegrationAction) => void;
  onCancel: () => void;
};

const icons: Record<IntegrationAction["type"], React.ElementType> = {
  email: Mail,
  calendar: Calendar,
  slack: MessageCircle,
  telegram: Send,
};

const labels: Record<IntegrationAction["type"], string> = {
  email: "Send Email via Gmail",
  calendar: "Create Calendar Event",
  slack: "Post to Slack",
  telegram: "Send Telegram Message",
};

export function ActionConfirmDialog({ action, onConfirm, onCancel }: Props) {
  const [draft, setDraft] = useState<IntegrationAction | null>(action);

  if (!action || !draft) return null;

  const Icon = icons[action.type];

  return (
    <Dialog open={!!action} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-lg bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-white/5 border border-border/60 flex items-center justify-center">
              <Icon className="size-4" />
            </div>
            {labels[action.type]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[12px] text-yellow-200">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span>Review the draft below before void acts on your behalf. You can edit any field.</span>
          </div>

          {draft.to && (
            <Field label="To">
              <input
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                className="w-full bg-card border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
              />
            </Field>
          )}

          {draft.subject && (
            <Field label="Subject">
              <input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="w-full bg-card border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
              />
            </Field>
          )}

          {draft.title && (
            <Field label="Title">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full bg-card border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
              />
            </Field>
          )}

          {draft.startTime && (
            <Field label="When">
              <input
                value={draft.startTime}
                onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                className="w-full bg-card border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
              />
            </Field>
          )}

          <Field label={action.type === "calendar" ? "Description" : "Message"}>
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={5}
              className="bg-card resize-none text-sm"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(draft)} className="bg-white text-black hover:bg-neutral-200 gap-2">
            <Icon className="size-3.5" /> Confirm & Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
