import { describe, it, expect } from 'vitest';
import { Planner } from '../src/Planner.js';
import { ParameterRegistry } from '../src/ParameterRegistry.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';
import type { Diagnosis, SimulationResult, SuggestedAction, PrincipleViolation, ActionPlan } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

function makeDiagnosis(overrides: Partial<SuggestedAction> = {}): Diagnosis {
  const violation: PrincipleViolation = {
    violated: true,
    severity: 5,
    evidence: {},
    suggestedAction: {
      parameterType: 'cost',
      direction: 'increase',
      magnitude: 0.10,
      reasoning: 'test',
      ...overrides,
    },
    confidence: 0.8,
  };
  return {
    principle: { id: 'P1', name: 'Test', category: 'currency', description: 'Test', check: () => ({ violated: false }) },
    violation,
    tick: 100,
  };
}

function makeSimResult(): SimulationResult {
  return {
    proposedAction: { parameterType: 'cost', direction: 'increase', reasoning: 'test' },
    iterations: 100,
    forwardTicks: 20,
    outcomes: { p10: emptyMetrics(), p50: emptyMetrics(), p90: emptyMetrics(), mean: emptyMetrics() },
    netImprovement: true,
    noNewProblems: true,
    confidenceInterval: [50, 70],
    estimatedEffectTick: 120,
    overshootRisk: 0.1,
  };
}

describe('Planner — type-level cooldowns', () => {
  it('blocks a second plan for the same parameterType+scope within cooldown', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'crafting' },
      currentValue: 100,
    });

    const diagnosis = makeDiagnosis({ scope: { system: 'crafting' } });
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;

    // First plan should succeed
    const plan1 = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);
    expect(plan1).not.toBeNull();

    // Record it applied
    planner.recordApplied(plan1!, 100);

    // Second plan at tick 105 (within cooldown of 15) should be blocked by type cooldown
    const metrics2 = emptyMetrics(105);
    metrics2.avgSatisfaction = 70;
    const diagnosis2 = makeDiagnosis({ scope: { system: 'crafting' } });
    const plan2 = planner.plan(diagnosis2, metrics2, makeSimResult(), {}, t, registry);
    expect(plan2).toBeNull();
  });

  it('allows plan after type cooldown expires', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'crafting' },
      currentValue: 100,
    });

    const diagnosis = makeDiagnosis({ scope: { system: 'crafting' } });
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;

    const plan1 = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);
    planner.recordApplied(plan1!, 100);

    // At tick 120 (cooldown 15 has passed)
    const metrics2 = emptyMetrics(120);
    metrics2.avgSatisfaction = 70;
    const diagnosis2 = makeDiagnosis({ scope: { system: 'crafting' } });
    const plan2 = planner.plan(diagnosis2, metrics2, makeSimResult(), {}, t, registry);
    expect(plan2).not.toBeNull();
  });

  it('different scopes have independent type cooldowns', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'crafting' },
      currentValue: 100,
    });
    registry.register({
      key: 'marketCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'marketplace' },
      currentValue: 100,
    });

    // Apply crafting cost plan
    const craftDiag = makeDiagnosis({ scope: { system: 'crafting' } });
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;
    const plan1 = planner.plan(craftDiag, metrics, makeSimResult(), {}, t, registry);
    planner.recordApplied(plan1!, 100);

    // Marketplace cost should still be plannable (different scope)
    const marketDiag = makeDiagnosis({ scope: { system: 'marketplace' } });
    const metrics2 = emptyMetrics(105);
    metrics2.avgSatisfaction = 70;
    const plan2 = planner.plan(marketDiag, metrics2, makeSimResult(), {}, t, registry);
    expect(plan2).not.toBeNull();
    expect(plan2!.parameter).toBe('marketCost');
  });

  it('resetCooldowns clears type cooldowns too', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      scope: { system: 'crafting' },
      currentValue: 100,
    });

    const diagnosis = makeDiagnosis({ scope: { system: 'crafting' } });
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;

    const plan1 = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);
    planner.recordApplied(plan1!, 100);

    // Reset cooldowns
    planner.resetCooldowns();

    // Should be able to plan again immediately
    const metrics2 = emptyMetrics(105);
    metrics2.avgSatisfaction = 70;
    const diagnosis2 = makeDiagnosis({ scope: { system: 'crafting' } });
    const plan2 = planner.plan(diagnosis2, metrics2, makeSimResult(), {}, t, registry);
    expect(plan2).not.toBeNull();
  });
});
