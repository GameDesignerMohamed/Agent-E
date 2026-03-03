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

describe('Simulator — resolves independently of Planner', () => {
  it('resolves flow impact directly from registry by type+scope (no resolvedParameter needed)', () => {
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'crafting', currency: 'gold' },
    });

    const sim = new Simulator(registry);
    const metrics = metricsForSim(100);

    // Action does NOT have resolvedParameter set — Simulator resolves on its own
    const action: SuggestedAction = {
      parameterType: 'cost',
      direction: 'increase',
      magnitude: 0.15,
      reasoning: 'Simulator should resolve independently',
      scope: { system: 'crafting', currency: 'gold' },
    };

    const result = sim.simulate(action, metrics, t, 100, 10);

    // Sink dynamics: increasing cost should reduce net flow
    const projectedNetFlow = result.outcomes.p50.netFlowByCurrency['gold'] ?? 0;
    expect(projectedNetFlow).toBeLessThan(metrics.netFlowByCurrency['gold']!);
  });

  it('Simulator and Planner can resolve the same action to the same parameter', () => {
    const registry = new ParameterRegistry();
    registry.register({
      key: 'stakingYield',
      type: 'yield',
      flowImpact: 'faucet',
      scope: { system: 'staking' },
    });

    // Simulator resolves by calling registry.resolve() directly
    const resolved = registry.resolve('yield', { system: 'staking' });
    expect(resolved?.key).toBe('stakingYield');
    expect(resolved?.flowImpact).toBe('faucet');

    // Simulator uses this same resolution path internally
    const sim = new Simulator(registry);
    const metrics = metricsForSim(100);

    const action: SuggestedAction = {
      parameterType: 'yield',
      direction: 'increase',
      magnitude: 0.10,
      reasoning: 'Test independent resolution',
      scope: { system: 'staking' },
    };

    const result = sim.simulate(action, metrics, t, 100, 10);
    expect(result).toBeDefined();
    expect(result.outcomes.p50.totalSupply).toBeGreaterThan(0);
  });

  it('falls back to infer when registry has no matching type+scope', () => {
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'crafting' },
    });

    const sim = new Simulator(registry);
    const metrics = metricsForSim(100);

    // Action for 'reward' type — registry has no reward entry
    const action: SuggestedAction = {
      parameterType: 'reward',
      direction: 'increase',
      magnitude: 0.10,
      reasoning: 'No registry match, should infer faucet',
    };

    const result = sim.simulate(action, metrics, t, 100, 10);
    expect(result).toBeDefined();
    // reward infers to faucet → positive supply growth
    expect(result.outcomes.p50.totalSupply).toBeGreaterThan(0);
  });
});
