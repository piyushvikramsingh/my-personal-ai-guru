export type IntegrationId = "gmail" | "google_calendar" | "slack" | "telegram";

export type IntegrationConnection = {
  id: IntegrationId;
  connectedAt: string;
  email?: string;
  scopes?: string[];
  accessToken?: string;
};

const STORE_KEY = "void.integrations.v1";

export type IntegrationsStore = Record<IntegrationId, IntegrationConnection | null>;

function load(): IntegrationsStore {
  if (typeof window === "undefined")
    return { gmail: null, google_calendar: null, slack: null, telegram: null };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { gmail: null, google_calendar: null, slack: null, telegram: null, ...JSON.parse(raw) };
  } catch {}
  return { gmail: null, google_calendar: null, slack: null, telegram: null };
}

function save(store: IntegrationsStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export function getIntegrations(): IntegrationsStore {
  return load();
}

export function getIntegration(id: IntegrationId): IntegrationConnection | null {
  return load()[id];
}

export function setIntegration(conn: IntegrationConnection) {
  const store = load();
  store[conn.id] = conn;
  save(store);
}

export function removeIntegration(id: IntegrationId) {
  const store = load();
  store[id] = null;
  save(store);
}

export function isConnected(id: IntegrationId): boolean {
  return load()[id] !== null;
}

const listeners = new Set<() => void>();

export function subscribeIntegrations(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyIntegrationChange() {
  listeners.forEach((fn) => fn());
}
