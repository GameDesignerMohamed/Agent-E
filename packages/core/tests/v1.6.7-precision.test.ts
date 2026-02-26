import { describe, it, expect } from 'vitest';
import { PersonaTracker } from '../src/PersonaTracker.js';
import { Observer } from '../src/Observer.js';
import { P4_MaterialsFlowFasterThanCooldown } from '../src/principles/supply-chain.js';
import { P8_RegulatorCannotFightDesign } from '../src/principles/incentives.js';
import { REGULATOR_PRINCIPLES } from '../src/principles/regulator.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';
import type { EconomyState, Thresholds } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

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

// ─── P4 Per-Currency Velocity ───────────────────────────────────────────────

describe('P4 — Per-Currency Velocity', () => {
  it('fires for stagnant currency when another is healthy', () => {
    const m = {
      ...emptyMetrics(50),
      totalAgents: 30,
      supplyByResource: { materialA: 5 },
      populationByRole: { extractor: 10, producer: 20 },
      velocity: 4.5, // aggregate looks borderline
      velocityByCurrency: { gold: 9.0, gems: 0.3 }, // gems is dead
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gems');
      expect(result.evidence['currVelocity']).toBe(0.3);
      expect(result.suggestedAction.scope?.currency).toBe('gems');
    }
  });

  it('does not fire when both currencies are healthy', () => {
    const m = {
      ...emptyMetrics(50),
      totalAgents: 30,
      supplyByResource: { materialA: 5 },
      populationByRole: { extractor: 10, producer: 20 },
      velocity: 8,
      velocityByCurrency: { gold: 9.0, gems: 7.0 },
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    // Should not fire for velocity (may fire for excess supply, but not for low velocity)
    if (result.violated) {
      // If it fires, it should NOT be for velocity reasons
      expect(result.evidence['currency']).toBeUndefined();
    }
  });

  it('evidence includes specific currency name', () => {
    const m = {
      ...emptyMetrics(50),
      totalAgents: 30,
      supplyByResource: { materialA: 5 },
      populationByRole: { extractor: 10, producer: 20 },
      velocity: 3,
      velocityByCurrency: { stakingToken: 1.2 },
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('stakingToken');
    }
  });

  it('falls back to aggregate when no velocityByCurrency data', () => {
    const m = {
      ...emptyMetrics(50),
      totalAgents: 30,
      supplyByResource: { materialA: 5 },
      populationByRole: { extractor: 10, producer: 20 },
      velocity: 2,
      velocityByCurrency: {},
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      // Fallback uses aggregate — no currency in evidence
      expect(result.evidence['velocity']).toBe(2);
      expect(result.evidence['currency']).toBeUndefined();
    }
  });
});

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

// ─── P8/P28 Merge ───────────────────────────────────────────────────────────

describe('P8 — Regulator Cannot Fight Design (with P28 merge)', () => {
  it('structural role gets classification: structural, no intervention', () => {
    const thresholds: Thresholds = { ...t, dominantRoles: ['Warrior'] };
    const m = {
      ...emptyMetrics(100),
      roleShares: { Warrior: 0.55, Mage: 0.25, Healer: 0.20 },
      avgSatisfaction: 70,
    };
    const result = P8_RegulatorCannotFightDesign.check(m, thresholds);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['classification']).toBe('structural');
      expect(result.suggestedAction.magnitude).toBe(0);
      expect(result.severity).toBe(3);
    }
  });

  it('non-structural role > 30% gets classification: pathological', () => {
    const thresholds: Thresholds = { ...t, dominantRoles: [] };
    const m = {
      ...emptyMetrics(100),
      roleShares: { Trader: 0.45, Consumer: 0.35, Producer: 0.20 },
      avgSatisfaction: 40,
    };
    const result = P8_RegulatorCannotFightDesign.check(m, thresholds);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['classification']).toBe('pathological');
      expect(result.suggestedAction.direction).toBe('decrease');
      expect(result.severity).toBe(7);
    }
  });

  it('does not fire when no role exceeds 30%', () => {
    const m = {
      ...emptyMetrics(100),
      roleShares: { A: 0.25, B: 0.25, C: 0.25, D: 0.25 },
      avgSatisfaction: 70,
    };
    const result = P8_RegulatorCannotFightDesign.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('P28 is no longer in active REGULATOR_PRINCIPLES', () => {
    const ids = REGULATOR_PRINCIPLES.map(p => p.id);
    expect(ids).not.toContain('P28');
  });
});
