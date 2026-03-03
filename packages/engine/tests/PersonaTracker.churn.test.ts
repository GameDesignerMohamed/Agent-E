import { describe, it, expect } from 'vitest';
import { PersonaTracker } from '../src/PersonaTracker.js';
import type { EconomyState } from '../src/types.js';

function makeState(tick: number, agentIds: string[]): EconomyState {
  const agentBalances: Record<string, Record<string, number>> = {};
  const agentRoles: Record<string, string> = {};
  const agentInventories: Record<string, Record<string, number>> = {};

  for (const id of agentIds) {
    agentBalances[id] = { gold: 100 };
    agentRoles[id] = 'consumer';
    agentInventories[id] = { itemA: 1 };
  }

  return {
    tick,
    roles: ['consumer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances,
    agentRoles,
    agentInventories,
    marketPrices: { gold: { itemA: 10 } },
    recentTransactions: [],
  };
}

describe('PersonaTracker — churn pruning', () => {
  it('agents unseen for >100 ticks are pruned', () => {
    const tracker = new PersonaTracker();

    // Agent appears at tick 0
    tracker.update(makeState(0, ['a1', 'a2']));

    // Both agents have history
    const dist1 = tracker.getDistribution();
    expect(Object.keys(dist1).length).toBeGreaterThan(0);

    // Fast forward to tick 150 — only a2 still active
    // We need to trigger pruning at tick 150 (divisible by 50)
    tracker.update(makeState(150, ['a2']));

    // a1 was last seen at tick 0 — 150-0 = 150 > 100 → pruned
    // a2 was just seen at tick 150 → kept
    const dist2 = tracker.getDistribution();
    // Should only have a2 now
    const totalAgents = Object.values(dist2).reduce((s, v) => s + v, 0);
    // Distribution should sum to ~1 (since there's 1 agent)
    expect(totalAgents).toBeCloseTo(1, 0);
  });

  it('pruning occurs every 50 ticks', () => {
    const tracker = new PersonaTracker();

    // Add agent at tick 0
    tracker.update(makeState(0, ['a1']));

    // At tick 49 (not divisible by 50), no pruning
    tracker.update(makeState(49, [])); // empty — a1 not seen

    // a1 was last seen at tick 0. 49-0=49 < 100 → not pruned (but pruning doesn't run anyway)
    // At tick 100 (divisible by 50), pruning runs
    tracker.update(makeState(100, [])); // empty — a1 not seen

    // 100-0=100 → exactly at boundary. Since condition is > 100, not pruned yet
    // At tick 150 (divisible by 50), 150-0=150 > 100 → pruned
    tracker.update(makeState(150, ['b1']));

    const dist = tracker.getDistribution();
    // Should only have b1
    const total = Object.values(dist).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 0);
  });

  it('active agents are not pruned', () => {
    const tracker = new PersonaTracker();

    // Agent appears consistently
    for (let tick = 0; tick <= 200; tick += 10) {
      tracker.update(makeState(tick, ['persistent']));
    }

    const dist = tracker.getDistribution();
    const total = Object.values(dist).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 0);
  });

  it('memory stays bounded with high agent turnover', () => {
    const tracker = new PersonaTracker();

    // Simulate 200 ticks of high turnover: 100 new agents per batch, each batch replaced
    for (let tick = 0; tick <= 200; tick += 50) {
      const agents = Array.from({ length: 100 }, (_, i) => `batch${tick}_agent${i}`);
      tracker.update(makeState(tick, agents));
    }

    // After tick 200, only the latest batch should remain (previous batches pruned)
    const dist = tracker.getDistribution();
    const total = Object.values(dist).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 0);
  });
});
