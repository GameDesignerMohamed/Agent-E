# @agent-e/core

Autonomous economic balancer SDK. 60 built-in principles, 5-stage pipeline, zero dependencies.

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
      agentBalances: { /* id → gold */ },
      agentRoles: { /* id → role */ },
      agentInventories: { /* id → { resource → qty } */ },
      marketPrices: { /* resource → price */ },
      agentSatisfaction: { /* id → 0-100 */ },
      poolSizes: { /* pool → amount */ },
    }),
    setParam: async (param, value) => {
      // Apply parameter change to your economy
    },
  },
  mode: 'advisor', // or 'autonomous'
});

agent.connect(agent.adapter).start();

// Call once per tick in your loop:
await agent.tick();
```

## The 5-Stage Pipeline

1. **Observer** — Translates raw state into 40+ metrics at 3 resolutions (fine/medium/coarse)
2. **Diagnoser** — Runs 60 principles, returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — Lag-aware, cooldown-aware planning with rollback conditions
5. **Executor** — Applies actions and monitors for rollback triggers

## Modes

| Mode | Behavior |
|------|----------|
| `autonomous` | Full pipeline — executes parameter changes automatically |
| `advisor` | Full pipeline but stops before execution — emits recommendations via `onDecision` |

## 60 Principles

Organized across 15 categories: supply chain, incentives, population, currency flow, bootstrap, feedback loops, regulator, market dynamics, measurement, statistical, system dynamics, resource management, player experience, open economy, and liveops.

Each principle has a `check(metrics, thresholds)` function that returns either `{ violated: false }` or a violation with severity, evidence, suggested action, confidence, and estimated lag.

## Developer API

```typescript
// Lock a parameter from automated adjustment
agent.lock('craftingCost');
agent.unlock('craftingCost');

// Constrain a parameter to a range
agent.constrain('auctionFee', { min: 0.01, max: 0.50 });

// Add a custom principle
agent.addPrinciple(myPrinciple);

// Register a custom metric
agent.registerCustomMetric('myMetric', (state) => compute(state));

// Veto actions
agent.on('beforeAction', (plan) => {
  if (plan.targetValue > 2.0) return false;
});

// Query decision history
const decisions = agent.getDecisions({ outcome: 'applied' });

// Health score (0-100)
const health = agent.getHealth();

// Metric time-series
const latest = agent.metrics.latest('fine');
```

## Custom Principles

```typescript
import type { Principle } from '@agent-e/core';

const myRule: Principle = {
  id: 'MY_01',
  name: 'Healer Population Floor',
  category: 'population',
  description: 'Healer share below 5% is a crisis',
  check(metrics, thresholds) {
    const share = metrics.roleShares['Healer'] ?? 0;
    if (share < 0.05) {
      return {
        violated: true,
        severity: 8,
        evidence: { share },
        suggestedAction: {
          parameter: 'healerReward',
          direction: 'increase',
          magnitude: 0.25,
          reasoning: 'Healer population critically low.',
        },
        confidence: 0.90,
        estimatedLag: 10,
      };
    }
    return { violated: false };
  },
};

agent.addPrinciple(myRule);
```

## Performance

- **O(N) event classification** — single-pass instead of 6 separate filters
- **Cached diagnosis** — no redundant principle checks within the same tick
- **Numerical stability** — clamped inputs to prevent NaN edge cases

Typical for 1,000 agents, 100 events/tick: ~60ms end-to-end.

## License

MIT
