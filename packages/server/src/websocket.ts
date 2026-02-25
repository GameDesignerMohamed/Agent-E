// WebSocket handler for AgentE Server
// Same port via HTTP upgrade. JSON messages with `type` field.

import type * as http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { validateEconomyState, type EconomyState, type EconomicEvent } from '@agent-e/core';
import type { AgentEServer } from './AgentEServer.js';

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

export function createWebSocketHandler(
  httpServer: http.Server,
  server: AgentEServer,
): WebSocketHandle {
  const wss = new WebSocketServer({ server: httpServer });

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

  wss.on('connection', (ws) => {
    console.log('[AgentE Server] Client connected');
    aliveMap.set(ws, true);

    ws.on('pong', () => {
      aliveMap.set(ws, true);
    });

    ws.on('close', () => {
      console.log('[AgentE Server] Client disconnected');
    });

    ws.on('message', async (raw) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(raw.toString()) as IncomingMessage;
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
            const result = await server.processTick(
              state as EconomyState,
              Array.isArray(events) ? events as EconomicEvent[] : undefined,
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
          } catch (err) {
            send(ws, { type: 'error', message: 'Tick processing failed' });
          }
          break;
        }

        case 'event': {
          const event = msg['event'] as EconomicEvent | undefined;
          if (event) {
            server.getAgentE().ingest(event);
            send(ws, { type: 'event_ack' });
          } else {
            send(ws, { type: 'error', message: 'Missing "event" field' });
          }
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
          send(ws, { type: 'error', message: `Unknown message type: "${msg.type}"` });
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
