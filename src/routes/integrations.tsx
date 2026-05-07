import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/NavRail";
import { Mail, Calendar, MessageCircle, Send, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — void" },
      { name: "description", content: "Connect Gmail, Calendar, Slack, and Telegram so void can act on your behalf." },
    ],
  }),
  component: IntegrationsPage,
});

const integrations = [
  { id: "gmail", name: "Gmail", desc: "Read inbox, draft and send emails on your behalf.", icon: Mail },
  { id: "google_calendar", name: "Google Calendar", desc: "Read your schedule and create events.", icon: Calendar },
  { id: "slack", name: "Slack", desc: "Send messages and read channel context.", icon: MessageCircle },
  { id: "telegram", name: "Telegram", desc: "Talk to void through your Telegram account.", icon: Send },
];

function IntegrationsPage() {
  return (
    <PageShell
      title="Integrations"
      subtitle="Wire void into your real life. Each connector is sandboxed and you can disconnect anytime."
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {integrations.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.id} className="p-5 rounded-2xl border border-border/60 bg-card/40 hover:bg-card hover:border-white/20 transition-all">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-lg bg-white/5 border border-border/60 flex items-center justify-center">
                  <Icon className="size-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-[15px]">{it.name}</div>
                  <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">{it.desc}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/70 inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" /> Not connected
                </span>
                <button
                  onClick={() => toast.info(`Ask in chat: "Connect ${it.name}" and void will guide you.`)}
                  className="px-3 h-8 rounded-md bg-white text-black hover:bg-neutral-200 text-[12px] font-medium transition-colors"
                >
                  Connect
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 p-5 rounded-2xl border border-border/60 bg-card/30">
        <div className="flex items-center gap-2 mb-2">
          <Check className="size-4 text-white" />
          <h2 className="font-medium text-[14px]">How agentic actions work</h2>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Once connected, ask in chat — "Email Sam the meeting recap", "What's on my calendar tomorrow?",
          "Post the launch update to #general". void will draft, confirm, then act. You stay in control.
        </p>
      </div>

      <div className="mt-6 p-5 rounded-2xl border border-dashed border-border/70 bg-transparent">
        <h2 className="font-medium text-[14px]">Coming next: void Desktop</h2>
        <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
          A small companion app that pairs to your void account and runs local commands on your computer —
          the legitimate path to "control my machine". Browsers can't do that on their own.
        </p>
      </div>
    </PageShell>
  );
}
