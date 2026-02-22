# @agent-e/adapter-game

**Game economy adapter** for AgentE — preset configurations and helpers for common game economy patterns.

This package provides opinionated defaults and utilities for using AgentE in game economies (MMOs, live-service games, multiplayer sims).

## Installation

```bash
npm install @agent-e/adapter-game @agent-e/core
```

## Quick Start

```typescript
import { GameEconomyAdapter } from '@agent-e/adapter-game';

// Create adapter with game-specific presets
const adapter = new GameEconomyAdapter({
  economyType: 'mmo', // 'mmo', 'idle', 'pvp', 'survival'
  expectedPlayerCount: 1000,
  sessionLengthMinutes: 30,
});

// Feed your game state
const gameState = {
  players: [
    { id: 'player1', gold: 500, level: 10, role: 'warrior' },
    { id: 'player2', gold: 300, level: 8, role: 'mage' },
  ],
  trades: [
    { from: 'player1', to: 'player2', item: 'sword', price: 50 },
  ],
};

// Get balancing recommendations
const actions = adapter.balance(gameState);

console.log(actions);
// [
//   {
//     parameter: 'questReward',
//     direction: 'increase',
//     magnitude: 0.15,
//     reasoning: 'Player progression too slow for session length',
//     confidence: 0.80
//   }
// ]
```

## Economy Types

### MMO

Optimized for persistent worlds with:
- Long player retention (months to years)
- Complex role specialization
- Player-driven markets
- Large-scale trading

```typescript
const adapter = new GameEconomyAdapter({ economyType: 'mmo' });
```

**Adjusted thresholds:**
- Lower Gini tolerance (0.50 → 0.45) — prevent whale domination
- Higher velocity target (5 → 8) — encourage trading
- Longer observation windows (10 ticks → 20 ticks)

### Idle/Incremental

Optimized for progression-focused games with:
- Exponential growth curves
- Prestige/reset mechanics
- Offline progression
- Purchase-driven advancement

```typescript
const adapter = new GameEconomyAdapter({ economyType: 'idle' });
```

**Adjusted thresholds:**
- Higher inflation tolerance (0.10 → 0.25) — exponential by design
- Shorter time-to-value (20 ticks → 5 ticks) — fast dopamine loops
- Lower churn sensitivity — resets are normal

### PvP

Optimized for competitive economies with:
- Zero-sum resource contests
- Skill-based matchmaking
- Seasonal resets
- Ranked progression

```typescript
const adapter = new GameEconomyAdapter({ economyType: 'pvp' });
```

**Adjusted thresholds:**
- Strict Gini limits (0.40 critical) — fairness matters
- High velocity (10+) — active trading meta
- Low satisfaction tolerance — competitive frustration is acceptable

### Survival

Optimized for scarcity-driven economies with:
- Resource depletion
- Harsh death penalties
- Base building
- PvE focus

```typescript
const adapter = new GameEconomyAdapter({ economyType: 'survival' });
```

**Adjusted thresholds:**
- High pinch-point tolerance — scarcity is core gameplay
- Low production rates — resource struggle intended
- High satisfaction variance — moments of desperation + relief

## Custom Configurations

```typescript
const adapter = new GameEconomyAdapter({
  economyType: 'mmo',
  expectedPlayerCount: 5000,
  sessionLengthMinutes: 60,

  // Override specific thresholds
  thresholds: {
    giniWarning: 0.40,
    giniCritical: 0.50,
    inflationRateMax: 0.08,
  },

  // Custom parameter mappings
  parameterMappings: {
    craftingCost: 'recipe_gold_cost',
    auctionFee: 'marketplace_tax_rate',
    arenaReward: 'pvp_victory_gold',
  },
});
```

## API Reference

### `GameEconomyAdapter`

```typescript
class GameEconomyAdapter {
  constructor(config: GameEconomyConfig);

  balance(gameState: any): SuggestedAction[];

  // Low-level access
  getMetrics(): EconomyMetrics;
  getDiagnoses(): Diagnosis[];
  simulate(action: SuggestedAction): SimulationResult;
}
```

### `GameEconomyConfig`

```typescript
interface GameEconomyConfig {
  economyType: 'mmo' | 'idle' | 'pvp' | 'survival';
  expectedPlayerCount?: number;
  sessionLengthMinutes?: number;
  thresholds?: Partial<Thresholds>;
  parameterMappings?: Record<string, string>;
}
```

## Examples

### Full Integration

```typescript
import { GameEconomyAdapter } from '@agent-e/adapter-game';

const adapter = new GameEconomyAdapter({ economyType: 'mmo' });

// Every game tick (or every 10 ticks for performance)
function onGameTick() {
  const actions = adapter.balance({
    players: getPlayers(),
    trades: getRecentTrades(),
    crafts: getRecentCrafts(),
    deaths: getRecentDeaths(),
  });

  // Apply the highest-confidence action
  if (actions.length > 0) {
    const topAction = actions[0];
    applyParameterChange(topAction.parameter, topAction.direction, topAction.magnitude);

    console.log(`AgentE: ${topAction.reasoning}`);
  }
}
```

### Monitoring Only (No Auto-Apply)

```typescript
const adapter = new GameEconomyAdapter({ economyType: 'mmo' });

function checkEconomyHealth() {
  const metrics = adapter.getMetrics();
  const diagnoses = adapter.getDiagnoses();

  if (diagnoses.some(d => d.severity >= 7)) {
    alert('CRITICAL: Economy imbalance detected!');
    console.log(diagnoses.filter(d => d.severity >= 7));
  }

  // Log key metrics
  console.log({
    gini: metrics.giniCoefficient,
    velocity: metrics.velocity,
    inflation: metrics.inflationRate,
    satisfaction: metrics.avgSatisfaction,
  });
}
```

## License

MIT

## Links

- [Core Package](https://www.npmjs.com/package/@agent-e/core)
- [Documentation](https://github.com/GameDesignerMohamed/Agent-E)
- [GitHub](https://github.com/GameDesignerMohamed/Agent-E)

---

**Built by Oka × Claude — AB Labs**
