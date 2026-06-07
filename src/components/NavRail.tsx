import { Link, useLocation } from "@tanstack/react-router";
import { MessageSquare, Activity, Plug, Settings, Home, Sparkles, Brain, Inbox } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/briefing", label: "Daily Briefing", icon: Sparkles },
  { to: "/actions", label: "Action Inbox", icon: Inbox },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/health", label: "Health", icon: Activity },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function VoidMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.25" fill="currentColor" />
    </svg>
  );
}

export function NavRail() {
  const loc = useLocation();
  return (
    <nav className="w-16 shrink-0 border-r border-border/60 bg-sidebar flex flex-col items-center py-4 gap-1">
      <Link to="/" className="mb-3 text-white"><VoidMark className="size-6" /></Link>
      {items.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            title={label}
            className={`group relative size-10 rounded-lg flex items-center justify-center transition-colors ${
              active ? "bg-white text-black" : "text-muted-foreground hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="size-[18px]" />
            <span className="absolute left-full ml-2 px-2 py-1 rounded bg-popover text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 border border-border">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="h-screen flex bg-background text-foreground">
      <NavRail />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-muted-foreground text-[14px]">{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
