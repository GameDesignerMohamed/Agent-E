# @agent-e/adapter-game

Game economy adapter for AgentE. Translates your game's API into AgentE's universal multi-currency state format.

## When to Use This

Use this adapter when you're running AgentE **inside your game process** (not over HTTP). If your game engine can run Node.js/TypeScript, embed AgentE directly:

```ts
import { AgentE } from '@agent-e/core';
import { GameAdapter } from '@agent-e/adapter-game';

const adapter = new GameAdapter({
  api: myGameAPI,  // implements GameAPI interface
});

const agentE = new AgentE({
  adapter,
  mode: 'autonomous',
  gracePeriod: 50,
  checkInterval: 5,
});

agentE.connect(adapter).start();

// In your game loop:
function onTick() {
  agentE.tick();
}
```

If your game engine **cannot** run Node.js (Unity, Unreal, Godot), use `@agent-e/server` instead and communicate over HTTP/WebSocket. See the `examples/` directory.

## GameAPI Interface

Implement this interface to connect your game:

```ts
interface GameAPI {
  getTick(): number;
  getRoles(): string[];
  getCurrencies(): string[];
  getResources(): string[];
  getAgentRoles(): Record<string, string>;
  getAgentBalances(): Record<string, Record<string, number>>;
  getAgentInventories(): Record<string, Record<string, number>>;
  getMarketPrices(): Record<string, Record<string, number>>;
  setParam(key: string, value: number, currency?: string): void;

  // Optional
  getAgentSatisfaction?(): Record<string, number>;
  getRecentEvents?(): EconomicEvent[];
  getPoolSizes?(): Record<string, Record<string, number>>;
}
```

### Multi-Currency Support

Balances, prices, and pools are all nested by currency:

```ts
// Agent balances: agent → currency → amount
getAgentBalances(): {
  'player_1': { gold: 150, gems: 10 },
  'player_2': { gold: 80, gems: 25 },
}

// Market prices: currency → resource → price
getMarketPrices(): {
  gold: { ore: 15, weapons: 50 },
  gems: { ore: 2, weapons: 8 },
}

// Pool sizes: currency → pool → amount
getPoolSizes(): {
  gold: { arena: 500, bank: 200 },
  gems: { shop: 1000 },
}
```

### Event Types

If you implement `getRecentEvents()`, return events with these types:

| Type | Description |
|------|-------------|
| `trade` | Player-to-player or auction house trade |
| `mint` | Currency created (quest reward, daily login) |
| `burn` | Currency destroyed (repair cost, tax) |
| `transfer` | Currency moved between agents |
| `produce` | Resource crafted or gathered |
| `consume` | Resource used up |
| `role_change` | Agent switched roles |
| `spawn` | New agent entered economy |
| `churn` | Agent left economy |

## Pushing Events

For real-time event streaming (instead of polling via `getRecentEvents`):

```ts
const adapter = new GameAdapter({ api: myGameAPI });

// Push events as they happen in your game
onPlayerTrade((trade) => {
  adapter.pushEvent({
    type: 'trade',
    timestamp: currentTick,
    actor: trade.buyerId,
    resource: trade.item,
    amount: trade.quantity,
    price: trade.price,
  });
});
```
