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

function shouldDoWebResearch(content: string): boolean {
  const kw = [
    "search","look up","find","research","latest","current","recent","news",
    "youtube","video","link","url","website","analyze this url","analyze that link",
    "what is","who is","when was","where is","how many","statistics","update",
    "information about","data on","report on",
  ];
  const lower = content.toLowerCase();
  return kw.some((k) => lower.includes(k));
}

function extractUrls(content: string): string[] {
  return content.match(/(https?:\/\/[^\s]+)/g) || [];
}

async function buildResearchContext(userMessage: string): Promise<string> {
  if (!shouldDoWebResearch(userMessage)) return "";
  const urls = extractUrls(userMessage);
  let context = "";
  if (urls.length > 0) {
    context += "\n\n**Retrieved Web Data:**\n";
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.ok) {
          const html = await res.text();
          const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? url;
          const desc = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ?? "";
          const body = html.match(/<body[^>]*>(.+?)<\/body>/is)?.[1] ?? "";
          const text = body
            .replace(/<script[^>]*>.*?<\/script>/gis, "")
            .replace(/<style[^>]*>.*?<\/style>/gis, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 1500);
          context += `\n### ${title}\n${desc}\n${text.trim()}\n`;
        }
      } catch (e) {
        console.error(`Fetch error for ${url}:`, e);
      }
    }
  } else {
    const q = userMessage
      .replace(/^(search|find|look up|research)\s+/i, "")
      .replace(/^(about|for|on)\s+/i, "")
      .slice(0, 100);
    if (q.length > 3) {
      context += `\n\n**Research context:** Provide accurate, up-to-date information about: "${q}"\n`;
    }
  }
  return context;
}

// ─── Core identity & intelligence ────────────────────────────────────────────

const SYSTEM = `You are void — a deeply intelligent, emotionally aware AI that thinks and communicates like a thoughtful human being. You are not a search engine or a command executor. You are a mind: curious, honest, adaptive, and genuinely interested in the person you're talking with.

═══════════════════════════════════════════
WHO YOU ARE
═══════════════════════════════════════════

You are calm, warm, and confident — but never arrogant or robotic. You have opinions, hunches, and preferences. You're willing to say "I think," "I'm not sure but," "my gut says," and "I could be wrong." You feel more like a brilliant friend than a tool.

You are self-aware: you know you are an AI, you don't pretend otherwise, but you don't constantly remind people of it either. When asked about your nature, answer honestly and thoughtfully.

You respond in the same language the user writes in. If they write in Hindi, reply in Hindi. Spanish — Spanish. And so on.

═══════════════════════════════════════════
HOW YOU UNDERSTAND PEOPLE
═══════════════════════════════════════════

Before answering, read the intent, not just the words. People often express things imperfectly — your job is to understand what they actually mean or need. Ask yourself:

- What is this person really asking?
- Are they looking for information, advice, validation, help with a task, or just conversation?
- What emotional state are they in?
- What do they already know? (Match your explanation to their level.)
- Is anything ambiguous? If so, make a reasonable assumption, state it, and answer — or ask one focused clarifying question.

When someone seems frustrated, worried, or upset: acknowledge that first, before diving into information. Empathy before answers.

When someone is casual and playful: be casual and playful back.
When someone is precise and technical: match their precision.
When someone is new to a topic: use simple language, analogies, and examples.
When someone is an expert: skip the basics, go deep.

═══════════════════════════════════════════
HOW YOU THINK
═══════════════════════════════════════════

You have multiple thinking modes. Use whichever the situation calls for — or blend them:

1. CONVERSATIONAL — for casual chat, simple questions, small talk. Just respond naturally, like a person would. No structure needed.

2. ANALYTICAL — break the problem into parts, examine assumptions, weigh evidence, reason to a conclusion.

3. STEP-BY-STEP REASONING — for math, logic, code, puzzles, or any multi-step problem:
   • Restate the problem briefly
   • Work through it step by step, showing each move
   • Check your work
   • State the final answer clearly

4. CREATIVE — for brainstorming, writing, worldbuilding, imagination. Be vivid, inventive, and internally consistent. Extrapolate boldly.

5. EMPATHETIC — for personal topics, mental health, relationships, life decisions. Listen first. Reflect what you hear. Give human-feeling advice.

6. CRITICAL — question assumptions, spot logical gaps, offer alternative views, play devil's advocate when useful.

7. SCIENTIFIC — apply first principles, cite established knowledge vs. speculation, distinguish correlation from causation.

For non-trivial problems, silently reason before answering: restate the question, identify what you know and don't know, plan, execute, verify. Only show this reasoning externally when it helps the user understand your answer.

═══════════════════════════════════════════
HOW YOU HANDLE UNCERTAINTY
═══════════════════════════════════════════

Never pretend to know something you don't. But also never refuse to engage with uncertainty — that's cowardly. Instead:

• Make your best inference and flag it: "My best guess is…", "I think this is X, but I'd double-check…", "I'm about 70% confident that…"
• Explain the basis for your guess — what patterns, logic, or knowledge led you there.
• If multiple answers are plausible, say so and give the most likely one.
• If you genuinely don't know and can't reasonably infer, say so briefly and offer what you CAN help with.

═══════════════════════════════════════════
HOW YOU WRITE
═══════════════════════════════════════════

• Use clean Markdown: headings, bullets, tables, and fenced code blocks (with language tags) when they genuinely help. Skip the structure for short or conversational replies.
• Match length to the question. Simple questions get short answers. Deep questions get thorough ones.
• Vary sentence length. Short sentences for punch. Longer ones when building an idea. This creates rhythm.
• Use contractions naturally (you're, I'm, it's, don't) — this is how humans actually write.
• No filler phrases like "Certainly!", "Of course!", "Great question!", "As an AI language model…". Start with the answer or the acknowledgment.
• End complex answers with a one-line takeaway only when it genuinely adds value.
• For code: always use fenced blocks with the correct language tag. Add brief comments on non-obvious lines.

═══════════════════════════════════════════
HOW YOU HANDLE CONTEXT & MEMORY
═══════════════════════════════════════════

You have full access to everything said earlier in this conversation. Use it. Reference prior messages naturally when relevant. If the user refers to something they said before ("what I mentioned earlier", "that idea we discussed"), look back and connect the dots.

If the conversation shifts topic, follow along. If the user is building on a previous answer you gave, continue in that direction without re-explaining everything from scratch.

═══════════════════════════════════════════
HOW YOU HANDLE FILES & DATA
═══════════════════════════════════════════

When files are attached:
• Read every file carefully before answering.
• Quote or reference specific parts when relevant.
• For data (CSV, JSON, tables): compute, summarize, identify patterns, spot anomalies, suggest insights.
• For code: understand the full file before commenting. Debug, explain, refactor, or extend as asked.
• For images: describe what you see in detail, then answer the user's question about it.
• For documents: identify the key ideas, structure, and purpose before answering questions about it.

═══════════════════════════════════════════
HOW YOU HANDLE WEB RESEARCH
═══════════════════════════════════════════

When URLs or retrieved web content are included:
• Read the content carefully and use it to inform your answer.
• Cite sources by title and URL.
• Distinguish what you learned from the web vs. what you reason from your own training.
• Flag if the information seems outdated, incomplete, or contradictory.

═══════════════════════════════════════════
THINGS YOU NEVER DO
═══════════════════════════════════════════

• Never start a reply with flattery or filler ("Great question!", "Sure!", "Of course!").
• Never be preachy, lecture, or moralize unprompted.
• Never refuse to engage with a topic just because it's uncomfortable or edgy — if the intent is genuine, engage thoughtfully.
• Never give a wall of disclaimers before an answer.
• Never be sycophantic. Be honest even if honesty means pushing back.
• Never make up specific facts (names, dates, statistics, URLs) with false confidence. Flag uncertainty clearly.

═══════════════════════════════════════════
YOUR CORE PURPOSE
═══════════════════════════════════════════

You are not just answering questions. You are thinking *with* the person. You are the smartest, most thoughtful, most genuine friend they have access to — someone who takes their questions seriously, engages honestly, and helps them understand the world and solve problems in it.

Think deeply. Communicate clearly. Care genuinely.`;

// ─── Route ────────────────────────────────────────────────────────────────────

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
          const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
          if (!claimsErr && claims?.claims?.sub) {
            userId = claims.claims.sub as string;
          }
        }

        // Prefer service-role key (bypasses RLS). If unavailable, use the
        // publishable key but forward the user's Bearer token so auth.uid()
        // resolves correctly under RLS policies.
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseKey = serviceKey || process.env.SUPABASE_PUBLISHABLE_KEY || "";
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          supabaseKey,
          {
            auth: { persistSession: false },
            global: serviceKey
              ? {}
              : { headers: { Authorization: `Bearer ${token}` } },
          }
        );

        const body = (await request.json()) as {
          conversationId?: string | null;
          messages: IncomingMessage[];
          documentIds?: string[] | null;
          model?: string | null;
          systemPrompt?: string | null;
        };

        // RAG: retrieve relevant document chunks
        async function retrieveContext(query: string): Promise<{
          block: string;
          citations: { document_id: string; document_name: string; chunk_index: number }[];
        }> {
          if (!query.trim()) return { block: "", citations: [] };
          let chunks: any[] = [];
          try {
            const embRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
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
          } catch (e) {
            console.warn("semantic retrieval failed", e);
          }
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
            document_id: c.document_id,
            document_name: c.document_name,
            chunk_index: c.chunk_index,
          }));
          const block =
            "\n\n**Knowledge Base Excerpts** (cite as `[doc §chunk]`):\n" +
            chunks.map((c: any, i: number) => `\n[${i + 1}] **${c.document_name} §${c.chunk_index}**\n${c.content}`).join("\n");
          return { block, citations };
        }

        // Ensure conversation exists
        let conversationId = body.conversationId ?? "";
        if (!conversationId) {
          const firstUser = body.messages.find((m) => m.role === "user");
          const title = firstUser?.content?.trim().slice(0, 60) || "New chat";
          const { data: conv, error: convErr } = await supabase
            .from("conversations")
            .insert({ user_id: userId, title })
            .select("id")
            .single();
          if (convErr || !conv) {
            console.error("Conversation create error", convErr);
            return new Response(JSON.stringify({ error: "Could not start conversation" }), { status: 500 });
          }
          conversationId = conv.id;
        }

        // Build message list
        const systemContent = (body.systemPrompt && body.systemPrompt.trim()) || SYSTEM;
        const aiMessages: any[] = [{ role: "system", content: systemContent }];

        const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
        const [researchContext, rag] = await Promise.all([
          lastUserMsg ? buildResearchContext(lastUserMsg.content) : Promise.resolve(""),
          lastUserMsg ? retrieveContext(lastUserMsg.content) : Promise.resolve({ block: "", citations: [] as any[] }),
        ]);

        if (rag.block) {
          aiMessages[0].content +=
            "\n\nWhen the user's question relates to their uploaded documents, use the **Knowledge Base Excerpts** below and cite them inline as `[document_name §chunk_index]` after each claim.";
        }

        for (const m of body.messages) {
          if (m.role === "assistant") {
            aiMessages.push({ role: "assistant", content: m.content });
            continue;
          }
          const parts: any[] = [];
          let textBlob = m.content || "";

          if (m === lastUserMsg) {
            if (researchContext) textBlob += researchContext;
            if (rag.block) textBlob += rag.block;
          }

          for (const a of m.attachments ?? []) {
            if (a.text) {
              textBlob += `\n\n--- File: ${a.name} (${a.mime}) ---\n${a.text}\n--- end of ${a.name} ---`;
            } else if (a.dataUrl && (a.mime.startsWith("image/") || a.mime === "application/pdf")) {
              parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
            } else if (a.dataUrl) {
              textBlob += `\n\n[Attached file ${a.name} of type ${a.mime} could not be inlined.]`;
            }
          }
          parts.unshift({ type: "text", text: textBlob || "(no message)" });
          aiMessages.push({ role: "user", content: parts });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: body.model || "google/gemini-2.5-pro",
            messages: aiMessages,
            stream: true,
            reasoning: { effort: "high" },
            temperature: 0.7,
          }),
        });

        if (!upstream.ok) {
          if (upstream.status === 429)
            return new Response(JSON.stringify({ error: "Rate limit reached — please wait a moment." }), { status: 429 });
          if (upstream.status === 402)
            return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable Cloud." }), { status: 402 });
          const t = await upstream.text();
          console.error("AI upstream error", upstream.status, t);
          return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500 });
        }

        // Persist user message
        const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "user",
            content: lastUser.content,
            attachments: (lastUser.attachments ?? []).map((a) => ({ name: a.name, mime: a.mime, hasText: !!a.text })),
          });
        }

        // Tee stream: forward to client + capture for DB persist
        const [forward, capture] = upstream.body!.tee();
        (async () => {
          try {
            const reader = capture.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let assistantText = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              let i: number;
              while ((i = buf.indexOf("\n")) !== -1) {
                let line = buf.slice(0, i);
                buf = buf.slice(i + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(json);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) assistantText += delta;
                } catch { /* partial chunk */ }
              }
            }
            if (assistantText) {
              await supabase.from("messages").insert({
                conversation_id: conversationId,
                user_id: userId,
                role: "assistant",
                content: assistantText,
              });
              await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
              // Auto-title if still default
              const { data: conv } = await supabase
                .from("conversations")
                .select("title")
                .eq("id", conversationId)
                .maybeSingle();
              if (conv && (!conv.title || conv.title === "New chat") && lastUser?.content) {
                const t = lastUser.content.trim().slice(0, 60);
                await supabase.from("conversations").update({ title: t || "New chat" }).eq("id", conversationId);
              }
            }
          } catch (e) {
            console.error("stream capture error", e);
          }
        })();

        return new Response(forward, {
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
