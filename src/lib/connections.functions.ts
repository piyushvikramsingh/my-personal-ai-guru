import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { authorizeAppUserOAuth } from "@/integrations/lovable/appUserConnector";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

// Map our connector ids → Lovable connector ids + default scopes.
const CONNECTOR_CONFIG: Record<string, { id: string; scopes: string[]; clientIdEnv: string }> = {
  google_mail: {
    id: "google_mail",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    clientIdEnv: "GOOGLE_APP_USER_CONNECTOR_CLIENT_ID",
  },
  google_calendar: {
    id: "google_calendar",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    clientIdEnv: "GOOGLE_APP_USER_CONNECTOR_CLIENT_ID",
  },
};

export const startConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ connectorId: z.string().min(1), targetOrigin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const cfg = CONNECTOR_CONFIG[data.connectorId];
    if (!cfg) throw new Error(`Unknown connector ${data.connectorId}`);
    const clientId = process.env[cfg.clientIdEnv];
    if (!clientId) {
      throw new Error(
        `${cfg.clientIdEnv} is not configured on the server. Ask the developer to add this secret.`,
      );
    }
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: cfg.id,
      appUserId: context.userId,
      connectorClientId: clientId,
      returnUrl: data.targetOrigin + "/integrations",
      responseMode: "web_message",
      webMessageTargetOrigin: data.targetOrigin,
      credentialsConfiguration: { scopes: cfg.scopes },
    });
    return { authorizationUrl };
  });

export const saveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        connectorId: z.string().min(1),
        connectionId: z.string().min(1),
        scopes: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_connections").upsert(
      {
        user_id: userId,
        connector_id: data.connectorId,
        connection_id: data.connectionId,
        scopes: data.scopes ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ connectorId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("connector_id", data.connectorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_connections")
      .select("connector_id, connection_id, scopes, created_at");
    if (error) throw new Error(error.message);
    return { connections: data ?? [] };
  });
