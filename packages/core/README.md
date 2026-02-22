# @agent-e/core

**Autonomous economic balancer** — observe, diagnose, simulate, plan, execute.

AgentE is a 5-stage pipeline that autonomously maintains balance in virtual economies (games, DeFi, marketplaces) using 60 battle-tested principles from game economics research and real-world production data.

## Installation

```bash
npm install @agent-e/core
```

## Quick Start

```typescript
import { AgentE } from '@agent-e/core';

// Initialize the balancer
const agentE = new AgentE();

// Feed your economy state
const state = {
  tick: 100,
  agentBalances: { player1: 500, player2: 300 },
  agentRoles: { player1: 'Crafter', player2: 'Fighter' },
  marketPrices: { sword: 50, potion: 10 },
  agentInventories: { player1: { sword: 2 }, player2: { potion: 5 } },
  agentSatisfaction: { player1: 75, player2: 60 },
};

// Recent economic events
const events = [
  { type: 'trade', from: 'player1', to: 'player2', resource: 'sword', amount: 1, price: 50 },
  { type: 'mint', amount: 100, timestamp: 99 },
];

// Get autonomous balancing actions
const result = agentE.run(state, events);

console.log(result.suggestedActions);
// [
//   {
//     parameter: 'craftingCost',
//     direction: 'decrease',
//     magnitude: 0.10,
//     reasoning: 'Supply bottleneck detected...',
//     confidence: 0.75
//   }
// ]
```

## The 5-Stage Pipeline

AgentE processes your economy through 5 stages:

1. **Observer** — Translates raw state into 40+ economic metrics (Gini, velocity, inflation, pinch points, etc.)
2. **Diagnoser** — Checks 60 principles to detect violations (e.g., wealth concentration, currency sinks, arbitrage opportunities)
3. **Simulator** — Runs Monte Carlo projections to forecast the impact of potential parameter changes
4. **Planner** — Ranks actions by confidence × improvement and selects the safest intervention
5. **Executor** — Returns actionable parameter adjustments (you apply them to your game/system)

## Key Features

- **60 Battle-Tested Principles** — From Machinations, Naavik, Valve Economics, and production game data
- **Zero Tuning Required** — Works out-of-the-box with sensible defaults for game economies
- **Monte Carlo Simulation** — Forecasts outcomes before applying changes (P10, P50, P90 percentiles)
- **Custom Metrics & Principles** — Extend with your own domain logic
- **TypeScript First** — Full type safety, autocomplete, and inline docs

## Architecture

```
EconomyState (your data)
    ↓
Observer → EconomyMetrics (40+ computed metrics)
    ↓
Diagnoser → Diagnosis[] (violated principles)
    ↓
Simulator → SimulationResult[] (Monte Carlo forecasts)
    ↓
Planner → SuggestedAction[] (ranked by confidence)
    ↓
You apply the actions to your economy
```

## Principle Categories

- **Supply Chain** (P1-P4, P60) — Production, consumption, delivery rates
- **Currency Flow** (P12-P16, P32, P58) — Faucets, sinks, inflation, velocity
- **Wealth Distribution** (P18-P23) — Gini coefficient, progression, whale risk
- **Market Dynamics** (P29-P30, P57) — Pinch points, price discovery, arbitrage
- **Population** (P8-P11) — Role balance, churn, specialization
- **Player Experience** (P33-P40) — Satisfaction, friction, time-to-value
- **LiveOps** (P51-P54, P56) — Event cadence, engagement peaks, content drops
- **Measurement** (P31, P41, P55, P59) — Anchor tracking, arbitrage thermometer, gift economy noise

## Advanced Usage

### Custom Metrics

```typescript
import { Observer } from '@agent-e/core';

const observer = new Observer();

// Add your own metric
observer.registerCustomMetric('pvpWinRate', (state) => {
  const wins = state.agentStats?.pvpWins ?? 0;
  const total = state.agentStats?.pvpMatches ?? 1;
  return wins / total;
});
```

### Custom Principles

```typescript
import { Principle } from '@agent-e/core';

const myPrinciple: Principle = {
  id: 'CUSTOM_1',
  name: 'PvP Balance',
  category: 'custom',
  description: 'Win rate should stay between 45-55%',
  check(metrics, thresholds) {
    const winRate = metrics.custom.pvpWinRate ?? 0.50;
    if (winRate < 0.45 || winRate > 0.55) {
      return {
        violated: true,
        severity: 5,
        evidence: { winRate },
        suggestedAction: {
          parameter: 'arenaReward',
          direction: winRate < 0.45 ? 'increase' : 'decrease',
          magnitude: 0.10,
          reasoning: `PvP win rate at ${(winRate * 100).toFixed(0)}% — rebalance needed`,
        },
        confidence: 0.70,
        estimatedLag: 10,
      };
    }
    return { violated: false };
  },
};

// Use it
const diagnoser = new Diagnoser([...ALL_PRINCIPLES, myPrinciple]);
```

### Adjusting Thresholds

```typescript
import { DEFAULT_THRESHOLDS } from '@agent-e/core';

const customThresholds = {
  ...DEFAULT_THRESHOLDS,
  giniWarning: 0.40,      // Default: 0.45
  giniCritical: 0.55,     // Default: 0.60
  inflationRateMax: 0.08, // Default: 0.10
};

const result = agentE.run(state, events, customThresholds);
```

## API Reference

### `AgentE`

Main entry point. Runs the full 5-stage pipeline.

```typescript
class AgentE {
  run(
    state: EconomyState,
    recentEvents: EconomicEvent[],
    thresholds?: Partial<Thresholds>
  ): {
    metrics: EconomyMetrics;
    diagnoses: Diagnosis[];
    simulations: SimulationResult[];
    suggestedActions: SuggestedAction[];
  };
}
```

### `Observer`

Computes metrics from raw economy state.

```typescript
class Observer {
  compute(state: EconomyState, recentEvents: EconomicEvent[]): EconomyMetrics;
  registerCustomMetric(name: string, fn: (state: EconomyState) => number): void;
}
```

### `Diagnoser`

Checks principles and detects violations.

```typescript
class Diagnoser {
  constructor(principles: Principle[]);
  diagnose(metrics: EconomyMetrics, thresholds: Thresholds): Diagnosis[];
}
```

### `Simulator`

Runs Monte Carlo projections for proposed actions.

```typescript
class Simulator {
  simulate(
    action: SuggestedAction,
    currentMetrics: EconomyMetrics,
    thresholds: Thresholds,
    iterations?: number,
    forwardTicks?: number
  ): SimulationResult;
}
```

### `Planner`

Ranks and selects the best action.

```typescript
class Planner {
  plan(
    diagnoses: Diagnosis[],
    simulations: SimulationResult[],
    currentMetrics: EconomyMetrics,
    thresholds: Thresholds
  ): SuggestedAction[];
}
```

## Performance

v1.1.1 optimizations:
- **O(N) event classification** — Single-pass switch statement instead of 6 separate filters
- **Cached diagnose() calls** — Prevents redundant principle checks when evaluating multiple actions
- **Numerical stability** — Clamped Math.log() inputs to prevent NaN crashes

Typical performance for 1,000 agents, 100 events/tick:
- Observer: ~2ms
- Diagnoser: ~5ms (60 principles)
- Simulator: ~50ms (100 Monte Carlo iterations)
- **Total:** ~60ms end-to-end

## License

MIT

## Links

- [Documentation](https://github.com/GameDesignerMohamed/Agent-E)
- [GitHub](https://github.com/GameDesignerMohamed/Agent-E)
- [npm](https://www.npmjs.com/package/@agent-e/core)

## Related Packages

- `@agent-e/adapter-game` — Game economy adapter with preset configurations

---

**Built by Oka × Claude — AB Labs**
