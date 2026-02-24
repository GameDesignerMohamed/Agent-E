# @agent-e/core

Autonomous economic balancer SDK. 60 built-in principles, 5-stage pipeline, zero dependencies. Works with any digital economy.

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
      currencies: ['currency_a', 'currency_b'],
      systems: ['system_1', 'system_2'],
      agentBalances: {
        agent_001: { currency_a: 500, currency_b: 20 },
        agent_002: { currency_a: 120, currency_b: 80 },
      },
      agentRoles: { agent_001: 'role_a', agent_002: 'role_b' },
      marketPrices: {
        currency_a: { resource_x: 10, resource_y: 25 },
      },
      agentSatisfaction: { agent_001: 72, agent_002: 85 },
      poolSizes: { main_pool: { currency_a: 5000 } },
      roles: ['role_a', 'role_b'],
      resources: ['resource_x', 'resource_y'],
      recentTransactions: [],
    }),
    setParam: async (param, value, scope) => {
      applyToYourEconomy(param, value, scope);
    },
  },
  parameters: [
    { key: 'your_fee_param',    type: 'fee',    flowImpact: 'friction', scope: { system: 'system_1' } },
    { key: 'your_reward_param', type: 'reward', flowImpact: 'faucet',   scope: { system: 'system_2' } },
  ],
  mode: 'advisor',
});

agent.start();
await agent.tick();
```

**Replace the placeholder names with YOUR economy's actual names.** See the root README for real-world examples (game, DeFi, marketplace).

## The 5-Stage Pipeline

1. **Observer** — Translates raw state into 40+ metrics at 3 resolutions (fine/medium/coarse)
2. **Diagnoser** — Runs 60 principles, returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — Lag-aware, cooldown-aware planning with rollback conditions
5. **Executor** — Applies actions and monitors for rollback triggers

## Parameter Registry

Register your parameters with semantic types and flow impacts:

```typescript
parameters: [
  // key: whatever YOU call it
  // type: what kind of lever is it?
  // flowImpact: what does it do to currency flow?
  // scope: where in your economy does it live?

  { key: 'my_fee',      type: 'fee',      flowImpact: 'friction',       scope: { system: 'trading' } },
  { key: 'my_reward',   type: 'reward',   flowImpact: 'faucet',         scope: { system: 'engagement' } },
  { key: 'my_rate',     type: 'rate',     flowImpact: 'sink',           scope: { system: 'burning' } },
  { key: 'my_yield',    type: 'yield',    flowImpact: 'faucet',         scope: { system: 'staking', currency: 'currency_b' } },
  { key: 'my_cut',      type: 'fee',      flowImpact: 'sink',           scope: { system: 'platform', tags: ['operator'] } },
]
```

Principles say "decrease `fee` in `trading`" — the registry resolves to `my_fee`. Your names stay yours.

### Semantic Types

| Type | What it means |
|------|--------------|
| `cost` | Something participants pay to do an action |
| `fee` | A percentage or flat charge on transactions |
| `reward` | Something participants receive for an action |
| `yield` | Passive income from holding or staking |
| `rate` | A speed or frequency multiplier |
| `multiplier` | A scaling factor |
| `threshold` | A boundary value that triggers behavior |
| `weight` | A relative importance factor |
| `custom` | Anything else |

### Flow Impacts

| Impact | What it does to currency flow |
|--------|------------------------------|
| `sink` | Removes currency from circulation |
| `faucet` | Adds currency to circulation |
| `friction` | Slows velocity without removing currency |
| `redistribution` | Moves currency between participants |
| `neutral` | No direct effect on flow |

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
// Lock — AgentE will never adjust this parameter
agent.lock('your_param_name');
agent.unlock('your_param_name');

// Constrain — AgentE can adjust, but only within this range
agent.constrain('another_param', { min: 0.01, max: 0.50 });

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
  name: 'Minimum Provider Population',
  category: 'population',
  description: 'Triggers when a critical role drops below 5% of population',
  check(metrics, thresholds) {
    const share = metrics.roleShares['role_a'] ?? 0;
    if (share < 0.05) {
      return {
        violated: true,
        severity: 8,
        evidence: { share },
        suggestedAction: {
          parameterType: 'reward',
          scope: { tags: ['role_a'] },
          direction: 'increase',
          magnitude: 0.25,
          reasoning: 'Critical role population below 5%.',
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
