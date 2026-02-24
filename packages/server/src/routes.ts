// HTTP routes for AgentE Server
// Node http module with manual body parsing. CORS on all responses.

import type * as http from 'node:http';
import { validateEconomyState } from '@agent-e/core';
import type { AgentEServer } from './AgentEServer.js';

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function createRouteHandler(
  server: AgentEServer,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method?.toUpperCase() ?? 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // POST /tick — validate state, run tick, return adjustments/alerts/health
      if (path === '/tick' && method === 'POST') {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }

        if (!parsed || typeof parsed !== 'object') {
          json(res, 400, { error: 'Body must be a JSON object' });
          return;
        }

        const payload = parsed as Record<string, unknown>;
        const state = payload['state'] ?? parsed;
        const events = payload['events'];

        // Validate state
        const validation = validateEconomyState(state);
        if (!validation.valid) {
          json(res, 400, {
            error: 'Invalid state',
            validation,
          });
          return;
        }

        const result = await server.processTick(
          state as import('@agent-e/core').EconomyState,
          Array.isArray(events) ? events as import('@agent-e/core').EconomicEvent[] : undefined,
        );

        json(res, 200, {
          adjustments: result.adjustments,
          alerts: result.alerts.map(a => ({
            principle: a.principle.id,
            name: a.principle.name,
            severity: a.violation.severity,
            evidence: a.violation.evidence,
            suggestedAction: a.violation.suggestedAction,
          })),
          health: result.health,
          decisions: result.decisions.map(d => ({
            id: d.id,
            tick: d.tick,
            principle: d.diagnosis.principle.id,
            parameter: d.plan.parameter,
            result: d.result,
            reasoning: d.reasoning,
          })),
        });
        return;
      }

      // GET /health — health, tick, mode, activePlans, uptime
      if (path === '/health' && method === 'GET') {
        const agentE = server.getAgentE();
        json(res, 200, {
          health: agentE.getHealth(),
          tick: agentE.metrics.latest()?.tick ?? 0,
          mode: agentE.getMode(),
          activePlans: agentE.getActivePlans().length,
          uptime: server.getUptime(),
        });
        return;
      }

      // GET /decisions — decision log with optional ?limit and ?since
      if (path === '/decisions' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
        const since = url.searchParams.get('since');
        const agentE = server.getAgentE();

        let decisions;
        if (since) {
          decisions = agentE.getDecisions({ since: parseInt(since, 10) });
        } else {
          decisions = agentE.log.latest(limit);
        }

        json(res, 200, {
          decisions: decisions.map(d => ({
            id: d.id,
            tick: d.tick,
            timestamp: d.timestamp,
            principle: d.diagnosis.principle.id,
            principeName: d.diagnosis.principle.name,
            parameter: d.plan.parameter,
            currentValue: d.plan.currentValue,
            targetValue: d.plan.targetValue,
            result: d.result,
            reasoning: d.reasoning,
          })),
        });
        return;
      }

      // POST /config — lock/unlock/constrain/mode
      if (path === '/config' && method === 'POST') {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }

        const config = parsed as Record<string, unknown>;

        if (config['action'] === 'lock' && typeof config['param'] === 'string') {
          server.lock(config['param']);
          json(res, 200, { ok: true, action: 'lock', param: config['param'] });
        } else if (config['action'] === 'unlock' && typeof config['param'] === 'string') {
          server.unlock(config['param']);
          json(res, 200, { ok: true, action: 'unlock', param: config['param'] });
        } else if (
          config['action'] === 'constrain' &&
          typeof config['param'] === 'string' &&
          typeof config['min'] === 'number' &&
          typeof config['max'] === 'number'
        ) {
          server.constrain(config['param'], { min: config['min'], max: config['max'] });
          json(res, 200, { ok: true, action: 'constrain', param: config['param'] });
        } else if (
          config['action'] === 'mode' &&
          (config['mode'] === 'autonomous' || config['mode'] === 'advisor')
        ) {
          server.setMode(config['mode']);
          json(res, 200, { ok: true, action: 'mode', mode: config['mode'] });
        } else {
          json(res, 400, {
            error: 'Invalid config action. Use: lock, unlock, constrain, or mode',
          });
        }
        return;
      }

      // GET /principles — list all principles
      if (path === '/principles' && method === 'GET') {
        const principles = server.getAgentE().getPrinciples();
        json(res, 200, {
          count: principles.length,
          principles: principles.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            description: p.description,
          })),
        });
        return;
      }

      // POST /diagnose — standalone Observer+Diagnoser (no side effects)
      if (path === '/diagnose' && method === 'POST') {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }

        const payload = parsed as Record<string, unknown>;
        const state = payload['state'] ?? parsed;

        const validation = validateEconomyState(state);
        if (!validation.valid) {
          json(res, 400, { error: 'Invalid state', validation });
          return;
        }

        const result = server.diagnoseOnly(state as import('@agent-e/core').EconomyState);

        json(res, 200, {
          health: result.health,
          diagnoses: result.diagnoses.map(d => ({
            principle: d.principle.id,
            name: d.principle.name,
            severity: d.violation.severity,
            evidence: d.violation.evidence,
            suggestedAction: d.violation.suggestedAction,
          })),
        });
        return;
      }

      // 404
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[AgentE Server] Unhandled route error:', err);
      json(res, 500, { error: 'Internal server error' });
    }
  };
}
