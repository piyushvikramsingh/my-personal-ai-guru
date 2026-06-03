import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_memory")
      .select("preferences, recurring_tasks, fetch_allowlist")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (
      data ?? { preferences: {}, recurring_tasks: [], fetch_allowlist: [] as string[] }
    );
  });

export const updateMyMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        preferences: z.record(z.string(), z.unknown()).optional(),
        recurring_tasks: z.array(z.unknown()).optional(),
        fetch_allowlist: z.array(z.string().min(1).max(255)).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_memory").upsert(
      {
        user_id: context.userId,
        ...(data.preferences !== undefined && { preferences: data.preferences }),
        ...(data.recurring_tasks !== undefined && { recurring_tasks: data.recurring_tasks }),
        ...(data.fetch_allowlist !== undefined && { fetch_allowlist: data.fetch_allowlist }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
