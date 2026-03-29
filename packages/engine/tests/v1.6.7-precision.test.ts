import { describe, it, expect } from 'vitest';
import { PersonaTracker } from '../src/PersonaTracker.js';
import { Observer } from '../src/Observer.js';
import type { EconomyState } from '../src/types.js';

// ── Helpers ──

function makeState(tick: number, overrides: Partial<EconomyState> = {}): EconomyState {
  return {
    tick,
    roles: ['consumer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 }, a2: { gold: 50 }, a3: { gold: 200 } },
    agentRoles: { a1: 'consumer', a2: 'consumer', a3: 'consumer' },
    agentInventories: {},
    marketPrices: { gold: { itemA: 10 } },
    recentTransactions: [],
    ...overrides,
  };
}

// ─── PersonaTracker Reclassification ────────────────────────────────────────

describe('PersonaTracker — reclassification interval', () => {
  it('first call always classifies', () => {
    const tracker = new PersonaTracker();
    tracker.update(makeState(0));
    const dist = tracker.getDistribution(0);
    expect(Object.keys(dist).length).toBeGreaterThan(0);
  });

  it('returns cached between intervals', () => {
    const tracker = new PersonaTracker({ reclassifyInterval: 10 });
    tracker.update(makeState(0));
    const dist1 = tracker.getDistribution(0);

    // Update state at tick 5 (within interval)
    tracker.update(makeState(5));
    const dist2 = tracker.getDistribution(5);

    // Should be exact same reference (cached)
    expect(dist2).toBe(dist1);
  });

  it('recomputes at interval boundary', () => {
    const tracker = new PersonaTracker({ reclassifyInterval: 10 });

    tracker.update(makeState(0));
    const dist1 = tracker.getDistribution(0);

    // Update and reclassify at tick 10
    tracker.update(makeState(10));
    const dist2 = tracker.getDistribution(10);

    // Should have recomputed (new object)
    expect(dist2).not.toBe(dist1);
    expect(Object.keys(dist2).length).toBeGreaterThan(0);
  });

  it('custom interval is respected', () => {
    const tracker = new PersonaTracker({ reclassifyInterval: 5 });

    tracker.update(makeState(0));
    const dist0 = tracker.getDistribution(0);

    // tick 3 — within interval
    tracker.update(makeState(3));
    const dist3 = tracker.getDistribution(3);
    expect(dist3).toBe(dist0); // cached

    // tick 5 — at interval boundary
    tracker.update(makeState(5));
    const dist5 = tracker.getDistribution(5);
    expect(dist5).not.toBe(dist0); // recomputed
  });
});

// ─── Observer Persona Fallback ──────────────────────────────────────────────

describe('Observer — persona fallback for populationByRole', () => {
  it('uses PersonaTracker when agentRoles is empty', () => {
    const obs = new Observer();
    const state = makeState(10, {
      agentRoles: {}, // empty
      agentBalances: { a1: { gold: 100 }, a2: { gold: 50 } },
    });
    const personaDist = { Whale: 0.5, Passive: 0.5 };
    const m = obs.compute(state, [], personaDist);

    // Should have persona-based roles
    expect(m.populationByRole['Whale']).toBe(1); // 0.5 * 2 = 1
    expect(m.populationByRole['Passive']).toBe(1);
  });

  it('triggers fallback when all agents share same role', () => {
    const obs = new Observer();
    const state = makeState(10, {
      agentRoles: { a1: 'player', a2: 'player', a3: 'player' },
      agentBalances: { a1: { gold: 100 }, a2: { gold: 50 }, a3: { gold: 200 } },
    });
    const personaDist = { Accumulator: 0.33, ActiveTrader: 0.33, Passive: 0.34 };
    const m = obs.compute(state, [], personaDist);

    // Fallback triggers (only 1 unique role)
    expect(m.populationByRole['Accumulator']).toBeDefined();
    expect(m.populationByRole['ActiveTrader']).toBeDefined();
  });

  it('uses developer roles when agentRoles is populated', () => {
    const obs = new Observer();
    const state = makeState(10, {
      agentRoles: { a1: 'warrior', a2: 'mage', a3: 'warrior' },
      agentBalances: { a1: { gold: 100 }, a2: { gold: 50 }, a3: { gold: 200 } },
    });
    const personaDist = { Whale: 0.5, Passive: 0.5 };
    const m = obs.compute(state, [], personaDist);

    // Should use developer-provided roles, NOT persona fallback
    expect(m.populationByRole['warrior']).toBe(2);
    expect(m.populationByRole['mage']).toBe(1);
    expect(m.populationByRole['Whale']).toBeUndefined();
  });

  it('no fallback when PersonaTracker has no data', () => {
    const obs = new Observer();
    const state = makeState(10, {
      agentRoles: {},
      agentBalances: { a1: { gold: 100 } },
    });
    const m = obs.compute(state, [], {}); // empty persona distribution

    // Should remain empty
    expect(Object.keys(m.populationByRole).length).toBe(0);
  });
});

// ─── Observer: persona fallback clears original role entries ─────────────────

describe('Observer — persona fallback does not inflate roleShares', () => {
  it('clears single-role entry before adding persona data', () => {
    const obs = new Observer();
    const state = makeState(10, {
      agentRoles: { a1: 'player', a2: 'player', a3: 'player' },
      agentBalances: { a1: { gold: 100 }, a2: { gold: 50 }, a3: { gold: 200 } },
    });
    const personaDist = { Accumulator: 0.33, ActiveTrader: 0.33, Passive: 0.34 };
    const m = obs.compute(state, [], personaDist);

    // The original 'player' entry must be gone
    expect(m.populationByRole['player']).toBeUndefined();
    expect(m.roleShares['player']).toBeUndefined();

    // roleShares must sum to <= 1.0 (rounding tolerance)
    const totalShare = Object.values(m.roleShares).reduce((s, v) => s + v, 0);
    expect(totalShare).toBeLessThanOrEqual(1.01);
    expect(totalShare).toBeGreaterThan(0);
  });
});
