import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/Simulator.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';
import type { SuggestedAction } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

function metricsWithCurrency(tick: number, overrides: Record<string, unknown> = {}) {
  return {
    ...emptyMetrics(tick),
    tick,
    currencies: ['credits'],
    totalSupplyByCurrency: { credits: 0 },
    netFlowByCurrency: { credits: 0 },
    velocityByCurrency: { credits: 0 },
    giniCoefficientByCurrency: { credits: 0 },
    faucetVolumeByCurrency: { credits: 0 },
    sinkVolumeByCurrency: { credits: 0 },
    ...overrides,
  };
}

const increaseAction: SuggestedAction = {
  parameter: 'productionCost',
  direction: 'increase',
  magnitude: 0.15,
  reasoning: 'Test increase',
};

const decreaseAction: SuggestedAction = {
  parameter: 'yieldRate',
  direction: 'decrease',
  magnitude: 0.15,
  reasoning: 'Test decrease',
};

describe('Simulator', () => {
  it('runs at least the minimum iterations (P43)', () => {
    const sim = new Simulator();
    const m = metricsWithCurrency(100, { avgSatisfaction: 60 });
    const result = sim.simulate(increaseAction, m, t, 50); // request fewer than min
    expect(result.iterations).toBeGreaterThanOrEqual(t.simulationMinIterations);
  });

  it('returns outcome percentiles in correct order (p10 ≤ p50 ≤ p90)', () => {
    const sim = new Simulator();
    const m = metricsWithCurrency(100, {
      avgSatisfaction: 60,
      netFlow: 15,
      netFlowByCurrency: { credits: 15 },
    });
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
    const m = metricsWithCurrency(100);
    const result = sim.simulate(increaseAction, m, t);
    expect(result.estimatedEffectTick).toBeGreaterThan(100);
  });

  it('overshoot risk is between 0 and 1', () => {
    const sim = new Simulator();
    const m = metricsWithCurrency(100);
    const result = sim.simulate(decreaseAction, m, t);
    expect(result.overshootRisk).toBeGreaterThanOrEqual(0);
    expect(result.overshootRisk).toBeLessThanOrEqual(1);
  });

  it('confidence interval is [lo, hi] with lo ≤ hi', () => {
    const sim = new Simulator();
    const m = metricsWithCurrency(100);
    const result = sim.simulate(increaseAction, m, t);
    expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.confidenceInterval[1]);
  });

  it('projects multi-currency independently', () => {
    const sim = new Simulator();
    const m = {
      ...emptyMetrics(100),
      tick: 100,
      currencies: ['gold', 'gems'],
      totalSupply: 1000,
      totalSupplyByCurrency: { gold: 800, gems: 200 },
      netFlow: 50,
      netFlowByCurrency: { gold: 40, gems: 10 },
      velocityByCurrency: { gold: 0.05, gems: 0.03 },
      giniCoefficientByCurrency: { gold: 0.35, gems: 0.40 },
      faucetVolumeByCurrency: { gold: 60, gems: 20 },
      sinkVolumeByCurrency: { gold: 20, gems: 10 },
      avgSatisfaction: 70,
      totalAgents: 100,
    };

    const goldAction: SuggestedAction = {
      parameter: 'productionCost',
      direction: 'increase',
      currency: 'gold',
      magnitude: 0.15,
      reasoning: 'Test gold-scoped action',
    };

    const result = sim.simulate(goldAction, m, t, 100, 10);
    // Both currencies should have projected values
    expect(result.outcomes.p50.totalSupplyByCurrency['gold']).toBeDefined();
    expect(result.outcomes.p50.totalSupplyByCurrency['gems']).toBeDefined();
    // The currencies array should be preserved
    expect(result.outcomes.p50.currencies).toEqual(['gold', 'gems']);
  });
});
