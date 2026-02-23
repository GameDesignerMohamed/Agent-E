import { describe, it, expect } from 'vitest';
import { P42_TheMedianPrinciple } from '../../src/principles/statistical.js';
import { P33_FairNotEqual } from '../../src/principles/player-experience.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('P42 — The Median Principle (multi-currency)', () => {
  it('fires on the currency with divergent mean/median', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      meanMedianDivergenceByCurrency: { gold: 0.10, gems: 0.50 },
      giniCoefficientByCurrency: { gold: 0.3, gems: 0.6 },
      meanBalanceByCurrency: { gold: 100, gems: 150 },
      medianBalanceByCurrency: { gold: 90, gems: 80 },
    };
    const result = P42_TheMedianPrinciple.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gems');
      expect(result.suggestedAction.currency).toBe('gems');
    }
  });

  it('does not fire when all currencies are below threshold', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      meanMedianDivergenceByCurrency: { gold: 0.10, gems: 0.20 },
    };
    const result = P42_TheMedianPrinciple.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('works with single currency', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['credits'],
      meanMedianDivergenceByCurrency: { credits: 0.45 },
      giniCoefficientByCurrency: { credits: 0.5 },
      meanBalanceByCurrency: { credits: 200 },
      medianBalanceByCurrency: { credits: 120 },
    };
    const result = P42_TheMedianPrinciple.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('credits');
    }
  });
});

describe('P33 — Fair Not Equal (multi-currency gini)', () => {
  it('fires on the currency with high gini', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      giniCoefficientByCurrency: { gold: 0.30, gems: 0.65 },
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gems');
      expect(result.severity).toBe(7); // red zone → severity 7
    }
  });

  it('fires warning when gini is in yellow zone', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold'],
      giniCoefficientByCurrency: { gold: 0.50 },
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(4); // yellow zone → severity 4
    }
  });

  it('does not fire when all currencies have healthy gini', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      giniCoefficientByCurrency: { gold: 0.30, gems: 0.25 },
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(false);
  });
});
