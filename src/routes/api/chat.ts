import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";

type Attachment = { name: string; mime: string; dataUrl?: string; text?: string };
type IncomingMessage = { role: "user" | "assistant"; content: string; attachments?: Attachment[] };

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM = `You are void — a deeply intelligent, agentic AI that thinks and acts like a brilliant human collaborator.

You have TOOLS available. Use them whenever they help you answer better:
• web_search — search the live web for current information
• fetch_url — fetch and read a specific URL
• calculate — evaluate math / numeric expressions exactly
• run_js — run sandboxed JavaScript for data transforms, parsing, logic
• current_time — get the current date/time
• send_email — send an email via the user's Gmail (requires Gmail connected)
• create_calendar_event — create an event on the user's Google Calendar (requires Calendar connected)
• propose_action — queue an action card for the user to approve in their Action Inbox (/actions). Use when you'd like to act on the user's behalf but want explicit consent.
• remember — save a preference about the user (key + value)
• forget — remove a saved preference

AGENTIC BEHAVIOR
• Decide autonomously when to call tools — don't ask permission, just do it.
• Chain tools: search → fetch → calculate → answer.
• If one approach fails, try another. Don't give up after one tool error.
• When facts could be stale, prefer web_search over guessing.
• When the user asks you to "do" something (send, schedule, calculate, look up), execute it.
• When tools return rate_limited or not_connected, briefly tell the user and (for not_connected) point them to /integrations.
• Only ask the user a question when you genuinely cannot proceed without their input.

VOICE
Calm, warm, confident. Match the user's language and tone. Use markdown when it helps. No filler like "Certainly!" or "Great question!". Be honest about uncertainty. Cite sources from web tools as inline links.

When you're done with tools, write the final answer for the user in clean markdown.`;

// ─── Tools schema ────────────────────────────────────────────────────────────

const TOOLS = [
  { type: "function", function: { name: "web_search", description: "Search the web. Returns top results.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "fetch_url", description: "Fetch a URL and return cleaned text.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "calculate", description: "Evaluate a math expression safely.",
    parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } } },
  { type: "function", function: { name: "run_js", description: "Execute sandboxed JavaScript. No network, no fs.",
    parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } } },
  { type: "function", function: { name: "current_time", description: "Get current date and time.",
    parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "send_email", description: "Send an email via the user's Gmail. Requires Gmail connected on /integrations.",
    parameters: { type: "object", properties: {
      to: { type: "string" }, subject: { type: "string" }, body: { type: "string" },
    }, required: ["to", "subject", "body"] } } },
  { type: "function", function: { name: "create_calendar_event", description: "Create a Google Calendar event on the user's primary calendar.",
    parameters: { type: "object", properties: {
      title: { type: "string" }, start: { type: "string", description: "ISO datetime" },
      end: { type: "string", description: "ISO datetime" }, description: { type: "string" },
    }, required: ["title", "start", "end"] } } },
  { type: "function", function: { name: "remember", description: "Save or update a preference about this user.",
    parameters: { type: "object", properties: { key: { type: "string" }, value: {} }, required: ["key", "value"] } } },
  { type: "function", function: { name: "forget", description: "Remove a saved preference.",
    parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } } },
  { type: "function", function: { name: "propose_action", description: "Queue a proposed action card in the user's Action Inbox (/actions) for them to approve.",
    parameters: { type: "object", properties: {
      kind: { type: "string", description: "Short category, e.g. email, calendar, task, reminder, research" },
      title: { type: "string", description: "One-line human-readable summary of what you propose to do" },
      details: { type: "object", description: "Structured payload — recipients, subject/body, datetimes, links, etc." },
    }, required: ["kind", "title"] } } },
];

// ─── Sandboxing helpers ──────────────────────────────────────────────────────

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./, /^::1$/, /\.local$/i, /\.internal$/i,
  /^0\.0\.0\.0$/, /^metadata\.google\.internal$/i,
];

function isHostAllowed(host: string, userAllowlist: string[]): { ok: boolean; reason?: string } {
  const h = host.toLowerCase();
  for (const re of BLOCKED_HOST_PATTERNS) {
    if (re.test(h)) return { ok: false, reason: `blocked host pattern (${h})` };
  }
  if (userAllowlist.length > 0) {
    const allowed = userAllowlist.some((d) => h === d.toLowerCase() || h.endsWith("." + d.toLowerCase()));
    if (!allowed) return { ok: false, reason: `host ${h} not in your allowlist` };
  }
  return { ok: true };
}

const DANGEROUS_JS = /\b(constructor|require|process|globalThis|eval|Function|import\s*\()/;

function tool_run_js(code: string): string {
  if (typeof code !== "string" || code.length > 8000) {
    return JSON.stringify({ error: "code too long or invalid" });
  }
  if (DANGEROUS_JS.test(code)) {
    return JSON.stringify({ error: "code rejected by sandbox: forbidden identifier" });
  }
  try {
    // Shadow dangerous globals; provide a no-op console.
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "fetch", "XMLHttpRequest", "WebSocket", "process", "require", "global", "globalThis",
      "self", "window", "document", "localStorage", "sessionStorage", "console",
      `"use strict"; return (async () => { ${code.includes("return") ? code : "return (" + code + ");"} })();`,
    );
    const consoleStub = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
    const promise = fn(undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, consoleStub);
    return JSON.stringify({ pending: true, _: handleTimeout(promise) });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

// Sync wrapper that races against a timer; returns serialized result.
async function runJsAsync(code: string): Promise<string> {
  if (typeof code !== "string" || code.length > 8000)
    return JSON.stringify({ error: "code too long or invalid" });
  if (DANGEROUS_JS.test(code))
    return JSON.stringify({ error: "code rejected by sandbox: forbidden identifier" });
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "fetch", "XMLHttpRequest", "WebSocket", "process", "require", "global", "globalThis",
      "self", "window", "document", "localStorage", "sessionStorage", "console",
      `"use strict"; return (async () => { ${code.includes("return") ? code : "return (" + code + ");"} })();`,
    );
    const consoleStub = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
    const exec: Promise<unknown> = Promise.resolve(
      fn(undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, consoleStub),
    );
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("run_js timeout (1500ms)")), 1500),
    );
    const result = await Promise.race([exec, timeout]);
    let json = JSON.stringify({ result: result === undefined ? null : result });
    if (json.length > 32_000) json = JSON.stringify({ error: "result too large (>32KB)" });
    return json;
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

function handleTimeout(_p: unknown) { return null; }

// ─── Cache + rate limit ──────────────────────────────────────────────────────

type CacheEntry = { value: string; exp: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_MAX = 200;

function cacheGet(key: string): string | null {
  const e = CACHE.get(key);
  if (!e) return null;
  if (e.exp < Date.now()) { CACHE.delete(key); return null; }
  // LRU touch
  CACHE.delete(key); CACHE.set(key, e);
  return e.value;
}
function cacheSet(key: string, value: string, ttlMs: number) {
  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
  CACHE.set(key, { value, exp: Date.now() + ttlMs });
}

const BUCKETS = new Map<string, { count: number; resetAt: number }>();
function rateLimit(userId: string, tool: string, limit: number, windowMs: number):
  { ok: true } | { ok: false; retryAfter: number } {
  const key = `${userId}:${tool}`;
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || b.resetAt < now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  b.count++;
  return { ok: true };
}

// ─── Tool implementations ────────────────────────────────────────────────────

async function tool_web_search(query: string, userId: string): Promise<string> {
  const q = (query || "").trim().slice(0, 200);
  if (!q) return JSON.stringify({ error: "empty query" });
  const rl = rateLimit(userId, "web_search", 20, 5 * 60_000);
  if (!rl.ok) return JSON.stringify({ error: "rate_limited", retry_after_seconds: rl.retryAfter });
  const ck = `ws:${q.toLowerCase()}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; voidbot/1.0)" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return JSON.stringify({ error: `search failed ${res.status}` });
    const html = await res.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < 6) {
      let url = m[1];
      const ddg = url.match(/uddg=([^&]+)/);
      if (ddg) url = decodeURIComponent(ddg[1]);
      results.push({
        title: m[2].replace(/<[^>]+>/g, "").trim(),
        url,
        snippet: m[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 240),
      });
    }
    const out = JSON.stringify({ results });
    cacheSet(ck, out, 10 * 60_000);
    return out;
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

async function tool_fetch_url(url: string, userId: string, allowlist: string[]): Promise<string> {
  if (typeof url !== "string" || url.length > 2000)
    return JSON.stringify({ error: "invalid url" });
  let parsed: URL;
  try { parsed = new URL(url); } catch { return JSON.stringify({ error: "invalid url" }); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return JSON.stringify({ error: "only http(s) URLs allowed" });
  const allowed = isHostAllowed(parsed.hostname, allowlist);
  if (!allowed.ok) return JSON.stringify({ error: allowed.reason });

  const rl = rateLimit(userId, "fetch_url", 30, 5 * 60_000);
  if (!rl.ok) return JSON.stringify({ error: "rate_limited", retry_after_seconds: rl.retryAfter });
  const ck = `fu:${parsed.toString()}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; voidbot/1.0)" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status}` });
    const ct = res.headers.get("content-type") || "";
    if (!/text\/|application\/(json|xml|xhtml)/.test(ct))
      return JSON.stringify({ error: `unsupported content-type ${ct}` });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 1_000_000)
      return JSON.stringify({ error: "response too large (>1MB)" });
    const txt = new TextDecoder().decode(buf);
    let content: string;
    if (ct.includes("json")) {
      content = txt.slice(0, 4000);
    } else {
      const body = txt.match(/<body[^>]*>([\s\S]+?)<\/body>/i)?.[1] ?? txt;
      content = body
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, 4000);
    }
    const title = txt.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
    const out = JSON.stringify({ url: parsed.toString(), title, content });
    cacheSet(ck, out, 30 * 60_000);
    return out;
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

function tool_calculate(expr: string): string {
  if (typeof expr !== "string" || expr.length > 500)
    return JSON.stringify({ error: "expression too long" });
  if (!/^[\d+\-*/().,%\seE]*$/.test(expr.replace(/Math\.\w+/g, ""))) {
    return JSON.stringify({ error: "only math expressions allowed" });
  }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${expr});`);
    return JSON.stringify({ result: fn() });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

function tool_current_time(): string {
  const d = new Date();
  return JSON.stringify({ iso: d.toISOString(), readable: d.toUTCString(), unix: d.getTime() });
}

async function tool_send_email(
  args: { to: string; subject: string; body: string },
  connectionId: string | null,
): Promise<string> {
  if (!connectionId) {
    return JSON.stringify({ error: "not_connected", connector: "google_mail",
      message: "Gmail not connected. Tell the user to open /integrations and connect Gmail." });
  }
  if (!args?.to || !args?.subject || !args?.body)
    return JSON.stringify({ error: "missing to/subject/body" });
  const raw = [
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    args.body,
  ].join("\r\n");
  const b64 = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    const res = await callAsAppUser({
      gatewayBaseUrl: "https://connector-gateway.lovable.dev",
      connectionId, connectorId: "google_mail",
      path: "/gmail/v1/users/me/messages/send",
      init: { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: b64 }) },
    });
    const text = await res.text();
    if (!res.ok) return JSON.stringify({ error: `gmail ${res.status}: ${text.slice(0, 200)}` });
    return JSON.stringify({ ok: true, response: text.slice(0, 400) });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

async function tool_create_calendar_event(
  args: { title: string; start: string; end: string; description?: string },
  connectionId: string | null,
): Promise<string> {
  if (!connectionId) {
    return JSON.stringify({ error: "not_connected", connector: "google_calendar",
      message: "Google Calendar not connected. Tell the user to open /integrations and connect it." });
  }
  if (!args?.title || !args?.start || !args?.end)
    return JSON.stringify({ error: "missing title/start/end" });
  try {
    const res = await callAsAppUser({
      gatewayBaseUrl: "https://connector-gateway.lovable.dev",
      connectionId, connectorId: "google_calendar",
      path: "/calendar/v3/calendars/primary/events",
      init: { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: args.title,
          description: args.description ?? "",
          start: { dateTime: args.start },
          end: { dateTime: args.end },
        }) },
    });
    const text = await res.text();
    if (!res.ok) return JSON.stringify({ error: `calendar ${res.status}: ${text.slice(0, 200)}` });
    return JSON.stringify({ ok: true, response: text.slice(0, 400) });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseData(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}
function sseAgent(event: unknown): string {
  return `event: agent\ndata: ${JSON.stringify(event)}\n\n`;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        let userId: string = crypto.randomUUID();
        if (token) {
          const supabaseAuth = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
          );
          const { data: claims } = await supabaseAuth.auth.getClaims(token);
          if (claims?.claims?.sub) userId = claims.claims.sub as string;
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseKey = serviceKey || process.env.SUPABASE_PUBLISHABLE_KEY || "";
        const supabase = createClient(process.env.SUPABASE_URL!, supabaseKey, {
          auth: { persistSession: false },
          global: serviceKey ? {} : { headers: { Authorization: `Bearer ${token}` } },
        });

        const body = (await request.json()) as {
          conversationId?: string | null;
          messages: IncomingMessage[];
          documentIds?: string[] | null;
          model?: string | null;
          systemPrompt?: string | null;
        };

        // Load per-user memory + connections (best-effort).
        let memory: { preferences: Record<string, unknown>; recurring_tasks: unknown[]; fetch_allowlist: string[] } =
          { preferences: {}, recurring_tasks: [], fetch_allowlist: [] };
        const connByConnector: Record<string, string> = {};
        try {
          const [{ data: mem }, { data: conns }] = await Promise.all([
            supabase.from("user_memory").select("preferences, recurring_tasks, fetch_allowlist")
              .eq("user_id", userId).maybeSingle(),
            supabase.from("user_connections").select("connector_id, connection_id")
              .eq("user_id", userId),
          ]);
          if (mem) {
            memory = {
              preferences: (mem.preferences as Record<string, unknown>) ?? {},
              recurring_tasks: (mem.recurring_tasks as unknown[]) ?? [],
              fetch_allowlist: (mem.fetch_allowlist as string[]) ?? [],
            };
          }
          for (const c of conns ?? []) {
            connByConnector[c.connector_id as string] = c.connection_id as string;
          }
        } catch (e) { console.error("memory/conn load", e); }

        // RAG retrieval (unchanged)
        async function retrieveContext(query: string) {
          if (!query.trim()) return { block: "", citations: [] as any[] };
          let chunks: any[] = [];
          try {
            const embRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
              method: "POST",
              headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "openai/text-embedding-3-small", input: query.slice(0, 4000) }),
            });
            if (embRes.ok) {
              const j = await embRes.json();
              const emb = j.data?.[0]?.embedding;
              if (emb) {
                const { data } = await supabase.rpc("match_document_chunks", {
                  query_embedding: emb, match_user_id: userId, match_count: 6,
                  filter_document_ids: body.documentIds?.length ? body.documentIds : null,
                });
                chunks = data ?? [];
              }
            }
          } catch {}
          if (!chunks.length) {
            const { data } = await supabase.rpc("search_document_chunks", {
              query_text: query.slice(0, 500), match_user_id: userId, match_count: 6,
              filter_document_ids: body.documentIds?.length ? body.documentIds : null,
            });
            chunks = data ?? [];
          }
          if (!chunks.length) return { block: "", citations: [] };
          const citations = chunks.map((c: any) => ({
            document_id: c.document_id, document_name: c.document_name, chunk_index: c.chunk_index,
          }));
          const block = "\n\n**Knowledge Base Excerpts** (cite as `[doc §chunk]`):\n" +
            chunks.map((c: any, i: number) => `\n[${i + 1}] **${c.document_name} §${c.chunk_index}**\n${c.content}`).join("\n");
          return { block, citations };
        }

        // Conversation
        let conversationId = body.conversationId ?? "";
        if (!conversationId) {
          const firstUser = body.messages.find((m) => m.role === "user");
          const title = firstUser?.content?.trim().slice(0, 60) || "New chat";
          const { data: conv, error: convErr } = await supabase
            .from("conversations").insert({ user_id: userId, title }).select("id").single();
          if (convErr || !conv) {
            return new Response(JSON.stringify({ error: "Could not start conversation" }), { status: 500 });
          }
          conversationId = conv.id;
        }

        const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
        const rag = lastUserMsg ? await retrieveContext(lastUserMsg.content) : { block: "", citations: [] as any[] };

        const memSummary = (() => {
          const prefKeys = Object.keys(memory.preferences);
          const conns = Object.keys(connByConnector);
          if (!prefKeys.length && !conns.length) return "";
          const parts: string[] = ["\n\n---\n**About this user (memory)**"];
          if (prefKeys.length) parts.push(`Preferences: ${JSON.stringify(memory.preferences).slice(0, 1500)}`);
          if (conns.length) parts.push(`Connected services: ${conns.join(", ")}`);
          else parts.push("Connected services: none. If a tool needs Gmail/Calendar, tell the user to visit /integrations.");
          return parts.join("\n");
        })();

        const systemContent = ((body.systemPrompt && body.systemPrompt.trim()) || SYSTEM) +
          (rag.block ? "\n\nWhen the user's question relates to their uploaded documents, use the **Knowledge Base Excerpts** below and cite them inline as `[document_name §chunk_index]`." : "") +
          memSummary;

        const aiMessages: any[] = [{ role: "system", content: systemContent }];
        for (const m of body.messages) {
          if (m.role === "assistant") { aiMessages.push({ role: "assistant", content: m.content }); continue; }
          const parts: any[] = [];
          let textBlob = m.content || "";
          if (m === lastUserMsg && rag.block) textBlob += rag.block;
          for (const a of m.attachments ?? []) {
            if (a.text) textBlob += `\n\n--- File: ${a.name} (${a.mime}) ---\n${a.text}\n--- end ---`;
            else if (a.dataUrl && (a.mime.startsWith("image/") || a.mime === "application/pdf"))
              parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
          }
          parts.unshift({ type: "text", text: textBlob || "(no message)" });
          aiMessages.push({ role: "user", content: parts });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        if (lastUserMsg) {
          await supabase.from("messages").insert({
            conversation_id: conversationId, user_id: userId, role: "user",
            content: lastUserMsg.content,
            attachments: (lastUserMsg.attachments ?? []).map((a) => ({ name: a.name, mime: a.mime, hasText: !!a.text })),
          });
        }

        // Memory update helper (used by remember/forget tools).
        async function applyMemoryPatch(patch: Partial<typeof memory>) {
          const next = {
            user_id: userId,
            preferences: patch.preferences ?? memory.preferences,
            recurring_tasks: patch.recurring_tasks ?? memory.recurring_tasks,
            fetch_allowlist: patch.fetch_allowlist ?? memory.fetch_allowlist,
            updated_at: new Date().toISOString(),
          };
          memory = { preferences: next.preferences, recurring_tasks: next.recurring_tasks, fetch_allowlist: next.fetch_allowlist };
          await supabase.from("user_connections"); // no-op type warm
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.from("user_memory").upsert(next as any, { onConflict: "user_id" });
        }

        async function executeTool(name: string, args: any): Promise<string> {
          try {
            switch (name) {
              case "web_search": return await tool_web_search(String(args?.query ?? ""), userId);
              case "fetch_url": return await tool_fetch_url(String(args?.url ?? ""), userId, memory.fetch_allowlist);
              case "calculate": return tool_calculate(String(args?.expression ?? ""));
              case "run_js": return await runJsAsync(String(args?.code ?? ""));
              case "current_time": return tool_current_time();
              case "send_email": return await tool_send_email(args, connByConnector["google_mail"] ?? null);
              case "create_calendar_event": return await tool_create_calendar_event(args, connByConnector["google_calendar"] ?? null);
              case "remember": {
                const key = String(args?.key ?? "").slice(0, 100);
                if (!key) return JSON.stringify({ error: "missing key" });
                const next = { ...memory.preferences, [key]: args?.value };
                await applyMemoryPatch({ preferences: next });
                return JSON.stringify({ ok: true, remembered: key });
              }
              case "forget": {
                const key = String(args?.key ?? "");
                if (!key) return JSON.stringify({ error: "missing key" });
                const next = { ...memory.preferences };
                delete next[key];
                await applyMemoryPatch({ preferences: next });
                return JSON.stringify({ ok: true, forgot: key });
              }
              default: return JSON.stringify({ error: `unknown tool ${name}` });
            }
          } catch (e: any) {
            return JSON.stringify({ error: String(e?.message || e) });
          }
        }

        const MAX_ITERS = 6;
        let finalText = "";

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (s: string) => controller.enqueue(enc.encode(s));

            try {
              for (let iter = 0; iter < MAX_ITERS; iter++) {
                const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: body.model || "google/gemini-2.5-pro",
                    messages: aiMessages,
                    tools: TOOLS,
                    tool_choice: "auto",
                    temperature: 0.7,
                  }),
                });

                if (!upstream.ok) {
                  const t = await upstream.text();
                  console.error("AI upstream error", upstream.status, t);
                  const errMsg = upstream.status === 429
                    ? "Rate limit reached — please wait a moment."
                    : upstream.status === 402
                    ? "AI credits exhausted. Add credits in Lovable Cloud."
                    : "AI gateway error";
                  send(sseData(errMsg));
                  send("data: [DONE]\n\n");
                  controller.close();
                  return;
                }

                const data = await upstream.json();
                const msg = data.choices?.[0]?.message;
                if (!msg) break;

                const toolCalls = msg.tool_calls as any[] | undefined;
                if (toolCalls && toolCalls.length) {
                  aiMessages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
                  // Announce + execute in parallel
                  const parsed = toolCalls.map((tc) => {
                    let args: any = {};
                    try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
                    send(sseAgent({ kind: "tool_call", id: tc.id, name: tc.function?.name, args }));
                    return { tc, args };
                  });
                  const results = await Promise.all(parsed.map(async ({ tc, args }) => {
                    const out = await executeTool(tc.function?.name, args);
                    let ok = true;
                    try { ok = !JSON.parse(out)?.error; } catch {}
                    send(sseAgent({ kind: "tool_result", id: tc.id, name: tc.function?.name, ok, preview: out.slice(0, 400) }));
                    return { tool_call_id: tc.id, role: "tool" as const, name: tc.function?.name, content: out };
                  }));
                  for (const r of results) aiMessages.push(r);
                  continue;
                }

                finalText = msg.content || "";
                if (rag.citations.length) {
                  const seen = new Set<string>();
                  const uniq = rag.citations.filter((c: any) => {
                    const k = `${c.document_id}:${c.chunk_index}`;
                    if (seen.has(k)) return false; seen.add(k); return true;
                  });
                  finalText += "\n\n---\n**Sources**\n" + uniq.map((c: any, i: number) =>
                    `${i + 1}. ${c.document_name} §${c.chunk_index}`).join("\n");
                }
                const chunkSize = 40;
                for (let i = 0; i < finalText.length; i += chunkSize) {
                  send(sseData(finalText.slice(i, i + chunkSize)));
                }
                break;
              }

              if (!finalText) {
                finalText = "I hit my reasoning step limit. Try rephrasing or breaking the request into smaller parts.";
                send(sseData(finalText));
              }

              send("data: [DONE]\n\n");
              controller.close();

              try {
                await supabase.from("messages").insert({
                  conversation_id: conversationId, user_id: userId, role: "assistant",
                  content: finalText,
                });
                await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
                const { data: conv } = await supabase.from("conversations").select("title").eq("id", conversationId).maybeSingle();
                if (conv && (!conv.title || conv.title === "New chat") && lastUserMsg?.content) {
                  await supabase.from("conversations").update({ title: lastUserMsg.content.trim().slice(0, 60) || "New chat" }).eq("id", conversationId);
                }
              } catch (e) { console.error("persist error", e); }
            } catch (e: any) {
              console.error("agent loop error", e);
              send(sseData(`\n\n[error: ${String(e?.message || e)}]`));
              send("data: [DONE]\n\n");
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Conversation-Id": conversationId,
            "X-Citations": rag.citations.length ? encodeURIComponent(JSON.stringify(rag.citations)) : "",
            "Access-Control-Expose-Headers": "X-Conversation-Id, X-Citations",
          },
        });
      },
    },
  },
});
