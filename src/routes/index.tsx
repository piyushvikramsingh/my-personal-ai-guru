import { createFileRoute, Link } from "@tanstack/react-router";
import { NavRail } from "@/components/NavRail";
import { MessageSquare, Activity, Plug, Mic, ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "void — Your personal AI" },
      { name: "description", content: "Chat, voice, health insights, and live integrations. Your private AI workspace." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="h-screen flex bg-background text-foreground">
      <NavRail />
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-16">
          <div className="mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="size-3" /> v1.0 · Llama 3.1 ready
            </div>
            <h1 className="mt-6 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
              Hello. I'm <span className="text-white">void</span>.<br/>
              <span className="text-muted-foreground">Your personal AI.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] text-muted-foreground leading-relaxed">
              Talk to me, drop in your files, hand me your health data, or wire me into your inbox.
              I'll help you think, act, and stay on top of your life.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/chat" className="inline-flex items-center gap-2 bg-white text-black hover:bg-neutral-200 rounded-lg h-11 px-5 text-sm font-medium transition-colors">
                Start a conversation <ArrowRight className="size-4" />
              </Link>
              <Link to="/integrations" className="inline-flex items-center gap-2 border border-border hover:bg-white/5 rounded-lg h-11 px-5 text-sm font-medium transition-colors">
                Connect your tools
              </Link>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card to="/chat" icon={<MessageSquare className="size-5" />} title="Chat" desc="Stream replies, attach files, switch models. Voice in, voice out." />
            <Card to="/health" icon={<Activity className="size-5" />} title="Health" desc="Drop Apple Health or Fitbit exports. Get an honest readout." />
            <Card to="/integrations" icon={<Plug className="size-5" />} title="Integrations" desc="Gmail, Calendar, Slack, Telegram — let void act on your behalf." />
            <Card to="/chat" icon={<Mic className="size-5" />} title="Talk to void" desc="Hold the mic in chat. Like JARVIS, but yours." />
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="group p-5 rounded-2xl border border-border/60 bg-card/40 hover:bg-card hover:border-white/20 transition-all">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-white/5 border border-border/60 flex items-center justify-center text-white group-hover:bg-white group-hover:text-black transition-colors">
          {icon}
        </div>
        <div className="font-medium text-[15px]">{title}</div>
        <ArrowRight className="ml-auto size-4 text-muted-foreground group-hover:text-white group-hover:translate-x-0.5 transition-all" />
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
    </Link>
  );
}
