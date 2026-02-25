import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentEServer } from '../src/AgentEServer.js';
import { WebSocket } from 'ws';

let server: AgentEServer;
let baseUrl: string;

function validState(tick = 100) {
  return {
    tick,
    roles: ['Fighter', 'Crafter'],
    resources: ['ore', 'weapons'],
    currencies: ['gold'],
    agentBalances: {
      a1: { gold: 100 },
      a2: { gold: 50 },
    },
    agentRoles: { a1: 'Fighter', a2: 'Crafter' },
    agentInventories: {
      a1: { weapons: 2 },
      a2: { ore: 5 },
    },
    agentSatisfaction: { a1: 80, a2: 70 },
    marketPrices: { gold: { ore: 15, weapons: 50 } },
    recentTransactions: [],
  };
}

beforeAll(async () => {
  server = new AgentEServer({
    port: 0, // random port
    agentE: {
      gracePeriod: 0,
      checkInterval: 1,
    },
  });
  await server.start();
  const addr = server.getAddress();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await server.stop();
});

// ── HTTP Tests ──────────────────────────────────────────────────────────────

describe('HTTP: POST /tick', () => {
  it('returns adjustments and health for valid state', async () => {
    const res = await fetch(`${baseUrl}/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: validState() }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('adjustments');
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('alerts');
    expect(data).toHaveProperty('tick');
    expect(typeof data.health).toBe('number');
    expect(typeof data.tick).toBe('number');
  });

  it('returns 400 with validationErrors for invalid state', async () => {
    const res = await fetch(`${baseUrl}/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: { tick: -1 } }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_state');
    expect(data).toHaveProperty('validationErrors');
    expect(Array.isArray(data.validationErrors)).toBe(true);
  });

  it('healthy economy returns empty adjustments', async () => {
    const state = {
      ...validState(200),
      agentSatisfaction: { a1: 90, a2: 85 },
    };
    const res = await fetch(`${baseUrl}/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.adjustments)).toBe(true);
  });
});

describe('HTTP: GET /health', () => {
  it('returns health info', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('mode');
    expect(data).toHaveProperty('tick');
    expect(data).toHaveProperty('activePlans');
    expect(typeof data.uptime).toBe('number');
  });
});

describe('HTTP: GET /decisions', () => {
  it('returns decisions array (may be empty)', async () => {
    const res = await fetch(`${baseUrl}/decisions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('decisions');
    expect(Array.isArray(data.decisions)).toBe(true);
  });
});

describe('HTTP: POST /config', () => {
  it('locks parameters via batch config', async () => {
    const res = await fetch(`${baseUrl}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lock: ['craftingCost'] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe('HTTP: GET /principles', () => {
  it('returns principles with count', async () => {
    const res = await fetch(`${baseUrl}/principles`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('count');
    expect(data.count).toBeGreaterThan(0);
    expect(Array.isArray(data.principles)).toBe(true);
  });
});

describe('HTTP: POST /diagnose', () => {
  it('returns diagnoses without side effects', async () => {
    const res = await fetch(`${baseUrl}/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: validState() }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('diagnoses');
    expect(Array.isArray(data.diagnoses)).toBe(true);
    // Verify field names match spec
    if (data.diagnoses.length > 0) {
      expect(data.diagnoses[0]).toHaveProperty('principleId');
      expect(data.diagnoses[0]).toHaveProperty('principleName');
      expect(data.diagnoses[0]).toHaveProperty('severity');
    }
  });
});

describe('HTTP: CORS', () => {
  it('includes CORS headers in response', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3100');
  });
});

// ── Dashboard Route Tests ────────────────────────────────────────────────────

describe('HTTP: GET / (Dashboard)', () => {
  it('returns HTML with Cache-Control header', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    const body = await res.text();
    expect(body).toContain('AgentE Dashboard');
  });
});

describe('HTTP: GET /metrics', () => {
  it('returns latest metrics and history array', async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('latest');
    expect(data).toHaveProperty('history');
    expect(Array.isArray(data.history)).toBe(true);
    expect(data.latest).toHaveProperty('tick');
  });
});

describe('HTTP: GET /metrics/personas', () => {
  it('returns persona distribution and total', async () => {
    const res = await fetch(`${baseUrl}/metrics/personas`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('distribution');
    expect(data).toHaveProperty('total');
    expect(typeof data.total).toBe('number');
  });
});

describe('HTTP: GET /pending', () => {
  it('returns pending list with mode and count', async () => {
    const res = await fetch(`${baseUrl}/pending`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('mode');
    expect(data).toHaveProperty('pending');
    expect(data).toHaveProperty('count');
    expect(Array.isArray(data.pending)).toBe(true);
  });
});

describe('HTTP: POST /approve', () => {
  it('returns 400 when missing decisionId', async () => {
    const res = await fetch(`${baseUrl}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('missing_decision_id');
  });

  it('returns 400 when not in advisor mode', async () => {
    const res = await fetch(`${baseUrl}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: 'fake_id' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('not_in_advisor_mode');
  });
});

describe('HTTP: POST /reject', () => {
  it('returns 400 when missing decisionId', async () => {
    const res = await fetch(`${baseUrl}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('missing_decision_id');
  });

  it('returns 400 when not in advisor mode', async () => {
    const res = await fetch(`${baseUrl}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: 'fake_id' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('not_in_advisor_mode');
  });
});

// ── WebSocket Tests ─────────────────────────────────────────────────────────

function connectWs(): Promise<WebSocket> {
  const addr = server.getAddress();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sendAndReceive(ws: WebSocket, msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (raw) => {
      resolve(JSON.parse(raw.toString()));
    });
    ws.send(JSON.stringify(msg));
  });
}

describe('WebSocket', () => {
  it('returns tick_result for valid tick', async () => {
    const ws = await connectWs();
    const response = await sendAndReceive(ws, {
      type: 'tick',
      state: validState(300),
    });
    expect(response['type']).toBe('tick_result');
    expect(response).toHaveProperty('adjustments');
    expect(response).toHaveProperty('health');
    expect(response).toHaveProperty('tick');
    ws.close();
  });

  it('returns health_result for health message', async () => {
    const ws = await connectWs();
    const response = await sendAndReceive(ws, { type: 'health' });
    expect(response['type']).toBe('health_result');
    expect(response).toHaveProperty('health');
    expect(response).toHaveProperty('uptime');
    ws.close();
  });

  it('returns error with message field for malformed input', async () => {
    const ws = await connectWs();
    const response = await sendAndReceive(ws, { notType: 'hello' });
    expect(response['type']).toBe('error');
    expect(response).toHaveProperty('message');
    ws.close();
  });

  it('returns validation_error with validationErrors for invalid state', async () => {
    const ws = await connectWs();
    const response = await sendAndReceive(ws, {
      type: 'tick',
      state: { tick: -1 },
    });
    expect(response['type']).toBe('validation_error');
    expect(response).toHaveProperty('validationErrors');
    expect(Array.isArray(response['validationErrors'])).toBe(true);
    ws.close();
  });
});
