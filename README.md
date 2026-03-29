# AgentE — Autonomous Economic Balancer

> 5 core principles (60 with Pro). 5-stage pipeline. One npm install. Any economy.

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

## What Does That Look Like in Practice?

The Quick Start above uses placeholder names. Here's what real setups look like:

### Game Economy

```typescript
currencies: ['gold', 'gems'],
systems: ['crafting', 'arena', 'trading'],
parameters: [
  { key: 'craftingCost',  type: 'cost',   flowImpact: 'sink',    scope: { system: 'crafting' } },
  { key: 'arenaReward',   type: 'reward', flowImpact: 'faucet',  scope: { system: 'arena' } },
  { key: 'tradingFee',    type: 'fee',    flowImpact: 'friction', scope: { system: 'trading' } },
],
```

### SaaS Platform

```typescript
currencies: ['credits'],
systems: ['subscriptions', 'promotions', 'referrals'],
parameters: [
  { key: 'subscriptionFee', type: 'fee',    flowImpact: 'friction', scope: { system: 'subscriptions' } },
  { key: 'promoDiscount',   type: 'cost',   flowImpact: 'faucet',   scope: { system: 'promotions' } },
  { key: 'referralBonus',   type: 'reward', flowImpact: 'faucet',   scope: { system: 'referrals' } },
],
```

**The parameter names are YOURS. AgentE only cares about the `type` and `flowImpact`.**

## How It Works

```
Your Economy → Observer → Diagnoser → Simulator → Planner → Executor → Your Economy
```

1. **Observer** — computes 40+ metrics at 3 time resolutions (fine/medium/coarse)
2. **Diagnoser** — runs active principles (5 in Community, 60 in Pro), returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — lag-aware, cooldown-aware action planning with rollback conditions
5. **Executor** — applies actions, monitors for rollback triggers

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

## LLM Intelligence Layer

AgentE explains its decisions in plain English. Optional — bring your own LLM provider. Zero cost to AgentE.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const agent = new AgentE({
  adapter,
  llm: {
    provider: {
      async complete(prompt, config) {
        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: config?.maxTokens ?? 256,
          messages: [{ role: 'user', content: prompt }],
        });
        return msg.content[0].type === 'text' ? msg.content[0].text : '';
      },
    },
  },
});

agent.on('narration',   (n) => console.log(n.narration));
agent.on('explanation', (e) => console.log(e.explanation));
agent.on('anomaly',     (a) => console.log(a.interpretation));
```

The developer implements the `provider.complete()` function — that's where their API key lives. AgentE never touches or stores API keys. The developer's key stays in their environment (`ANTHROPIC_API_KEY`) or wherever they manage secrets.

Three capabilities:

- **Diagnosis Narration** — when a violation fires, the LLM explains it in plain language. *"Inflation is spiking at 12% because faucets are outpacing sinks by 3:1."*
- **Plan Explanation** — before applying a fix, the LLM explains what will change, what the simulation predicts, and what could go wrong.
- **Anomaly Interpretation** — detects statistical anomalies the principles don't cover. Rolling mean + stddev, then asks the LLM to interpret unexplained deviations.

The engine works identically with or without an LLM. All three features are no-ops when no provider is configured. The LLM never makes decisions — it only narrates what the engine already computed.

**Recommended:** Claude Sonnet 4.6 via the Anthropic SDK. Also works with any open-source model (Llama, Mistral) or self-hosted backend (Ollama, vLLM).

## Principles

This community package ships **5 core principles**:

| ID | Name | Category |
|----|------|----------|
| P1 | Production Must Match Consumption | Supply Chain |
| P12 | One Primary Faucet | Currency |
| P20 | Decay Prevents Accumulation | Feedback |
| P33 | Fair ≠ Equal | Participant Experience |
| P43 | Simulation Minimum (100 Iterations) | Statistical |

These 5 cover the fundamentals: supply/demand balance, currency control, wealth circulation, fairness, and simulation rigor. You can also add **unlimited custom principles**.

**Need all 60?** [`@agent-e/pro`](https://www.npmjs.com/package/@agent-e/pro) includes 55 additional principles across 15 categories — incentives, population, bootstrap, regulator, market dynamics, and more.

Each principle returns either `{ violated: false }` or a full violation with severity, evidence, suggested action (parameterType + scope), confidence score, and estimated lag.

## Dashboard

Real-time charts, decision feed, alerts — no extra setup.

```typescript
import { startServer } from '@agent-e/server';

startServer({ port: 3100 });
// Open http://localhost:3100
```

Health, Gini, net flow, and satisfaction charts update live via WebSocket. Decision feed shows every adjustment as it happens. In `advisor` mode, approve or reject recommendations directly from the UI.

Disable with `serveDashboard: false` if you only want the API.

## Packages

| Package | Description | License |
|---------|-------------|---------|
| `@agent-e/core` | Community SDK — 5 principles, full pipeline | MIT |
| `@agent-e/pro` | Pro SDK — all 60 principles + LLM layer + metered billing | BSL-1.1 |
| `@agent-e/adapter-game` | Presets for game economies | MIT |
| `@agent-e/server` | HTTP + WebSocket server for game engine integration | MIT |

### Using Pro

```bash
npm install @agent-e/pro
```

```typescript
import { createProAgent } from '@agent-e/pro';

const engine = createProAgent({
  adapter: myAdapter,
  apiKey: process.env.AGENTE_API_KEY,   // get yours at https://agente.dev/pro
  // billingEndpoint: 'https://api.agente.dev/v1',  // optional, this is the default
});

engine.start();
await engine.tick();
```

- **With a valid `apiKey`:** all 60 principles active, usage metered automatically.
- **Without `apiKey`:** falls back to Community mode (5 principles) with a warning — useful for local development.

## Links

- [npm](https://www.npmjs.com/package/@agent-e/core)

## License

[MIT](./LICENSE) — free for any use.

**Pro:** [`@agent-e/pro`](https://www.npmjs.com/package/@agent-e/pro) is licensed under [BSL-1.1](https://mariadb.com/bsl11/) — free for non-production use, production use requires a commercial license.

---

**Built by Mohamed AbdelKhalek × Claude — Animoca Labs**
