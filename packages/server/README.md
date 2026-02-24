# @agent-e/server

Plug-and-play HTTP + WebSocket server for AgentE. Send your game's economy state, get back parameter adjustments.

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
    dominantRoles: ['Fighter'],
    maxAdjustmentPercent: 0.15,
    cooldownTicks: 15,
  },
});

await server.start();
```

## API Reference

### POST /tick

Send economy state, receive parameter adjustments.

**Request:**
```json
{
  "state": {
    "tick": 100,
    "roles": ["Fighter", "Crafter"],
    "resources": ["ore", "weapons"],
    "currencies": ["gold"],
    "agentBalances": { "a1": { "gold": 150 } },
    "agentRoles": { "a1": "Fighter" },
    "agentInventories": { "a1": { "weapons": 2 } },
    "marketPrices": { "gold": { "ore": 15 } },
    "recentTransactions": []
  },
  "events": []
}
```

**Response (200):**
```json
{
  "adjustments": [{ "key": "craftingCost", "value": 12.5 }],
  "alerts": [{ "principle": "P1", "severity": 7 }],
  "health": 85,
  "decisions": [{ "id": "d_1", "parameter": "craftingCost", "result": "applied" }]
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
    "parameter": "craftingCost",
    "result": "applied",
    "reasoning": "..."
  }]
}
```

### POST /config

Lock/unlock parameters, change mode.

```json
{ "action": "lock", "param": "craftingCost" }
{ "action": "unlock", "param": "craftingCost" }
{ "action": "constrain", "param": "miningYield", "min": 0.5, "max": 2.0 }
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

## State Validation

All incoming state is validated before processing. Invalid state returns detailed errors with paths:

```json
{
  "error": "Invalid state",
  "validation": {
    "valid": false,
    "errors": [{
      "path": "agentBalances.a1.gold",
      "expected": "number >= 0",
      "received": "string",
      "message": "agentBalances.a1.gold must be a non-negative number"
    }],
    "warnings": []
  }
}
```
