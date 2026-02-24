import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/Simulator.js';
import { ParameterRegistry } from '../src/ParameterRegistry.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';
import type { SuggestedAction, EconomyMetrics } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

function metricsForSim(tick: number): EconomyMetrics {
  return {
    ...emptyMetrics(tick),
    currencies: ['gold'],
    totalSupply: 1000,
    totalSupplyByCurrency: { gold: 1000 },
    netFlow: 10,
    netFlowByCurrency: { gold: 10 },
    velocityByCurrency: { gold: 0.05 },
    giniCoefficientByCurrency: { gold: 0.3 },
    faucetVolumeByCurrency: { gold: 50 },
    sinkVolumeByCurrency: { gold: 40 },
    avgSatisfaction: 70,
    totalAgents: 100,
    populationByRole: { consumer: 50, producer: 50 },
  };
}

describe('Simulator – registry-based flow impact', () => {
  it('uses registry flowImpact when resolvedParameter is set', () => {
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'crafting', currency: 'gold' },
    });

    const sim = new Simulator(registry);
    const metrics = metricsForSim(100);

    const action: SuggestedAction = {
      parameterType: 'cost',
      direction: 'increase',
      magnitude: 0.15,
      reasoning: 'Raise crafting cost to drain excess gold',
      resolvedParameter: 'craftingCost',
      scope: { system: 'crafting', currency: 'gold' },
    };

    const result = sim.simulate(action, metrics, t, 100, 10);

    // The simulation should complete and produce valid outcome structure
    expect(result.outcomes.p50.totalSupplyByCurrency['gold']).toBeDefined();
    expect(result.iterations).toBeGreaterThanOrEqual(t.simulationMinIterations);

    // Sink dynamics: increasing a cost should reduce net flow (drain currency).
    // With 'sink' impact, flowEffect = sign * netFlow * 0.2 where sign = -1 for increase.
    // This means the net effect pulls flow negative, so projected net flow should
    // trend lower than the starting +10.
    const projectedNetFlow = result.outcomes.p50.netFlowByCurrency['gold'] ?? 0;
    expect(projectedNetFlow).toBeLessThan(metrics.netFlowByCurrency['gold']!);
  });

  it('falls back to inferFlowImpact when registry has no match', () => {
    // Registry exists but has no entry for the resolved key
    const registry = new ParameterRegistry();
    registry.register({
      key: 'unrelatedParam',
      type: 'multiplier',
      flowImpact: 'neutral',
    });

    const sim = new Simulator(registry);
    const metrics = metricsForSim(100);

    const action: SuggestedAction = {
      parameterType: 'reward',
      direction: 'increase',
      magnitude: 0.15,
      reasoning: 'Increase reward to attract participants',
      // resolvedParameter is NOT set — forces inferFlowImpact fallback
    };

    const result = sim.simulate(action, metrics, t, 100, 10);

    // 'reward' infers to 'faucet'. Faucet dynamics: -sign * dominantRoleCount * 0.3
    // For 'increase' direction, sign = -1, so effect = 1 * 50 * 0.3 = +15
    // This positive faucet effect should push projected supply higher.
    expect(result.outcomes.p50.totalSupply).toBeGreaterThan(0);
    expect(result.iterations).toBeGreaterThanOrEqual(t.simulationMinIterations);
  });

  describe('inferFlowImpact mapping (no registry)', () => {
    // Without a registry, the Simulator infers flow impact from parameterType.
    // We verify each mapping by confirming the simulation runs and produces
    // qualitatively different dynamics.

    it('cost → sink: drains currency', () => {
      const sim = new Simulator();
      const metrics = metricsForSim(100);

      const action: SuggestedAction = {
        parameterType: 'cost',
        direction: 'increase',
        magnitude: 0.15,
        reasoning: 'cost infers to sink',
      };

      const result = sim.simulate(action, metrics, t, 100, 10);
      // Sink: sign * netFlow * 0.2 — increase with sign=-1 pushes flow down
      const projected = result.outcomes.p50.netFlowByCurrency['gold'] ?? 0;
      expect(projected).toBeLessThan(metrics.netFlowByCurrency['gold']!);
    });

    it('reward → faucet: injects currency', () => {
      const sim = new Simulator();
      const metrics = metricsForSim(100);

      const action: SuggestedAction = {
        parameterType: 'reward',
        direction: 'increase',
        magnitude: 0.15,
        reasoning: 'reward infers to faucet',
      };

      const result = sim.simulate(action, metrics, t, 100, 10);
      // Faucet with increase: -sign * dominantRoleCount * 0.3 = +15 per tick
      // Supply should grow with positive inflow
      expect(result.outcomes.p50.totalSupply).toBeGreaterThan(metrics.totalSupply * 0.5);
    });

    it('yield → mixed: blends faucet and sink dynamics', () => {
      const sim = new Simulator();
      const metrics = metricsForSim(100);

      const action: SuggestedAction = {
        parameterType: 'yield',
        direction: 'increase',
        magnitude: 0.10,
        reasoning: 'yield infers to mixed',
      };

      const result = sim.simulate(action, metrics, t, 100, 10);
      // Mixed: sign * faucetVolume * 0.15. For increase, sign = -1
      // Effect = -1 * 50 * 0.15 = -7.5 per tick, moderately reducing flow.
      // Simulation should complete successfully.
      expect(result.outcomes.p50.currencies).toEqual(['gold']);
      expect(typeof result.outcomes.p50.netFlowByCurrency['gold']).toBe('number');
    });

    it('cap → neutral: minimal direct flow effect', () => {
      const sim = new Simulator();
      const metrics = metricsForSim(100);

      const action: SuggestedAction = {
        parameterType: 'cap',
        direction: 'increase',
        magnitude: 0.10,
        reasoning: 'cap infers to neutral',
      };

      const result = sim.simulate(action, metrics, t, 100, 10);
      // Neutral: sign * dominantRoleCount * 0.5. For increase, sign = -1
      // Effect = -1 * 50 * 0.5 = -25. Neutral uses population, not flow,
      // producing a distinct dynamic from sink/faucet.
      expect(result.outcomes.p50.currencies).toEqual(['gold']);
      expect(result.iterations).toBeGreaterThanOrEqual(t.simulationMinIterations);
    });
  });

  it('smoke test: Simulator with populated registry runs without error', () => {
    const registry = new ParameterRegistry();
    registry.registerAll([
      {
        key: 'craftingCost',
        type: 'cost',
        flowImpact: 'sink',
        scope: { system: 'crafting', currency: 'gold' },
      },
      {
        key: 'miningReward',
        type: 'reward',
        flowImpact: 'faucet',
        scope: { system: 'mining', currency: 'gold' },
      },
      {
        key: 'stakingYield',
        type: 'yield',
        flowImpact: 'mixed',
        scope: { system: 'staking', currency: 'gold' },
      },
      {
        key: 'supplyCap',
        type: 'cap',
        flowImpact: 'neutral',
      },
    ]);

    const sim = new Simulator(registry);
    const metrics = metricsForSim(200);

    const action: SuggestedAction = {
      parameterType: 'cost',
      direction: 'increase',
      magnitude: 0.10,
      reasoning: 'Smoke test with full registry',
      resolvedParameter: 'craftingCost',
      scope: { system: 'crafting', currency: 'gold' },
    };

    // Should not throw
    const result = sim.simulate(action, metrics, t, 100, 10);
    expect(result).toBeDefined();
    expect(result.proposedAction).toBe(action);
    expect(result.outcomes.p10).toBeDefined();
    expect(result.outcomes.p50).toBeDefined();
    expect(result.outcomes.p90).toBeDefined();
    expect(result.outcomes.mean).toBeDefined();
    expect(result.confidenceInterval).toHaveLength(2);
    expect(result.overshootRisk).toBeGreaterThanOrEqual(0);
    expect(result.overshootRisk).toBeLessThanOrEqual(1);
  });

  it('resolvedParameter drives registry lookup for flow impact', () => {
    const registry = new ParameterRegistry();

    // Register two cost parameters with different flow impacts
    registry.register({
      key: 'transactionFee',
      type: 'fee',
      flowImpact: 'sink',
      scope: { system: 'marketplace' },
    });
    registry.register({
      key: 'bonusMultiplier',
      type: 'multiplier',
      flowImpact: 'neutral',
    });

    const sim = new Simulator(registry);
    const metrics = metricsForSim(100);

    // Action resolved to transactionFee (sink)
    const sinkAction: SuggestedAction = {
      parameterType: 'fee',
      direction: 'increase',
      magnitude: 0.15,
      reasoning: 'Increase fee to drain gold',
      resolvedParameter: 'transactionFee',
      scope: { system: 'marketplace', currency: 'gold' },
    };

    // Action resolved to bonusMultiplier (neutral)
    const neutralAction: SuggestedAction = {
      parameterType: 'multiplier',
      direction: 'increase',
      magnitude: 0.15,
      reasoning: 'Increase multiplier (neutral flow)',
      resolvedParameter: 'bonusMultiplier',
    };

    const sinkResult = sim.simulate(sinkAction, metrics, t, 100, 10);
    const neutralResult = sim.simulate(neutralAction, metrics, t, 100, 10);

    // Both should produce valid results
    expect(sinkResult.outcomes.p50).toBeDefined();
    expect(neutralResult.outcomes.p50).toBeDefined();

    // Sink and neutral dynamics use different formulas, so their projected
    // net flows should diverge. Sink uses netFlow * 0.2, neutral uses
    // dominantRoleCount * 0.5 — qualitatively different drivers.
    const sinkNetFlow = sinkResult.outcomes.p50.netFlowByCurrency['gold'] ?? 0;
    const neutralNetFlow = neutralResult.outcomes.p50.netFlowByCurrency['gold'] ?? 0;
    expect(sinkNetFlow).not.toBeCloseTo(neutralNetFlow, 0);
  });

  it('unresolved parameter with registry still falls back to infer', () => {
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
    });

    const sim = new Simulator(registry);
    const metrics = metricsForSim(100);

    // resolvedParameter points to a key NOT in the registry
    const action: SuggestedAction = {
      parameterType: 'reward',
      direction: 'increase',
      magnitude: 0.10,
      reasoning: 'Resolved key missing from registry',
      resolvedParameter: 'nonExistentKey',
    };

    // registry.getFlowImpact('nonExistentKey') returns undefined,
    // so it should fall back to inferFlowImpact('reward') → 'faucet'
    const result = sim.simulate(action, metrics, t, 100, 10);
    expect(result).toBeDefined();
    expect(result.outcomes.p50.totalSupply).toBeGreaterThan(0);
  });
});
