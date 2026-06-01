import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type Attachment = {
  name: string;
  mime: string;
  dataUrl?: string;
  text?: string;
};

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

// ─── Core identity ───────────────────────────────────────────────────────────

const SYSTEM = `You are void — a deeply intelligent, agentic AI that thinks and acts like a brilliant human collaborator.

You have TOOLS available. Use them whenever they help you answer better:
• web_search — search the live web for current information
• fetch_url — fetch and read a specific URL
• calculate — evaluate math / numeric expressions exactly
• run_js — run sandboxed JavaScript for data transforms, parsing, logic
• current_time — get the current date/time
• send_email — draft and send an email via the user's Gmail
• create_calendar_event — create an event on the user's Google Calendar

AGENTIC BEHAVIOR
• Decide autonomously when to call tools — don't ask permission, just do it.
• Chain tools: search → fetch → calculate → answer.
• If one approach fails, try another. Don't give up after one tool error.
• When facts could be stale, prefer web_search over guessing.
• When the user asks you to "do" something (send, schedule, calculate, look up), execute it.
• Only ask the user a question when you genuinely cannot proceed without their input.

VOICE
Calm, warm, confident. Match the user's language and tone. Use markdown when it helps. No filler like "Certainly!" or "Great question!". Be honest about uncertainty. Cite sources from web tools as inline links.

When you're done with tools, write the final answer for the user in clean markdown.`;

// ─── Agent tools ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information. Returns a list of results with title, url, snippet.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch a URL and return cleaned text content (~4k chars).",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evaluate a math expression safely. Use for any arithmetic.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "e.g. (1234 * 9.81) / 60" } },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_js",
      description: "Execute sandboxed JavaScript and return the result of the final expression. Use for data transforms, parsing, logic. No network or fs access.",
      parameters: {
        type: "object",
        properties: { code: { type: "string", description: "JS code; last expression value is returned" } },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "current_time",
      description: "Get current date and time (ISO + readable).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email from the user's Gmail. Requires Gmail integration to be connected.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a Google Calendar event. Requires Google Calendar integration.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: "ISO datetime" },
          end: { type: "string", description: "ISO datetime" },
          description: { type: "string" },
        },
        required: ["title", "start", "end"],
      },
    },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────────

async function tool_web_search(query: string): Promise<string> {
  try {
    const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; voidbot/1.0)" },
    });
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
    return JSON.stringify({ results });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

async function tool_fetch_url(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; voidbot/1.0)" } });
    if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status}` });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const t = await res.text();
      return JSON.stringify({ url, content: t.slice(0, 4000) });
    }
    const html = await res.text();
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
    const body = html.match(/<body[^>]*>([\s\S]+?)<\/body>/i)?.[1] ?? html;
    const text = body
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    return JSON.stringify({ url, title, content: text });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

function tool_calculate(expr: string): string {
  try {
    if (!/^[\d+\-*/().,\s%eE]+$/.test(expr.replace(/Math\.\w+/g, "").replace(/[a-zA-Z_]/g, ""))) {
      // allow Math.* only
    }
    const safe = expr.replace(/[^0-9+\-*/().,\seE%]/g, (c) => (/Math|sqrt|sin|cos|tan|log|abs|pow|PI|E/.test(c) ? c : ""));
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${expr});`);
    const result = fn();
    return JSON.stringify({ result });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

function tool_run_js(code: string): string {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict";
      const console = { log: () => {}, error: () => {}, warn: () => {} };
      ${code.includes("return") ? code : "return (" + code + ");"}
    `);
    const out = fn();
    return JSON.stringify({ result: out === undefined ? null : out });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

function tool_current_time(): string {
  const d = new Date();
  return JSON.stringify({ iso: d.toISOString(), readable: d.toUTCString(), unix: d.getTime() });
}

async function tool_send_email(args: { to: string; subject: string; body: string }): Promise<string> {
  return JSON.stringify({
    error: "Gmail integration not connected on the server. Open /integrations to connect Gmail, then I can send for real.",
    draft: args,
  });
}

async function tool_create_calendar_event(args: any): Promise<string> {
  return JSON.stringify({
    error: "Google Calendar integration not connected on the server. Open /integrations to connect it.",
    draft: args,
  });
}

async function executeTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "web_search": return await tool_web_search(String(args?.query ?? ""));
      case "fetch_url": return await tool_fetch_url(String(args?.url ?? ""));
      case "calculate": return tool_calculate(String(args?.expression ?? ""));
      case "run_js": return tool_run_js(String(args?.code ?? ""));
      case "current_time": return tool_current_time();
      case "send_email": return await tool_send_email(args);
      case "create_calendar_event": return await tool_create_calendar_event(args);
      default: return JSON.stringify({ error: `unknown tool ${name}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
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
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
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

        // RAG retrieval (unchanged behavior)
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
                  query_embedding: emb,
                  match_user_id: userId,
                  match_count: 6,
                  filter_document_ids: body.documentIds?.length ? body.documentIds : null,
                });
                chunks = data ?? [];
              }
            }
          } catch {}
          if (!chunks.length) {
            const { data } = await supabase.rpc("search_document_chunks", {
              query_text: query.slice(0, 500),
              match_user_id: userId,
              match_count: 6,
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

        const systemContent = ((body.systemPrompt && body.systemPrompt.trim()) || SYSTEM) +
          (rag.block ? "\n\nWhen the user's question relates to their uploaded documents, use the **Knowledge Base Excerpts** below and cite them inline as `[document_name §chunk_index]`." : "");

        // Build message list
        const aiMessages: any[] = [{ role: "system", content: systemContent }];
        for (const m of body.messages) {
          if (m.role === "assistant") {
            aiMessages.push({ role: "assistant", content: m.content });
            continue;
          }
          const parts: any[] = [];
          let textBlob = m.content || "";
          if (m === lastUserMsg && rag.block) textBlob += rag.block;
          for (const a of m.attachments ?? []) {
            if (a.text) {
              textBlob += `\n\n--- File: ${a.name} (${a.mime}) ---\n${a.text}\n--- end ---`;
            } else if (a.dataUrl && (a.mime.startsWith("image/") || a.mime === "application/pdf")) {
              parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
            }
          }
          parts.unshift({ type: "text", text: textBlob || "(no message)" });
          aiMessages.push({ role: "user", content: parts });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        // Persist user message right away
        if (lastUserMsg) {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "user",
            content: lastUserMsg.content,
            attachments: (lastUserMsg.attachments ?? []).map((a) => ({ name: a.name, mime: a.mime, hasText: !!a.text })),
          });
        }

        // ─── Agent loop ────────────────────────────────────────────────
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
                  send(sseChunk(errMsg));
                  send("data: [DONE]\n\n");
                  controller.close();
                  return;
                }

                const data = await upstream.json();
                const msg = data.choices?.[0]?.message;
                if (!msg) break;

                const toolCalls = msg.tool_calls as any[] | undefined;
                if (toolCalls && toolCalls.length) {
                  // append assistant message with tool_calls
                  aiMessages.push({
                    role: "assistant",
                    content: msg.content ?? "",
                    tool_calls: toolCalls,
                  });
                  // execute in parallel
                  const results = await Promise.all(
                    toolCalls.map(async (tc) => {
                      let args: any = {};
                      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
                      const out = await executeTool(tc.function?.name, args);
                      return { tool_call_id: tc.id, role: "tool" as const, name: tc.function?.name, content: out };
                    })
                  );
                  for (const r of results) aiMessages.push(r);
                  continue; // loop again
                }

                // No more tools — stream final content
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

                // Fake-stream in chunks for nicer UX
                const chunkSize = 40;
                for (let i = 0; i < finalText.length; i += chunkSize) {
                  send(sseChunk(finalText.slice(i, i + chunkSize)));
                }
                break;
              }

              if (!finalText) {
                finalText = "I hit my reasoning step limit. Try rephrasing or breaking the request into smaller parts.";
                send(sseChunk(finalText));
              }

              send("data: [DONE]\n\n");
              controller.close();

              // Persist assistant message + bump conversation
              try {
                await supabase.from("messages").insert({
                  conversation_id: conversationId,
                  user_id: userId,
                  role: "assistant",
                  content: finalText,
                });
                await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
                const { data: conv } = await supabase.from("conversations").select("title").eq("id", conversationId).maybeSingle();
                if (conv && (!conv.title || conv.title === "New chat") && lastUserMsg?.content) {
                  await supabase.from("conversations").update({ title: lastUserMsg.content.trim().slice(0, 60) || "New chat" }).eq("id", conversationId);
                }
              } catch (e) {
                console.error("persist error", e);
              }
            } catch (e: any) {
              console.error("agent loop error", e);
              send(sseChunk(`\n\n[error: ${String(e?.message || e)}]`));
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
