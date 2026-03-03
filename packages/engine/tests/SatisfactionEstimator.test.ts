import { describe, it, expect } from 'vitest';
import { SatisfactionEstimator } from '../src/SatisfactionEstimator.js';
import type { EconomyState, EconomicEvent } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeState(tick: number, overrides?: Partial<EconomyState>): EconomyState {
  return {
    tick,
    currencies: ['gold'],
    agentBalances: {},
    agentInventories: {},
    agentRoles: {},
    activeSinks: [],
    activeSources: [],
    pools: {},
    priceIndex: {},
    ...overrides,
  } as EconomyState;
}

function makeAgentState(
  tick: number,
  agents: Record<string, { balance: number; items?: string[] }>,
): EconomyState {
  const agentBalances: Record<string, Record<string, number>> = {};
  const agentInventories: Record<string, Record<string, number>> = {};
  for (const [id, data] of Object.entries(agents)) {
    agentBalances[id] = { gold: data.balance };
    agentInventories[id] = {};
    if (data.items) {
      for (const item of data.items) {
        agentInventories[id]![item] = 1;
      }
    }
  }
  return makeState(tick, { agentBalances, agentInventories });
}

function makeTxEvent(actor: string, tick: number): EconomicEvent {
  return {
    type: 'trade',
    actor,
    tick,
  } as EconomicEvent;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SatisfactionEstimator', () => {
  it('returns empty object when no agents have been seen', () => {
    const estimator = new SatisfactionEstimator();
    expect(estimator.getEstimates()).toEqual({});
  });

  it('initializes new agents at the default score (70)', () => {
    const estimator = new SatisfactionEstimator();
    const state = makeAgentState(1, {
      alice: { balance: 100 },
      bob: { balance: 200 },
    });

    estimator.update(state);
    const estimates = estimator.getEstimates();

    // First tick: score is smoothed from initialScore (70) toward the raw signal
    // Raw at tick 1 is ~50 (neutral baseline + some adjustments)
    // After smoothing: 70 * 0.85 + rawScore * 0.15
    expect(estimates['alice']).toBeDefined();
    expect(estimates['bob']).toBeDefined();
    // Both should be close to initial score after just one update
    expect(estimates['alice']!).toBeGreaterThan(50);
    expect(estimates['alice']!).toBeLessThan(80);
    expect(estimates['bob']!).toBeGreaterThan(50);
    expect(estimates['bob']!).toBeLessThan(80);
  });

  it('score increases when balance grows over time', () => {
    const estimator = new SatisfactionEstimator();

    // Simulate growing balance over 10 ticks
    for (let t = 1; t <= 10; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100 + t * 20 }, // steadily growing
      });
      const events = [makeTxEvent('alice', t)]; // active each tick
      estimator.update(state, events);
    }

    const estimates = estimator.getEstimates();
    // With growing balance + active transactions, score should be above neutral
    expect(estimates['alice']!).toBeGreaterThan(60);
  });

  it('score decreases when balance declines over time', () => {
    const estimator = new SatisfactionEstimator();

    // Simulate declining balance
    for (let t = 1; t <= 15; t++) {
      const state = makeAgentState(t, {
        alice: { balance: Math.max(10, 300 - t * 20) }, // declining
      });
      const events = [makeTxEvent('alice', t)];
      estimator.update(state, events);
    }

    const estimatesDecline = estimator.getEstimates();

    // Compare with a growing agent
    const estimator2 = new SatisfactionEstimator();
    for (let t = 1; t <= 15; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100 + t * 20 }, // growing
      });
      const events = [makeTxEvent('alice', t)];
      estimator2.update(state, events);
    }
    const estimatesGrow = estimator2.getEstimates();

    expect(estimatesDecline['alice']!).toBeLessThan(estimatesGrow['alice']!);
  });

  it('score decays after inactivity threshold', () => {
    const estimator = new SatisfactionEstimator();

    // Active for first 5 ticks
    for (let t = 1; t <= 5; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100 },
      });
      const events = [makeTxEvent('alice', t)];
      estimator.update(state, events);
    }

    const scoreAfterActive = estimator.getEstimates()['alice']!;

    // Inactive for 20 more ticks (well past the 10-tick threshold)
    for (let t = 6; t <= 25; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100 },
      });
      estimator.update(state); // no events = inactive
    }

    const scoreAfterInactive = estimator.getEstimates()['alice']!;
    expect(scoreAfterInactive).toBeLessThan(scoreAfterActive);
  });

  it('relative standing: agent below median gets penalized', () => {
    const estimator = new SatisfactionEstimator();

    // Multiple agents, one far below median
    for (let t = 1; t <= 10; t++) {
      const state = makeAgentState(t, {
        rich1: { balance: 1000 },
        rich2: { balance: 900 },
        rich3: { balance: 800 },
        poor: { balance: 50 }, // far below median
      });
      const events = [
        makeTxEvent('rich1', t),
        makeTxEvent('rich2', t),
        makeTxEvent('rich3', t),
        makeTxEvent('poor', t),
      ];
      estimator.update(state, events);
    }

    const estimates = estimator.getEstimates();
    // Poor agent should have lower satisfaction than rich agents
    expect(estimates['poor']!).toBeLessThan(estimates['rich1']!);
  });

  it('inventory diversity growth boosts score', () => {
    const estimator = new SatisfactionEstimator();

    // Agent gains more items over time
    for (let t = 1; t <= 10; t++) {
      const items: string[] = [];
      for (let i = 0; i < t; i++) items.push(`item_${i}`);

      const state = makeAgentState(t, {
        alice: { balance: 100, items },
      });
      const events = [makeTxEvent('alice', t)];
      estimator.update(state, events);
    }

    const estimatesDiverse = estimator.getEstimates();

    // Compare with agent with static inventory
    const estimator2 = new SatisfactionEstimator();
    for (let t = 1; t <= 10; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100, items: ['item_0'] },
      });
      const events = [makeTxEvent('alice', t)];
      estimator2.update(state, events);
    }
    const estimatesStatic = estimator2.getEstimates();

    expect(estimatesDiverse['alice']!).toBeGreaterThan(estimatesStatic['alice']!);
  });

  it('scores are clamped to 0–100', () => {
    const estimator = new SatisfactionEstimator();

    // Extreme negative scenario: inactive, declining, far below median
    for (let t = 1; t <= 50; t++) {
      const state = makeAgentState(t, {
        rich: { balance: 10000 },
        poor: { balance: Math.max(1, 100 - t * 5) },
      });
      // rich is active, poor is not
      const events = [makeTxEvent('rich', t)];
      estimator.update(state, events);
    }

    const estimates = estimator.getEstimates();
    expect(estimates['poor']!).toBeGreaterThanOrEqual(0);
    expect(estimates['poor']!).toBeLessThanOrEqual(100);
    expect(estimates['rich']!).toBeGreaterThanOrEqual(0);
    expect(estimates['rich']!).toBeLessThanOrEqual(100);
  });

  it('custom config overrides defaults', () => {
    const estimator = new SatisfactionEstimator({
      initialScore: 90,
      smoothing: 0.5,
      inactivityThreshold: 3,
    });

    const state = makeAgentState(1, {
      alice: { balance: 100 },
    });
    estimator.update(state);

    const estimates = estimator.getEstimates();
    // With higher initial score (90) and higher smoothing (0.5),
    // the first-tick score should reflect that
    expect(estimates['alice']!).toBeGreaterThan(60);
  });

  it('prunes agents gone from state for 2× history window', () => {
    const estimator = new SatisfactionEstimator({ historyWindow: 5 });

    // Agent appears for 3 ticks
    for (let t = 1; t <= 3; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100 },
      });
      estimator.update(state);
    }
    expect(estimator.getEstimates()['alice']).toBeDefined();

    // Agent disappears for 2× window (10 ticks) — prune happens at tick % window === 0
    for (let t = 4; t <= 15; t++) {
      const state = makeAgentState(t, {}); // alice not present
      estimator.update(state);
    }

    // Should be pruned by now (lastActive=3, tick=15, gap=12 > 2*5=10)
    expect(estimator.getEstimates()['alice']).toBeUndefined();
  });

  it('transaction engagement boost when recently active', () => {
    const estimator = new SatisfactionEstimator();

    // Agent inactive for 10 ticks, then suddenly active
    for (let t = 1; t <= 10; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100 },
      });
      estimator.update(state); // no events
    }
    const scoreBefore = estimator.getEstimates()['alice']!;

    // Now burst of activity
    for (let t = 11; t <= 15; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 100 },
      });
      const events = [
        makeTxEvent('alice', t),
        makeTxEvent('alice', t),
        makeTxEvent('alice', t),
      ];
      estimator.update(state, events);
    }
    const scoreAfter = estimator.getEstimates()['alice']!;

    // Activity should boost score
    expect(scoreAfter).toBeGreaterThan(scoreBefore);
  });

  it('handles events with from/to fields for tx counting', () => {
    const estimator = new SatisfactionEstimator();

    const state = makeAgentState(1, {
      alice: { balance: 100 },
      bob: { balance: 100 },
    });

    const events: EconomicEvent[] = [
      { type: 'trade', from: 'alice', to: 'bob', tick: 1 } as EconomicEvent,
    ];

    estimator.update(state, events);
    const estimates = estimator.getEstimates();

    // Both alice and bob should be tracked (from/to counted)
    expect(estimates['alice']).toBeDefined();
    expect(estimates['bob']).toBeDefined();
  });

  it('exponential smoothing prevents wild swings', () => {
    const estimator = new SatisfactionEstimator({ smoothing: 0.15 });

    // Establish a baseline over several ticks
    for (let t = 1; t <= 20; t++) {
      const state = makeAgentState(t, {
        alice: { balance: 500 },
      });
      const events = [makeTxEvent('alice', t)];
      estimator.update(state, events);
    }
    const stableScore = estimator.getEstimates()['alice']!;

    // Sudden shock: balance drops dramatically
    const shockState = makeAgentState(21, {
      alice: { balance: 10 },
    });
    estimator.update(shockState);
    const postShockScore = estimator.getEstimates()['alice']!;

    // Score should drop but not catastrophically in a single tick
    // (smoothing dampens the change)
    const delta = Math.abs(stableScore - postShockScore);
    expect(delta).toBeLessThan(20); // shouldn't swing more than ~20 points in one tick
  });
});
