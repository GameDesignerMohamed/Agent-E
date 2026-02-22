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

const agent = new AgentE({
  adapter: {
    getState: () => yourEconomyState,
    setParam: (param, value) => applyToYourEconomy(param, value),
  },
  mode: 'advisor',
  onDecision: (d) => console.log(d),
});

agent.connect(agent.adapter).start();

// In your loop:
await agent.tick();
```

## How It Works

```
Your Economy → Observer → Diagnoser → Simulator → Planner → Executor → Your Economy
                  ↓           ↓            ↓           ↓          ↓
              40+ metrics   60 principles  Monte Carlo  Cooldowns  Rollback
              3 resolutions  sorted by     ≥100 runs    + locks    monitoring
                             severity      P10/P50/P90  + vetos
```

The **adapter** is the only thing you write — an object with `getState()` and `setParam()`. Everything else runs inside `@agent-e/core`.

## Modes

| Mode | What happens |
|------|-------------|
| `autonomous` | Full pipeline — observes, diagnoses, simulates, plans, executes automatically |
| `advisor` | Full pipeline but stops before execution — emits recommendations for your approval |

## Developer Controls

```typescript
agent.lock('arenaEntryFee');                          // never touch this parameter
agent.constrain('craftingCost', { min: 0.5, max: 2 }); // bound the range
agent.addPrinciple(myCustomPrinciple);                // add your own rules
agent.registerCustomMetric('myMetric', fn);           // add your own metrics

agent.on('beforeAction', (plan) => {
  if (plan.parameter === 'arenaReward') return false; // veto
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
