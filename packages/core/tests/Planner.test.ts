import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../src/Planner.js';
import { Executor } from '../src/Executor.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';
import type { Diagnosis, SimulationResult, ActionPlan, EconomyAdapter, Principle } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

const fakePrinciple: Principle = {
  id: 'P12',
  name: 'One Primary Faucet',
  category: 'currency',
  description: 'Test principle',
  check: () => ({ violated: false }),
};

function makeDiagnosis(currency?: string): Diagnosis {
  return {
    principle: fakePrinciple,
    tick: 100,
    violation: {
      violated: true,
      severity: 5,
      evidence: { currency: currency ?? 'gold' },
      suggestedAction: {
        parameter: 'productionCost',
        direction: 'increase',
        magnitude: 0.10,
        reasoning: 'test',
        ...(currency !== undefined ? { currency } : {}),
      },
      confidence: 0.80,
      estimatedLag: 8,
    },
  };
}

function makeSimResult(): SimulationResult {
  const em = emptyMetrics(110);
  return {
    proposedAction: {
      parameter: 'productionCost',
      direction: 'increase',
      magnitude: 0.10,
      reasoning: 'test',
    },
    iterations: 100,
    forwardTicks: 20,
    outcomes: { p10: em, p50: em, p90: em, mean: em },
    netImprovement: true,
    noNewProblems: true,
    confidenceInterval: [0.5, 0.9] as [number, number],
    estimatedEffectTick: 110,
    overshootRisk: 0.1,
  };
}

function makePlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    id: 'plan_100_productionCost',
    diagnosis: makeDiagnosis('gold'),
    parameter: 'productionCost',
    currency: 'gold',
    currentValue: 1.0,
    targetValue: 1.15,
    maxChangePercent: 0.15,
    cooldownTicks: 15,
    rollbackCondition: {
      metric: 'avgSatisfaction',
      direction: 'below',
      threshold: 30,
      checkAfterTick: 110,
    },
    simulationResult: makeSimResult(),
    estimatedLag: 8,
    ...overrides,
  };
}

describe('Planner — currency propagation', () => {
  it('sets plan.currency when action has currency', () => {
    const planner = new Planner();
    const result = planner.plan(
      makeDiagnosis('gems'),
      emptyMetrics(100),
      makeSimResult(),
      { productionCost: 1.0 },
      t,
    );
    expect(result).not.toBeNull();
    expect(result!.currency).toBe('gems');
  });

  it('omits plan.currency when action has no currency', () => {
    const planner = new Planner();
    const result = planner.plan(
      makeDiagnosis(undefined),
      emptyMetrics(100),
      makeSimResult(),
      { productionCost: 1.0 },
      t,
    );
    expect(result).not.toBeNull();
    expect(result!.currency).toBeUndefined();
  });

  it('plan.parameter matches action.parameter', () => {
    const planner = new Planner();
    const result = planner.plan(
      makeDiagnosis('gold'),
      emptyMetrics(100),
      makeSimResult(),
      { productionCost: 1.0 },
      t,
    );
    expect(result).not.toBeNull();
    expect(result!.parameter).toBe('productionCost');
  });

  it('plan is null when parameter is locked', () => {
    const planner = new Planner();
    planner.lock('productionCost');
    const result = planner.plan(
      makeDiagnosis('gold'),
      emptyMetrics(100),
      makeSimResult(),
      { productionCost: 1.0 },
      t,
    );
    expect(result).toBeNull();
  });

  it('plan is null when simulation shows no improvement', () => {
    const planner = new Planner();
    const result = planner.plan(
      makeDiagnosis('gold'),
      emptyMetrics(100),
      { ...makeSimResult(), netImprovement: false },
      { productionCost: 1.0 },
      t,
    );
    expect(result).toBeNull();
  });
});

describe('Executor — currency pass-through', () => {
  it('apply passes plan.currency to adapter.setParam', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    const plan = makePlan({ currency: 'gems', targetValue: 1.15 });
    await executor.apply(plan, adapter, { productionCost: 1.0 });
    expect(adapter.setParam).toHaveBeenCalledWith('productionCost', 1.15, 'gems');
  });

  it('apply works without currency (undefined)', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    const plan = makePlan({ targetValue: 1.15 });
    delete (plan as Record<string, unknown>)['currency'];
    await executor.apply(plan, adapter, { productionCost: 1.0 });
    expect(adapter.setParam).toHaveBeenCalledWith('productionCost', 1.15, undefined);
  });

  it('rollback passes plan.currency to adapter.setParam', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    const plan = makePlan({ currency: 'gold' });
    await executor.apply(plan, adapter, { productionCost: 1.0 });

    // Trigger rollback: avgSatisfaction below threshold, tick past checkAfterTick
    const metrics = {
      ...emptyMetrics(120),
      tick: 120,
      avgSatisfaction: 10, // below threshold of 30
    };
    const rolledBack = await executor.checkRollbacks(metrics, adapter);
    expect(rolledBack.length).toBe(1);
    expect(adapter.setParam).toHaveBeenLastCalledWith('productionCost', 1.0, 'gold');
  });
});
