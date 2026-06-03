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
    const row: {
      user_id: string;
      preferences?: unknown;
      recurring_tasks?: unknown;
      fetch_allowlist?: string[];
      updated_at: string;
    } = {
      user_id: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.preferences !== undefined) row.preferences = data.preferences;
    if (data.recurring_tasks !== undefined) row.recurring_tasks = data.recurring_tasks;
    if (data.fetch_allowlist !== undefined) row.fetch_allowlist = data.fetch_allowlist;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("user_memory").upsert(row as any, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
