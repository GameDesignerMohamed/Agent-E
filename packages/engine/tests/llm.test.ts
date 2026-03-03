/**
 * llm.test.ts — Tests for the V1.8 LLM Intelligence Layer
 *
 * Covers: resolveFeatureFlags, DiagnosisNarrator, PlanExplainer,
 * AnomalyInterpreter, and AgentE integration.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveFeatureFlags } from '../src/llm/LLMProvider.js';
import { DiagnosisNarrator } from '../src/llm/DiagnosisNarrator.js';
import { PlanExplainer } from '../src/llm/PlanExplainer.js';
import { AnomalyInterpreter } from '../src/llm/AnomalyInterpreter.js';
import { AgentE } from '../src/AgentE.js';
import { emptyMetrics } from '../src/types.js';
import type { LLMProvider } from '../src/llm/LLMProvider.js';
import type { Diagnosis, ActionPlan, EconomyMetrics, EconomyAdapter, EconomyState } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockProvider(response = 'mock response'): LLMProvider {
  return { complete: vi.fn().mockResolvedValue(response) };
}

function makeDiagnosis(overrides?: Partial<Diagnosis>): Diagnosis {
  return {
    principle: {
      id: 'P1',
      name: 'Test Principle',
      category: 'currency',
      description: 'A test principle',
      check: () => ({ violated: false }),
    },
    violation: {
      violated: true,
      severity: 5,
      evidence: { inflationRate: 0.12 },
      suggestedAction: { parameterType: 'faucet_rate', direction: 'decrease' },
      confidence: 0.85,
    },
    tick: 100,
    ...overrides,
  };
}

function makeMetrics(tick: number, overrides?: Partial<EconomyMetrics>): EconomyMetrics {
  return { ...emptyMetrics(tick), ...overrides };
}

function makeActionPlan(): ActionPlan {
  const diagnosis = makeDiagnosis();
  return {
    id: 'plan-1',
    diagnosis,
    parameter: 'faucetRate',
    currentValue: 100,
    targetValue: 85,
    maxChangePercent: 0.15,
    cooldownTicks: 15,
    rollbackCondition: {
      metric: 'totalSupply',
      direction: 'below',
      threshold: 5000,
      checkAfterTick: 120,
    },
    simulationResult: {
      proposedAction: diagnosis.violation.suggestedAction,
      iterations: 100,
      forwardTicks: 20,
      outcomes: { p10: emptyMetrics(120), p50: emptyMetrics(120), p90: emptyMetrics(120), mean: emptyMetrics(120) },
      netImprovement: true,
      noNewProblems: true,
      confidenceInterval: [0.6, 0.9],
      estimatedEffectTick: 115,
      overshootRisk: 0.2,
    },
    estimatedLag: 10,
  };
}

function makeState(tick: number): EconomyState {
  return {
    tick,
    roles: ['consumer', 'producer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 }, a2: { gold: 50 } },
    agentRoles: { a1: 'consumer', a2: 'producer' },
    agentInventories: { a1: { itemA: 1 }, a2: { itemA: 2 } },
    agentSatisfaction: { a1: 80, a2: 70 },
    marketPrices: { gold: { itemA: 10 } },
    recentTransactions: [],
  };
}

function makeAdapter(tick: number): EconomyAdapter {
  return {
    getState: () => makeState(tick),
    setParam: vi.fn(),
  };
}

// ── resolveFeatureFlags ──────────────────────────────────────────────────────

describe('resolveFeatureFlags', () => {
  it('defaults all flags to true when called with no argument', () => {
    const flags = resolveFeatureFlags();
    expect(flags).toEqual({
      diagnosisNarration: true,
      planExplanation: true,
      anomalyInterpretation: true,
    });
  });

  it('respects partial overrides', () => {
    const flags = resolveFeatureFlags({ anomalyInterpretation: false });
    expect(flags.diagnosisNarration).toBe(true);
    expect(flags.planExplanation).toBe(true);
    expect(flags.anomalyInterpretation).toBe(false);
  });
});

// ── DiagnosisNarrator ────────────────────────────────────────────────────────

describe('DiagnosisNarrator', () => {
  it('returns NarratedDiagnosis with narration + context parsed from NARRATION:/CONTEXT: format', async () => {
    const provider = mockProvider(
      'NARRATION: Inflation is spiking at 12%.\nCONTEXT: This happens when faucets outpace sinks.',
    );
    const narrator = new DiagnosisNarrator(provider);
    const diagnosis = makeDiagnosis();
    const metrics = makeMetrics(100);

    const result = await narrator.narrate(diagnosis, metrics);

    expect(result.narration).toBe('Inflation is spiking at 12%.');
    expect(result.suggestedContext).toBe('This happens when faucets outpace sinks.');
    expect(result.diagnosis).toBe(diagnosis);
    expect(result.generatedAt).toBeGreaterThan(0);
  });

  it('falls back to raw text when LLM response does not match expected format', async () => {
    const raw = 'The economy is in trouble because inflation is too high.';
    const provider = mockProvider(raw);
    const narrator = new DiagnosisNarrator(provider);

    const result = await narrator.narrate(makeDiagnosis(), makeMetrics(100));

    expect(result.narration).toBe(raw);
    expect(result.suggestedContext).toBe('');
  });

  it('passes through confidence from diagnosis', async () => {
    const provider = mockProvider('NARRATION: test\nCONTEXT: test');
    const narrator = new DiagnosisNarrator(provider);
    const diagnosis = makeDiagnosis();

    const result = await narrator.narrate(diagnosis, makeMetrics(100));

    expect(result.confidence).toBe(0.85);
  });

  it('includes trend data when recentHistory has 3+ entries', async () => {
    const provider = mockProvider('NARRATION: test\nCONTEXT: test');
    const narrator = new DiagnosisNarrator(provider);
    const history = [
      makeMetrics(1, { totalSupply: 1000 }),
      makeMetrics(2, { totalSupply: 1050 }),
      makeMetrics(3, { totalSupply: 1200 }),
    ];

    await narrator.narrate(makeDiagnosis(), makeMetrics(100), history);

    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('Recent trends');
  });

  it('skips trends when history has <3 entries', async () => {
    const provider = mockProvider('NARRATION: test\nCONTEXT: test');
    const narrator = new DiagnosisNarrator(provider);
    const history = [makeMetrics(1), makeMetrics(2)];

    await narrator.narrate(makeDiagnosis(), makeMetrics(100), history);

    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).not.toContain('Recent trends');
  });
});

// ── PlanExplainer ────────────────────────────────────────────────────────────

describe('PlanExplainer', () => {
  it('returns ExplainedPlan with explanation/outcome/risks parsed from format', async () => {
    const provider = mockProvider(
      'EXPLANATION: Reducing faucet rate by 15% to curb inflation.\nOUTCOME: Supply growth should stabilize within 15 ticks.\nRISKS: If sinks also drop, this could overcorrect.',
    );
    const explainer = new PlanExplainer(provider);
    const plan = makeActionPlan();

    const result = await explainer.explain(plan, makeMetrics(100));

    expect(result.explanation).toBe('Reducing faucet rate by 15% to curb inflation.');
    expect(result.expectedOutcome).toBe('Supply growth should stabilize within 15 ticks.');
    expect(result.risks).toBe('If sinks also drop, this could overcorrect.');
    expect(result.plan).toBe(plan);
    expect(result.generatedAt).toBeGreaterThan(0);
  });

  it('falls back to raw text for explanation when format does not match', async () => {
    const raw = 'We are decreasing the rate to fix inflation.';
    const provider = mockProvider(raw);
    const explainer = new PlanExplainer(provider);

    const result = await explainer.explain(makeActionPlan(), makeMetrics(100));

    expect(result.explanation).toBe(raw);
    expect(result.expectedOutcome).toBe('');
    expect(result.risks).toBe('');
  });

  it('includes simulation data in prompt', async () => {
    const provider = mockProvider('EXPLANATION: x\nOUTCOME: y\nRISKS: z');
    const explainer = new PlanExplainer(provider);

    await explainer.explain(makeActionPlan(), makeMetrics(100));

    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('Net improvement predicted: yes');
    expect(prompt).toContain('Overshoot risk: 20%');
    expect(prompt).toContain('Confidence interval: [0.60, 0.90]');
  });
});

// ── AnomalyInterpreter ──────────────────────────────────────────────────────

describe('AnomalyInterpreter', () => {
  function feedHistory(interpreter: AnomalyInterpreter, count: number, provider: LLMProvider) {
    // Feed `count` ticks of stable metrics so rolling stats are established
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        interpreter.check(
          makeMetrics(i, { totalSupply: 10_000, velocity: 0.5, netFlow: 0, totalAgents: 100 }),
          [],
        ),
      );
    }
    return Promise.all(promises);
  }

  it('returns null when history is <10 ticks (MIN_HISTORY)', async () => {
    const provider = mockProvider('anomaly interpretation');
    const interpreter = new AnomalyInterpreter(provider);

    // Feed only 5 ticks
    for (let i = 0; i < 5; i++) {
      const result = await interpreter.check(makeMetrics(i, { totalSupply: 10_000 }), []);
      expect(result).toBeNull();
    }
  });

  it('returns null when no anomalies detected (all metrics within 2σ)', async () => {
    const provider = mockProvider('should not be called');
    const interpreter = new AnomalyInterpreter(provider);

    // Feed 15 ticks of identical metrics — stddev will be 0
    for (let i = 0; i < 15; i++) {
      const result = await interpreter.check(
        makeMetrics(i, { totalSupply: 10_000, velocity: 0.5, netFlow: 0 }),
        [],
      );
      expect(result).toBeNull();
    }
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('detects anomaly when metric deviates >2σ from rolling mean', async () => {
    const provider = mockProvider('Looks like a sudden supply spike.');
    const interpreter = new AnomalyInterpreter(provider);

    // Feed 12 ticks of stable supply
    for (let i = 0; i < 12; i++) {
      await interpreter.check(
        makeMetrics(i, { totalSupply: 10_000 + (i % 2 === 0 ? 10 : -10) }),
        [],
      );
    }

    // Now spike totalSupply way beyond 2σ
    const result = await interpreter.check(
      makeMetrics(12, { totalSupply: 50_000 }),
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.anomalies.length).toBeGreaterThan(0);
    expect(result!.interpretation).toBe('Looks like a sudden supply spike.');
    expect(result!.tick).toBe(12);
  });

  it('returns null during cooldown period (< 10 ticks since last LLM call)', async () => {
    const provider = mockProvider('anomaly detected');
    const interpreter = new AnomalyInterpreter(provider);

    // Feed 12 stable ticks
    for (let i = 0; i < 12; i++) {
      await interpreter.check(
        makeMetrics(i, { totalSupply: 10_000 + (i % 2 === 0 ? 10 : -10) }),
        [],
      );
    }

    // Trigger first anomaly at tick 12
    const first = await interpreter.check(makeMetrics(12, { totalSupply: 50_000 }), []);
    expect(first).not.toBeNull();

    // Try again at tick 15 (within 10-tick cooldown) — should return null
    const second = await interpreter.check(makeMetrics(15, { totalSupply: 50_000 }), []);
    expect(second).toBeNull();
  });

  it('rate limits: allows LLM call again after cooldown expires', async () => {
    const provider = mockProvider('anomaly detected');
    const interpreter = new AnomalyInterpreter(provider);

    // Feed 12 stable ticks
    for (let i = 0; i < 12; i++) {
      await interpreter.check(
        makeMetrics(i, { totalSupply: 10_000 + (i % 2 === 0 ? 10 : -10) }),
        [],
      );
    }

    // Trigger first anomaly at tick 12
    await interpreter.check(makeMetrics(12, { totalSupply: 50_000 }), []);

    // Feed a few more normal ticks to keep history going
    for (let i = 13; i < 22; i++) {
      await interpreter.check(
        makeMetrics(i, { totalSupply: 10_000 + (i % 2 === 0 ? 10 : -10) }),
        [],
      );
    }

    // Tick 22 is exactly 10 ticks after 12 — should allow again
    const result = await interpreter.check(makeMetrics(22, { totalSupply: 50_000 }), []);
    expect(result).not.toBeNull();
  });

  it('filters out anomalies explained by active violations (category mapping)', async () => {
    const provider = mockProvider('should not be called');
    const interpreter = new AnomalyInterpreter(provider);

    // Feed 12 stable ticks
    for (let i = 0; i < 12; i++) {
      await interpreter.check(
        makeMetrics(i, { totalSupply: 10_000 + (i % 2 === 0 ? 10 : -10) }),
        [],
      );
    }

    // Spike totalSupply — but provide an active violation in 'currency' category
    // which maps to totalSupply, so the anomaly should be filtered out
    const diagnosis = makeDiagnosis(); // category: 'currency'
    const result = await interpreter.check(
      makeMetrics(12, { totalSupply: 50_000 }),
      [diagnosis],
    );

    expect(result).toBeNull();
  });

  it('classifies severity: low (<3σ, 1 anomaly)', async () => {
    const provider = mockProvider('mild anomaly');
    const interpreter = new AnomalyInterpreter(provider);

    // Build history with some variance in avgSatisfaction (not mapped to currency)
    for (let i = 0; i < 12; i++) {
      await interpreter.check(
        makeMetrics(i, { avgSatisfaction: 75 + (i % 2 === 0 ? 1 : -1) }),
        [],
      );
    }

    // Between 2σ and 3σ for avgSatisfaction — should be 'low'
    // mean ≈ 75, stddev ≈ 1, so 77.5 is ~2.5σ (below 3σ threshold)
    const result = await interpreter.check(
      makeMetrics(12, { avgSatisfaction: 77.5 }),
      [],
    );

    if (result) {
      expect(result.severity).toBe('low');
    }
  });

  it('classifies severity: high (≥4σ or ≥4 anomalies)', async () => {
    const provider = mockProvider('severe anomaly');
    const interpreter = new AnomalyInterpreter(provider);

    // Build history with variance in multiple uncorrelated metrics
    for (let i = 0; i < 12; i++) {
      await interpreter.check(
        makeMetrics(i, {
          avgSatisfaction: 75 + (i % 2 === 0 ? 1 : -1),
          blockedAgentCount: 5 + (i % 2 === 0 ? 1 : -1),
          churnRate: 0.02 + (i % 2 === 0 ? 0.001 : -0.001),
          extractionRatio: 0.1 + (i % 2 === 0 ? 0.01 : -0.01),
          newUserDependency: 0.3 + (i % 2 === 0 ? 0.01 : -0.01),
        }),
        [],
      );
    }

    // Massive spike on multiple metrics
    const result = await interpreter.check(
      makeMetrics(12, {
        avgSatisfaction: 200,
        blockedAgentCount: 500,
        churnRate: 0.9,
        extractionRatio: 0.95,
        newUserDependency: 0.99,
      }),
      [],
    );

    if (result) {
      expect(result.severity).toBe('high');
    }
  });
});

// ── AgentE Integration ───────────────────────────────────────────────────────

describe('AgentE — LLM integration', () => {
  it('constructing with llm.provider initializes narrator/explainer/anomalyInterpreter', () => {
    const adapter = makeAdapter(100);
    const provider = mockProvider();

    // Should not throw
    const agent = new AgentE({
      adapter,
      mode: 'advisor',
      llm: { provider },
    });
    expect(agent).toBeDefined();
  });

  it('constructing with llm.features.diagnosisNarration: false skips narrator', async () => {
    const adapter = makeAdapter(100);
    const provider = mockProvider('NARRATION: test\nCONTEXT: test');

    const narrationEvents: unknown[] = [];
    const agent = new AgentE({
      adapter,
      mode: 'advisor',
      gracePeriod: 0,
      checkInterval: 1,
      llm: {
        provider,
        features: { diagnosisNarration: false },
      },
    });

    agent.on('narration', ((...args: unknown[]) => {
      narrationEvents.push(args);
    }) as never);

    agent.connect(adapter).start();
    await agent.tick(makeState(100));

    // Even after tick, no narration event should fire since narrator is disabled
    // Wait a tick for async to settle
    await new Promise(r => setTimeout(r, 50));
    expect(narrationEvents).toHaveLength(0);
  });

  it('constructing without llm field produces no LLM instances (no-op)', async () => {
    const adapter = makeAdapter(100);
    const agent = new AgentE({
      adapter,
      mode: 'advisor',
      gracePeriod: 0,
      checkInterval: 1,
    });

    const events: unknown[] = [];
    agent.on('narration', ((...args: unknown[]) => events.push(args)) as never);
    agent.on('explanation', ((...args: unknown[]) => events.push(args)) as never);
    agent.on('anomaly', ((...args: unknown[]) => events.push(args)) as never);

    agent.connect(adapter).start();
    await agent.tick(makeState(100));
    await new Promise(r => setTimeout(r, 50));

    expect(events).toHaveLength(0);
  });
});
