import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Markdown } from "./Markdown";
import { AttachmentChip, FilePicker, type LocalAttachment } from "./Attachments";
import { DrivePickerDialog } from "./DrivePicker";
import {
  Plus, Send, Sparkles, LogOut, MessageSquare, Trash2, FolderOpen, User2, Bot,
} from "lucide-react";

type Conversation = { id: string; title: string; updated_at: string };
type DBMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments: { name: string; mime: string }[];
  created_at: string;
};

export function ChatApp() {
  const nav = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [streaming, setStreaming] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [driveOpen, setDriveOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auth gate
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) { nav({ to: "/auth" }); return; }
      setUserEmail(data.session.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) nav({ to: "/auth" });
      else setUserEmail(session.user.email ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [nav]);

  // Load conversations
  const loadConvs = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations").select("id,title,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return;
    setConvs(data ?? []);
    if (!activeId && data && data.length) setActiveId(data[0].id);
  }, [activeId]);

  useEffect(() => { if (userEmail) loadConvs(); }, [userEmail, loadConvs]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    supabase.from("messages")
      .select("id,role,content,attachments,created_at")
      .eq("conversation_id", activeId)
      .order("created_at")
      .then(({ data }) => setMessages((data ?? []) as any));
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const newChat = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("conversations").insert({ user_id: u.user.id, title: "New chat" })
      .select("id,title,updated_at").single();
    if (error) { toast.error(error.message); return; }
    setConvs((c) => [data as any, ...c]);
    setActiveId(data!.id);
    setMessages([]);
  };

  const deleteConv = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConvs((c) => c.filter((x) => x.id !== id));
    if (activeId === id) {
      const next = convs.find((c) => c.id !== id);
      setActiveId(next?.id ?? null);
    }
  };

  const send = async () => {
    if (busy) return;
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    let convId = activeId;
    if (!convId) {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data, error } = await supabase
        .from("conversations").insert({ user_id: u.user.id, title: "New chat" })
        .select("id,title,updated_at").single();
      if (error) { toast.error(error.message); return; }
      setConvs((c) => [data as any, ...c]);
      convId = data!.id;
      setActiveId(convId);
    }

    const userMsg: DBMessage = {
      id: crypto.randomUUID(), role: "user", content: text,
      attachments: attachments.map((a) => ({ name: a.name, mime: a.mime })),
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    const sentAttachments = attachments;
    setAttachments([]);
    setStreaming("");
    setBusy(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      // Build payload from full history
      const payload = {
        conversationId: convId,
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: text, attachments: sentAttachments.map((a) => ({
            name: a.name, mime: a.mime, dataUrl: a.dataUrl, text: a.text,
          })) },
        ],
      };
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        try { const j = JSON.parse(t); toast.error(j.error || "Request failed"); }
        catch { toast.error(t || "Request failed"); }
        setBusy(false);
        return;
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") continue;
          try {
            const p = JSON.parse(json);
            const d = p.choices?.[0]?.delta?.content;
            if (d) { acc += d; setStreaming(acc); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }

      const assistantMsg: DBMessage = {
        id: crypto.randomUUID(), role: "assistant", content: acc, attachments: [],
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      setStreaming("");
      // refresh conversation list (titles/updated_at)
      loadConvs();
    } catch (e: any) {
      toast.error(e.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-3 flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="size-4 text-primary" />
          </div>
          <span className="font-semibold tracking-tight">Nova</span>
        </div>
        <div className="px-3">
          <Button onClick={newChat} className="w-full justify-start gap-2" variant="secondary">
            <Plus className="size-4" /> New chat
          </Button>
        </div>
        <ScrollArea className="flex-1 mt-3">
          <div className="px-2 space-y-0.5">
            {convs.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-sidebar-accent ${activeId === c.id ? "bg-sidebar-accent" : ""}`}
                onClick={() => setActiveId(c.id)}
              >
                <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{c.title || "New chat"}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {convs.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
            )}
          </div>
        </ScrollArea>
        <div className="border-t p-3 flex items-center gap-2">
          <div className="size-7 rounded-full bg-accent flex items-center justify-center">
            <User2 className="size-3.5" />
          </div>
          <span className="text-xs truncate flex-1" title={userEmail ?? ""}>{userEmail}</span>
          <button
            className="text-muted-foreground hover:text-foreground"
            title="Sign out"
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="border-b px-6 py-3">
          <h1 className="text-sm font-medium truncate">
            {convs.find((c) => c.id === activeId)?.title || "New chat"}
          </h1>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {messages.length === 0 && !streaming && (
              <EmptyState />
            )}
            {messages.map((m) => <Bubble key={m.id} m={m} />)}
            {streaming && (
              <div className="flex gap-4">
                <div className="size-8 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className={busy && !streaming ? "" : "cursor-blink"}>
                    <Markdown content={streaming} />
                  </div>
                </div>
              </div>
            )}
            {busy && !streaming && (
              <div className="flex gap-4">
                <div className="size-8 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t bg-background">
          <div className="max-w-3xl mx-auto px-6 py-4">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((a, i) => (
                  <AttachmentChip
                    key={i} a={a}
                    onRemove={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
            <div className="rounded-2xl border bg-card focus-within:ring-2 focus-within:ring-primary/40 transition">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask anything, or attach files to analyze…"
                rows={1}
                className="resize-none border-0 bg-transparent focus-visible:ring-0 max-h-48 px-4 py-3 shadow-none"
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-1">
                  <FilePicker onPick={(a) => setAttachments((arr) => [...arr, a])} />
                  <Button variant="ghost" size="icon" type="button" title="Pick from Google Drive" onClick={() => setDriveOpen(true)}>
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
                <Button onClick={send} disabled={busy || (!input.trim() && attachments.length === 0)} size="sm" className="gap-1.5">
                  <Send className="size-3.5" /> Send
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              Nova can analyze images, PDFs, code, and text files. 8MB max per file.
            </p>
          </div>
        </div>
      </main>

      <DrivePickerDialog
        open={driveOpen}
        onOpenChange={setDriveOpen}
        onPick={(a) => setAttachments((arr) => [...arr, a])}
      />
    </div>
  );
}

function Bubble({ m }: { m: DBMessage }) {
  const isUser = m.role === "user";
  return (
    <div className="flex gap-4">
      <div className={`size-8 shrink-0 rounded-full flex items-center justify-center ${isUser ? "bg-bubble-user" : "bg-primary/15"}`}>
        {isUser ? <User2 className="size-4" /> : <Bot className="size-4 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        {m.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {m.attachments.map((a, i) => (
              <AttachmentChip key={i} a={{ name: a.name, mime: a.mime, size: 0, source: "local" }} />
            ))}
          </div>
        )}
        {m.content && <Markdown content={m.content} />}
      </div>
    </div>
  );
}

function EmptyState() {
  const examples = [
    "Summarize this PDF in 5 bullet points",
    "Explain what this code does and find any bugs",
    "Extract all the action items from this meeting transcript",
    "Translate this document to French",
  ];
  return (
    <div className="text-center py-16">
      <div className="inline-flex size-14 rounded-2xl bg-primary/15 items-center justify-center mb-4">
        <Sparkles className="size-6 text-primary" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">How can I help you today?</h2>
      <p className="text-sm text-muted-foreground mt-2">Attach files from your computer or Google Drive to analyze.</p>
      <div className="mt-8 grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
        {examples.map((e) => (
          <div key={e} className="rounded-xl border bg-card px-4 py-3 text-sm text-left text-muted-foreground hover:bg-accent transition cursor-default">
            {e}
          </div>
        ))}
      </div>
    </div>
  );
}
