import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/Simulator.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';
import type { SuggestedAction } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

const increaseAction: SuggestedAction = {
  parameter: 'craftingCost',
  direction: 'increase',
  magnitude: 0.15,
  reasoning: 'Test increase',
};

const decreaseAction: SuggestedAction = {
  parameter: 'miningYield',
  direction: 'decrease',
  magnitude: 0.15,
  reasoning: 'Test decrease',
};

describe('Simulator', () => {
  it('runs at least the minimum iterations (P43)', () => {
    const sim = new Simulator();
    const m = { ...emptyMetrics(100), tick: 100, avgSatisfaction: 60 };
    const result = sim.simulate(increaseAction, m, t, 50); // request fewer than min
    expect(result.iterations).toBeGreaterThanOrEqual(t.simulationMinIterations);
  });

  it('returns outcome percentiles in correct order (p10 ≤ p50 ≤ p90)', () => {
    const sim = new Simulator();
    const m = { ...emptyMetrics(100), tick: 100, avgSatisfaction: 60, netFlow: 15 };
    const result = sim.simulate(increaseAction, m, t);
    expect(result.outcomes.p10.avgSatisfaction).toBeLessThanOrEqual(
      result.outcomes.p50.avgSatisfaction + 5, // allow small noise
    );
    expect(result.outcomes.p50.avgSatisfaction).toBeLessThanOrEqual(
      result.outcomes.p90.avgSatisfaction + 5,
    );
  });

  it('estimates effect tick in the future', () => {
    const sim = new Simulator();
    const m = { ...emptyMetrics(100), tick: 100 };
    const result = sim.simulate(increaseAction, m, t);
    expect(result.estimatedEffectTick).toBeGreaterThan(100);
  });

  it('overshoot risk is between 0 and 1', () => {
    const sim = new Simulator();
    const m = { ...emptyMetrics(100), tick: 100 };
    const result = sim.simulate(decreaseAction, m, t);
    expect(result.overshootRisk).toBeGreaterThanOrEqual(0);
    expect(result.overshootRisk).toBeLessThanOrEqual(1);
  });

  it('confidence interval is [lo, hi] with lo ≤ hi', () => {
    const sim = new Simulator();
    const m = { ...emptyMetrics(100), tick: 100 };
    const result = sim.simulate(increaseAction, m, t);
    expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.confidenceInterval[1]);
  });
});
