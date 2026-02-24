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

describe('Planner — activePlanCount settlement', () => {
  it('activePlanCount increments on recordApplied()', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({ key: 'testCost', type: 'cost', flowImpact: 'sink', currentValue: 100 });

    const diagnosis = makeDiagnosis();
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;
    const plan = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);
    expect(plan).not.toBeNull();

    expect(planner.getActivePlanCount()).toBe(0);
    planner.recordApplied(plan!, 100);
    expect(planner.getActivePlanCount()).toBe(1);
  });

  it('activePlanCount decrements on recordSettled()', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({ key: 'testCost', type: 'cost', flowImpact: 'sink', currentValue: 100 });

    const diagnosis = makeDiagnosis();
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;
    const plan = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);
    planner.recordApplied(plan!, 100);
    expect(planner.getActivePlanCount()).toBe(1);

    planner.recordSettled(plan!);
    expect(planner.getActivePlanCount()).toBe(0);
  });

  it('activePlanCount decrements on recordRolledBack()', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({ key: 'testCost', type: 'cost', flowImpact: 'sink', currentValue: 100 });

    const diagnosis = makeDiagnosis();
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;
    const plan = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);
    planner.recordApplied(plan!, 100);

    planner.recordRolledBack(plan!);
    expect(planner.getActivePlanCount()).toBe(0);
  });

  it('activePlanCount never goes below 0', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({ key: 'testCost', type: 'cost', flowImpact: 'sink', currentValue: 100 });

    const diagnosis = makeDiagnosis();
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;
    const plan = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);

    // Settle without applying (shouldn't happen, but should not go negative)
    planner.recordSettled(plan!);
    expect(planner.getActivePlanCount()).toBe(0);
  });

  it('Planner allows new plans after settlement brings count below budget', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({ key: 'testCost', type: 'cost', flowImpact: 'sink', currentValue: 100 });

    // Fill up active plans to budget max
    for (let i = 0; i < t.complexityBudgetMax; i++) {
      const m = emptyMetrics(100 + i * 20);
      m.avgSatisfaction = 70;
      const d = makeDiagnosis();
      const p = planner.plan(d, m, makeSimResult(), {}, t, registry);
      if (p) {
        planner.recordApplied(p, 100 + i * 20);
        planner.resetCooldowns(); // Allow re-planning at same type
      }
    }

    expect(planner.getActivePlanCount()).toBe(t.complexityBudgetMax);

    // Next plan should be blocked
    const blockedMetrics = emptyMetrics(500);
    blockedMetrics.avgSatisfaction = 70;
    planner.resetCooldowns();
    const blocked = planner.plan(makeDiagnosis(), blockedMetrics, makeSimResult(), {}, t, registry);
    expect(blocked).toBeNull();

    // Settle one plan — should allow planning again
    planner.recordSettled({} as ActionPlan);
    planner.resetCooldowns();
    const unblocked = planner.plan(makeDiagnosis(), blockedMetrics, makeSimResult(), {}, t, registry);
    expect(unblocked).not.toBeNull();
  });

  it('resetActivePlans() zeroes the count', () => {
    const planner = new Planner();
    const registry = new ParameterRegistry();
    registry.register({ key: 'testCost', type: 'cost', flowImpact: 'sink', currentValue: 100 });

    const diagnosis = makeDiagnosis();
    const metrics = emptyMetrics(100);
    metrics.avgSatisfaction = 70;
    const plan = planner.plan(diagnosis, metrics, makeSimResult(), {}, t, registry);
    planner.recordApplied(plan!, 100);
    planner.recordApplied(plan!, 100);

    expect(planner.getActivePlanCount()).toBe(2);
    planner.resetActivePlans();
    expect(planner.getActivePlanCount()).toBe(0);
  });
});
