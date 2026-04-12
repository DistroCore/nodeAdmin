/**
 * Polling intervals (milliseconds) for auto-refreshing data.
 *
 * Centralised so they can be tuned in one place. Values can be overridden
 * via Vite env vars, e.g. VITE_POLL_METRICS=3000.
 */

function readPositiveInt(name: string, fallback: number): number {
  const raw = import.meta.env[name];
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const POLL_INTERVALS = {
  /** System metrics (CPU, memory, event loop) */
  metrics: readPositiveInt('VITE_POLL_METRICS', 5_000),
  /** Conversation list refresh */
  conversations: readPositiveInt('VITE_POLL_CONVERSATIONS', 10_000),
  /** Notification / audit-log refresh */
  notifications: readPositiveInt('VITE_POLL_NOTIFICATIONS', 30_000),
  /** Auth header (token refresh check) */
  auth: readPositiveInt('VITE_POLL_AUTH', 30_000),
} as const;
