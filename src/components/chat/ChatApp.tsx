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
import { SettingsDialog, loadSettings, type VoidSettings } from "./Settings";
import { ingestDocument } from "@/lib/documents.functions";
import {
  Plus, Send, MessageSquare, Trash2, FolderOpen, User2, Copy, RotateCcw, Edit2, Search, X, Check, Globe, BookOpen, Brain, Code2, PenLine, Lightbulb, ArrowUp, Paperclip, Command, Mic, MicOff, Volume2, VolumeX,
} from "lucide-react";
import { NavRail } from "@/components/NavRail";
import { useSpeechRecognition, speak, stopSpeaking, getAutoSpeak, setAutoSpeak } from "@/hooks/use-voice";

// Minimal void mark — a precise, geometric "•" inside a ring. Feels like a real brand.
function VoidMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.25" fill="currentColor" />
    </svg>
  );
}

function groupByDate(convs: Conversation[]) {
  const now = Date.now();
  const day = 86400000;
  const buckets: Record<string, Conversation[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of convs) {
    const age = now - new Date(c.updated_at).getTime();
    if (age < day) buckets.Today.push(c);
    else if (age < 2 * day) buckets.Yesterday.push(c);
    else if (age < 7 * day) buckets["Previous 7 days"].push(c);
    else buckets.Older.push(c);
  }
  return buckets;
}

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
  const [settings, setSettings] = useState<VoidSettings>(() => loadSettings());
  const [autoSpeakOn, setAutoSpeakOn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<() => void>(() => {});
  const voice = useSpeechRecognition((text, isFinal) => {
    setInput(text);
    if (isFinal && text.trim()) {
      // auto-submit on final transcript (push-to-talk)
      setTimeout(() => sendRef.current?.(), 50);
    }
  });
  useEffect(() => { setAutoSpeakOn(getAutoSpeak()); }, []);

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
        model: settings.model,
        systemPrompt: settings.systemPrompt,
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
      if (autoSpeakOn) speak(finalContent.replace(/```[\s\S]*?```/g, "").replace(/[#*_`>]/g, "").slice(0, 1500));
      loadConvs();
    } catch (e: any) {
      toast.error(e.message ?? "Network error");
      setDebug((d) => ({ ...d, lastError: e?.message ?? "Network error" }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { sendRef.current = send; });

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="h-screen flex bg-background text-foreground selection:bg-white selection:text-black">
      <NavRail />
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-border/60 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
          <VoidMark className="size-5 text-white" />
          <span className="font-semibold text-[15px] tracking-[-0.01em]">void</span>
          <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-medium">v1.0</span>
        </div>

        <div className="px-3 pt-2">
          <Button
            onClick={newChat}
            className="w-full justify-between gap-2 bg-white text-black hover:bg-neutral-200 rounded-lg h-9 font-medium text-[13px] shadow-none"
          >
            <span className="flex items-center gap-2"><Plus className="size-3.5" /> New chat</span>
            <kbd className="text-[10px] font-mono text-black/50 bg-black/5 px-1.5 py-0.5 rounded">⌘N</kbd>
          </Button>
        </div>

        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border border-border/60 rounded-lg pl-9 pr-3 h-9 text-[13px] placeholder:text-muted-foreground/70 focus:outline-none focus:border-white/40 transition-colors"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 pb-3">
            {(() => {
              const filtered = convs.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
              const groups = groupByDate(filtered);
              const order = ["Today", "Yesterday", "Previous 7 days", "Older"];
              return order.map((label) => groups[label].length === 0 ? null : (
                <div key={label} className="mb-3">
                  <div className="px-3 pb-1.5 pt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">{label}</div>
                  <div className="space-y-0.5">
                    {groups[label].map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center gap-2 rounded-lg px-3 h-9 text-[13px] cursor-pointer transition-colors ${
                          activeId === c.id
                            ? "bg-white/[0.08] text-white"
                            : "text-sidebar-foreground/80 hover:bg-white/[0.04] hover:text-white"
                        }`}
                        onClick={() => setActiveId(c.id)}
                      >
                        {editingId === c.id ? (
                          <>
                            <input
                              autoFocus
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="flex-1 bg-transparent border border-white/30 rounded px-2 py-0.5 text-[13px] focus:outline-none"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => { if (e.key === "Enter") renameConv(c.id, editTitle); if (e.key === "Escape") setEditingId(null); }}
                            />
                            <button onClick={(e) => { e.stopPropagation(); renameConv(c.id, editTitle); }} className="text-white/70 hover:text-white">
                              <Check className="size-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-muted-foreground hover:text-white">
                              <X className="size-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className={`size-1.5 rounded-full shrink-0 ${activeId === c.id ? "bg-white" : "bg-white/30"}`} />
                            <span className="truncate flex-1">{c.title || "New chat"}</span>
                            <button
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white transition-opacity"
                              onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title); }}
                            >
                              <Edit2 className="size-3" />
                            </button>
                            <button
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                              onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
            {convs.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground/70 text-center">No conversations yet</p>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/60 p-3 flex items-center gap-2.5">
          <div className="size-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
            <User2 className="size-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium truncate">{userEmail || "Guest"}</div>
            <div className="text-[10px] text-muted-foreground">{userEmail ? "Signed in" : "Anonymous session"}</div>
          </div>
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border/60 px-6 py-3 bg-background/80 backdrop-blur flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-[14px] font-medium tracking-tight truncate text-white/90">
              {convs.find((c) => c.id === activeId)?.title || "New chat"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { const v = !autoSpeakOn; setAutoSpeakOn(v); setAutoSpeak(v); if (!v) stopSpeaking(); }}
              title={autoSpeakOn ? "Voice replies on" : "Voice replies off"}
              className="size-8 hover:bg-white/5 text-muted-foreground hover:text-white"
            >
              {autoSpeakOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
            <SettingsDialog settings={settings} onChange={setSettings} />
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
            {messages.length === 0 && !streaming && (
              <EmptyState onPick={(p) => setInput(p)} />
            )}
            {messages.map((m, idx) => <Bubble key={m.id} m={m} delay={idx * 40} />)}
            {streaming && (
              <div className="flex gap-4 animate-fadeInUp">
                <div className="size-8 shrink-0 rounded-full bg-white text-black flex items-center justify-center">
                  <VoidMark className="size-4" />
                </div>
                <div className="flex-1 pt-0.5 min-w-0">
                  <div className="text-[11px] text-muted-foreground mb-1 font-medium">void</div>
                  <div className={busy && !streaming ? "" : "cursor-blink"}>
                    <Markdown content={streaming} />
                  </div>
                </div>
              </div>
            )}
            {busy && !streaming && (
              <div className="flex gap-4 animate-fadeInUp">
                <div className="size-8 shrink-0 rounded-full bg-white text-black flex items-center justify-center">
                  <VoidMark className="size-4" />
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground pt-2">
                  <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            {messages.length > 0 && messages[messages.length - 1].role === "assistant" && !streaming && !busy && (
              <div className="flex justify-center pt-2">
                <Button onClick={regenerateResponse} className="gap-2 bg-transparent border border-border/60 text-muted-foreground hover:bg-white/5 hover:text-white" variant="outline" size="sm">
                  <RotateCcw className="size-3.5" /> Regenerate
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="bg-background pt-2">
          <div className="max-w-3xl mx-auto px-6 pb-5">
        {/* Composer */}
        <div className="bg-background pt-2">
          <div className="max-w-3xl mx-auto px-6 pb-5">
            {voice.listening && (
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-200 animate-fadeInUp">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                  <span className="relative inline-flex rounded-full size-2.5 bg-red-500"></span>
                </span>
                <span className="flex-1">Listening… speak now. Will auto-send when you pause.</span>
                <button
                  type="button"
                  onClick={voice.stop}
                  className="text-xs text-red-200/80 hover:text-white underline-offset-2 hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
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
            <div className="rounded-2xl border border-border/60 bg-card/60 focus-within:border-white/30 focus-within:bg-card transition-all duration-150 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Message void…"
                rows={1}
                className="resize-none border-0 bg-transparent focus-visible:ring-0 max-h-48 px-5 pt-4 pb-2 shadow-none placeholder:text-muted-foreground/60 text-[14px]"
              />
              <div className="flex items-center justify-between px-2.5 pb-2.5">
                <div className="flex items-center gap-0.5">
                  <FilePicker onPick={(a) => setAttachments((arr) => [...arr, a])} />
                  {voice.supported && (
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title={voice.listening ? "Stop listening" : "Talk to void"}
                      onClick={voice.toggle}
                      className={`size-8 hover:bg-white/5 ${voice.listening ? "text-red-400 animate-pulse" : "text-muted-foreground hover:text-white"}`}
                    >
                      {voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" type="button" title="Pick from Google Drive" onClick={() => setDriveOpen(true)} className="size-8 hover:bg-white/5 text-muted-foreground hover:text-white">
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
                <Button
                  onClick={send}
                  disabled={busy || (!input.trim() && attachments.length === 0)}
                  size="icon"
                  className="size-8 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:bg-white/20 disabled:text-white/40 disabled:hover:bg-white/20"
                  title="Send"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-2.5 text-center">
              void may produce inaccurate information. Verify important details.
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

  const handleCopy = () => {
    navigator.clipboard.writeText(m.content);
    toast.success("Copied");
  };

  return (
    <div
      className="flex gap-4 animate-fadeInUp group"
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`size-8 shrink-0 rounded-full flex items-center justify-center ${
        isUser
          ? "bg-white/10 border border-white/15 text-white"
          : "bg-white text-black"
      }`}>
        {isUser ? <User2 className="size-4" /> : <VoidMark className="size-4" />}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="text-[11px] text-muted-foreground mb-1 font-medium">{isUser ? "You" : "void"}</div>
        {m.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {m.attachments.map((a, i) => (
              <AttachmentChip key={i} a={{ name: a.name, mime: a.mime, size: 0, source: "local" }} />
            ))}
          </div>
        )}
        <div className="flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            {m.content && <Markdown content={m.content} />}
          </div>
          {!isUser && m.content && showActions && (
            <button
              onClick={handleCopy}
              className="text-muted-foreground hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-md"
              title="Copy"
            >
              <Copy className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (p: string) => void }) {
  const suggestions = [
    { icon: Code2, label: "Code", prompt: "Review this function and suggest improvements" },
    { icon: PenLine, label: "Write", prompt: "Draft a concise launch announcement for a new product" },
    { icon: Lightbulb, label: "Brainstorm", prompt: "Give me 10 unconventional ideas for weekend projects" },
    { icon: BookOpen, label: "Summarize", prompt: "Summarize this document into 5 key bullet points" },
    { icon: Brain, label: "Reason", prompt: "Walk me through solving a tricky logic puzzle step by step" },
    { icon: Globe, label: "Research", prompt: "Compare the latest open-source LLMs released this year" },
  ];

  return (
    <div className="py-16 px-2">
      <div className="flex items-center justify-center gap-3 mb-4">
        <VoidMark className="size-8 text-white" />
      </div>
      <h2 className="text-3xl md:text-[34px] font-semibold tracking-[-0.02em] text-center mb-2 text-white">
        What's on your mind?
      </h2>
      <p className="text-[14px] text-muted-foreground text-center mb-10 max-w-md mx-auto">
        A quiet, thoughtful AI. Ask anything, attach files, or pick a starting point below.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-w-2xl mx-auto">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.prompt)}
            className="group flex flex-col gap-2 text-left p-4 rounded-xl border border-border/60 bg-card/40 hover:bg-card hover:border-white/20 transition-all"
          >
            <s.icon className="size-4 text-white/70 group-hover:text-white transition-colors" />
            <div className="text-[13px] font-medium text-white">{s.label}</div>
            <div className="text-[11.5px] text-muted-foreground line-clamp-2 leading-relaxed">{s.prompt}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 mt-10 text-[11px] text-muted-foreground/70">
        <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-white/5 border border-border/60 rounded font-mono text-[10px]">↵</kbd> Send</span>
        <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-white/5 border border-border/60 rounded font-mono text-[10px]">⇧↵</kbd> New line</span>
        <span className="flex items-center gap-1.5"><Paperclip className="size-3" /> Attach</span>
      </div>
    </div>
  );
}
