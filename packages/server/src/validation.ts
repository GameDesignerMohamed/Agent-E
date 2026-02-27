// Shared event validation — single source of truth for routes.ts and websocket.ts

import type { EconomicEvent } from '@agent-e/core';

/** Valid EconomicEvent type values — must match core EconomicEventType union. */
export const VALID_EVENT_TYPES = new Set([
  'trade', 'mint', 'burn', 'transfer', 'produce', 'consume', 'role_change', 'enter', 'churn',
]);

/** Validates an event has the required shape before ingestion. */
export function validateEvent(e: unknown): e is EconomicEvent {
  if (!e || typeof e !== 'object') return false;
  const ev = e as Record<string, unknown>;
  return typeof ev['type'] === 'string' && VALID_EVENT_TYPES.has(ev['type'])
    && typeof ev['timestamp'] === 'number'
    && typeof ev['actor'] === 'string';
}
