import { describe, it, expect } from 'vitest';
import { Planner } from '../src/Planner.js';
import { ParameterRegistry } from '../src/ParameterRegistry.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';
import type { Diagnosis, SimulationResult, Principle } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

const fakePrinciple: Principle = {
  id: 'P_TEST', name: 'Test', category: 'currency',
  description: 'test', check: () => ({ violated: false }),
};

function makeDiagnosis(parameterType: string, scope?: Record<string, unknown>): Diagnosis {
  return {
    principle: fakePrinciple, tick: 100,
    violation: {
      violated: true, severity: 5, evidence: {},
      suggestedAction: {
        parameterType, direction: 'increase', magnitude: 0.10, reasoning: 'test',
        ...(scope ? { scope } : {}),
      },
      confidence: 0.80, estimatedLag: 8,
    },
  };
}

function makeSimResult(): SimulationResult {
  const em = emptyMetrics(110);
  return {
    proposedAction: { parameterType: 'cost', direction: 'increase', magnitude: 0.10, reasoning: 'test' },
    iterations: 100, forwardTicks: 20,
    outcomes: { p10: em, p50: em, p90: em, mean: em },
    netImprovement: true, noNewProblems: true,
    confidenceInterval: [0.5, 0.9], estimatedEffectTick: 110, overshootRisk: 0.1,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Planner parameter-type resolution via ParameterRegistry', () => {
  it('resolves parameterType to concrete key via registry', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({
      key: 'craftingCost',
      type: 'cost',
      flowImpact: 'sink',
      currentValue: 50,
    });

    const diagnosis = makeDiagnosis('cost');
    const metrics = emptyMetrics(100);
    const sim = makeSimResult();

    const plan = planner.plan(diagnosis, metrics, sim, {}, t, registry);

    expect(plan).not.toBeNull();
    expect(plan!.parameter).toBe('craftingCost');
    // parameter should be the resolved key, not the parameterType
    expect(plan!.parameter).not.toBe('cost');
  });

  it('picks the parameter matching scope.currency', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();

    registry.registerAll([
      { key: 'goldCraftingCost', type: 'cost', flowImpact: 'sink', scope: { currency: 'gold' }, currentValue: 30 },
      { key: 'gemsCraftingCost', type: 'cost', flowImpact: 'sink', scope: { currency: 'gems' }, currentValue: 80 },
    ]);

    // Diagnosis scoped to gems
    const diagnosis = makeDiagnosis('cost', { currency: 'gems' });
    const metrics = emptyMetrics(100);
    const sim = makeSimResult();

    const plan = planner.plan(diagnosis, metrics, sim, {}, t, registry);

    expect(plan).not.toBeNull();
    expect(plan!.parameter).toBe('gemsCraftingCost');
  });

  it('falls back to parameterType when no registry is provided', () => {
    const planner = new Planner();

    const diagnosis = makeDiagnosis('cost');
    const metrics = emptyMetrics(100);
    const sim = makeSimResult();

    const plan = planner.plan(diagnosis, metrics, sim, { cost: 50 }, t);

    expect(plan).not.toBeNull();
    // Without registry, plan.parameter should fall back to parameterType
    expect(plan!.parameter).toBe('cost');
  });

  it('returns null when registry has no matching parameter for the type', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();

    // Register only a 'reward' type — diagnosis asks for 'cost'
    registry.register({
      key: 'questReward',
      type: 'reward',
      flowImpact: 'faucet',
      currentValue: 100,
    });

    const diagnosis = makeDiagnosis('cost');
    const metrics = emptyMetrics(100);
    const sim = makeSimResult();

    const plan = planner.plan(diagnosis, metrics, sim, {}, t, registry);

    expect(plan).toBeNull();
  });

  it('uses registry currentValue as baseline for magnitude calculations', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();

    registry.register({
      key: 'mintingFee',
      type: 'fee',
      flowImpact: 'sink',
      currentValue: 200,
    });

    const diagnosis = makeDiagnosis('fee');
    const metrics = emptyMetrics(100);
    const sim = makeSimResult();

    // currentParams has a different value for mintingFee — registry should win
    const plan = planner.plan(diagnosis, metrics, sim, { mintingFee: 50 }, t, registry);

    expect(plan).not.toBeNull();
    // Baseline should be registry's currentValue (200), not currentParams (50)
    expect(plan!.currentValue).toBe(200);
    // direction = increase, magnitude = 0.10 → targetValue = 200 * 1.10 = 220
    expect(plan!.targetValue).toBeCloseTo(220, 2);
  });

  it('sets resolvedParameter on action after plan()', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();

    registry.register({
      key: 'stakingYield',
      type: 'yield',
      flowImpact: 'faucet',
      currentValue: 10,
    });

    const diagnosis = makeDiagnosis('yield');
    const metrics = emptyMetrics(100);
    const sim = makeSimResult();

    const plan = planner.plan(diagnosis, metrics, sim, {}, t, registry);

    expect(plan).not.toBeNull();
    // The suggestedAction on the diagnosis should have resolvedParameter set
    const action = diagnosis.violation.suggestedAction;
    expect(action.resolvedParameter).toBe('stakingYield');
  });
});
