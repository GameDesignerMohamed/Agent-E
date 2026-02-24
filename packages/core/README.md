# @agent-e/core

Autonomous economic balancer SDK. 60 built-in principles, 5-stage pipeline, zero dependencies. Works with any digital economy — games, DeFi, marketplaces, token systems, social platforms.

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
      currencies: ['credits', 'tokens'],
      systems: ['exchange', 'rewards'],
      agentBalances: {
        user_a: { credits: 500, tokens: 20 },
        user_b: { credits: 300, tokens: 80 },
      },
      agentRoles: { user_a: 'provider', user_b: 'consumer' },
      marketPrices: {
        credits: { service_a: 10, service_b: 25 },
      },
      agentSatisfaction: { user_a: 72, user_b: 85 },
      poolSizes: { rewardPool: { credits: 5000 } },
      roles: ['provider', 'consumer'],
      resources: ['service_a', 'service_b'],
      recentTransactions: [],
    }),
    setParam: async (param, value, scope) => {
      applyToYourEconomy(param, value, scope);
    },
  },
  parameters: [
    { key: 'exchangeFee', type: 'fee', flowImpact: 'friction', scope: { system: 'exchange' } },
    { key: 'dailyReward', type: 'reward', flowImpact: 'faucet', scope: { system: 'rewards' } },
  ],
  mode: 'advisor',
});

agent.start();
await agent.tick();
```

## The 5-Stage Pipeline

1. **Observer** — Translates raw state into 40+ metrics at 3 resolutions (fine/medium/coarse)
2. **Diagnoser** — Runs 60 principles, returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — Lag-aware, cooldown-aware planning with rollback conditions
5. **Executor** — Applies actions and monitors for rollback triggers

## Parameter Registry

Register your economy's parameters with semantic types and flow impacts:

```typescript
parameters: [
  { key: 'tradeFee',   type: 'fee',    flowImpact: 'friction',       scope: { system: 'trading' } },
  { key: 'mintReward', type: 'reward', flowImpact: 'faucet',         scope: { system: 'minting' } },
  { key: 'burnRate',   type: 'rate',   flowImpact: 'sink',           scope: { system: 'burning' } },
  { key: 'lpYield',    type: 'yield',  flowImpact: 'faucet',         scope: { system: 'liquidity', currency: 'tokens' } },
  { key: 'platformCut', type: 'fee',   flowImpact: 'sink',           scope: { system: 'marketplace', tags: ['operator'] } },
]
```

Principles target types (e.g., "decrease `fee` in `trading`"), and the registry resolves to your concrete parameter name.

## Multi-System, Multi-Currency

AgentE tracks each system and currency independently:

- Per-currency: supply, net flow, velocity, inflation, Gini, wealth distribution, faucet/sink volumes, price index
- Per-system: flow, activity, participant count
- Cross-system: arbitrage index, source/sink share analysis

## Modes

| Mode | Behavior |
|------|----------|
| `autonomous` | Full pipeline — executes parameter changes automatically |
| `advisor` | Full pipeline but stops before execution — emits recommendations via `onDecision` |

## Developer API

```typescript
// Lock a parameter from automated adjustment
agent.lock('exchangeFee');
agent.unlock('exchangeFee');

// Constrain a parameter to a range
agent.constrain('dailyReward', { min: 1, max: 100 });

// Add a custom principle
agent.addPrinciple(myPrinciple);

// Register a custom metric
agent.registerCustomMetric('myMetric', (state) => compute(state));

// Veto actions
agent.on('beforeAction', (plan) => {
  if (plan.parameterType === 'reward') return false;
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
  name: 'Provider Population Floor',
  category: 'population',
  description: 'Provider role share below 5% is a crisis',
  check(metrics, thresholds) {
    const share = metrics.roleShares['provider'] ?? 0;
    if (share < 0.05) {
      return {
        violated: true,
        severity: 8,
        evidence: { share },
        suggestedAction: {
          parameterType: 'reward',
          scope: { tags: ['provider'] },
          direction: 'increase',
          magnitude: 0.25,
          reasoning: 'Provider population critically low.',
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

## 60 Principles

Organized across 15 categories: supply chain, incentives, population, currency flow, bootstrap, feedback loops, regulator, market dynamics, measurement, statistical, system dynamics, resource management, participant experience, open economy, and operations.

## Performance

- **O(N) event classification** — single-pass instead of 6 separate filters
- **O(n) arbitrage index** — log-price standard deviation instead of pairwise
- **Cached diagnosis** — no redundant principle checks within the same tick
- **Numerical stability** — clamped inputs to prevent NaN/Infinity edge cases

Typical for 1,000 agents, 100 events/tick: ~60ms end-to-end.

## License

MIT

---

**Built by Oka × Claude — AB Labs**
