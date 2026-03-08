import { describe, it, expect } from 'vitest';
import { P33_FairNotEqual } from '../../src/principles/participant-experience.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('P33 — Fair ≠ Equal', () => {
  it('fires with reward increase when Gini < 0.10 (too flat — no stakes)', () => {
    const m = {
      ...emptyMetrics(10),
      currencies: ['gold'],
      giniCoefficientByCurrency: { gold: 0.05 },
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(3);
      expect(result.evidence['currency']).toBe('gold');
      expect(result.evidence['giniCoefficient']).toBe(0.05);
      expect(result.suggestedAction.parameterType).toBe('reward');
      expect(result.suggestedAction.direction).toBe('increase');
    }
  });

  it('fires at severity 7 with fee increase when Gini > giniRedThreshold (oligarchy)', () => {
    const m = {
      ...emptyMetrics(10),
      currencies: ['gems'],
      giniCoefficientByCurrency: { gems: 0.70 }, // above 0.60 red threshold
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(7);
      expect(result.evidence['currency']).toBe('gems');
      expect(result.suggestedAction.parameterType).toBe('fee');
      expect(result.suggestedAction.direction).toBe('increase');
    }
  });

  it('fires at severity 4 when Gini > giniWarnThreshold but < giniRedThreshold (warning)', () => {
    const m = {
      ...emptyMetrics(10),
      currencies: ['gold'],
      giniCoefficientByCurrency: { gold: 0.50 }, // between 0.45 warn and 0.60 red
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(4);
      expect(result.suggestedAction.parameterType).toBe('fee');
      expect(result.suggestedAction.direction).toBe('increase');
      expect(result.suggestedAction.magnitude).toBe(0.10);
    }
  });

  it('does not fire when Gini is in healthy range [0.10, giniWarnThreshold]', () => {
    const m = {
      ...emptyMetrics(10),
      currencies: ['gold', 'gems'],
      giniCoefficientByCurrency: { gold: 0.30, gems: 0.35 },
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire when no currencies', () => {
    const m = {
      ...emptyMetrics(10),
      currencies: [],
      giniCoefficientByCurrency: {},
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('uses 0 as default Gini when currency has no entry in giniCoefficientByCurrency', () => {
    // Missing currency entry → defaults to 0 → Gini < 0.10 → fires flat economy warning
    const m = {
      ...emptyMetrics(10),
      currencies: ['tokens'],
      giniCoefficientByCurrency: {}, // no entry for 'tokens'
    };
    const result = P33_FairNotEqual.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.suggestedAction.direction).toBe('increase'); // flat economy
    }
  });
});
