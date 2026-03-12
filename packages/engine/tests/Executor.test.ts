import { describe, it, expect, vi } from 'vitest';
import { Executor } from '../src/Executor.js';
import { emptyMetrics } from '../src/types.js';
import type { ActionPlan, EconomyAdapter, Principle, EconomyMetrics } from '../src/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fakePrinciple: Principle = {
  id: 'P1',
  name: 'Test Principle',
  category: 'supply-chain',
  description: 'Test',
  check: () => ({ violated: false }),
};

function makePlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    id: 'plan_test',
    diagnosis: {
      principle: fakePrinciple,
      tick: 100,
      violation: {
        violated: true,
        severity: 5,
        evidence: {},
        suggestedAction: {
          parameterType: 'cost',
          direction: 'increase',
          magnitude: 0.10,
          reasoning: 'test',
        },
        confidence: 0.80,
        estimatedLag: 8,
      },
    },
    parameter: 'craftingFee',
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
    simulationResult: {
      proposedAction: {
        parameterType: 'cost',
        direction: 'increase',
        magnitude: 0.10,
        reasoning: 'test',
      },
      iterations: 100,
      forwardTicks: 20,
      outcomes: {
        p10: emptyMetrics(120),
        p50: emptyMetrics(120),
        p90: emptyMetrics(120),
        mean: emptyMetrics(120),
      },
      netImprovement: true,
      noNewProblems: true,
      confidenceInterval: [0.5, 0.9] as [number, number],
      estimatedEffectTick: 110,
      overshootRisk: 0.1,
    },
    estimatedLag: 8,
    ...overrides,
  };
}

function makeAdapter(params: Record<string, number> = {}): EconomyAdapter & { calls: Array<{ key: string; value: number }> } {
  const store = { ...params };
  const calls: Array<{ key: string; value: number }> = [];
  return {
    calls,
    getState: vi.fn(async () => ({
      tick: 100,
      roles: [],
      resources: [],
      currencies: [],
      agentBalances: {},
      agentRoles: {},
      agentInventories: {},
      marketPrices: {},
      recentTransactions: [],
    })),
    setParam: vi.fn(async (key: string, value: number) => {
      store[key] = value;
      calls.push({ key, value });
    }),
  };
}

function withMetric(base: EconomyMetrics, key: string, value: number): EconomyMetrics {
  return { ...base, [key]: value };
}

// ─── apply() ─────────────────────────────────────────────────────────────────

describe('Executor.apply()', () => {
  it('calls adapter.setParam with targetValue', async () => {
    const exec = new Executor();
    const plan = makePlan();
    const adapter = makeAdapter({ craftingFee: 1.0 });

    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    expect(adapter.setParam).toHaveBeenCalledWith('craftingFee', 1.15, plan.scope);
  });

  it('stamps appliedAt on the plan', async () => {
    const exec = new Executor();
    const plan = makePlan();
    const adapter = makeAdapter({ craftingFee: 1.0 });

    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    expect(plan.appliedAt).toBe(100); // diagnosis.tick
  });

  it('tracks active plans', async () => {
    const exec = new Executor();
    const p1 = makePlan({ id: 'plan_a', parameter: 'feeA' });
    const p2 = makePlan({ id: 'plan_b', parameter: 'feeB' });
    const adapter = makeAdapter();

    await exec.apply(p1, adapter, { feeA: 1.0, feeB: 1.0 });
    await exec.apply(p2, adapter, { feeA: 1.0, feeB: 1.0 });

    expect(exec.getActivePlans()).toHaveLength(2);
  });

  it('uses currentParams value as originalValue when parameter exists', async () => {
    const exec = new Executor();
    const plan = makePlan({ parameter: 'miningYield', currentValue: 2.0 });
    const adapter = makeAdapter({ miningYield: 1.5 });

    await exec.apply(plan, adapter, { miningYield: 1.5 });

    // After a rollback-below breach, should restore to 1.5 (from currentParams), not 2.0
    const metrics = withMetric(emptyMetrics(120), 'avgSatisfaction', 20); // below 30
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1);
    expect(adapter.calls.at(-1)).toEqual({ key: 'miningYield', value: 1.5 });
  });

  it('falls back to plan.currentValue when parameter missing from currentParams', async () => {
    const exec = new Executor();
    const plan = makePlan({ parameter: 'missing', currentValue: 9.9 });
    const adapter = makeAdapter();

    await exec.apply(plan, adapter, {}); // no currentParams for 'missing'

    const metrics = withMetric(emptyMetrics(120), 'avgSatisfaction', 20);
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1);
    expect(adapter.calls.at(-1)).toEqual({ key: 'missing', value: 9.9 });
  });
});

// ─── checkRollbacks() — not yet ready ────────────────────────────────────────

describe('Executor.checkRollbacks() — not yet ready', () => {
  it('keeps plan active when tick < checkAfterTick', async () => {
    const exec = new Executor();
    const plan = makePlan({
      rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 30, checkAfterTick: 200 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    const metrics = withMetric(emptyMetrics(150), 'avgSatisfaction', 10); // below threshold but not ready
    const { rolledBack, settled } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(0);
    expect(settled).toHaveLength(0);
    expect(exec.getActivePlans()).toHaveLength(1);
  });
});

// ─── checkRollbacks() — rollback triggered ───────────────────────────────────

describe('Executor.checkRollbacks() — rollback triggered', () => {
  it('rolls back when metric goes below threshold', async () => {
    const exec = new Executor();
    const plan = makePlan({
      parameter: 'craftingFee',
      rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 30, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    const metrics = withMetric(emptyMetrics(120), 'avgSatisfaction', 25); // 25 < 30 → rollback
    const { rolledBack, settled } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1);
    expect(rolledBack[0].id).toBe('plan_test');
    expect(settled).toHaveLength(0);
    expect(exec.getActivePlans()).toHaveLength(0);
  });

  it('rolls back when metric goes above threshold (direction: above)', async () => {
    const exec = new Executor();
    const plan = makePlan({
      parameter: 'inflationRate',
      rollbackCondition: { metric: 'giniCoefficient', direction: 'above', threshold: 0.6, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ inflationRate: 1.0 });
    await exec.apply(plan, adapter, { inflationRate: 1.0 });

    const metrics = withMetric(emptyMetrics(120), 'giniCoefficient', 0.75); // 0.75 > 0.6 → rollback
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1);
  });

  it('does NOT roll back when metric stays healthy (below → not violated)', async () => {
    const exec = new Executor();
    const plan = makePlan({
      rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 30, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    const metrics = withMetric(emptyMetrics(120), 'avgSatisfaction', 55); // 55 > 30 → healthy
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(0);
  });
});

// ─── checkRollbacks() — settlement ───────────────────────────────────────────

describe('Executor.checkRollbacks() — settlement', () => {
  it('settles a plan past its check window without rollback', async () => {
    const exec = new Executor();
    const plan = makePlan({
      rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 30, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    // Tick 125: past checkAfterTick(110) + 10 = 120
    const metrics = withMetric(emptyMetrics(125), 'avgSatisfaction', 55);
    const { rolledBack, settled } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(0);
    expect(settled).toHaveLength(1);
    expect(exec.getActivePlans()).toHaveLength(0);
  });

  it('settles a plan that hits the hard TTL (maxActiveTicks)', async () => {
    const exec = new Executor(50); // small TTL
    const plan = makePlan({
      rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 30, checkAfterTick: 9999 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    // appliedAt = 100 (diagnosis.tick), TTL = 50, so at tick 151 it should be evicted
    const metrics = withMetric(emptyMetrics(151), 'avgSatisfaction', 10);
    const { settled } = await exec.checkRollbacks(metrics, adapter);

    expect(settled).toHaveLength(1);
    expect(exec.getActivePlans()).toHaveLength(0);
  });
});

// ─── NaN fail-safe ────────────────────────────────────────────────────────────

describe('Executor — NaN fail-safe rollback', () => {
  it('triggers rollback when metric path resolves to NaN (unresolvable path)', async () => {
    const exec = new Executor();
    const plan = makePlan({
      parameter: 'miningYield',
      rollbackCondition: { metric: 'nonexistent.deep.path', direction: 'below', threshold: 30, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ miningYield: 1.0 });
    await exec.apply(plan, adapter, { miningYield: 1.0 });

    const metrics = emptyMetrics(120); // 'nonexistent.deep.path' → NaN
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1); // fail-safe: rollback on unresolvable metric
  });

  it('resolves dotted metric paths correctly (e.g. poolSizes.primary)', async () => {
    const exec = new Executor();
    const plan = makePlan({
      rollbackCondition: { metric: 'poolSizes.primary', direction: 'above', threshold: 500, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    const metrics = {
      ...emptyMetrics(120),
      poolSizes: { primary: { gold: 800 } } as unknown as Record<string, Record<string, number>>,
    } as EconomyMetrics;

    // poolSizes.primary resolves to an object, not a number → NaN → rollback
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);
    expect(rolledBack).toHaveLength(1); // object is not a number → NaN fail-safe
  });
});

// ─── Prototype pollution guard ────────────────────────────────────────────────

describe('Executor — prototype pollution guard', () => {
  it('returns NaN (and triggers rollback) for __proto__ metric path', async () => {
    const exec = new Executor();
    const plan = makePlan({
      rollbackCondition: { metric: '__proto__', direction: 'below', threshold: 30, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    const metrics = emptyMetrics(120);
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1); // blocked → NaN → rollback
  });

  it('returns NaN (and triggers rollback) for constructor metric path', async () => {
    const exec = new Executor();
    const plan = makePlan({
      rollbackCondition: { metric: 'constructor', direction: 'below', threshold: 30, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ craftingFee: 1.0 });
    await exec.apply(plan, adapter, { craftingFee: 1.0 });

    const metrics = emptyMetrics(120);
    const { rolledBack } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1);
  });
});

// ─── Multiple plans ───────────────────────────────────────────────────────────

describe('Executor — multiple active plans', () => {
  it('independently rolls back only the failing plan', async () => {
    const exec = new Executor();
    const goodPlan = makePlan({
      id: 'plan_good',
      parameter: 'feeA',
      rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 30, checkAfterTick: 110 },
    });
    const badPlan = makePlan({
      id: 'plan_bad',
      parameter: 'feeB',
      rollbackCondition: { metric: 'velocity', direction: 'below', threshold: 5, checkAfterTick: 110 },
    });
    const adapter = makeAdapter({ feeA: 1.0, feeB: 1.0 });

    await exec.apply(goodPlan, adapter, { feeA: 1.0, feeB: 1.0 });
    await exec.apply(badPlan, adapter, { feeA: 1.0, feeB: 1.0 });

    // avgSatisfaction=50 (good, no rollback), velocity=2 (bad, rollback)
    const metrics = {
      ...emptyMetrics(120),
      avgSatisfaction: 50,
      velocity: 2,
    } as EconomyMetrics;

    const { rolledBack, settled } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(1);
    expect(rolledBack[0].id).toBe('plan_bad');
    expect(settled).toHaveLength(0);
    expect(exec.getActivePlans()).toHaveLength(1);
    expect(exec.getActivePlans()[0].id).toBe('plan_good');
  });

  it('settles all plans when all pass check window', async () => {
    const exec = new Executor();
    const p1 = makePlan({ id: 'p1', parameter: 'feeA', rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 30, checkAfterTick: 110 } });
    const p2 = makePlan({ id: 'p2', parameter: 'feeB', rollbackCondition: { metric: 'velocity', direction: 'below', threshold: 5, checkAfterTick: 110 } });
    const adapter = makeAdapter({ feeA: 1.0, feeB: 1.0 });

    await exec.apply(p1, adapter, { feeA: 1.0, feeB: 1.0 });
    await exec.apply(p2, adapter, { feeA: 1.0, feeB: 1.0 });

    const metrics = {
      ...emptyMetrics(130), // past 110 + 10 = 120
      avgSatisfaction: 60,
      velocity: 10,
    } as EconomyMetrics;

    const { rolledBack, settled } = await exec.checkRollbacks(metrics, adapter);

    expect(rolledBack).toHaveLength(0);
    expect(settled).toHaveLength(2);
    expect(exec.getActivePlans()).toHaveLength(0);
  });
});
