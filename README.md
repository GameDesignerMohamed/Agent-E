# AgentE V1 — Autonomous Economic Balancer

> The Sentry for economies. Observe, diagnose, simulate, plan, execute — continuously, transparently, in production.

## Quick Start

```typescript
import { AgentE } from '@agent-e/core';
import { GameAdapter } from '@agent-e/adapter-game';

const adapter = new GameAdapter({ api: myGameAPI });

const agentE = new AgentE({
  adapter,
  mode: 'autonomous',
  dominantRoles: ['Fighter'],  // exempt from population suppression
  gracePeriod: 50,             // no intervention before tick 50
  onDecision: (d) => console.log(d.reasoning),
});

agentE.connect(adapter).start();

// In your game loop:
await agentE.tick(currentState);
```

## Monorepo Structure

```
v1/
├── packages/
│   ├── core/              @agent-e/core — Observer → Diagnose → Simulate → Plan → Execute
│   ├── adapter-game/      @agent-e/adapter-game — Game economy adapter + V0 preset
│   ├── adapter-defi/      @agent-e/adapter-defi — DeFi protocol adapter (Phase 4)
│   └── adapter-marketplace/  @agent-e/adapter-marketplace (Phase 4)
└── demo/                  Standalone demo wired to V0 game
```

## The 5-Stage Pipeline

```
OBSERVE → DIAGNOSE → SIMULATE → PLAN → EXECUTE
```

1. **Observer** — computes 30+ metrics at 3 time resolutions (fine/medium/coarse)
2. **Diagnoser** — runs all 60 principles, returns violations sorted by severity
3. **Simulator** — Monte Carlo forward projection (≥100 iterations) before any action
4. **Planner** — lag-aware, cooldown-aware action planning with rollback conditions
5. **Executor** — applies actions, monitors for rollback triggers

## The 60 Principles

Built-in knowledge base extracted from:
- **P1-P28**: V0.0-V0.4.6 development failures (supply chain, incentives, population, currency, bootstrap, feedback loops, regulator behavior)
- **P29-P54**: ~130 articles across Machinations.io and Naavik.co (market dynamics, measurement, statistical balancing, system dynamics, open economy, LiveOps)
- **P55-P60**: V1.1.0 additions — arbitrage thermometer, content drop shock, combinatorial price space, natural numeraire, gift economy noise, surplus disposal asymmetry

```typescript
// Add your own principles
agentE.addPrinciple({
  id: 'MY_RULE_1',
  name: 'Healers must always exist',
  category: 'population',
  description: 'Healer share below 5% = crisis',
  check: (metrics, thresholds) => {
    const healerShare = metrics.roleShares['Healer'] ?? 0;
    if (healerShare < 0.05) {
      return {
        violated: true,
        severity: 8,
        evidence: { healerShare },
        suggestedAction: {
          parameter: 'healerReward',
          direction: 'increase',
          magnitude: 0.25,
          reasoning: 'Healer population critically low.',
        },
        confidence: 0.90,
      };
    }
    return { violated: false };
  },
});
```

## Developer API — 3 Tiers

### Tier 1 — Drop-in (3 lines)
```typescript
const agentE = new AgentE({ adapter: myAdapter });
agentE.connect(myAdapter).start();
// That's it. AgentE observes and acts with defaults.
```

### Tier 2 — Configured
```typescript
const agentE = new AgentE({
  adapter,
  mode: 'autonomous',
  dominantRoles: ['Fighter'],
  idealDistribution: { Fighter: 0.45, Crafter: 0.15, Gatherer: 0.20 },
  gracePeriod: 50,
  checkInterval: 5,
  maxAdjustmentPercent: 0.15,
  cooldownTicks: 15,
  onDecision: (d) => sendToSlack(d.reasoning),
});
```

### Tier 3 — Full Control
```typescript
agentE.lock('arenaEntryFee');                        // parameter never touched
agentE.constrain('craftingCost', { min: 0.5, max: 2.0 });

agentE.on('beforeAction', (plan) => {
  if (plan.parameter === 'arenaReward' && plan.targetValue > 2.0) {
    return false; // veto this action
  }
});

agentE.registerCustomMetric('weaponDeficit', (state) => {
  const fighters = Object.values(state.agentRoles).filter(r => r === 'Fighter').length;
  const weapons = Object.values(state.agentInventories)
    .reduce((s, inv) => s + (inv['weapons'] ?? 0), 0);
  return fighters - weapons;
});

const history = agentE.metrics.query({
  metric: 'giniCoefficient',
  from: tick - 200,
  to: tick,
  resolution: 'fine',
});
```

## Advisor Mode

AgentE recommends without acting. You approve each decision.

```typescript
const agentE = new AgentE({ adapter, mode: 'advisor' });
agentE.on('decision', (entry) => {
  console.log('Recommendation:', entry.reasoning);
  // Inspect entry.plan.simulationResult for proof
  if (meetsMyStandards(entry)) agentE.apply(entry.plan);
});
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check all packages
npm run typecheck

# Build all packages
npm run build

# Run standalone demo
cd demo && npm start
```

## Implementation Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Core engine + Simulator | ✅ **Done** |
| Phase 2 | GameAdapter + V0 demo | ✅ **Done** |
| Phase 3 | Best practices extraction (P29-P60, 60 total) | ✅ **Done** |
| Phase 4 | DeFi + Marketplace adapters | Pending |
| Phase 5 | Dashboard + CLI | Pending |
| Phase 6 | npm publish + public beta | Pending |

---

*AgentE — Built by Oka × Claude | AB Labs, Lane B Execution Pod*
