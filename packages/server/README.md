# @agent-e/server

Plug-and-play HTTP + WebSocket server for AgentE. Send your economy's state, get back parameter adjustments.

## Quick Start

```ts
import { startServer } from '@agent-e/server';

const server = await startServer({ port: 3000 });
// Server is running — POST /tick, GET /health, etc.
```

Or with full configuration:

```ts
import { AgentEServer } from '@agent-e/server';

const server = new AgentEServer({
  port: 3000,
  host: '0.0.0.0',
  agentEConfig: {
    mode: 'autonomous',     // or 'advisor' for recommendations only
    gracePeriod: 50,         // no interventions before tick 50
    checkInterval: 5,        // analyze every 5 ticks
    maxAdjustmentPercent: 0.15,
    cooldownTicks: 15,
  },
});

await server.start();
```

## Dashboard

The server includes a built-in developer dashboard at `GET /`. Start the server and open `http://localhost:3100` in your browser.

The dashboard shows:
- **Health & Metrics** — real-time line charts for economy health, gini, net flow, satisfaction
- **Decision Feed** — terminal-style log of every AgentE decision
- **Active Alerts** — live violation cards sorted by severity
- **Violation History** — sortable table of all past violations
- **Persona Distribution** — horizontal bar chart of agent archetypes
- **Parameter Registry** — tracked principles

The dashboard connects via WebSocket for real-time updates, with HTTP polling fallback when WebSocket is unavailable.

To disable the dashboard:

```ts
const server = new AgentEServer({
  serveDashboard: false,
});
```

## Advisor Mode

In advisor mode, AgentE recommends parameter changes but does not apply them. Use the dashboard or HTTP API to approve or reject recommendations.

```ts
const server = new AgentEServer({
  agentE: { mode: 'advisor' },
});
```

### GET /pending

List pending recommendations waiting for approval.

```bash
curl http://localhost:3100/pending
```

```json
{
  "mode": "advisor",
  "pending": [{ "id": "decision_100_trade_tax", "tick": 100, ... }],
  "count": 1
}
```

### POST /approve

Approve a pending recommendation. AgentE will apply the parameter change.

```bash
curl -X POST http://localhost:3100/approve \
  -H 'Content-Type: application/json' \
  -d '{"decisionId": "decision_100_trade_tax"}'
```

### POST /reject

Reject a pending recommendation with an optional reason.

```bash
curl -X POST http://localhost:3100/reject \
  -H 'Content-Type: application/json' \
  -d '{"decisionId": "decision_100_trade_tax", "reason": "too aggressive"}'
```

### GET /metrics

Latest metrics snapshot plus recent history for charting.

```json
{
  "latest": { "tick": 100, "giniCoefficient": 0.35, ... },
  "history": [{ "tick": 1, "health": 100, "giniCoefficient": 0.0, ... }, ...]
}
```

### GET /metrics/personas

Persona distribution from the latest metrics.

```json
{ "distribution": { "Whale": 3, "ActiveTrader": 12, ... }, "total": 50 }
```

## API Reference

### POST /tick

Send economy state, receive parameter adjustments.

**Request:**
```json
{
  "state": {
    "tick": 100,
    "roles": ["role_a", "role_b"],
    "resources": ["resource_x", "resource_y"],
    "currencies": ["currency_a"],
    "agentBalances": { "agent_1": { "currency_a": 150 } },
    "agentRoles": { "agent_1": "role_a" },
    "agentInventories": { "agent_1": { "resource_x": 2 } },
    "marketPrices": { "currency_a": { "resource_x": 15 } },
    "recentTransactions": []
  },
  "events": []
}
```

**Response (200):**
```json
{
  "adjustments": [{ "key": "your_cost_param", "value": 12.5 }],
  "alerts": [{ "principle": "P1", "severity": 7 }],
  "health": 85,
  "decisions": [{ "id": "d_1", "parameter": "your_cost_param", "result": "applied" }]
}
```

**Error (400):** Invalid state returns validation errors.

### GET /health

```json
{
  "health": 85,
  "tick": 100,
  "mode": "autonomous",
  "activePlans": 1,
  "uptime": 60000
}
```

### GET /decisions

Query parameters: `?limit=50`, `?since=100`

```json
{
  "decisions": [{
    "id": "d_1",
    "tick": 100,
    "principle": "P1",
    "parameter": "your_cost_param",
    "result": "applied",
    "reasoning": "..."
  }]
}
```

### POST /config

Lock/unlock parameters, change mode.

```json
{ "action": "lock", "param": "your_cost_param" }
{ "action": "unlock", "param": "your_cost_param" }
{ "action": "constrain", "param": "your_yield_param", "min": 0.5, "max": 2.0 }
{ "action": "mode", "mode": "advisor" }
```

### GET /principles

Lists all 60 built-in principles.

### POST /diagnose

Run Observer + Diagnoser without side effects (no parameter changes).

```json
{ "state": { ... } }
```

## WebSocket

Connect to the same port via WebSocket upgrade.

### Client → Server Messages

```json
{ "type": "tick", "state": {...}, "events": [...] }
{ "type": "event", "event": { "type": "trade", ... } }
{ "type": "health" }
{ "type": "diagnose", "state": {...} }
```

### Server → Client Messages

```json
{ "type": "tick_result", "adjustments": [...], "health": 85 }
{ "type": "health_result", "health": 85, "uptime": 60000 }
{ "type": "diagnose_result", "diagnoses": [...] }
{ "type": "validation_error", "validation": {...} }
{ "type": "validation_warning", "warning": {...} }
{ "type": "error", "error": "..." }
```

Heartbeat: Server pings every 30 seconds.

## Authentication

Protect mutation routes and the dashboard with an API key:

```ts
const server = new AgentEServer({
  apiKey: process.env.AGENTE_API_KEY,
});
```

When `apiKey` is set:

- **POST routes** (`/tick`, `/config`, `/approve`, `/reject`, `/diagnose`) require `Authorization: Bearer <key>`.
- **Sensitive GET routes** (`/decisions`, `/metrics`, `/metrics/personas`, `/pending`) also require the header.
- **Dashboard** (`GET /`) accepts either the `Authorization` header or a `?token=<key>` query parameter.
- **WebSocket** accepts the key via `Authorization` header or `?token=<key>` on the upgrade request.
- **Open routes** (`/health`, `/principles`) remain unauthenticated for health-check probes.

All key comparisons use `crypto.timingSafeEqual()` to prevent timing side-channel attacks.

## Security

The server includes multiple layers of defense-in-depth:

### Input Validation

- **State validation** — all incoming economy state is validated before processing. Invalid state returns detailed errors with field paths.
- **Event validation** — events are checked for required fields (`type`, `actor`, `timestamp`) and a valid `type` value before ingestion. Malformed events are silently dropped (HTTP) or return an error (WebSocket).
- **Prototype pollution protection** — `__proto__`, `constructor`, and `prototype` keys are recursively stripped from all parsed JSON bodies.
- **Body size limits** — HTTP request bodies are capped at 1 MB with a 30-second read timeout to mitigate slow-loris attacks.
- **Array caps** — configuration arrays (lock/unlock/constrain) are capped at 1,000 entries.

### Rate Limiting

- **Per-connection** — each WebSocket connection is limited to one tick per 100 ms.
- **Global** — a server-wide rate limiter caps ticks at 20/sec across all WebSocket connections to prevent CPU saturation.
- **Connection limit** — maximum 50 concurrent WebSocket connections; excess connections are closed with code 1013.

### Transport Security

- **CORS** — configurable origin restriction via `corsOrigin` (default: `http://localhost:3100`). WebSocket connections from disallowed origins are closed with code 1008.
- **HSTS** — `Strict-Transport-Security: max-age=31536000; includeSubDomains` header on all responses.
- **Nonce-based CSP** — the dashboard uses a per-request cryptographic nonce for `script-src`, eliminating `'unsafe-inline'` scripts.
- **SRI** — the CDN-loaded Chart.js library includes a `integrity` hash and `crossorigin="anonymous"` attribute.
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Cache-Control: no-cache, private` on all responses.

### Concurrency

- **Tick serialization** — `processTick()` uses a Promise-based mutex so concurrent HTTP + WebSocket ticks cannot corrupt shared adjustment queues.

### Data Exposure

- **metricsSnapshot stripping** — the `/decisions` endpoint strips full metrics snapshots from decision records to avoid leaking large internal state objects.

## State Validation

All incoming state is validated before processing. Invalid state returns detailed errors with paths:

```json
{
  "error": "Invalid state",
  "validation": {
    "valid": false,
    "errors": [{
      "path": "agentBalances.agent_1.currency_a",
      "expected": "number >= 0",
      "received": "string",
      "message": "agentBalances.agent_1.currency_a must be a non-negative number"
    }],
    "warnings": []
  }
}
```
