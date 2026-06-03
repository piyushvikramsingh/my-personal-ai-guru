
## Goal
Harden and extend the agent loop in `src/routes/api/chat.ts` plus add a live activity UI in the chat. Six asks, grouped by where they land.

## 1. Live "Agent Activity" panel (UI)
- Server: stream tool events over the same SSE channel using a new event type `event: agent` with JSON payloads: `{ kind: "tool_call", id, name, args }`, `{ kind: "tool_result", id, ok, preview }`, `{ kind: "iteration", n }`. Final answer continues to stream as today.
- Client (`ChatApp.tsx`): parse the new event lines, collect per-message `steps[]`, render a collapsible **Agent Activity** panel above each assistant bubble (icon + tool name + truncated args + status + result preview, expandable). Persist `steps` on the message object in local state only (not in DB — keep schema unchanged).

## 2. Sandbox + allowlists for `run_js` and `fetch_url`
- `fetch_url`:
  - Parse URL, reject non-`http(s)`, reject if hostname resolves to private/loopback/link-local ranges (block by hostname patterns: `localhost`, `127.`, `10.`, `192.168.`, `169.254.`, `::1`, `.local`, plus reject `.internal` and metadata endpoints like `169.254.169.254`).
  - 8 s timeout via `AbortController`, max 1 MB response, deny non-text content types beyond html/json/text.
  - Optional user allowlist (see §3 memory) checked first; if set, only those hosts pass.
- `run_js`:
  - Wrap in `Function` with a frozen empty `globalThis`-like scope: explicitly shadow `fetch`, `XMLHttpRequest`, `WebSocket`, `process`, `require`, `import`, `eval`, `Function`, `setTimeout`, `setInterval`, `globalThis`, `self`, `window` to `undefined`.
  - Hard 1.5 s wall-clock timeout using a `Promise.race` against a timer; serialize result via `JSON.stringify` with size cap (32 KB).
  - Block obvious escape patterns with a quick regex pre-check (`constructor`, `import(`, `require(`, backticks containing `process`) and reject.

## 3. Per-user memory store
- New table `user_memory` (one row per user):
  ```
  user_id uuid pk, preferences jsonb default '{}',
  recurring_tasks jsonb default '[]',
  fetch_allowlist text[] default '{}',
  updated_at timestamptz default now()
  ```
  RLS: `auth.uid() = user_id`. Standard `GRANT`s for `authenticated` + `service_role`.
- Agent loads memory at the start of each request, injects a compact summary into the system prompt ("User preferences: …"), and exposes two tools:
  - `remember(key, value)` — upserts into `preferences`.
  - `forget(key)` — removes a key.
- Connection status (Gmail/Calendar — see §4) is also surfaced into the system prompt so the model knows what it can actually do.

## 4. Real Gmail + Calendar tools (server-side)
- Use the existing Lovable **App User Connector** flow (per-user OAuth, not the workspace connector). Add helpers at `src/integrations/lovable/appUserConnector.ts` + `appUserConnectorClient.ts` (per the knowledge file).
- New table `user_connections (user_id, connector_id, connection_id, scopes text[], created_at)` with RLS.
- New server fns in `src/lib/connections.functions.ts`:
  - `startConnect(connectorId, targetOrigin)` → returns `authorizationUrl`.
  - `saveConnection(connectorId, connectionId)` → persists row.
  - `disconnect(connectorId)`.
  - `listConnections()`.
- `/integrations` page swapped to drive the popup with `connectAppUser` and call those server fns. Adds "Connect Gmail" / "Connect Google Calendar" buttons that actually work.
- `send_email` and `create_calendar_event` tools in `chat.ts`:
  - Look up the user's `connection_id` for `google_mail` / `google_calendar`.
  - If missing → return a structured error `{ error: "not_connected", connector: "google_mail" }` so the model tells the user to connect.
  - If present → call gateway via `callAsAppUser` (Gmail `users/me/messages/send` with base64url RFC2822; Calendar `calendars/primary/events`).
- Bearer attacher: confirm `src/start.ts` registers `attachSupabaseAuth` so the new server fns receive the user token.

## 5. Cache + rate limit for `web_search` / `fetch_url`
- In-memory `Map` keyed by tool+normalized-arg, TTL 10 min for `web_search`, 30 min for `fetch_url`, max 200 entries (LRU eviction).
- Per-user token bucket: 20 web_search + 30 fetch_url per 5-minute window. Keyed by `userId`. Over-limit returns `{ error: "rate_limited", retry_after_seconds }` to the model instead of calling out.
- Both live in module scope of `chat.ts` (worker memory; acceptable for current scale, documented as such).

## Files

**New**
- `src/integrations/lovable/appUserConnector.ts`
- `src/integrations/lovable/appUserConnectorClient.ts`
- `src/lib/connections.functions.ts`
- `src/lib/memory.functions.ts`
- `src/components/chat/AgentActivity.tsx`
- migration: `user_memory`, `user_connections`

**Edited**
- `src/routes/api/chat.ts` — sandboxing, cache, rate limit, agent-event SSE stream, memory injection, real Gmail/Calendar tools, `remember`/`forget` tools.
- `src/components/chat/ChatApp.tsx` — parse agent SSE events, render `<AgentActivity steps={...} />`.
- `src/routes/integrations.tsx` — wire popup-based connect for Gmail + Calendar, show real connection status.
- `src/start.ts` — verify `attachSupabaseAuth` is registered (add if missing).

## Out of scope (call out to user)
- Persisting agent activity to DB across reloads (kept in client state only).
- Real desktop control / true JARVIS multi-app automation — separate Electron companion app, mentioned in earlier turn.
- Redis-backed cache/rate-limit (using in-memory; fine for current scale).
