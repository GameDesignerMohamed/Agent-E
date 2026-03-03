import { describe, it, expect } from 'vitest';
import {
  P1_ProductionMatchesConsumption,
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
