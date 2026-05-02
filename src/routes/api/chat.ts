import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type Attachment = {
  name: string;
  mime: string;
  /** for images / pdfs: base64 data url. For text: raw text in `text` */
  dataUrl?: string;
  text?: string;
};

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

const SYSTEM = `You are Nova, a helpful, precise personal AI assistant.
- When the user attaches files, analyze their contents thoroughly and answer based on what they actually contain.
- For text/code files, content is provided inline. For images and PDFs, you receive them as media.
- Use Markdown. Use fenced code blocks with language tags. Cite the file name when referring to attachments.
- Be concise but complete. If something is unclear, ask a follow-up.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
        );
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = claims.claims.sub as string;

        const body = (await request.json()) as {
          conversationId: string;
          messages: IncomingMessage[];
        };

        // Build OpenAI-style messages with multimodal content
        const aiMessages: any[] = [{ role: "system", content: SYSTEM }];
        for (const m of body.messages) {
          if (m.role === "assistant") {
            aiMessages.push({ role: "assistant", content: m.content });
            continue;
          }
          const parts: any[] = [];
          let textBlob = m.content || "";
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
            model: "google/gemini-3-flash-preview",
            messages: aiMessages,
            stream: true,
          }),
        });

        if (!upstream.ok) {
          if (upstream.status === 429)
            return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment." }), { status: 429 });
          if (upstream.status === 402)
            return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), { status: 402 });
          const t = await upstream.text();
          console.error("AI upstream error", upstream.status, t);
          return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500 });
        }

        // Persist user message (only the latest one) before streaming
        const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          await supabase.from("messages").insert({
            conversation_id: body.conversationId,
            user_id: userId,
            role: "user",
            content: lastUser.content,
            attachments: (lastUser.attachments ?? []).map((a) => ({
              name: a.name, mime: a.mime, hasText: !!a.text,
            })),
          });
        }

        // Tee the stream: forward to client, accumulate to save assistant message
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
              let i;
              while ((i = buf.indexOf("\n")) !== -1) {
                let line = buf.slice(0, i); buf = buf.slice(i + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(json);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) assistantText += delta;
                } catch { /* partial */ }
              }
            }
            if (assistantText) {
              await supabase.from("messages").insert({
                conversation_id: body.conversationId,
                user_id: userId,
                role: "assistant",
                content: assistantText,
              });
              await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", body.conversationId);
              // auto-title if currently default
              const { data: conv } = await supabase.from("conversations").select("title").eq("id", body.conversationId).maybeSingle();
              if (conv && (conv.title === "New chat" || !conv.title) && lastUser?.content) {
                const t = lastUser.content.trim().slice(0, 60);
                await supabase.from("conversations").update({ title: t || "New chat" }).eq("id", body.conversationId);
              }
            }
          } catch (e) {
            console.error("capture error", e);
          }
        })();

        return new Response(forward, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
