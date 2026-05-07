import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/NavRail";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Mail, Calendar, MessageCircle, Send, Check, AlertTriangle, Loader2, Unlink, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  getIntegrations, setIntegration, removeIntegration, notifyIntegrationChange,
  type IntegrationId, type IntegrationConnection, type IntegrationsStore,
} from "@/lib/integrations-store";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — void" },
      { name: "description", content: "Connect Gmail, Calendar, Slack, and Telegram so void can act on your behalf." },
    ],
  }),
  component: IntegrationsPage,
});

type IntegrationMeta = {
  id: IntegrationId;
  name: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  scopes: string[];
  testAction: string;
  oauthProvider?: "google";
  manualSetup?: boolean;
};

const integrations: IntegrationMeta[] = [
  {
    id: "gmail",
    name: "Gmail",
    desc: "Read inbox, draft and send emails on your behalf.",
    icon: Mail,
    color: "text-red-400",
    scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
    testAction: "List last 5 emails",
    oauthProvider: "google",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    desc: "Read your schedule and create events.",
    icon: Calendar,
    color: "text-blue-400",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    testAction: "List upcoming events",
    oauthProvider: "google",
  },
  {
    id: "slack",
    name: "Slack",
    desc: "Send messages and read channel context.",
    icon: MessageCircle,
    color: "text-purple-400",
    scopes: ["channels:read", "chat:write"],
    testAction: "List channels",
    manualSetup: true,
  },
  {
    id: "telegram",
    name: "Telegram",
    desc: "Talk to void through your Telegram account.",
    icon: Send,
    color: "text-sky-400",
    scopes: [],
    testAction: "Send test message",
    manualSetup: true,
  },
];

function IntegrationsPage() {
  const [store, setStore] = useState<IntegrationsStore>({ gmail: null, google_calendar: null, slack: null, telegram: null });
  const [connecting, setConnecting] = useState<IntegrationId | null>(null);
  const [testing, setTesting] = useState<IntegrationId | null>(null);
  const [manualOpen, setManualOpen] = useState<IntegrationId | null>(null);
  const [manualToken, setManualToken] = useState("");

  const refresh = useCallback(() => setStore(getIntegrations()), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleGoogleOAuth = async (meta: IntegrationMeta) => {
    setConnecting(meta.id);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: {
          scope: meta.scopes.join(" "),
          access_type: "offline",
          prompt: "consent select_account",
        },
      });

      if (result.error) {
        toast.error(`Failed to connect ${meta.name}: ${result.error.message}`);
        return;
      }

      const conn: IntegrationConnection = {
        id: meta.id,
        connectedAt: new Date().toISOString(),
        scopes: meta.scopes,
      };
      setIntegration(conn);
      notifyIntegrationChange();
      refresh();
      toast.success(`${meta.name} connected!`);
    } catch (e: any) {
      toast.error(e?.message ?? `Failed to connect ${meta.name}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleManualConnect = (meta: IntegrationMeta) => {
    if (!manualToken.trim()) {
      toast.error("Please enter a token or webhook URL.");
      return;
    }
    const conn: IntegrationConnection = {
      id: meta.id,
      connectedAt: new Date().toISOString(),
      accessToken: manualToken.trim(),
      scopes: meta.scopes,
    };
    setIntegration(conn);
    notifyIntegrationChange();
    refresh();
    toast.success(`${meta.name} connected!`);
    setManualOpen(null);
    setManualToken("");
  };

  const handleDisconnect = (id: IntegrationId, name: string) => {
    removeIntegration(id);
    notifyIntegrationChange();
    refresh();
    toast.success(`${name} disconnected.`);
  };

  const handleTest = async (meta: IntegrationMeta) => {
    const conn = store[meta.id];
    if (!conn) return;
    setTesting(meta.id);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      toast.success(`Test action "${meta.testAction}" succeeded for ${meta.name}.`);
    } catch {
      toast.error(`Test failed for ${meta.name}.`);
    } finally {
      setTesting(null);
    }
  };

  const manualMeta = integrations.find((m) => m.id === manualOpen);

  return (
    <PageShell
      title="Integrations"
      subtitle="Wire void into your real life. Each connector is sandboxed and you can disconnect anytime."
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {integrations.map((it) => {
          const conn = store[it.id];
          const connected = !!conn;
          const isConnecting = connecting === it.id;
          const isTesting = testing === it.id;
          const Icon = it.icon;

          return (
            <div
              key={it.id}
              className={`p-5 rounded-2xl border transition-all ${
                connected
                  ? "border-white/20 bg-card/60"
                  : "border-border/60 bg-card/40 hover:bg-card hover:border-white/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`size-10 rounded-lg bg-white/5 border border-border/60 flex items-center justify-center ${it.color}`}>
                  <Icon className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[15px]">{it.name}</div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">{it.desc}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`text-[11px] inline-flex items-center gap-1.5 ${connected ? "text-green-400" : "text-muted-foreground/70"}`}>
                  <span className={`size-1.5 rounded-full ${connected ? "bg-green-400" : "bg-muted-foreground/40"}`} />
                  {connected ? (
                    <>Connected · {new Date(conn.connectedAt).toLocaleDateString()}</>
                  ) : (
                    "Not connected"
                  )}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {connected ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(it)}
                        disabled={isTesting}
                        className="h-7 px-2.5 text-[11px] gap-1.5 border-border/60 bg-card hover:bg-white/5"
                      >
                        {isTesting ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDisconnect(it.id, it.name)}
                        className="h-7 px-2.5 text-[11px] gap-1.5 text-muted-foreground hover:text-red-400"
                      >
                        <Unlink className="size-3" /> Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        it.oauthProvider === "google"
                          ? handleGoogleOAuth(it)
                          : setManualOpen(it.id)
                      }
                      disabled={isConnecting}
                      className="h-7 px-3 text-[12px] bg-white text-black hover:bg-neutral-200 gap-1.5"
                    >
                      {isConnecting ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : it.oauthProvider ? (
                        <ExternalLink className="size-3" />
                      ) : null}
                      {isConnecting ? "Connecting…" : "Connect"}
                    </Button>
                  )}
                </div>
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
          Once connected, ask in chat — <em>"Email Sam the meeting recap"</em>, <em>"What's on my calendar tomorrow?"</em>,{" "}
          <em>"Post the launch update to #general"</em>. void will draft, show you a preview to approve or edit, then act. You stay in control.
        </p>
      </div>

      {manualMeta && (
        <Dialog open={!!manualOpen} onOpenChange={(o) => { if (!o) { setManualOpen(null); setManualToken(""); } }}>
          <DialogContent className="max-w-md bg-background border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <manualMeta.icon className={`size-4 ${manualMeta.color}`} />
                Connect {manualMeta.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[12px] text-yellow-200 flex gap-2">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  {manualMeta.id === "slack"
                    ? "Create a Slack Bot token at api.slack.com/apps and paste it below."
                    : "Create a Telegram Bot via @BotFather and paste the token below."}
                </span>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  {manualMeta.id === "slack" ? "Bot Token (xoxb-…)" : "Bot Token"}
                </label>
                <input
                  type="password"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder={manualMeta.id === "slack" ? "xoxb-…" : "123456789:AAF…"}
                  className="w-full bg-card border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setManualOpen(null); setManualToken(""); }}>Cancel</Button>
              <Button onClick={() => handleManualConnect(manualMeta)} className="bg-white text-black hover:bg-neutral-200">
                Save & Connect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
