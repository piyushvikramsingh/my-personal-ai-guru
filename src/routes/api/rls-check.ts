import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Verifies whether the current session can perform conversation/message writes
 * under the active RLS policies. Performs a real INSERT then rolls it back by
 * deleting the test row, so the answer reflects production policies.
 */
export const Route = createFileRoute("/api/rls-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        const result: any = {
          hasToken: !!token,
          userId: null as string | null,
          isAnonymous: null as boolean | null,
          conversations: { canInsert: false, error: null as string | null },
          messages: { canInsert: false, error: null as string | null },
          documents: { canInsert: false, error: null as string | null },
        };

        if (!token) {
          return new Response(JSON.stringify({ ...result, ok: false, reason: "No bearer token" }),
            { status: 200, headers: { "Content-Type": "application/json" } });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
        );

        const { data: claims, error: claimErr } = await supabase.auth.getClaims(token);
        if (claimErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ ...result, ok: false, reason: claimErr?.message ?? "Invalid token" }),
            { status: 200, headers: { "Content-Type": "application/json" } });
        }
        const userId = claims.claims.sub as string;
        result.userId = userId;
        result.isAnonymous = (claims.claims as any).is_anonymous ?? null;

        // Try inserting a probe conversation
        const { data: convRow, error: convErr } = await supabase
          .from("conversations")
          .insert({ user_id: userId, title: "__rls_probe__" })
          .select("id")
          .single();

        if (convErr) result.conversations.error = convErr.message;
        else {
          result.conversations.canInsert = true;
          // probe message
          const { error: msgErr } = await supabase.from("messages").insert({
            conversation_id: convRow.id, user_id: userId, role: "user", content: "__rls_probe__",
          });
          if (msgErr) result.messages.error = msgErr.message;
          else result.messages.canInsert = true;
          // cleanup
          await supabase.from("conversations").delete().eq("id", convRow.id);
        }

        // Probe documents
        const { data: docRow, error: docErr } = await supabase
          .from("documents")
          .insert({ user_id: userId, name: "__rls_probe__", mime: "text/plain", size: 0, source: "local", status: "ready" })
          .select("id")
          .single();
        if (docErr) result.documents.error = docErr.message;
        else {
          result.documents.canInsert = true;
          await supabase.from("documents").delete().eq("id", docRow.id);
        }

        const ok = result.conversations.canInsert && result.messages.canInsert;
        return new Response(JSON.stringify({ ...result, ok }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
