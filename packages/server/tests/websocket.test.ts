import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentEServer } from '../src/AgentEServer.js';
import { WebSocket } from 'ws';

// ── Helpers ──────────────────────────────────────────────────────────────────

function validState(tick = 100) {
  return {
    tick,
    roles: ['Fighter', 'Crafter'],
    resources: ['ore', 'weapons'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 }, a2: { gold: 50 } },
    agentRoles: { a1: 'Fighter', a2: 'Crafter' },
    agentInventories: { a1: { weapons: 2 }, a2: { ore: 5 } },
    agentSatisfaction: { a1: 80, a2: 70 },
    marketPrices: { gold: { ore: 15, weapons: 50 } },
    recentTransactions: [],
  };
}

let server: AgentEServer;
let wsUrl: string;

function connect(url?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url ?? wsUrl);
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

beforeAll(async () => {
  server = new AgentEServer({
    port: 0,
    agentE: { gracePeriod: 0, checkInterval: 1 },
  });
  await server.start();
  const addr = server.getAddress();
  wsUrl = `ws://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await server.stop();
});

// ── Rate Limiting ───────────────────────────────────────────────────────────

describe('WebSocket: rate limiting', () => {
  it('returns rate limit error when ticks sent too fast', async () => {
    const ws = await connect();

    // First tick should succeed
    const first = await sendAndReceive(ws, { type: 'tick', state: validState(500) });
    expect(first['type']).toBe('tick_result');

    // Immediate second tick (within 100ms) should be rate-limited
    const second = await sendAndReceive(ws, { type: 'tick', state: validState(501) });
    expect(second['type']).toBe('error');
    expect(second['message']).toContain('Rate limited');

    ws.close();
  });
});

// ── Event Ingestion ─────────────────────────────────────────────────────────

describe('WebSocket: event ingestion', () => {
  it('acknowledges event ingestion', async () => {
    const ws = await connect();
    const response = await sendAndReceive(ws, {
      type: 'event',
      event: { type: 'trade', actor: 'a1', tick: 100 },
    });
    expect(response['type']).toBe('event_ack');
    ws.close();
  });

  it('returns error when event field is missing', async () => {
    const ws = await connect();
    const response = await sendAndReceive(ws, { type: 'event' });
    expect(response['type']).toBe('error');
    expect(response['message']).toContain('Missing');
    ws.close();
  });
});

// ── Diagnose Message ────────────────────────────────────────────────────────

describe('WebSocket: diagnose', () => {
  it('returns diagnose_result for valid state', async () => {
    const ws = await connect();
    const response = await sendAndReceive(ws, {
      type: 'diagnose',
      state: validState(600),
    });
    expect(response['type']).toBe('diagnose_result');
    expect(response).toHaveProperty('health');
    expect(response).toHaveProperty('diagnoses');
    expect(Array.isArray(response['diagnoses'])).toBe(true);
    ws.close();
  });

  it('returns validation_error for invalid state in diagnose', async () => {
    const ws = await connect();
    const response = await sendAndReceive(ws, {
      type: 'diagnose',
      state: { tick: -1 },
    });
    expect(response['type']).toBe('validation_error');
    expect(response).toHaveProperty('validationErrors');
    ws.close();
  });
});

// ── Unknown Message Type ────────────────────────────────────────────────────

describe('WebSocket: unknown message type', () => {
  it('returns error for unrecognized message type', async () => {
    const ws = await connect();
    const response = await sendAndReceive(ws, { type: 'foobar' });
    expect(response['type']).toBe('error');
    expect(response['message']).toContain('Unknown message type');
    ws.close();
  });
});

// ── Malformed JSON ──────────────────────────────────────────────────────────

describe('WebSocket: malformed JSON', () => {
  it('returns error for unparseable JSON', async () => {
    const ws = await connect();
    const response = await new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (raw) => resolve(JSON.parse(raw.toString())));
      ws.send('not json at all{{{');
    });
    expect(response['type']).toBe('error');
    expect(response['message']).toContain('Malformed JSON');
    ws.close();
  });

  it('returns error when type field is missing from valid JSON', async () => {
    const ws = await connect();
    const response = await sendAndReceive(ws, { data: 'hello' });
    expect(response['type']).toBe('error');
    expect(response['message']).toContain('Missing "type"');
    ws.close();
  });
});

// ── Pong / Heartbeat ────────────────────────────────────────────────────────

describe('WebSocket: heartbeat', () => {
  it('responds to server ping with pong (keeps connection alive)', async () => {
    const ws = await connect();

    // Verify the connection stays open and can receive messages
    // (The pong handler is automatic in the ws library)
    const response = await sendAndReceive(ws, { type: 'health' });
    expect(response['type']).toBe('health_result');

    ws.close();
  });
});

// ── Origin Rejection ────────────────────────────────────────────────────────

describe('WebSocket: origin check', () => {
  it('rejects connection when origin does not match CORS policy', async () => {
    const addr = server.getAddress();
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}`, {
      headers: { origin: 'http://evil.example.com' },
    });

    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c));
      ws.on('error', () => {}); // suppress
    });

    expect(code).toBe(1008); // Origin not allowed
  });
});
