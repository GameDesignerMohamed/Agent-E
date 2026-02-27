// WebSocket handler for AgentE Server
// Same port via HTTP upgrade. JSON messages with `type` field.

import type * as http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { validateEconomyState, type EconomyState } from '@agent-e/core';
import type { AgentEServer } from './AgentEServer.js';
import { validateEvent } from './validation.js';

interface IncomingMessage {
  type: string;
  [key: string]: unknown;
}

function send(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export interface WebSocketHandle {
  cleanup: () => void;
  broadcast: (data: Record<string, unknown>) => void;
}

const MAX_WS_PAYLOAD = 1_048_576; // 1 MB
const MAX_WS_CONNECTIONS = 100;
const MIN_TICK_INTERVAL_MS = 100; // rate limit: max 10 ticks/sec per connection
const GLOBAL_MIN_TICK_INTERVAL_MS = 50; // global rate limit: max 20 ticks/sec across all connections

/** Strips prototype-polluting keys from parsed JSON objects (recursive). */
function sanitizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeJson);
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = sanitizeJson(val);
  }
  return clean;
}

export function createWebSocketHandler(
  httpServer: http.Server,
  server: AgentEServer,
): WebSocketHandle {
  const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_WS_PAYLOAD });

  // Global tick rate limiter — shared across all connections to prevent CPU saturation
  let globalLastTickTime = 0;

  // Heartbeat: ping every 30s, disconnect if no pong within 10s
  const aliveMap = new WeakMap<WebSocket, boolean>();

  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        if (aliveMap.get(ws) === false) {
          // No pong received since last ping — terminate
          ws.terminate();
          continue;
        }
        aliveMap.set(ws, false);
        ws.ping();
      }
    }
  }, 30_000);

  wss.on('connection', (ws, req) => {
    if (wss.clients.size > MAX_WS_CONNECTIONS) {
      ws.close(1013, 'Server at capacity');
      return;
    }

    // Origin check: validate against CORS policy (skip for non-browser / missing origin)
    const wsOrigin = req.headers['origin'];
    if (wsOrigin && server.corsOrigin !== '*') {
      if (wsOrigin.toLowerCase() !== server.corsOrigin.toLowerCase()) {
        ws.close(1008, 'Origin not allowed');
        return;
      }
    }

    // Auth check: if apiKey is configured, require it via Authorization header or query param.
    // SECURITY NOTE: The ?token= query param is for browser WebSocket compatibility only (browsers
    // cannot set custom headers on WebSocket upgrade). Prefer Authorization header in production —
    // query params may be logged in proxy/server access logs.
    if (server.apiKey) {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const authHeader = req.headers['authorization'];
      const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined)
        ?? url.searchParams.get('token');
      if (!token || token.length !== server.apiKey.length || !timingSafeEqual(Buffer.from(token), Buffer.from(server.apiKey))) {
        ws.close(1008, 'Unauthorized');
        return;
      }
    }

    console.log('[AgentE Server] Client connected');
    aliveMap.set(ws, true);

    let lastTickTime = 0;

    ws.on('pong', () => {
      aliveMap.set(ws, true);
    });

    ws.on('close', () => {
      console.log('[AgentE Server] Client disconnected');
    });

    ws.on('message', async (raw) => {
      let msg: IncomingMessage;
      try {
        msg = sanitizeJson(JSON.parse(raw.toString())) as IncomingMessage;
      } catch {
        send(ws, { type: 'error', message: 'Malformed JSON' });
        return;
      }

      if (!msg.type || typeof msg.type !== 'string') {
        send(ws, { type: 'error', message: 'Missing "type" field' });
        return;
      }

      switch (msg.type) {
        case 'tick': {
          const now = Date.now();
          if (now - lastTickTime < MIN_TICK_INTERVAL_MS) {
            send(ws, { type: 'error', message: 'Rate limited — min 100ms between ticks' });
            break;
          }
          if (now - globalLastTickTime < GLOBAL_MIN_TICK_INTERVAL_MS) {
            send(ws, { type: 'error', message: 'Rate limited — server tick capacity exceeded' });
            break;
          }
          lastTickTime = now;
          globalLastTickTime = now;

          const state = msg['state'];
          const events = msg['events'];

          if (server.validateState) {
            const validation = validateEconomyState(state);
            if (!validation.valid) {
              send(ws, { type: 'validation_error', validationErrors: validation.errors });
              return;
            }

            // Forward warnings even if valid
            if (validation.warnings.length > 0) {
              send(ws, { type: 'validation_warning', validationWarnings: validation.warnings });
            }
          }

          try {
            // Validate individual events before ingestion
            const validEvents = Array.isArray(events)
              ? (events as unknown[]).filter(validateEvent)
              : undefined;

            const result = await server.processTick(
              state as EconomyState,
              validEvents,
            );

            send(ws, {
              type: 'tick_result',
              adjustments: result.adjustments,
              alerts: result.alerts.map(a => ({
                principleId: a.principle.id,
                principleName: a.principle.name,
                severity: a.violation.severity,
                reasoning: a.violation.suggestedAction.reasoning,
              })),
              health: result.health,
              tick: result.tick,
            });
          } catch (_err) {
            send(ws, { type: 'error', message: 'Tick processing failed' });
          }
          break;
        }

        case 'event': {
          const rawEvent = msg['event'];
          if (!rawEvent) {
            send(ws, { type: 'error', message: 'Missing "event" field' });
            break;
          }
          if (!validateEvent(rawEvent)) {
            send(ws, { type: 'error', message: 'Invalid event — requires type (valid event type), timestamp (number), and actor (string)' });
            break;
          }
          server.getAgentE().ingest(rawEvent);
          send(ws, { type: 'event_ack' });
          break;
        }

        case 'health': {
          const agentE = server.getAgentE();
          send(ws, {
            type: 'health_result',
            health: agentE.getHealth(),
            tick: agentE.metrics.latest()?.tick ?? 0,
            mode: agentE.getMode(),
            activePlans: agentE.getActivePlans().length,
            uptime: server.getUptime(),
          });
          break;
        }

        case 'diagnose': {
          const state = msg['state'];

          if (server.validateState) {
            const validation = validateEconomyState(state);
            if (!validation.valid) {
              send(ws, { type: 'validation_error', validationErrors: validation.errors });
              return;
            }
          }

          const result = server.diagnoseOnly(state as EconomyState);
          send(ws, {
            type: 'diagnose_result',
            health: result.health,
            diagnoses: result.diagnoses.map(d => ({
              principleId: d.principle.id,
              principleName: d.principle.name,
              severity: d.violation.severity,
              suggestedAction: d.violation.suggestedAction,
            })),
          });
          break;
        }

        default:
          send(ws, { type: 'error', message: `Unknown message type: "${String(msg.type).slice(0, 100)}"` });
      }
    });
  });

  function broadcast(data: Record<string, unknown>): void {
    const payload = JSON.stringify(data);
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  return {
    cleanup: () => {
      clearInterval(heartbeatInterval);
      wss.close();
    },
    broadcast,
  };
}
