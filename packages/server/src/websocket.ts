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

export function createWebSocketHandler(
  httpServer: http.Server,
  server: AgentEServer,
): () => void {
  const wss = new WebSocketServer({ server: httpServer });

  // Heartbeat: ping every 30s
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 30_000);

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(raw.toString()) as IncomingMessage;
      } catch {
        send(ws, { type: 'error', error: 'Invalid JSON' });
        return;
      }

      if (!msg.type || typeof msg.type !== 'string') {
        send(ws, { type: 'error', error: 'Missing "type" field' });
        return;
      }

      switch (msg.type) {
        case 'tick': {
          const state = msg['state'];
          const events = msg['events'];

          const validation = validateEconomyState(state);
          if (!validation.valid) {
            send(ws, { type: 'validation_error', validation });
            // Also send individual warnings
            for (const w of validation.warnings) {
              send(ws, { type: 'validation_warning', warning: w });
            }
            return;
          }

          // Forward warnings even if valid
          for (const w of validation.warnings) {
            send(ws, { type: 'validation_warning', warning: w });
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
                principle: a.principle.id,
                name: a.principle.name,
                severity: a.violation.severity,
                suggestedAction: a.violation.suggestedAction,
              })),
              health: result.health,
              decisions: result.decisions.map(d => ({
                id: d.id,
                tick: d.tick,
                principle: d.diagnosis.principle.id,
                parameter: d.plan.parameter,
                result: d.result,
              })),
            });
          } catch (err) {
            send(ws, { type: 'error', error: 'Tick processing failed' });
          }
          break;
        }

        case 'event': {
          const event = msg['event'] as EconomicEvent | undefined;
          if (event) {
            server.getAgentE().ingest(event);
            send(ws, { type: 'event_ack' });
          } else {
            send(ws, { type: 'error', error: 'Missing "event" field' });
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
          const validation = validateEconomyState(state);
          if (!validation.valid) {
            send(ws, { type: 'validation_error', validation });
            return;
          }

          const result = server.diagnoseOnly(state as EconomyState);
          send(ws, {
            type: 'diagnose_result',
            health: result.health,
            diagnoses: result.diagnoses.map(d => ({
              principle: d.principle.id,
              name: d.principle.name,
              severity: d.violation.severity,
              suggestedAction: d.violation.suggestedAction,
            })),
          });
          break;
        }

        default:
          send(ws, { type: 'error', error: `Unknown message type: "${msg.type}"` });
      }
    });
  });

  // Return cleanup function
  return () => {
    clearInterval(heartbeatInterval);
    wss.close();
  };
}
