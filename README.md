# AgentE — Autonomous Economic Balancer

> 60 principles. 5-stage pipeline. One npm install.

AgentE observes, diagnoses, simulates, plans, and executes — keeping any digital economy healthy without manual tuning.

## Install

```bash
npm install @agent-e/core
```

## Quick Start

```typescript
import { AgentE } from '@agent-e/core';

const adapter = {
  getState: () => ({
    tick: currentTick,
    currencies: ['gold', 'gems'],
    agentBalances: {
      player1: { gold: 100, gems: 50 },
      player2: { gold: 200, gems: 10 },
    },
    agentRoles: { /* id → role */ },
    agentInventories: { /* id → { resource → qty } */ },
    marketPrices: {
      gold: { sword: 10, potion: 5 },
      gems: { sword: 2, potion: 1 },
    },
    roles: ['warrior', 'mage'],
    resources: ['sword', 'potion'],
    recentTransactions: [],
  }),
  setParam: async (param, value, currency) => {
    // currency tells you which economy to adjust
    applyToYourEconomy(param, value, currency);
  },
};

const agent = new AgentE({
  adapter,
  mode: 'advisor',
  onDecision: (d) => console.log(d),
});

agent.connect(adapter).start();

// In your loop:
await agent.tick();
```

## How It Works

```
Your Economy → Observer → Diagnoser → Simulator → Planner → Executor → Your Economy
```

1. **Observer** — computes 30+ metrics at 3 time resolutions (fine/medium/coarse)
2. **Diagnoser** — runs all 60 principles, returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — lag-aware, cooldown-aware action planning with rollback conditions
5. **Executor** — applies actions, monitors for rollback triggers

## Multi-Currency Support

AgentE tracks each currency independently. Every currency gets its own:
- Supply, net flow, velocity, inflation rate
- Gini coefficient, median/mean balance, wealth distribution
- Faucet/sink volumes, pool sizes
- Price index, arbitrage index

When a principle detects an issue, the violation tells you which currency
is unhealthy and the suggested action is scoped to that currency.

## Modes

| Mode | What happens |
|------|-------------|
| `autonomous` | Full pipeline — observes, diagnoses, simulates, plans, executes automatically |
| `advisor` | Full pipeline but stops before execution — emits recommendations for your approval |

## Tick Configuration

```typescript
const agent = new AgentE({
  adapter: yourAdapter,
  tickConfig: {
    duration: 5,          // one tick = 5 seconds
    unit: 'second',
    mediumWindow: 12,     // medium metrics = every 12 ticks (60s)
    coarseWindow: 120,    // coarse metrics = every 120 ticks (10min)
  },
});
```

## Developer Controls

```typescript
agent.lock('entryFee');                                // never touch this parameter
agent.constrain('productionCost', { min: 0.5, max: 2 }); // bound the range
agent.addPrinciple(myCustomPrinciple);                 // add your own rules
agent.registerCustomMetric('myMetric', fn);            // add your own metrics

agent.on('beforeAction', (plan) => {
  if (plan.parameter === 'rewardRate') return false;   // veto
});
```

## 60 Principles

Built-in knowledge base across 15 categories: supply chain, incentives, population, currency flow, bootstrap, feedback loops, regulator, market dynamics, measurement, statistical, system dynamics, resource management, player experience, open economy, and liveops.

Each principle returns either `{ violated: false }` or a full violation with severity, evidence, suggested action, confidence score, and estimated lag.

## Links

- [npm](https://www.npmjs.com/package/@agent-e/core)
- [Principles Reference](https://agente.dev/principles)

## License

MIT
