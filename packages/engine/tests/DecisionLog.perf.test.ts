import { describe, it, expect } from 'vitest';
import { DecisionLog } from '../src/DecisionLog.js';
import { emptyMetrics } from '../src/types.js';
import type { Diagnosis, ActionPlan, } from '../src/types.js';

function stubDiagnosis(tick: number): Diagnosis {
  return {
    principle: { id: 'P1', name: 'Test', category: 'currency', description: 'test', check: () => ({ violated: false }) },
    violation: {
      violated: true,
      severity: 5,
      evidence: {},
      suggestedAction: { parameterType: 'cost', direction: 'increase', reasoning: 'test' },
      confidence: 0.8,
    },
    tick,
  };
}

function stubPlan(tick: number): ActionPlan {
  return {
    id: `plan_${tick}`,
    diagnosis: stubDiagnosis(tick),
    parameter: 'testParam',
    currentValue: 1,
    targetValue: 1.1,
    maxChangePercent: 0.15,
    cooldownTicks: 15,
    rollbackCondition: { metric: 'avgSatisfaction', direction: 'below', threshold: 50, checkAfterTick: tick + 20 },
    simulationResult: {
      proposedAction: { parameterType: 'cost', direction: 'increase', reasoning: 'test' },
      iterations: 100,
      forwardTicks: 20,
      outcomes: { p10: emptyMetrics(), p50: emptyMetrics(), p90: emptyMetrics(), mean: emptyMetrics() },
      netImprovement: true,
      noNewProblems: true,
      confidenceInterval: [50, 70],
      estimatedEffectTick: tick + 15,
      overshootRisk: 0.1,
    },
    estimatedLag: 15,
  };
}

describe('DecisionLog — push + batch trim performance', () => {
  it('push() + batch trim: 10,000 inserts in < 1000ms', () => {
    const log = new DecisionLog(1000);
    const metrics = emptyMetrics(1);

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const m = { ...metrics, tick: i };
      log.record(stubDiagnosis(i), stubPlan(i), 'applied', m);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });

  it('entries are in chronological order (oldest first internally)', () => {
    const log = new DecisionLog(100);
    const metrics = emptyMetrics(1);

    log.record(stubDiagnosis(1), stubPlan(1), 'applied', { ...metrics, tick: 1 });
    log.record(stubDiagnosis(2), stubPlan(2), 'applied', { ...metrics, tick: 2 });
    log.record(stubDiagnosis(3), stubPlan(3), 'applied', { ...metrics, tick: 3 });

    // latest() returns newest first
    const recent = log.latest(3);
    expect(recent[0]!.tick).toBe(3);
    expect(recent[1]!.tick).toBe(2);
    expect(recent[2]!.tick).toBe(1);
  });

  it('getRecent(n) returns newest n entries', () => {
    const log = new DecisionLog(100);
    const metrics = emptyMetrics(1);

    for (let i = 1; i <= 10; i++) {
      log.record(stubDiagnosis(i), stubPlan(i), 'applied', { ...metrics, tick: i });
    }

    const recent = log.latest(3);
    expect(recent).toHaveLength(3);
    expect(recent[0]!.tick).toBe(10);
    expect(recent[1]!.tick).toBe(9);
    expect(recent[2]!.tick).toBe(8);
  });

  it('trim occurs when exceeding 1.5x maxEntries', () => {
    const log = new DecisionLog(10);
    const metrics = emptyMetrics(1);

    // Insert 16 entries (> 1.5x 10 = 15) — should trigger trim
    for (let i = 1; i <= 16; i++) {
      log.record(stubDiagnosis(i), stubPlan(i), 'applied', { ...metrics, tick: i });
    }

    // After trim, should have exactly 10 entries (sliced to maxEntries)
    const all = log.query();
    expect(all.length).toBe(10);

    // The most recent should still be accessible
    const recent = log.latest(1);
    expect(recent[0]!.tick).toBe(16);
  });
});
