import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const getTodayBriefing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("briefings")
      .select("*")
      .eq("user_id", userId)
      .eq("for_date", todayISO())
      .maybeSingle();
    return { briefing: data };
  });

export const listBriefings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("briefings")
      .select("id, for_date, summary, created_at")
      .order("for_date", { ascending: false })
      .limit(30);
    return { briefings: data ?? [] };
  });

export const generateBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ force: z.boolean().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = todayISO();

    if (!data.force) {
      const { data: existing } = await supabase
        .from("briefings").select("*")
        .eq("user_id", userId).eq("for_date", today).maybeSingle();
      if (existing) return { briefing: existing };
    }

    // Gather context: memory + connections + recent conversations
    const [{ data: mem }, { data: conns }, { data: recentMsgs }] = await Promise.all([
      supabase.from("user_memory").select("preferences, recurring_tasks").eq("user_id", userId).maybeSingle(),
      supabase.from("user_connections").select("connector_id"),
      supabase.from("messages").select("role, content, created_at")
        .order("created_at", { ascending: false }).limit(20),
    ]);

    const prefs = mem?.preferences ?? {};
    const tasks = mem?.recurring_tasks ?? [];
    const connectors = (conns ?? []).map((c) => c.connector_id);
    const recent = (recentMsgs ?? []).reverse()
      .map((m) => `${m.role}: ${String(m.content).slice(0, 200)}`).join("\n");

    const sys = `You are void, generating today's personal briefing. Be warm, concise, and useful.
Output in markdown with these sections (skip any with nothing to say):
## Good morning
1–2 sentence opener acknowledging the date and anything in their memory.

## Today's focus
1 suggested focus drawn from preferences, recurring tasks, or recent chats.

## Highlights
3–5 short bullets: what to do today, things to remember, follow-ups from recent conversations.

## Quick wins
1–2 small actions they could knock out in <10 min.

End with a single italic line of encouragement.

Do NOT mention what tools you have or don't have. Do NOT ask questions. Do NOT include preamble.`;

    const user = `Date: ${today}
Connected services: ${connectors.length ? connectors.join(", ") : "none"}
Preferences: ${JSON.stringify(prefs).slice(0, 1500)}
Recurring tasks: ${JSON.stringify(tasks).slice(0, 1000)}

Recent conversation excerpts (oldest → newest):
${recent.slice(-3000) || "(no recent chats)"}`;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "Briefing unavailable.";

    // 1-line summary = first non-heading line
    const summary = content.split("\n")
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0]?.slice(0, 200) ?? null;

    const { data: saved, error } = await supabase
      .from("briefings")
      .upsert({ user_id: userId, for_date: today, content, summary }, { onConflict: "user_id,for_date" })
      .select().single();
    if (error) throw new Error(error.message);
    return { briefing: saved };
  });
