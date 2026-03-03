import { describe, it, expect } from 'vitest';
import { P33_FairNotEqual } from '../../src/principles/participant-experience.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

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
