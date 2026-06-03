/**
 * App User Connector — server-only helper.
 * Reads LOVABLE_API_KEY from process.env. Never import from client code.
 */

function requireApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  return key;
}

export interface AuthorizeParams {
  gatewayBaseUrl: string;
  connectorId: string;
  appUserId: string;
  connectorClientId: string;
  returnUrl: string;
  credentialsConfiguration?: Record<string, unknown>;
  responseMode?: "redirect" | "web_message";
  webMessageTargetOrigin?: string;
}

export async function authorizeAppUserOAuth(p: AuthorizeParams) {
  const res = await fetch(`${p.gatewayBaseUrl}/api/v1/app-users/oauth2/authorize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      connector_id: p.connectorId,
      app_user_id: p.appUserId,
      connector_client_id: p.connectorClientId,
      return_url: p.returnUrl,
      credentials_configuration: p.credentialsConfiguration,
      response_mode: p.responseMode,
      web_message_target_origin: p.webMessageTargetOrigin,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OAuth start failed (${res.status}): ${text || res.statusText}`);
  const body = text ? JSON.parse(text) : {};
  if (!body.authorization_url) throw new Error("OAuth response missing authorization_url");
  return { authorizationUrl: body.authorization_url as string, sessionId: (body.session_id ?? "") as string };
}

export async function callAsAppUser(opts: {
  gatewayBaseUrl: string;
  connectionId: string;
  connectorId: string;
  path: string;
  init?: RequestInit;
}): Promise<Response> {
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  const headers = new Headers(opts.init?.headers);
  headers.set("Authorization", `Bearer ${requireApiKey()}`);
  headers.set("X-App-User-Connection-Id", opts.connectionId);
  return fetch(`${opts.gatewayBaseUrl}/${opts.connectorId}${path}`, { ...opts.init, headers });
}
