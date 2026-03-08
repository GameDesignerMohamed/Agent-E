import { describe, it, expect } from 'vitest';
import { P43_SimulationMinimum } from '../../src/principles/statistical.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('P43 — Simulation Minimum (100 Iterations)', () => {
  it('fires when inflationRate > 0.30 (large positive swing)', () => {
    const m = {
      ...emptyMetrics(10),
      inflationRate: 0.45,
    };
    const result = P43_SimulationMinimum.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(3);
      expect(result.evidence['inflationRate']).toBe(0.45);
      expect(result.evidence['minIterations']).toBe(t.simulationMinIterations);
      expect(result.suggestedAction.direction).toBe('increase'); // inflation → cost up
      expect(result.suggestedAction.parameterType).toBe('cost');
    }
  });

  it('fires when inflationRate < -0.30 (large negative swing)', () => {
    const m = {
      ...emptyMetrics(10),
      inflationRate: -0.35,
    };
    const result = P43_SimulationMinimum.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.suggestedAction.direction).toBe('decrease'); // deflation → cost down
    }
  });

  it('does not fire when inflationRate is within ±0.30', () => {
    const m = {
      ...emptyMetrics(10),
      inflationRate: 0.20,
    };
    const result = P43_SimulationMinimum.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire at exactly ±0.30 (boundary)', () => {
    const m = { ...emptyMetrics(10), inflationRate: 0.30 };
    expect(P43_SimulationMinimum.check(m, t).violated).toBe(false);

    const m2 = { ...emptyMetrics(10), inflationRate: -0.30 };
    expect(P43_SimulationMinimum.check(m2, t).violated).toBe(false);
  });

  it('does not fire when inflationRate is 0', () => {
    const m = {
      ...emptyMetrics(10),
      inflationRate: 0,
    };
    const result = P43_SimulationMinimum.check(m, t);
    expect(result.violated).toBe(false);
  });
});
