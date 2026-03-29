# AgentE — Autonomous Economic Balancer

> 5 principles. 5-stage pipeline. One npm install. Any economy.

AgentE observes, diagnoses, simulates, plans, and executes — keeping any digital economy healthy without manual tuning. If it has currencies, resources, and participants, AgentE balances it.

## Install

```bash
npm install @agent-e/core
```

Need all 60 principles? See [@agent-e/pro](https://www.npmjs.com/package/@agent-e/pro).

## Quick Start

```typescript
import { AgentE } from '@agent-e/core';

const agent = new AgentE({
  adapter: {
    // AgentE calls this every tick.
    // Return a snapshot of your economy — from YOUR database/API.
    getState: () => ({
      tick: getCurrentTick(),
      currencies: getCurrencies(),       // e.g. ['gold', 'gems']
      systems: getSystems(),             // e.g. ['crafting', 'arena']
      roles: getRoles(),                 // e.g. ['warrior', 'merchant']
      resources: getResources(),         // e.g. ['ore', 'wood']
      agentBalances: getBalances(),      // agent → currency → amount
      agentRoles: getAgentRoles(),       // agent → role
      marketPrices: getPrices(),         // currency → resource → price
      recentTransactions: getTxns(),
    }),

    // AgentE tells you WHAT to change — you apply it
    setParam: async (param, value, scope) => {
      applyToYourEconomy(param, value, scope);
    },
  },

  // Register YOUR economy's tunable parameters
  parameters: [
    { key: 'crafting_cost', type: 'cost',   flowImpact: 'sink' },
    { key: 'arena_reward',  type: 'reward', flowImpact: 'faucet' },
    { key: 'market_fee',    type: 'fee',    flowImpact: 'friction' },
  ],

  mode: 'advisor',
  onDecision: (d) => console.log(d),
});

agent.start();

// In your loop:
await agent.tick();
```

> **You never hand-type agents.** `getState()` pulls from your existing backend — whether that's 50 players or 5 million. AgentE computes aggregate metrics (Gini, velocity, flow rates) and balances the economy as a whole.

## How It Works

```
Your Economy → Observer → Diagnoser → Simulator → Planner → Executor → Your Economy
```

1. **Observer** — computes 40+ metrics at 3 time resolutions (fine/medium/coarse)
2. **Diagnoser** — runs principles, returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — lag-aware, cooldown-aware action planning with rollback conditions
5. **Executor** — applies actions, monitors for rollback triggers

## 5 Community Principles

| ID | Category | Name |
|----|----------|------|
| P1 | Supply Chain | Production Must Match Consumption |
| P12 | Currency Flow | One Primary Faucet |
| P20 | Feedback Loops | Decay Prevents Accumulation |
| P33 | Participant Experience | Fair ≠ Equal |
| P43 | Statistical | Simulation Minimum |

Each principle returns either `{ violated: false }` or a full violation with severity, evidence, suggested action (parameterType + scope), confidence score, and estimated lag.

Need all 60 principles across 15 categories? See [@agent-e/pro](https://www.npmjs.com/package/@agent-e/pro).

## Universal by Design

AgentE is not tied to any single domain. It's an **economy tool**. The core SDK has zero domain-specific logic.

### Parameter Registry

The core innovation. You register YOUR parameters with semantic metadata:

- **`type`** — what kind of lever is it? (`cost`, `fee`, `reward`, `yield`, `rate`, `multiplier`, `threshold`, `weight`, `custom`)
- **`flowImpact`** — what does it do to the flow of currency? (`sink`, `faucet`, `friction`, `redistribution`, `neutral`)
- **`scope`** — where in your economy does it live? (`{ system?, currency?, tags? }`)

AgentE's principles target **types**, not names. When a principle says "decrease the `fee` in `system_1`", the registry resolves that to YOUR parameter name.

### Multi-Everything

- **Multi-System** — register multiple sub-systems, each tracked independently
- **Multi-Currency** — every currency gets its own supply, velocity, Gini, inflation, faucet/sink metrics
- **Multi-Resource** — track resources, roles, pools, and market prices across the economy
- **Opt-in** — only register what your economy has. No pools? Don't register pool parameters. AgentE won't touch what doesn't exist.

## Modes

| Mode | What happens |
|------|-------------|
| `autonomous` | Full pipeline — observes, diagnoses, simulates, plans, executes automatically |
| `advisor` | Full pipeline but stops before execution — emits recommendations for your approval |

## Developer Controls

```typescript
// Lock a parameter — AgentE will NEVER adjust it
agent.lock('your_param_name');

// Constrain a parameter to a range — AgentE can adjust it, but only within these bounds
agent.constrain('another_param', { min: 0.5, max: 2.0 });

// Add your own principle
agent.addPrinciple(myCustomPrinciple);

// Veto specific actions before they execute
agent.on('beforeAction', (plan) => {
  if (plan.parameterType === 'reward' && plan.direction === 'increase') return false;
});
```

## Packages

| Package | Description |
|---------|-------------|
| `@agent-e/core` | Community Edition — 5 principles, MIT license |
| `@agent-e/pro` | Pro Edition — 60 principles, BSL-1.1 license |
| `@agent-e/adapter-game` | Presets for game economies |
| `@agent-e/server` | HTTP + WebSocket server for game engine integration |

## Links

- [npm](https://www.npmjs.com/package/@agent-e/core)

## License

[MIT](../../LICENSE-MIT) — free for any use.

For the full 60-principle Pro edition, see [@agent-e/pro](https://www.npmjs.com/package/@agent-e/pro) (BSL-1.1).

---

**Built by Mohamed AbdelKhalek × Claude — Animoca Labs**
