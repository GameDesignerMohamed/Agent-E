// HTTP routes for AgentE Server
// Node http module with manual body parsing. CORS on all responses.

import type * as http from 'node:http';
import { validateEconomyState } from '@agent-e/core';
import type { AgentEServer } from './AgentEServer.js';
import { getDashboardHtml } from './dashboard.js';

function setCorsHeaders(res: http.ServerResponse, origin: string): void {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res: http.ServerResponse, status: number, data: unknown, origin: string): void {
  setCorsHeaders(res, origin);
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
  const cors = server.corsOrigin;

  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method?.toUpperCase() ?? 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      setCorsHeaders(res, cors);
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
          json(res, 400, { error: 'Invalid JSON' }, cors);
          return;
        }

        if (!parsed || typeof parsed !== 'object') {
          json(res, 400, { error: 'Body must be a JSON object' }, cors);
          return;
        }

        const payload = parsed as Record<string, unknown>;
        const state = payload['state'] ?? parsed;
        const events = payload['events'];

        // Validate state (if enabled)
        const validation = server.validateState ? validateEconomyState(state) : null;
        if (validation && !validation.valid) {
          json(res, 400, {
            error: 'invalid_state',
            validationErrors: validation.errors,
          }, cors);
          return;
        }

        const result = await server.processTick(
          state as import('@agent-e/core').EconomyState,
          Array.isArray(events) ? events as import('@agent-e/core').EconomicEvent[] : undefined,
        );

        const warnings = validation?.warnings ?? [];

        json(res, 200, {
          adjustments: result.adjustments,
          alerts: result.alerts.map(a => ({
            principleId: a.principle.id,
            principleName: a.principle.name,
            severity: a.violation.severity,
            evidence: a.violation.evidence,
            reasoning: a.violation.suggestedAction.reasoning,
          })),
          health: result.health,
          tick: result.tick,
          ...(warnings.length > 0 ? { validationWarnings: warnings } : {}),
        }, cors);
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
        }, cors);
        return;
      }

      // GET /decisions — decision log with optional ?limit and ?since
      if (path === '/decisions' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
        const since = url.searchParams.get('since');
        const agentE = server.getAgentE();

        let decisions;
        if (since) {
          decisions = agentE.getDecisions({ since: parseInt(since, 10) });
        } else {
          decisions = agentE.log.latest(limit);
        }

        json(res, 200, { decisions }, cors);
        return;
      }

      // POST /config — batch lock/unlock/constrain/mode
      if (path === '/config' && method === 'POST') {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' }, cors);
          return;
        }

        const config = parsed as Record<string, unknown>;

        // Lock parameters
        if (Array.isArray(config['lock'])) {
          for (const param of config['lock']) {
            if (typeof param === 'string') server.lock(param);
          }
        }

        // Unlock parameters
        if (Array.isArray(config['unlock'])) {
          for (const param of config['unlock']) {
            if (typeof param === 'string') server.unlock(param);
          }
        }

        // Constrain parameters
        if (Array.isArray(config['constrain'])) {
          for (const c of config['constrain'] as unknown[]) {
            if (
              c && typeof c === 'object' &&
              typeof (c as Record<string, unknown>)['param'] === 'string' &&
              typeof (c as Record<string, unknown>)['min'] === 'number' &&
              typeof (c as Record<string, unknown>)['max'] === 'number'
            ) {
              const constraint = c as { param: string; min: number; max: number };
              server.constrain(constraint.param, { min: constraint.min, max: constraint.max });
            }
          }
        }

        // Mode switch
        if (config['mode'] === 'autonomous' || config['mode'] === 'advisor') {
          server.setMode(config['mode']);
        }

        json(res, 200, { ok: true }, cors);
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
        }, cors);
        return;
      }

      // POST /diagnose — standalone Observer+Diagnoser (no side effects)
      if (path === '/diagnose' && method === 'POST') {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' }, cors);
          return;
        }

        const payload = parsed as Record<string, unknown>;
        const state = payload['state'] ?? parsed;

        if (server.validateState) {
          const validation = validateEconomyState(state);
          if (!validation.valid) {
            json(res, 400, { error: 'invalid_state', validationErrors: validation.errors }, cors);
            return;
          }
        }

        const result = server.diagnoseOnly(state as import('@agent-e/core').EconomyState);

        json(res, 200, {
          health: result.health,
          diagnoses: result.diagnoses.map(d => ({
            principleId: d.principle.id,
            principleName: d.principle.name,
            severity: d.violation.severity,
            evidence: d.violation.evidence,
            suggestedAction: d.violation.suggestedAction,
          })),
        }, cors);
        return;
      }

      // GET / — Dashboard HTML
      if (path === '/' && method === 'GET' && server.serveDashboard) {
        setCorsHeaders(res, cors);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHtml());
        return;
      }

      // GET /metrics — Latest metrics + history for dashboard charts
      if (path === '/metrics' && method === 'GET') {
        const agentE = server.getAgentE();
        const latest = agentE.store.latest();
        const history = agentE.store.recentHistory(100);
        json(res, 200, { latest, history }, cors);
        return;
      }

      // GET /metrics/personas — Persona distribution
      if (path === '/metrics/personas' && method === 'GET') {
        const agentE = server.getAgentE();
        const latest = agentE.store.latest();
        const dist = latest.personaDistribution || {};
        const total = Object.values(dist).reduce((s: number, v) => s + (v as number), 0);
        json(res, 200, { distribution: dist, total }, cors);
        return;
      }

      // POST /approve — Approve advisor recommendation
      if (path === '/approve' && method === 'POST') {
        const body = await readBody(req);
        let parsed: unknown;
        try { parsed = JSON.parse(body); } catch {
          json(res, 400, { error: 'Invalid JSON' }, cors);
          return;
        }
        const payload = parsed as Record<string, unknown>;
        const decisionId = payload['decisionId'] as string;
        if (!decisionId) {
          json(res, 400, { error: 'missing_decision_id' }, cors);
          return;
        }

        const agentE = server.getAgentE();
        if (agentE.getMode() !== 'advisor') {
          json(res, 400, { error: 'not_in_advisor_mode' }, cors);
          return;
        }

        const entry = agentE.log.getById(decisionId);
        if (!entry) {
          json(res, 404, { error: 'decision_not_found' }, cors);
          return;
        }
        if (entry.result !== 'skipped_override') {
          json(res, 409, { error: 'decision_not_pending', currentResult: entry.result }, cors);
          return;
        }

        await agentE.apply(entry.plan);
        agentE.log.updateResult(decisionId, 'applied');
        server.broadcast({ type: 'advisor_action', action: 'approved', decisionId });
        json(res, 200, {
          ok: true,
          parameter: entry.plan.parameter,
          value: entry.plan.targetValue,
        }, cors);
        return;
      }

      // POST /reject — Reject advisor recommendation
      if (path === '/reject' && method === 'POST') {
        const body = await readBody(req);
        let parsed: unknown;
        try { parsed = JSON.parse(body); } catch {
          json(res, 400, { error: 'Invalid JSON' }, cors);
          return;
        }
        const payload = parsed as Record<string, unknown>;
        const decisionId = payload['decisionId'] as string;
        const reason = (payload['reason'] as string) || undefined;
        if (!decisionId) {
          json(res, 400, { error: 'missing_decision_id' }, cors);
          return;
        }

        const agentE = server.getAgentE();
        if (agentE.getMode() !== 'advisor') {
          json(res, 400, { error: 'not_in_advisor_mode' }, cors);
          return;
        }

        const entry = agentE.log.getById(decisionId);
        if (!entry) {
          json(res, 404, { error: 'decision_not_found' }, cors);
          return;
        }
        if (entry.result !== 'skipped_override') {
          json(res, 409, { error: 'decision_not_pending', currentResult: entry.result }, cors);
          return;
        }

        agentE.log.updateResult(decisionId, 'rejected', reason);
        server.broadcast({ type: 'advisor_action', action: 'rejected', decisionId, reason });
        json(res, 200, { ok: true, decisionId }, cors);
        return;
      }

      // GET /pending — List pending advisor recommendations
      if (path === '/pending' && method === 'GET') {
        const agentE = server.getAgentE();
        const pending = agentE.log.query({ result: 'skipped_override' });
        json(res, 200, {
          mode: agentE.getMode(),
          pending,
          count: pending.length,
        }, cors);
        return;
      }

      // 404
      json(res, 404, { error: 'Not found' }, cors);
    } catch (err) {
      console.error('[AgentE Server] Unhandled route error:', err);
      json(res, 500, { error: 'Internal server error' }, cors);
    }
  };
}
