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
        parameterType: 'cost',
        direction: 'increase',
        magnitude: 0.10,
        reasoning: 'test',
        ...(currency !== undefined ? { scope: { currency } } : {}),
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
      parameterType: 'cost',
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
    id: 'plan_100_cost',
    diagnosis: makeDiagnosis('gold'),
    parameter: 'cost',
    scope: { currency: 'gold' },
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

describe('Planner — scope propagation', () => {
  it('sets plan.scope when action has scope', () => {
    const planner = new Planner();
    const result = planner.plan(
      makeDiagnosis('gems'),
      emptyMetrics(100),
      makeSimResult(),
      { cost: 1.0 },
      t,
    );
    expect(result).not.toBeNull();
    expect(result!.scope?.currency).toBe('gems');
  });

  it('omits plan.scope when action has no scope', () => {
    const planner = new Planner();
    const result = planner.plan(
      makeDiagnosis(undefined),
      emptyMetrics(100),
      makeSimResult(),
      { cost: 1.0 },
      t,
    );
    expect(result).not.toBeNull();
    expect(result!.scope).toBeUndefined();
  });

  it('plan.parameter matches action.parameterType', () => {
    const planner = new Planner();
    const result = planner.plan(
      makeDiagnosis('gold'),
      emptyMetrics(100),
      makeSimResult(),
      { cost: 1.0 },
      t,
    );
    expect(result).not.toBeNull();
    expect(result!.parameter).toBe('cost');
  });

  it('plan is null when parameter is locked', () => {
    const planner = new Planner();
    planner.lock('cost');
    const result = planner.plan(
      makeDiagnosis('gold'),
      emptyMetrics(100),
      makeSimResult(),
      { cost: 1.0 },
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
      { cost: 1.0 },
      t,
    );
    expect(result).toBeNull();
  });
});

describe('Executor — scope pass-through', () => {
  it('apply passes plan.scope to adapter.setParam', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    const plan = makePlan({ scope: { currency: 'gems' }, targetValue: 1.15 });
    await executor.apply(plan, adapter, { cost: 1.0 });
    expect(adapter.setParam).toHaveBeenCalledWith('cost', 1.15, { currency: 'gems' });
  });

  it('apply works without scope (undefined)', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    const plan = makePlan({ targetValue: 1.15 });
    delete (plan as Record<string, unknown>)['scope'];
    await executor.apply(plan, adapter, { cost: 1.0 });
    expect(adapter.setParam).toHaveBeenCalledWith('cost', 1.15, undefined);
  });

  it('rollback passes plan.scope to adapter.setParam', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    const plan = makePlan({ scope: { currency: 'gold' } });
    await executor.apply(plan, adapter, { cost: 1.0 });

    // Trigger rollback: avgSatisfaction below threshold, tick past checkAfterTick
    const metrics = {
      ...emptyMetrics(120),
      tick: 120,
      avgSatisfaction: 10, // below threshold of 30
    };
    const { rolledBack } = await executor.checkRollbacks(metrics, adapter);
    expect(rolledBack.length).toBe(1);
    expect(adapter.setParam).toHaveBeenLastCalledWith('cost', 1.0, { currency: 'gold' });
  });
});

// ── V1.4.6 patch tests ──────────────────────────────────────────────────────

describe('V1.4.6 — activePlanCount settlement', () => {
  it('settled plans decrement activePlanCount so new plans can be created', async () => {
    const planner = new Planner();
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };

    // complexityBudgetMax is 20 in DEFAULT_THRESHOLDS
    const budgetMax = t.complexityBudgetMax; // 20

    // Apply budgetMax plans to exhaust the budget
    for (let i = 0; i < budgetMax; i++) {
      const plan = makePlan({
        id: `plan_${i}`,
        parameter: `param${i}`,
        diagnosis: { ...makeDiagnosis('gold'), tick: 5 },
        rollbackCondition: {
          metric: 'avgSatisfaction',
          direction: 'below',
          threshold: 30,
          checkAfterTick: 10,
        },
      });
      await executor.apply(plan, adapter, {});
      planner.recordApplied(plan, 5);
    }

    // Planner should now block (budget exhausted)
    const blocked = planner.plan(
      makeDiagnosis('gold'),
      emptyMetrics(100),
      makeSimResult(),
      { cost: 1.0 },
      t,
    );
    expect(blocked).toBeNull();

    // Advance past settled window (checkAfterTick=10 + 10 = 20, so tick 25 settles them)
    const metrics = { ...emptyMetrics(25), tick: 25, avgSatisfaction: 80 };
    const { settled } = await executor.checkRollbacks(metrics, adapter);
    expect(settled.length).toBe(budgetMax);

    for (const plan of settled) {
      planner.recordSettled(plan);
    }

    // Now planner should allow a new plan
    const unblocked = planner.plan(
      makeDiagnosis('gold'),
      emptyMetrics(100),
      makeSimResult(),
      { cost: 1.0 },
      t,
    );
    expect(unblocked).not.toBeNull();
  });
});

describe('V1.4.6 — NaN metric rollback fail-safe', () => {
  it('rolls back plan when metric path resolves to NaN', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    const plan = makePlan({
      rollbackCondition: {
        metric: 'nonexistent.path',
        direction: 'below',
        threshold: 30,
        checkAfterTick: 10,
      },
    });
    plan.appliedAt = 5;
    await executor.apply(plan, adapter, { cost: 1.0 });

    const metrics = { ...emptyMetrics(15), tick: 15, avgSatisfaction: 80 };
    const { rolledBack } = await executor.checkRollbacks(metrics, adapter);
    expect(rolledBack.length).toBe(1);
    expect(rolledBack[0]!.id).toBe(plan.id);
  });
});

describe('V1.4.6 — activePlans hard TTL eviction', () => {
  it('evicts plan after 200 ticks past appliedAt', async () => {
    const executor = new Executor();
    const adapter: EconomyAdapter = {
      getState: vi.fn() as EconomyAdapter['getState'],
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    // apply() sets appliedAt = plan.diagnosis.tick, so set diagnosis tick to 0
    const plan = makePlan({
      diagnosis: { ...makeDiagnosis('gold'), tick: 0 },
      rollbackCondition: {
        metric: 'avgSatisfaction',
        direction: 'below',
        threshold: 30,
        checkAfterTick: 99999, // far future — would never settle normally
      },
    });
    await executor.apply(plan, adapter, { cost: 1.0 });

    // At tick 201, TTL kicks in (201 - 0 > 200)
    const metrics = { ...emptyMetrics(201), tick: 201 };
    const { settled, rolledBack } = await executor.checkRollbacks(metrics, adapter);
    expect(settled.length).toBe(1);
    expect(rolledBack.length).toBe(0);
    expect(executor.getActivePlans().length).toBe(0);
  });
});

describe('V1.4.6 — Planner absoluteValue fallback', () => {
  it('uses absoluteValue as baseline when currentParams is empty', () => {
    const planner = new Planner();
    const diagnosis = makeDiagnosis('gold');
    diagnosis.violation.suggestedAction = {
      parameterType: 'reward',
      direction: 'decrease',
      magnitude: 0.10,
      reasoning: 'test',
      absoluteValue: 50,
    };
    const result = planner.plan(
      diagnosis,
      emptyMetrics(100),
      makeSimResult(),
      {}, // empty params — first adjustment
      t,
    );
    expect(result).not.toBeNull();
    // Should use 50 as baseline, not 1.0
    // decrease by 10%: 50 * 0.9 = 45
    expect(result!.targetValue).toBeCloseTo(45, 1);
  });
});

describe('V1.4.6 — Observer error boundary', () => {
  it('tick does not throw when observer.compute fails', async () => {
    // This is an integration-level concern; we test that the AgentE class
    // handles the error. Importing AgentE here to verify.
    const { AgentE } = await import('../src/AgentE.js');
    const agent = new AgentE({ mode: 'autonomous' });
    const adapter: EconomyAdapter = {
      getState: () => ({
        tick: 1,
        currencies: ['gold'],
        agentBalances: null as never, // invalid — will cause compute to throw
        agentRoles: {},
        agentInventories: {},
        agentSatisfaction: {},
        marketPrices: {},
        poolSizes: {},
      }),
      setParam: vi.fn() as EconomyAdapter['setParam'],
    };
    agent.connect(adapter).start();
    // Should not throw
    await expect(agent.tick()).resolves.not.toThrow();
  });
});

describe('V1.4.6 — Observer custom metric warning', () => {
  it('sets NaN and warns when custom metric throws', async () => {
    const { Observer } = await import('../src/Observer.js');
    const observer = new Observer();
    observer.registerCustomMetric('broken', () => {
      throw new Error('boom');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const metrics = observer.compute(
      {
        tick: 1,
        currencies: ['gold'],
        agentBalances: { a1: { gold: 100 } },
        agentRoles: { a1: 'consumer' },
        agentInventories: {},
        agentSatisfaction: { a1: 80 },
        marketPrices: { gold: { item: 10 } },
        poolSizes: {},
      },
      [],
    );
    expect(metrics.custom['broken']).toBeNaN();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Custom metric 'broken'"),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
