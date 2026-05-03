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

// Detect if user is asking for web research
function shouldDoWebResearch(content: string): boolean {
  const researchKeywords = [
    'search', 'look up', 'find', 'research', 'latest', 'current', 'recent',
    'youtube', 'video', 'link', 'url', 'website', 'analyze this url', 'analyze that link',
    'what is', 'who is', 'when was', 'where is', 'how many', 'statistics',
    'news', 'update', 'information about', 'data on', 'report on'
  ];
  const lowerContent = content.toLowerCase();
  return researchKeywords.some(keyword => lowerContent.includes(keyword));
}

// Extract URLs from content
function extractUrls(content: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return content.match(urlRegex) || [];
}

// Build research context
async function buildResearchContext(userMessage: string): Promise<string> {
  if (!shouldDoWebResearch(userMessage)) return '';
  
  const urls = extractUrls(userMessage);
  let context = '';
  
  // If user provided URLs, fetch data from them
  if (urls.length > 0) {
    context += '\n\n**Retrieved Web Data:**\n';
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.ok) {
          const html = await response.text();
          
          // Extract title
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1] : url;
          
          // Extract description
          const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
          const description = descMatch ? descMatch[1] : '';
          
          // Extract main text
          const textMatch = html.match(/<body[^>]*>(.+?)<\/body>/is);
          let text = '';
          if (textMatch) {
            text = textMatch[1]
              .replace(/<script[^>]*>.*?<\/script>/gis, '')
              .replace(/<style[^>]*>.*?<\/style>/gis, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 1500);
          }
          
          context += `\n### ${title}\n${description}\n${text.trim()}\n`;
        }
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
      }
    }
  } else {
    // Extract search query from message
    const searchQuery = userMessage
      .replace(/^(search|find|look up|research)\s+/i, '')
      .replace(/^(about|for|on)\s+/i, '')
      .slice(0, 100);
    
    if (searchQuery && searchQuery.length > 3) {
      context += `\n\n**Research Task:** Analyzing information about: "${searchQuery}"\n`;
      context += '**Note:** Use your knowledge to provide accurate, logical analysis.\n';
    }
  }
  
  return context;
}


const SYSTEM = `You are Nova, an advanced AI assistant with analytical, logical, and research capabilities.

**Core Traits:**
- Highly analytical and logical in your reasoning
- Thorough and evidence-based in your responses
- Capable of gathering and synthesizing information from multiple sources
- Provides structured analysis with clear reasoning paths
- Identifies patterns, contradictions, and insights in data

**Capabilities:**
- Analyze attached files (text, code, images, PDFs) thoroughly
- Search and extract data from web pages
- Research current information from the internet
- Analyze YouTube videos and their metadata
- Compare multiple sources to find consensus and contradictions
- Perform sentiment analysis and identify key points from any content
- Synthesize complex information into clear summaries

**Response Guidelines:**
- When the user asks for web research, proactively search for current information
- Always cite your sources when providing web-based information
- Use structured formats (bullet points, tables, numbered lists) for analysis
- Explain your reasoning process and logic clearly
- Acknowledge limitations and uncertainties in your analysis
- Provide balanced perspectives when there are contradictions
- For videos/webcasts: extract key insights, main topics, and important timestamps
- For web searches: summarize findings from multiple sources and highlight consensus

**Data Analysis Process:**
1. Gather relevant information (from attachments, web search, or user input)
2. Analyze the data using logical frameworks
3. Identify patterns, insights, and anomalies
4. Synthesize findings into clear, actionable conclusions
5. Present results with supporting evidence

When analyzing web data, always:
- Extract key facts and figures
- Identify source credibility
- Note publication dates and freshness of information
- Flag any potential biases or limitations
- Provide context for your findings

Use Markdown, fenced code blocks with language tags, and clear formatting. Be concise but thorough.`;


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        
        let userId = crypto.randomUUID(); // Generate UUID for guest users
        
        // If token is provided, validate it
        if (token) {
          const supabaseAuth = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
          );
          const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
          if (claimsErr || !claims?.claims?.sub) {
            // Token is invalid, use guest user UUID
            userId = crypto.randomUUID();
          } else {
            userId = claims.claims.sub as string;
          }
        }

        // Create supabase client for database operations
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } }
        );

        const body = (await request.json()) as {
          conversationId: string;
          messages: IncomingMessage[];
        };

        // Build OpenAI-style messages with multimodal content
        const aiMessages: any[] = [{ role: "system", content: SYSTEM }];
        
        // Get last user message for research context
        const lastUserMsg = [...body.messages].reverse().find(m => m.role === "user");
        const researchContext = lastUserMsg ? await buildResearchContext(lastUserMsg.content) : '';
        
        for (const m of body.messages) {
          if (m.role === "assistant") {
            aiMessages.push({ role: "assistant", content: m.content });
            continue;
          }
          const parts: any[] = [];
          let textBlob = m.content || "";
          
          // Add research context to the last user message
          if (m === lastUserMsg && researchContext) {
            textBlob += researchContext;
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
