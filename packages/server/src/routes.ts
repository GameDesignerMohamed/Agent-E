// HTTP routes for AgentE Server
// Node http module with manual body parsing. CORS on all responses.

import type * as http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { validateEconomyState } from '@agent-e/core';
import type { AgentEServer } from './AgentEServer.js';
import { getDashboardHtml } from './dashboard.js';

function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function setCorsHeaders(res: http.ServerResponse, allowedOrigin: string, requestOrigin?: string): void {
  setSecurityHeaders(res);
  // If configured as '*', allow all.
  // Otherwise, only reflect the origin if it matches the configured allowedOrigin.
  // If there's no request origin (non-browser / server-to-server), return allowedOrigin directly.
  let origin: string;
  if (allowedOrigin === '*') {
    origin = '*';
  } else if (requestOrigin === undefined) {
    origin = allowedOrigin; // non-browser request, return configured origin
  } else {
    // Reflect origin only if it matches (case-insensitive) — otherwise don't include a matching CORS header
    origin = requestOrigin.toLowerCase() === allowedOrigin.toLowerCase() ? requestOrigin : '';
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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

function checkAuth(req: http.IncomingMessage, apiKey: string | undefined): boolean {
  if (!apiKey) return true; // no key configured = open
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return false;
  const expected = `Bearer ${apiKey}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

function json(res: http.ServerResponse, status: number, data: unknown, origin: string, reqOrigin?: string): void {
  setCorsHeaders(res, origin, reqOrigin);
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
  const apiKey = server.apiKey;

  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method?.toUpperCase() ?? 'GET';
    const reqOrigin = req.headers['origin'] as string | undefined;

    // Scoped json helper — captures cors + reqOrigin for this request
    const respond = (status: number, data: unknown) => json(res, status, data, cors, reqOrigin);

    // CORS preflight
    if (method === 'OPTIONS') {
      setCorsHeaders(res, cors, reqOrigin);
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // POST /tick — validate state, run tick, return adjustments/alerts/health
      if (path === '/tick' && method === 'POST') {
        if (!checkAuth(req, apiKey)) {
          respond(401, { error: 'Unauthorized' });
          return;
        }
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = sanitizeJson(JSON.parse(body));
        } catch {
          respond(400, { error: 'Invalid JSON' });
          return;
        }

        if (!parsed || typeof parsed !== 'object') {
          respond(400, { error: 'Body must be a JSON object' });
          return;
        }

        const payload = parsed as Record<string, unknown>;
        const state = payload['state'] ?? parsed;
        const events = payload['events'];

        // Validate state (if enabled)
        const validation = server.validateState ? validateEconomyState(state) : null;
        if (validation && !validation.valid) {
          respond(400, {
            error: 'invalid_state',
            validationErrors: validation.errors,
          });
          return;
        }

        const result = await server.processTick(
          state as import('@agent-e/core').EconomyState,
          Array.isArray(events) ? events as import('@agent-e/core').EconomicEvent[] : undefined,
        );

        const warnings = validation?.warnings ?? [];

        respond(200, {
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
        });
        return;
      }

      // GET /health — health, tick, mode, activePlans, uptime
      if (path === '/health' && method === 'GET') {
        const agentE = server.getAgentE();
        respond(200, {
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
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '100', 10);
        const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 100 : rawLimit, 1), 1000);
        const sinceParam = url.searchParams.get('since');
        const agentE = server.getAgentE();

        let decisions;
        if (sinceParam) {
          const since = parseInt(sinceParam, 10);
          if (Number.isNaN(since)) {
            respond(400, { error: 'Invalid "since" parameter — must be a number' });
            return;
          }
          decisions = agentE.getDecisions({ since });
        } else {
          decisions = agentE.log.latest(limit);
        }

        respond(200, { decisions });
        return;
      }

      // POST /config — batch lock/unlock/constrain/mode
      if (path === '/config' && method === 'POST') {
        if (!checkAuth(req, apiKey)) {
          respond(401, { error: 'Unauthorized' });
          return;
        }
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = sanitizeJson(JSON.parse(body));
        } catch {
          respond(400, { error: 'Invalid JSON' });
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

        // Constrain parameters — validate ALL before applying any
        if (Array.isArray(config['constrain'])) {
          const validated: { param: string; min: number; max: number }[] = [];
          for (const c of config['constrain'] as unknown[]) {
            if (
              c && typeof c === 'object' &&
              typeof (c as Record<string, unknown>)['param'] === 'string' &&
              typeof (c as Record<string, unknown>)['min'] === 'number' &&
              typeof (c as Record<string, unknown>)['max'] === 'number'
            ) {
              const constraint = c as { param: string; min: number; max: number };
              if (!Number.isFinite(constraint.min) || !Number.isFinite(constraint.max)) {
                respond(400, { error: 'Constraint bounds must be finite numbers' });
                return;
              }
              if (constraint.min > constraint.max) {
                respond(400, { error: 'Constraint min cannot exceed max' });
                return;
              }
              validated.push(constraint);
            }
          }
          for (const constraint of validated) {
            server.constrain(constraint.param, { min: constraint.min, max: constraint.max });
          }
        }

        // Mode switch
        if (config['mode'] === 'autonomous' || config['mode'] === 'advisor') {
          server.setMode(config['mode']);
        }

        respond(200, { ok: true });
        return;
      }

      // GET /principles — list all principles
      if (path === '/principles' && method === 'GET') {
        const principles = server.getAgentE().getPrinciples();
        respond(200, {
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
        if (!checkAuth(req, apiKey)) {
          respond(401, { error: 'Unauthorized' });
          return;
        }
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = sanitizeJson(JSON.parse(body));
        } catch {
          respond(400, { error: 'Invalid JSON' });
          return;
        }

        const payload = parsed as Record<string, unknown>;
        const state = payload['state'] ?? parsed;

        if (server.validateState) {
          const validation = validateEconomyState(state);
          if (!validation.valid) {
            respond(400, { error: 'invalid_state', validationErrors: validation.errors });
            return;
          }
        }

        const result = server.diagnoseOnly(state as import('@agent-e/core').EconomyState);

        respond(200, {
          health: result.health,
          diagnoses: result.diagnoses.map(d => ({
            principleId: d.principle.id,
            principleName: d.principle.name,
            severity: d.violation.severity,
            evidence: d.violation.evidence,
            suggestedAction: d.violation.suggestedAction,
          })),
        });
        return;
      }

      // GET / — Dashboard HTML
      if (path === '/' && method === 'GET' && server.serveDashboard) {
        setCorsHeaders(res, cors, reqOrigin);
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:");
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHtml());
        return;
      }

      // GET /metrics — Latest metrics + history for dashboard charts
      if (path === '/metrics' && method === 'GET') {
        const agentE = server.getAgentE();
        const latest = agentE.store.latest();
        const history = agentE.store.recentHistory(100);
        respond(200, { latest, history });
        return;
      }

      // GET /metrics/personas — Persona distribution
      if (path === '/metrics/personas' && method === 'GET') {
        const agentE = server.getAgentE();
        const latest = agentE.store.latest();
        const dist = latest.personaDistribution || {};
        const total = Object.values(dist).reduce((s: number, v) => s + (v as number), 0);
        respond(200, { distribution: dist, total });
        return;
      }

      // POST /approve — Approve advisor recommendation
      if (path === '/approve' && method === 'POST') {
        if (!checkAuth(req, apiKey)) {
          respond(401, { error: 'Unauthorized' });
          return;
        }
        const body = await readBody(req);
        let parsed: unknown;
        try { parsed = sanitizeJson(JSON.parse(body)); } catch {
          respond(400, { error: 'Invalid JSON' });
          return;
        }
        const payload = parsed as Record<string, unknown>;
        const decisionId = payload['decisionId'] as string;
        if (!decisionId) {
          respond(400, { error: 'missing_decision_id' });
          return;
        }

        const agentE = server.getAgentE();
        if (agentE.getMode() !== 'advisor') {
          respond(400, { error: 'not_in_advisor_mode' });
          return;
        }

        const entry = agentE.log.getById(decisionId);
        if (!entry) {
          respond(404, { error: 'decision_not_found' });
          return;
        }
        if (entry.result !== 'skipped_override') {
          respond(409, { error: 'decision_not_pending', currentResult: entry.result });
          return;
        }

        await agentE.apply(entry.plan);
        agentE.log.updateResult(decisionId, 'applied');
        server.broadcast({ type: 'advisor_action', action: 'approved', decisionId });
        respond(200, {
          ok: true,
          parameter: entry.plan.parameter,
          value: entry.plan.targetValue,
        });
        return;
      }

      // POST /reject — Reject advisor recommendation
      if (path === '/reject' && method === 'POST') {
        if (!checkAuth(req, apiKey)) {
          respond(401, { error: 'Unauthorized' });
          return;
        }
        const body = await readBody(req);
        let parsed: unknown;
        try { parsed = sanitizeJson(JSON.parse(body)); } catch {
          respond(400, { error: 'Invalid JSON' });
          return;
        }
        const payload = parsed as Record<string, unknown>;
        const decisionId = payload['decisionId'] as string;
        const reason = (payload['reason'] as string) || undefined;
        if (!decisionId) {
          respond(400, { error: 'missing_decision_id' });
          return;
        }

        const agentE = server.getAgentE();
        if (agentE.getMode() !== 'advisor') {
          respond(400, { error: 'not_in_advisor_mode' });
          return;
        }

        const entry = agentE.log.getById(decisionId);
        if (!entry) {
          respond(404, { error: 'decision_not_found' });
          return;
        }
        if (entry.result !== 'skipped_override') {
          respond(409, { error: 'decision_not_pending', currentResult: entry.result });
          return;
        }

        agentE.log.updateResult(decisionId, 'rejected', reason);
        server.broadcast({ type: 'advisor_action', action: 'rejected', decisionId, reason });
        respond(200, { ok: true, decisionId });
        return;
      }

      // GET /pending — List pending advisor recommendations
      if (path === '/pending' && method === 'GET') {
        const agentE = server.getAgentE();
        const pending = agentE.log.query({ result: 'skipped_override' });
        respond(200, {
          mode: agentE.getMode(),
          pending,
          count: pending.length,
        });
        return;
      }

      // 404
      respond(404, { error: 'Not found' });
    } catch (err) {
      console.error('[AgentE Server] Unhandled route error:', err);
      respond(500, { error: 'Internal server error' });
    }
  };
}
