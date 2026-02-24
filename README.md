# AgentE — Autonomous Economic Balancer

> 60 principles. 5-stage pipeline. One npm install. Any economy.

AgentE observes, diagnoses, simulates, plans, and executes — keeping any digital economy healthy without manual tuning. If it has currencies, resources, and participants, AgentE balances it.

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

      // What currencies exist in your economy?
      currencies: ['currency_a', 'currency_b'],

      // What sub-systems does your economy have? (optional)
      systems: ['system_1', 'system_2'],

      // Who holds what?
      agentBalances: {
        agent_001: { currency_a: 500, currency_b: 20 },
        agent_002: { currency_a: 120, currency_b: 80 },
      },

      // What role does each participant play?
      agentRoles: { agent_001: 'role_a', agent_002: 'role_b' },

      // What do things cost?
      marketPrices: {
        currency_a: { resource_x: 10, resource_y: 25 },
      },

      roles: ['role_a', 'role_b'],
      resources: ['resource_x', 'resource_y'],
      recentTransactions: [],
    }),

    setParam: async (param, value, scope) => {
      // AgentE tells you WHAT to change — you apply it to your system
      applyToYourEconomy(param, value, scope);
    },
  },

  // Register YOUR parameters — whatever they're called in YOUR economy
  parameters: [
    { key: 'your_fee_param',    type: 'fee',    flowImpact: 'friction', scope: { system: 'system_1' } },
    { key: 'your_reward_param', type: 'reward', flowImpact: 'faucet',   scope: { system: 'system_2' } },
  ],

  mode: 'advisor',
  onDecision: (d) => console.log(d),
});

agent.start();

// In your loop:
await agent.tick();
```

## What Does That Look Like in Practice?

The Quick Start above uses placeholder names. Here's what real setups look like:

### Game Economy

```typescript
currencies: ['gold', 'gems'],
systems: ['crafting', 'arena', 'marketplace'],
parameters: [
  { key: 'craftingCost',  type: 'cost',   flowImpact: 'sink',    scope: { system: 'crafting' } },
  { key: 'arenaReward',   type: 'reward', flowImpact: 'faucet',  scope: { system: 'arena' } },
  { key: 'auctionFee',    type: 'fee',    flowImpact: 'friction', scope: { system: 'marketplace' } },
],
```

### DeFi Protocol

```typescript
currencies: ['ETH', 'USDC'],
systems: ['amm', 'lending', 'staking'],
parameters: [
  { key: 'swapFee',       type: 'fee',   flowImpact: 'friction', scope: { system: 'amm' } },
  { key: 'borrowRate',    type: 'rate',  flowImpact: 'sink',     scope: { system: 'lending' } },
  { key: 'stakingYield',  type: 'yield', flowImpact: 'faucet',   scope: { system: 'staking' } },
],
```

### Marketplace

```typescript
currencies: ['credits'],
systems: ['listings', 'promotions', 'referrals'],
parameters: [
  { key: 'listingFee',    type: 'fee',    flowImpact: 'friction', scope: { system: 'listings' } },
  { key: 'promoDiscount', type: 'cost',   flowImpact: 'faucet',   scope: { system: 'promotions' } },
  { key: 'referralBonus', type: 'reward', flowImpact: 'faucet',   scope: { system: 'referrals' } },
],
```

**The parameter names are YOURS. AgentE only cares about the `type` and `flowImpact`.**

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

AgentE is not a game tool, a DeFi tool, or a marketplace tool. It's an **economy tool**. The core SDK has zero domain-specific logic.

### Parameter Registry

The core innovation. You register YOUR parameters with semantic metadata:

- **`type`** — what kind of lever is it? (`cost`, `fee`, `reward`, `yield`, `rate`, `multiplier`, `threshold`, `weight`, `custom`)
- **`flowImpact`** — what does it do to the flow of currency? (`sink`, `faucet`, `friction`, `redistribution`, `neutral`)
- **`scope`** — where in your economy does it live? (`{ system?, currency?, tags? }`)

AgentE's 60 principles target **types**, not names. When a principle says "decrease the `fee` in `system_1`", the registry resolves that to YOUR parameter name.

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

## 60 Principles

Built-in knowledge base across 15 categories: supply chain, incentives, population, currency flow, bootstrap, feedback loops, regulator, market dynamics, measurement, statistical, system dynamics, resource management, participant experience, open economy, and operations.

Each principle returns either `{ violated: false }` or a full violation with severity, evidence, suggested action (parameterType + scope), confidence score, and estimated lag.

## Packages

| Package | Description |
|---------|-------------|
| `@agent-e/core` | The SDK. Zero dependencies. |
| `@agent-e/adapter-game` | Presets for game economies |
| `@agent-e/adapter-defi` | Presets for DeFi protocols — coming soon |
| `@agent-e/adapter-marketplace` | Presets for two-sided marketplaces — coming soon |

## Links

- [npm](https://www.npmjs.com/package/@agent-e/core)
- [GitHub](https://github.com/AE-Vault/AgentE-v0)

## License

MIT

---

**Built by Oka × Claude — AB Labs**
