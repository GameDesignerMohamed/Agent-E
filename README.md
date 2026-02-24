# AgentE — Autonomous Economic Balancer

> 60 principles. 5-stage pipeline. One npm install. Any economy.

AgentE observes, diagnoses, simulates, plans, and executes — keeping any digital economy healthy without manual tuning. Games, DeFi protocols, marketplaces, token economies, social platforms — if it has currencies, resources, and participants, AgentE balances it.

## Install

```bash
npm install @agent-e/core
```

## Quick Start

```typescript
import { AgentE } from '@agent-e/core';

const agent = new AgentE({
  adapter: {
    getState: () => ({
      tick: currentTick,
      currencies: ['credits', 'points'],
      systems: ['marketplace', 'rewards', 'staking'],
      agentBalances: {
        user_001: { credits: 1200, points: 50 },
        user_002: { credits: 800, points: 120 },
      },
      agentRoles: { user_001: 'seller', user_002: 'buyer' },
      marketPrices: {
        credits: { widget: 10, premium_access: 100 },
      },
      roles: ['buyer', 'seller', 'operator'],
      resources: ['widget', 'premium_access'],
      recentTransactions: [],
    }),
    setParam: async (param, value, scope) => {
      applyToYourEconomy(param, value, scope);
    },
  },
  parameters: [
    { key: 'listingFee', type: 'fee', flowImpact: 'friction', scope: { system: 'marketplace' } },
    { key: 'referralBonus', type: 'reward', flowImpact: 'faucet', scope: { system: 'rewards' } },
    { key: 'stakingYield', type: 'yield', flowImpact: 'faucet', scope: { system: 'staking' } },
  ],
  mode: 'advisor',
  onDecision: (d) => console.log(d),
});

agent.start();

// In your loop:
await agent.tick();
```

## How It Works

```
Your Economy → Observer → Diagnoser → Simulator → Planner → Executor → Your Economy
```

1. **Observer** — computes 40+ metrics at 3 time resolutions (fine/medium/coarse)
2. **Diagnoser** — runs 60 principles, returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — lag-aware, cooldown-aware action planning with rollback conditions
5. **Executor** — applies actions, monitors for rollback triggers

## Universal by Design

AgentE is not a game tool, a DeFi tool, or a marketplace tool. It's an **economy tool**. The core SDK has zero domain-specific logic. Domain adapters (game, DeFi, marketplace) provide presets for specific economy types.

### Multi-System

Register multiple systems (marketplace, crafting, staking, etc.) and AgentE tracks per-system flow, activity, and participant distribution independently.

### Multi-Currency

Every currency gets independent tracking: supply, net flow, velocity, inflation, Gini coefficient, faucet/sink volumes, price index, and arbitrage index.

### Multi-Resource, Multi-Role, Multi-Everything

Resources, roles, pools, events — all tracked. The Parameter Registry lets you register any parameter with a semantic type and flow impact, and AgentE's 60 principles target types, not names.

## Parameter Registry

The core innovation. Instead of hardcoding parameter names, you register parameters with metadata:

```typescript
parameters: [
  { key: 'swapFee', type: 'fee', flowImpact: 'friction', scope: { system: 'amm' } },
  { key: 'lpReward', type: 'reward', flowImpact: 'faucet', scope: { system: 'amm' } },
  { key: 'listingFee', type: 'fee', flowImpact: 'friction', scope: { system: 'marketplace' } },
]
```

Principles say "increase the `fee` in `amm`" — the registry resolves that to `swapFee`. Your economy's parameter names stay yours.

## Modes

| Mode | What happens |
|------|-------------|
| `autonomous` | Full pipeline — observes, diagnoses, simulates, plans, executes automatically |
| `advisor` | Full pipeline but stops before execution — emits recommendations for your approval |

## Developer Controls

```typescript
// Lock a parameter
agent.lock('listingFee');

// Constrain a parameter to a range
agent.constrain('swapFee', { min: 0.001, max: 0.10 });

// Add a custom principle
agent.addPrinciple(myCustomPrinciple);

// Veto actions
agent.on('beforeAction', (plan) => {
  if (plan.parameterType === 'reward' && plan.direction === 'increase') return false;
});
```

## 60 Principles

Built-in knowledge base across 15 categories: supply chain, incentives, population, currency flow, bootstrap, feedback loops, regulator, market dynamics, measurement, statistical, system dynamics, resource management, participant experience, open economy, and operations.

Each principle returns either `{ violated: false }` or a full violation with severity, evidence, suggested action (parameterType + scope), confidence score, and estimated lag.

## Packages

| Package | Description |
|---------|-------------|
| `@agent-e/core` | The SDK. Zero dependencies. |
| `@agent-e/adapter-game` | Presets for game economies (MMO, idle, PvP, survival) |
| `@agent-e/adapter-defi` | Presets for DeFi protocols (AMM, lending, staking) — coming soon |
| `@agent-e/adapter-marketplace` | Presets for two-sided marketplaces — coming soon |

## Links

- [npm](https://www.npmjs.com/package/@agent-e/core)
- [GitHub](https://github.com/AE-Vault/AgentE-v0)

## License

MIT

---

**Built by Oka × Claude — AB Labs**
