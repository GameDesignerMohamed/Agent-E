import { describe, it, expect } from 'vitest';
import { DecisionLog } from '../src/DecisionLog.js';
import { emptyMetrics } from '../src/types.js';
import type { Diagnosis, ActionPlan, DecisionResult } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function stubDiagnosis(principleId: string, tick: number): Diagnosis {
  return {
    principle: {
      id: principleId,
      name: `Principle ${principleId}`,
      category: 'currency',
      description: 'test',
      check: () => ({ violated: false }),
    },
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

function stubPlan(parameter: string, tick: number): ActionPlan {
  return {
    id: `plan_${tick}`,
    diagnosis: stubDiagnosis('P1', tick),
    parameter,
    currentValue: 1,
    targetValue: 1.1,
    maxChangePercent: 0.15,
    cooldownTicks: 15,
    rollbackCondition: {
      metric: 'avgSatisfaction',
      direction: 'below',
      threshold: 50,
      checkAfterTick: tick + 20,
    },
    simulationResult: {
      proposedAction: { parameterType: 'cost', direction: 'increase', reasoning: 'test' },
      iterations: 100,
      forwardTicks: 20,
      outcomes: {
        p10: emptyMetrics(),
        p50: emptyMetrics(),
        p90: emptyMetrics(),
        mean: emptyMetrics(),
      },
      netImprovement: true,
      noNewProblems: true,
      confidenceInterval: [50, 70],
      estimatedEffectTick: tick + 15,
      overshootRisk: 0.1,
    },
    estimatedLag: 15,
  };
}

/** Build a log with N entries, returns the log and captured entry IDs. */
function buildLog(
  entries: Array<{ principleId: string; parameter: string; result: DecisionResult; tick: number }>,
): { log: DecisionLog; ids: string[] } {
  const log = new DecisionLog(1000);
  const ids: string[] = [];
  for (const e of entries) {
    const entry = log.record(
      stubDiagnosis(e.principleId, e.tick),
      stubPlan(e.parameter, e.tick),
      e.result,
      emptyMetrics(e.tick),
    );
    ids.push(entry.id);
  }
  return { log, ids };
}

// ── query() filtering ─────────────────────────────────────────────────────────

describe('DecisionLog.query() — filtering', () => {
  it('returns all entries when no filter supplied', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'P2', parameter: 'price', result: 'skipped_cooldown', tick: 2 },
      { principleId: 'P3', parameter: 'supply', result: 'rolled_back', tick: 3 },
    ]);
    expect(log.query()).toHaveLength(3);
  });

  it('filters by since (inclusive)', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'P2', parameter: 'cost', result: 'applied', tick: 5 },
      { principleId: 'P3', parameter: 'cost', result: 'applied', tick: 10 },
    ]);
    const results = log.query({ since: 5 });
    expect(results.map(e => e.tick)).toEqual([5, 10]);
  });

  it('filters by until (inclusive)', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'P2', parameter: 'cost', result: 'applied', tick: 5 },
      { principleId: 'P3', parameter: 'cost', result: 'applied', tick: 10 },
    ]);
    const results = log.query({ until: 5 });
    expect(results.map(e => e.tick)).toEqual([1, 5]);
  });

  it('filters by since+until range', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'P2', parameter: 'cost', result: 'applied', tick: 5 },
      { principleId: 'P3', parameter: 'cost', result: 'applied', tick: 8 },
      { principleId: 'P4', parameter: 'cost', result: 'applied', tick: 12 },
    ]);
    const results = log.query({ since: 5, until: 8 });
    expect(results.map(e => e.tick)).toEqual([5, 8]);
  });

  it('filters by issue (principle id)', () => {
    const { log } = buildLog([
      { principleId: 'inflation', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'deflation', parameter: 'cost', result: 'applied', tick: 2 },
      { principleId: 'inflation', parameter: 'supply', result: 'applied', tick: 3 },
    ]);
    const results = log.query({ issue: 'inflation' });
    expect(results).toHaveLength(2);
    expect(results.every(e => e.diagnosis.principle.id === 'inflation')).toBe(true);
  });

  it('filters by parameter', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'P2', parameter: 'price', result: 'applied', tick: 2 },
      { principleId: 'P3', parameter: 'cost', result: 'applied', tick: 3 },
    ]);
    const results = log.query({ parameter: 'cost' });
    expect(results).toHaveLength(2);
    expect(results.every(e => e.plan.parameter === 'cost')).toBe(true);
  });

  it('filters by result', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'P2', parameter: 'cost', result: 'skipped_cooldown', tick: 2 },
      { principleId: 'P3', parameter: 'cost', result: 'skipped_override', tick: 3 },
      { principleId: 'P4', parameter: 'cost', result: 'skipped_override', tick: 4 },
    ]);
    const results = log.query({ result: 'skipped_override' });
    expect(results).toHaveLength(2);
    expect(results.every(e => e.result === 'skipped_override')).toBe(true);
  });

  it('returns empty array when no entries match filter', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
    ]);
    expect(log.query({ result: 'rolled_back' })).toHaveLength(0);
  });

  it('combines multiple filters (AND logic)', () => {
    const { log } = buildLog([
      { principleId: 'inflation', parameter: 'cost', result: 'applied', tick: 5 },
      { principleId: 'inflation', parameter: 'price', result: 'applied', tick: 6 },
      { principleId: 'deflation', parameter: 'cost', result: 'applied', tick: 7 },
    ]);
    // Only tick=5 satisfies all three filters
    const results = log.query({ issue: 'inflation', parameter: 'cost', result: 'applied' });
    expect(results).toHaveLength(1);
    expect(results[0]!.tick).toBe(5);
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('DecisionLog.getById()', () => {
  it('returns the correct entry by id', () => {
    const { log, ids } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
      { principleId: 'P2', parameter: 'price', result: 'skipped_cooldown', tick: 2 },
    ]);
    const entry = log.getById(ids[1]!);
    expect(entry).toBeDefined();
    expect(entry!.tick).toBe(2);
    expect(entry!.plan.parameter).toBe('price');
  });

  it('returns undefined for a non-existent id', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
    ]);
    expect(log.getById('nonexistent_id')).toBeUndefined();
  });

  it('getById still works after entries have been evicted by trim', () => {
    const log = new DecisionLog(5);
    const ids: string[] = [];
    // Insert enough to trigger trim (> 7.5 entries = 8)
    for (let i = 1; i <= 9; i++) {
      const entry = log.record(
        stubDiagnosis('P1', i),
        stubPlan('cost', i),
        'applied',
        emptyMetrics(i),
      );
      ids.push(entry.id);
    }
    // After trim, only latest 5 remain — early entries should be gone
    expect(log.getById(ids[0]!)).toBeUndefined();   // evicted
    expect(log.getById(ids[8]!)).toBeDefined();      // still present
  });
});

// ── updateResult() ────────────────────────────────────────────────────────────

describe('DecisionLog.updateResult()', () => {
  it('returns true and mutates the entry result', () => {
    const { log, ids } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'skipped_override', tick: 1 },
    ]);
    const ok = log.updateResult(ids[0]!, 'applied');
    expect(ok).toBe(true);
    expect(log.getById(ids[0]!)!.result).toBe('applied');
  });

  it('updates reasoning when provided', () => {
    const { log, ids } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'skipped_override', tick: 1 },
    ]);
    log.updateResult(ids[0]!, 'rejected', 'human rejected via dashboard');
    const entry = log.getById(ids[0]!)!;
    expect(entry.result).toBe('rejected');
    expect(entry.reasoning).toBe('human rejected via dashboard');
  });

  it('preserves existing reasoning when no reasoning arg is given', () => {
    const { log, ids } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'skipped_override', tick: 1 },
    ]);
    const originalReasoning = log.getById(ids[0]!)!.reasoning;
    log.updateResult(ids[0]!, 'applied');
    expect(log.getById(ids[0]!)!.reasoning).toBe(originalReasoning);
  });

  it('returns false for a non-existent id', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
    ]);
    expect(log.updateResult('ghost_id', 'rejected')).toBe(false);
  });

  it('updated entry is reflected in subsequent query() calls', () => {
    const { log, ids } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'skipped_override', tick: 1 },
      { principleId: 'P2', parameter: 'cost', result: 'skipped_override', tick: 2 },
    ]);
    // Approve the first one
    log.updateResult(ids[0]!, 'applied');

    const stillPending = log.query({ result: 'skipped_override' });
    expect(stillPending).toHaveLength(1);
    expect(stillPending[0]!.tick).toBe(2);

    const nowApplied = log.query({ result: 'applied' });
    expect(nowApplied).toHaveLength(1);
    expect(nowApplied[0]!.tick).toBe(1);
  });
});

// ── recordSkip() ──────────────────────────────────────────────────────────────

describe('DecisionLog.recordSkip()', () => {
  it('records a skip entry with the given reasoning', () => {
    const log = new DecisionLog(100);
    const diagnosis = stubDiagnosis('P1', 5);
    log.recordSkip(diagnosis, 'skipped_cooldown', emptyMetrics(5), 'Still in cooldown window');

    const results = log.query({ result: 'skipped_cooldown' });
    expect(results).toHaveLength(1);
    expect(results[0]!.reasoning).toBe('Still in cooldown window');
    expect(results[0]!.tick).toBe(5);
  });

  it('skip entries appear in query() and latest() like regular records', () => {
    const log = new DecisionLog(100);
    const diagnosis = stubDiagnosis('inflation', 3);
    log.recordSkip(diagnosis, 'skipped_override', emptyMetrics(3), 'vetoed by beforeAction hook');

    const all = log.query();
    expect(all).toHaveLength(1);

    const recent = log.latest(1);
    expect(recent[0]!.result).toBe('skipped_override');
  });

  it('skip id prefix is "skip_" (not "decision_")', () => {
    const log = new DecisionLog(100);
    const diagnosis = stubDiagnosis('P1', 7);
    log.recordSkip(diagnosis, 'skipped_cooldown', emptyMetrics(7), 'reason');

    const all = log.query();
    expect(all[0]!.id).toMatch(/^skip_/);
  });
});

// ── export() ─────────────────────────────────────────────────────────────────

describe('DecisionLog.export()', () => {
  it('json format returns valid JSON array', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 1 },
    ]);
    const json = log.export('json');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].result).toBe('applied');
  });

  it('text format contains tick and result', () => {
    const { log } = buildLog([
      { principleId: 'P1', parameter: 'cost', result: 'applied', tick: 42 },
    ]);
    const text = log.export('text');
    expect(text).toContain('[Tick 42]');
    expect(text).toContain('APPLIED');
  });
});
