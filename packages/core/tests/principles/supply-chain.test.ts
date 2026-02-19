import { describe, it, expect } from 'vitest';
import {
  P1_ProductionMatchesConsumption,
  P2_ClosedLoopsNeedDirectHandoff,
  P3_BootstrapCapitalCoversFirstTransaction,
  P4_MaterialsFlowFasterThanCooldown,
} from '../../src/principles/supply-chain.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('P1 — Production Must Match Consumption', () => {
  it('fires when weapons are scarce but fighters exist', () => {
    const m = {
      ...emptyMetrics(100),
      supplyByResource: { weapons: 0, potions: 5 },
      demandSignals: { weapons: 20 },
      populationByRole: { Fighter: 50, Crafter: 2 },
    };
    const result = P1_ProductionMatchesConsumption.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBeGreaterThanOrEqual(5);
    }
  });

  it('does not fire when supply meets demand', () => {
    const m = {
      ...emptyMetrics(100),
      supplyByResource: { weapons: 80 },
      demandSignals: { weapons: 20 },
      populationByRole: { Fighter: 20, Crafter: 8 },
    };
    const result = P1_ProductionMatchesConsumption.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P2 — Closed Loops Need Direct Handoff', () => {
  it('fires when ore piles up with low velocity', () => {
    const m = {
      ...emptyMetrics(100),
      supplyByResource: { ore: 105 },
      prices: { ore: 15 },
      velocity: 1,
    };
    const result = P2_ClosedLoopsNeedDirectHandoff.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('does not fire when velocity is healthy', () => {
    const m = {
      ...emptyMetrics(100),
      supplyByResource: { ore: 105 },
      prices: { ore: 15 },
      velocity: 15,
    };
    const result = P2_ClosedLoopsNeedDirectHandoff.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P3 — Bootstrap Capital', () => {
  it('fires at tick 5 when crafters exist but no weapons', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      supplyByResource: { weapons: 0 },
      prices: { ore: 15 },
      populationByRole: { Crafter: 5, Alchemist: 0 },
    };
    const result = P3_BootstrapCapitalCoversFirstTransaction.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBeGreaterThanOrEqual(7);
    }
  });

  it('does not fire when weapons exist', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      supplyByResource: { weapons: 10 },
      prices: { ore: 15 },
      populationByRole: { Crafter: 5, Alchemist: 0 },
    };
    const result = P3_BootstrapCapitalCoversFirstTransaction.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P4 — Materials Flow Faster Than Cooldown', () => {
  it('fires when ore backlog is enormous', () => {
    const m = {
      ...emptyMetrics(50),
      supplyByResource: { ore: 200, wood: 10 },
      populationByRole: { Gatherer: 10, Crafter: 5, Alchemist: 3 },
      velocity: 4,
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.suggestedAction.direction).toBe('decrease'); // reduce yield
    }
  });

  it('fires when gatherers are too few relative to producers', () => {
    const m = {
      ...emptyMetrics(50),
      supplyByResource: { ore: 5, wood: 5 },
      populationByRole: { Gatherer: 1, Crafter: 20, Alchemist: 10 },
      velocity: 2,
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    expect(result.violated).toBe(true);
  });
});
