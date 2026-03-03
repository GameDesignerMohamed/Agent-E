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
  it('fires when goodA is scarce but consumers exist', () => {
    const m = {
      ...emptyMetrics(100),
      supplyByResource: { goodA: 0, goodB: 5 },
      demandSignals: { goodA: 20 },
      populationByRole: { consumer: 50, producer: 2 },
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
      supplyByResource: { goodA: 80 },
      demandSignals: { goodA: 20 },
      populationByRole: { consumer: 20, producer: 8 },
    };
    const result = P1_ProductionMatchesConsumption.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P2 — Closed Loops Need Direct Handoff', () => {
  it('fires when materialA piles up with low velocity', () => {
    const m = {
      ...emptyMetrics(100),
      supplyByResource: { materialA: 105 },
      prices: { materialA: 15 },
      velocity: 1,
    };
    const result = P2_ClosedLoopsNeedDirectHandoff.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('does not fire when velocity is healthy', () => {
    const m = {
      ...emptyMetrics(100),
      supplyByResource: { materialA: 105 },
      prices: { materialA: 15 },
      velocity: 15,
    };
    const result = P2_ClosedLoopsNeedDirectHandoff.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P3 — Bootstrap Capital', () => {
  it('fires at tick 5 when producers exist but no goodA', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      supplyByResource: { goodA: 0 },
      prices: { materialA: 15 },
      populationByRole: { producer: 5, refiner: 0 },
    };
    const result = P3_BootstrapCapitalCoversFirstTransaction.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBeGreaterThanOrEqual(7);
    }
  });

  it('does not fire when goodA exists', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      supplyByResource: { goodA: 10 },
      prices: { materialA: 15 },
      populationByRole: { producer: 5, refiner: 0 },
    };
    const result = P3_BootstrapCapitalCoversFirstTransaction.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P4 — Materials Flow Faster Than Cooldown', () => {
  it('fires when materialA backlog is enormous', () => {
    const m = {
      ...emptyMetrics(50),
      totalAgents: 18,
      supplyByResource: { materialA: 200, materialB: 10 },
      populationByRole: { extractor: 10, producer: 5, refiner: 3 },
      velocity: 4,
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.suggestedAction.direction).toBe('decrease'); // reduce yield
    }
  });

  it('fires when extractors are too few relative to producers', () => {
    const m = {
      ...emptyMetrics(50),
      totalAgents: 31,
      supplyByResource: { materialA: 5, materialB: 5 },
      populationByRole: { extractor: 1, producer: 20, refiner: 10 },
      velocity: 2,
    };
    const result = P4_MaterialsFlowFasterThanCooldown.check(m, t);
    expect(result.violated).toBe(true);
  });
});
