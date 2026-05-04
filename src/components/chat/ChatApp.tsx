import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Markdown } from "./Markdown";
import { AttachmentChip, FilePicker, type LocalAttachment } from "./Attachments";
import { DrivePickerDialog } from "./DrivePicker";
import { DebugPanel, type DebugInfo } from "./DebugPanel";
import { ingestDocument } from "@/server/documents.functions";
import {
  Plus, Send, Sparkles, MessageSquare, Trash2, FolderOpen, User2, Bot, Copy, RotateCcw, Edit2, Search, X, Check, Clock, Zap, Globe, BookOpen, Brain, Database,
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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [streaming, setStreaming] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [driveOpen, setDriveOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [debug, setDebug] = useState<DebugInfo>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // AuthGate guarantees a session before this component mounts.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? null);
      setUserEmail(data.session?.user?.email ?? null);
    });
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      setCurrentUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  // Load conversations
  const loadConvs = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations").select("id,title,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return;
    setConvs(data ?? []);
    if (!activeId && data && data.length) setActiveId(data[0].id);
  }, [activeId]);

  useEffect(() => { if (currentUserId) loadConvs(); }, [currentUserId, loadConvs]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    supabase.from("messages")
      .select("id,role,content,attachments,created_at")
      .eq("conversation_id", activeId)
      .order("created_at")
      .then(({ data, error }) => {
        if (error) return;
        setMessages((data ?? []) as any);
      });
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const newChat = async () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
  };

  const deleteConv = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConvs((c) => c.filter((x) => x.id !== id));
    if (activeId === id) {
      const next = convs.find((c) => c.id !== id);
      setActiveId(next?.id ?? null);
    }
  };

  const renameConv = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    await supabase.from("conversations").update({ title: newTitle }).eq("id", id);
    setConvs((c) => c.map((x) => x.id === id ? { ...x, title: newTitle } : x));
    setEditingId(null);
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard!");
  };

  const regenerateResponse = async () => {
    if (!activeId || messages.length === 0) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    const msgIndex = messages.indexOf(lastUserMsg);
    setMessages((m) => m.slice(0, msgIndex + 1));
    setInput(lastUserMsg.content);
  };

  // Ingest a file attachment (local or drive) into the RAG store. Returns documentId.
  const ingestAttachment = async (a: LocalAttachment, conversationId: string | null): Promise<string | null> => {
    try {
      const r = await ingestDocument({ data: {
        name: a.name, mime: a.mime, size: a.size,
        source: a.source, dataUrl: a.dataUrl, text: a.text,
        conversationId,
      }});
      return r.documentId;
    } catch (e: any) {
      console.warn("ingest failed", a.name, e);
      toast.error(`Could not analyze ${a.name}: ${e?.message ?? "unknown error"}`);
      return null;
    }
  };

  const send = async () => {
    if (busy) return;
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (!currentUserId) {
      toast.error("Session not ready yet. Please wait a moment.");
      return;
    }

    let convId = activeId;

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
    setDebug((d) => ({ ...d, lastSentAt: new Date().toISOString(), lastError: null }));

    try {
      // Kick off ingestion in parallel for any attachment that has text/PDF content
      const ingestable = sentAttachments.filter((a) =>
        a.text || a.mime === "application/pdf" || a.mime.startsWith("text/") || a.mime === "application/json"
      );
      const documentIds = (await Promise.all(ingestable.map((a) => ingestAttachment(a, convId))))
        .filter(Boolean) as string[];

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const payload = {
        conversationId: convId,
        documentIds,
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
      setDebug((d) => ({ ...d, lastStatus: resp.status }));

      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        let msg = t;
        try { msg = JSON.parse(t).error || t; } catch { /* keep raw */ }
        toast.error(msg || "Request failed");
        setDebug((d) => ({ ...d, lastError: msg }));
        setBusy(false);
        return;
      }

      // Always trust the server-provided conversation id.
      const persistedConversationId = resp.headers.get("x-conversation-id");
      if (persistedConversationId) {
        convId = persistedConversationId;
        setActiveId(persistedConversationId);
        setConvs((c) => c.some((x) => x.id === persistedConversationId)
          ? c
          : [{ id: persistedConversationId, title: text.slice(0, 60) || "New chat", updated_at: new Date().toISOString() }, ...c]);
        setDebug((d) => ({ ...d, lastConversationId: persistedConversationId }));
      }

      const rawCites = resp.headers.get("x-citations");
      let citations: any[] = [];
      if (rawCites) {
        try { citations = JSON.parse(decodeURIComponent(rawCites)); } catch { /* ignore */ }
      }
      setDebug((d) => ({ ...d, lastCitations: citations }));

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

      let finalContent = acc;
      if (citations.length) {
        const seen = new Set<string>();
        const uniq = citations.filter((c) => {
          const k = `${c.document_id}:${c.chunk_index}`;
          if (seen.has(k)) return false; seen.add(k); return true;
        });
        finalContent += "\n\n---\n**Sources**\n" + uniq.map((c, i) =>
          `${i + 1}. ${c.document_name} §${c.chunk_index}`
        ).join("\n");
      }

      const assistantMsg: DBMessage = {
        id: crypto.randomUUID(), role: "assistant", content: finalContent, attachments: [],
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      setStreaming("");
      loadConvs();
    } catch (e: any) {
      toast.error(e.message ?? "Network error");
      setDebug((d) => ({ ...d, lastError: e?.message ?? "Network error" }));
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
      <aside className="w-70 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-border/50">
          <div className="size-9 rounded-xl bg-white flex items-center justify-center shadow-md">
            <Sparkles className="size-5 text-black" />
          </div>
          <span className="font-bold text-lg tracking-tight">Nova</span>
        </div>
        <div className="px-3 py-4">
          <Button onClick={newChat} className="w-full justify-start gap-2 bg-white text-black hover:bg-gray-200 rounded-xl h-10 transition-all duration-200" variant="ghost">
            <Plus className="size-4" /> New chat
          </Button>
        </div>
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search chats…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-2 space-y-1">
            {convs.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())).map((c, idx) => (
              <div
                key={c.id}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-all duration-200 ${
                  activeId === c.id 
                    ? "bg-white text-black border border-white shadow-md" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:shadow-sm"
                }`}
                onClick={() => setActiveId(c.id)}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {editingId === c.id ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 bg-card border border-white rounded px-2 py-1 text-sm text-foreground focus:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={(e) => { e.stopPropagation(); renameConv(c.id, editTitle); }} className="text-white hover:scale-110">
                      <Check className="size-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-muted-foreground hover:scale-110">
                      <X className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <MessageSquare className="size-4 shrink-0" />
                    <span className="truncate flex-1 font-medium">{c.title || "New chat"}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white transition-all duration-150 hover:scale-110"
                      onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title); }}
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all duration-150 hover:scale-110"
                      onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {convs.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">No conversations yet.</p>
            )}
          </div>
        </ScrollArea>
        <div className="border-t border-border/50 p-4 flex items-center gap-3">
          <div className="size-8 rounded-full bg-white flex items-center justify-center border border-white">
            <User2 className="size-4 text-black" />
          </div>
          <span className="text-xs font-medium truncate flex-1">Guest User</span>
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border/50 px-8 py-4 bg-background">
          <h1 className="text-base font-semibold tracking-tight">
            {convs.find((c) => c.id === activeId)?.title || "New chat"}
          </h1>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
            {messages.length === 0 && !streaming && (
              <EmptyState />
            )}
            {messages.map((m, idx) => <Bubble key={m.id} m={m} delay={idx * 50} />)}
            {streaming && (
              <div className="flex gap-4 animate-fadeInUp">
                <div className="size-9 shrink-0 rounded-full bg-white flex items-center justify-center shadow-md">
                  <Bot className="size-5 text-black" />
                </div>
                <div className="flex-1 pt-1">
                  <div className={busy && !streaming ? "" : "cursor-blink"}>
                    <Markdown content={streaming} />
                  </div>
                </div>
              </div>
            )}
            {busy && !streaming && (
              <div className="flex gap-4 animate-fadeInUp">
                <div className="size-9 shrink-0 rounded-full bg-black border border-white flex items-center justify-center shadow-md">
                  <Bot className="size-5 text-white" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-sm pt-1">
                  <span className="size-2 rounded-full bg-current animate-pulse" />
                  <span className="size-2 rounded-full bg-current animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="size-2 rounded-full bg-current animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            {messages.length > 0 && messages[messages.length - 1].role === "assistant" && !streaming && !busy && (
              <div className="flex justify-center pt-4">
                <Button onClick={regenerateResponse} className="gap-2 bg-white text-black hover:bg-gray-200" variant="outline" size="sm">
                  <RotateCcw className="size-3.5" /> Regenerate response
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border/50 bg-background pt-6">
          <div className="max-w-2xl mx-auto px-6 pb-6">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((a, i) => (
                  <AttachmentChip
                    key={i} a={a}
                    onRemove={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-border bg-card focus-within:ring-2 focus-within:ring-white focus-within:border-white transition-all duration-200 shadow-lg">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask anything, or attach files to analyze…"
                rows={1}
                className="resize-none border-0 bg-transparent focus-visible:ring-0 max-h-48 px-5 py-4 shadow-none placeholder:text-muted-foreground/60"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  <FilePicker onPick={(a) => setAttachments((arr) => [...arr, a])} />
                  <Button variant="ghost" size="icon" type="button" title="Pick from Google Drive" onClick={() => setDriveOpen(true)} className="hover:bg-white/10 hover:text-white transition-colors">
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
                <Button onClick={send} disabled={busy || (!input.trim() && attachments.length === 0)} size="sm" className="gap-1.5 bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-white">
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
      {import.meta.env.DEV && <DebugPanel debug={debug} />}
    </div>
  );
}

function Bubble({ m, delay = 0 }: { m: DBMessage; delay?: number }) {
  const isUser = m.role === "user";
  const [showActions, setShowActions] = useState(false);
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  
  const handleCopy = () => {
    navigator.clipboard.writeText(m.content);
    toast.success("Copied to clipboard!");
  };

  return (
    <div 
      className="flex gap-4 animate-fadeInUp group"
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`size-9 shrink-0 rounded-full flex items-center justify-center shadow-md ${
        isUser 
          ? "bg-white border border-white" 
          : "bg-black border border-white"
      }`}>
        {isUser ? <User2 className="size-5 text-black" /> : <Bot className="size-5 text-white" />}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {m.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {m.attachments.map((a, i) => (
              <AttachmentChip key={i} a={{ name: a.name, mime: a.mime, size: 0, source: "local" }} />
            ))}
          </div>
        )}
        <div className="flex gap-2 items-start">
          <div className="flex-1">
            {m.content && <Markdown content={m.content} />}
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Clock className="size-3" />
              <span>{time}</span>
            </div>
          </div>
          {!isUser && m.content && showActions && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white transition-all p-1 hover:bg-white/10 rounded"
              title="Copy message"
            >
              <Copy className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const capabilities = [
    {
      icon: Globe,
      title: "Research & Analysis",
      prompts: [
        "Search for the latest trends in AI and summarize key findings",
        "Analyze this YouTube video and give me the main takeaways",
        "Compare iPhone 15 and Samsung Galaxy S24 specifications",
      ],
    },
    {
      icon: Brain,
      title: "Logical Thinking",
      prompts: [
        "Explain complex topics in simple terms with examples",
        "Help me break down this problem into actionable steps",
        "Analyze this dataset and identify patterns or anomalies",
      ],
    },
    {
      icon: BookOpen,
      title: "Content Processing",
      prompts: [
        "Summarize this research paper in bullet points",
        "Extract key insights from this document",
        "Translate and explain technical content",
      ],
    },
  ];

  const shortcuts = [
    { key: "Enter", action: "Send message" },
    { key: "Shift + Enter", action: "New line" },
    { key: "Cmd + K", action: "Search conversations" },
  ];

  return (
    <div className="text-center py-12 px-4">
      <div className="inline-flex size-16 rounded-3xl bg-white items-center justify-center mb-6 shadow-lg">
        <Sparkles className="size-8 text-black" />
      </div>
      
      <h2 className="text-4xl font-bold tracking-tight mb-2">How can I help you today?</h2>
      <p className="text-base text-muted-foreground mb-12 max-w-2xl mx-auto">
        Nova AI is your intelligent assistant for research, analysis, and content processing. Ask anything and get instant insights.
      </p>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
        {capabilities.map((cap) => {
          const IconComponent = cap.icon;
          return (
            <div key={cap.title} className="text-left">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-white/10 border border-white/20">
                  <IconComponent className="size-5 text-white" />
                </div>
                <h3 className="font-semibold text-white">{cap.title}</h3>
              </div>
              <div className="space-y-2">
                {cap.prompts.map((prompt) => (
                  <div
                    key={prompt}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/80 text-left hover:bg-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer hover:shadow-md"
                  >
                    {prompt}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="mb-8 p-6 rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center gap-2 mb-4 justify-center">
            <Zap className="size-4 text-white" />
            <p className="text-sm font-semibold text-white">Key Features</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 text-left">
            <div className="flex items-start gap-2">
              <Globe className="size-4 text-white/60 mt-1 shrink-0" />
              <span className="text-sm text-white/80">Web search & data extraction</span>
            </div>
            <div className="flex items-start gap-2">
              <Brain className="size-4 text-white/60 mt-1 shrink-0" />
              <span className="text-sm text-white/80">Analytical reasoning</span>
            </div>
            <div className="flex items-start gap-2">
              <Copy className="size-4 text-white/60 mt-1 shrink-0" />
              <span className="text-sm text-white/80">Multi-source comparison</span>
            </div>
            <div className="flex items-start gap-2">
              <BookOpen className="size-4 text-white/60 mt-1 shrink-0" />
              <span className="text-sm text-white/80">Document analysis</span>
            </div>
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase">Keyboard Shortcuts</p>
        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-xs border border-white/10 rounded-lg p-2 bg-white/5 hover:bg-white/10 transition-colors">
              <span className="text-white/80">{s.action}</span>
              <kbd className="px-2 py-1 bg-white text-black rounded font-mono text-[10px] font-semibold">{s.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
