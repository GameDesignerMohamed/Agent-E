# AgentE Integration Examples

Copy-paste client examples for connecting your game engine to AgentE Server.

## How It Works

1. **Start the AgentE server** — a standalone process that runs the 60-principle balancing engine
2. **Your game sends state snapshots** every N ticks via HTTP or WebSocket
3. **AgentE analyzes the state**, detects imbalances, simulates fixes, and returns parameter adjustments
4. **Your game applies the adjustments** to its economy parameters

```
┌─────────────┐    POST /tick     ┌──────────────┐
│  Your Game   │ ───────────────► │ AgentE Server │
│  (any engine)│ ◄─────────────── │  (Node.js)    │
└─────────────┘   { adjustments } └──────────────┘
```

## Examples

| File | Engine | Transport |
|------|--------|-----------|
| `browser-client.ts` | Browser / Node.js | HTTP |
| `websocket-client.ts` | Any (JS/TS) | WebSocket |
| `unity-client/AgentEClient.cs` | Unity | HTTP |
| `unreal-client/AgentEClient.h/.cpp` | Unreal Engine | HTTP |
| `godot-client/agente_client.gd` | Godot 4 | HTTP |

## State Shape

Every tick, send a JSON object matching this shape:

```json
{
  "tick": 100,
  "roles": ["role_a", "role_b", "role_c"],
  "resources": ["resource_x", "resource_y"],
  "currencies": ["currency_a"],
  "agentBalances": {
    "agent_1": { "currency_a": 150 },
    "agent_2": { "currency_a": 80 }
  },
  "agentRoles": {
    "agent_1": "role_a",
    "agent_2": "role_b"
  },
  "agentInventories": {
    "agent_1": { "resource_x": 2 },
    "agent_2": { "resource_y": 5 }
  },
  "marketPrices": {
    "currency_a": { "resource_x": 15, "resource_y": 50 }
  },
  "recentTransactions": []
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `tick` | `number` | Current game tick (non-negative integer) |
| `roles` | `string[]` | All role types (non-empty) |
| `resources` | `string[]` | All resource types (can be empty) |
| `currencies` | `string[]` | All currency types (non-empty) |
| `agentBalances` | `Record<id, Record<currency, number>>` | Nested: agent → currency → balance |
| `agentRoles` | `Record<id, string>` | Agent → role name |
| `agentInventories` | `Record<id, Record<resource, number>>` | Agent → resource → quantity |
| `marketPrices` | `Record<currency, Record<resource, number>>` | Currency → resource → price |
| `recentTransactions` | `EconomicEvent[]` | Recent events (can be empty) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `agentSatisfaction` | `Record<id, number>` | Agent → satisfaction (0-100) |
| `poolSizes` | `Record<currency, Record<pool, number>>` | Currency → pool → amount |
| `customData` | `Record<string, unknown>` | Any extra data |

## Response Shape

```json
{
  "adjustments": [
    { "key": "your_cost_param", "value": 12.5 }
  ],
  "alerts": [
    { "principle": "P1", "name": "Production Must Match Consumption", "severity": 7 }
  ],
  "health": 85,
  "decisions": [
    { "id": "d_1", "parameter": "your_cost_param", "result": "applied" }
  ]
}
```

## Quick Start

```bash
# Install and start
npm install @agent-e/server
npx @agent-e/server

# Test with curl
curl -X POST http://localhost:3000/tick \
  -H 'Content-Type: application/json' \
  -d '{"state":{"tick":0,"roles":["role_a"],"resources":[],"currencies":["currency_a"],"agentBalances":{},"agentRoles":{},"agentInventories":{},"marketPrices":{},"recentTransactions":[]}}'
```

## HTTP vs WebSocket

- **HTTP** (`POST /tick`): Simple, works everywhere. Best for games ticking < 10/sec.
- **WebSocket** (`ws://`): Lower latency, persistent connection. Best for fast-ticking games.

Both use the same state shape and return the same response format.
