/**
 * AgentE.llmCooldown.test.ts
 *
 * Tests for the AgentE-level LLM rate-limiting added in PR #14 (v1.8.2).
 *
 * NARRATION_COOLDOWN_TICKS  = 50 — narrator fires at most once per 50 ticks
 * EXPLANATION_COOLDOWN_TICKS = 20 — explainer fires at most once per 20 ticks
 *
 * AnomalyInterpreter has its own internal cooldown (10 ticks) and is tested
 * separately in llm.test.ts. This file covers the AgentE.tick() guards.
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentE } from '../src/AgentE.js';
import type { EconomyAdapter, EconomyState, LLMProvider, ParameterDefinition } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Economy state with extreme imbalance — reliably triggers principle violations. */
function makeState(tick: number): EconomyState {
  return {
    tick,
    roles: ['consumer', 'producer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 1000 }, a2: { gold: 50 } },
    agentRoles: { a1: 'producer', a2: 'consumer' },
    agentInventories: { a1: { itemA: 10 }, a2: { itemA: 0 } },
    agentSatisfaction: { a1: 80, a2: 30 },
    marketPrices: { gold: { itemA: 10 } },
    // 50 mint transactions → triggers supply inflation violations
    recentTransactions: Array.from({ length: 50 }, (_, i) => ({
      type: 'mint' as const,
      actor: 'a1',
      currency: 'gold',
      amount: 500,
      timestamp: tick - i,
    })),
  };
}

function makeAdapter(tick: number): EconomyAdapter {
  return {
    getState: () => makeState(tick),
    setParam: vi.fn(),
  };
}

function mockLLMProvider(): LLMProvider & { complete: ReturnType<typeof vi.fn> } {
  return {
    complete: vi.fn().mockResolvedValue(
      'NARRATION: Supply inflation detected.\nCONTEXT: Faucets outpacing sinks.',
    ),
  };
}

/**
 * Parameters that match the violations triggered by makeState().
 * Required so the Planner can produce plans → explanation fires.
 */
const TEST_PARAMETERS: ParameterDefinition[] = [
  { key: 'baseReward', type: 'reward', flowImpact: 'faucet', currentValue: 100 },
  { key: 'baseCost', type: 'cost', flowImpact: 'sink', currentValue: 50 },
  { key: 'baseFee', type: 'fee', flowImpact: 'sink', scope: { tags: ['transaction'] }, currentValue: 10 },
  { key: 'baseYield', type: 'yield', flowImpact: 'faucet', currentValue: 5 },
];

/** Let fire-and-forget LLM promises settle. */
const flush = () => new Promise(r => setTimeout(r, 50));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentE — narration cooldown (NARRATION_COOLDOWN_TICKS = 50)', () => {
  it('fires narration on the first eligible tick', async () => {
    const adapter = makeAdapter(100);
    const provider = mockLLMProvider();

    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      llm: { provider, features: { planExplanation: false, anomalyInterpretation: false } },
    });

    agent.connect(adapter).start();

    await agent.tick(makeState(100));
    await flush();

    // The imbalanced state triggers violations → narrator must be called
    expect(provider.complete).toHaveBeenCalled();
  });

  it('does not fire narration again within 50 ticks of the last call', async () => {
    const adapter = makeAdapter(100);
    const provider = mockLLMProvider();

    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      llm: { provider, features: { planExplanation: false, anomalyInterpretation: false } },
    });

    agent.connect(adapter).start();

    // Tick 100 — first narration fires
    await agent.tick(makeState(100));
    await flush();
    const callsAfterTick100 = provider.complete.mock.calls.length;
    expect(callsAfterTick100).toBeGreaterThanOrEqual(1);

    // Ticks 101–149 — all within cooldown window (100 + 50 = 150 is next eligible)
    for (let t = 101; t < 150; t++) {
      await agent.tick(makeState(t));
    }
    await flush();

    // Provider should not have been called any more times during the cooldown window
    expect(provider.complete.mock.calls.length).toBe(callsAfterTick100);
  });

  it('fires narration again after cooldown expires (tick >= lastNarrationTick + 50)', async () => {
    const adapter = makeAdapter(100);
    const provider = mockLLMProvider();

    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      llm: { provider, features: { planExplanation: false, anomalyInterpretation: false } },
    });

    agent.connect(adapter).start();

    // Tick 100 — first narration fires
    await agent.tick(makeState(100));
    await flush();
    const callsAfterFirst = provider.complete.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

    // Tick 150 — cooldown expired, narration should fire again
    await agent.tick(makeState(150));
    await flush();

    expect(provider.complete.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe('AgentE — explanation cooldown (EXPLANATION_COOLDOWN_TICKS = 20)', () => {
  it('fires explanation on the first eligible tick', async () => {
    const provider = mockLLMProvider();
    provider.complete.mockResolvedValue(
      'EXPLANATION: Reducing faucet.\nOUTCOME: Supply stabilizes.\nRISKS: Overcorrection.',
    );

    const adapter = makeAdapter(100);
    const explanationEvents: unknown[] = [];
    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      cooldownTicks: 1,
      settlementWindowTicks: 1,
      parameters: TEST_PARAMETERS,
      llm: { provider, features: { diagnosisNarration: false, anomalyInterpretation: false } },
    });

    agent.on('explanation', (e: unknown) => explanationEvents.push(e));
    agent.connect(adapter).start();

    await agent.tick(makeState(100));
    await flush();

    expect(explanationEvents.length).toBe(1);
  });

  it('does not fire explanation again within 20 ticks of the last call', async () => {
    const provider = mockLLMProvider();
    provider.complete.mockResolvedValue(
      'EXPLANATION: Reducing faucet.\nOUTCOME: Supply stabilizes.\nRISKS: Overcorrection.',
    );

    const adapter = makeAdapter(100);
    const explanationEvents: unknown[] = [];
    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      cooldownTicks: 1,
      settlementWindowTicks: 1,
      parameters: TEST_PARAMETERS,
      llm: { provider, features: { diagnosisNarration: false, anomalyInterpretation: false } },
    });

    agent.on('explanation', (e: unknown) => explanationEvents.push(e));
    agent.connect(adapter).start();

    // Tick 100 — first explanation fires
    await agent.tick(makeState(100));
    await flush();
    expect(explanationEvents.length).toBe(1);

    // Ticks 101–119 — within cooldown
    for (let t = 101; t < 120; t++) {
      await agent.tick(makeState(t));
    }
    await flush();

    // No additional explanation calls within cooldown window
    expect(explanationEvents.length).toBe(1);
  });

  it('fires explanation again after cooldown expires (tick >= lastExplanationTick + 20)', async () => {
    const provider = mockLLMProvider();
    provider.complete.mockResolvedValue(
      'EXPLANATION: Reducing faucet.\nOUTCOME: Supply stabilizes.\nRISKS: Overcorrection.',
    );

    const adapter = makeAdapter(100);
    const explanationEvents: unknown[] = [];
    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      cooldownTicks: 1,
      settlementWindowTicks: 1,
      parameters: TEST_PARAMETERS,
      llm: { provider, features: { diagnosisNarration: false, anomalyInterpretation: false } },
    });

    agent.on('explanation', (e: unknown) => explanationEvents.push(e));
    agent.connect(adapter).start();

    // Tick 100 — first explanation fires
    await agent.tick(makeState(100));
    await flush();
    expect(explanationEvents.length).toBe(1);

    // Tick 120 — cooldown expired, explanation should fire again
    await agent.tick(makeState(120));
    await flush();

    expect(explanationEvents.length).toBe(2);
  });
});

describe('AgentE — LLM cooldown isolation', () => {
  it('narration and explanation cooldowns are independent', async () => {
    // Narration cooldown = 50, explanation cooldown = 20
    // Over 60 ticks: narration can fire at most 2x (tick 100, 150)
    // explanation can fire at most 3x (tick 100, 120, 140)
    const provider = mockLLMProvider();
    const adapter = makeAdapter(100);

    const narrationFired: number[] = [];
    const explanationFired: number[] = [];

    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      cooldownTicks: 1,
      settlementWindowTicks: 1,
      parameters: TEST_PARAMETERS,
      llm: { provider, features: { anomalyInterpretation: false } },
    });

    agent.on('narration', () => narrationFired.push(narrationFired.length));
    agent.on('explanation', () => explanationFired.push(explanationFired.length));

    agent.connect(adapter).start();

    // Run 60 ticks
    for (let t = 100; t < 160; t++) {
      await agent.tick(makeState(t));
    }
    await flush();

    // Both must have fired (state reliably triggers violations)
    expect(narrationFired.length).toBeGreaterThanOrEqual(1);
    expect(explanationFired.length).toBeGreaterThanOrEqual(1);

    // Explanation has a shorter cooldown (20 vs 50), so it must fire more often
    expect(explanationFired.length).toBeGreaterThan(narrationFired.length);
  });

  it('no LLM calls when no provider is configured (existing behavior preserved)', async () => {
    const adapter = makeAdapter(100);
    const agent = new AgentE({
      adapter,
      gracePeriod: 0,
      checkInterval: 1,
      // No llm field
    });

    const events: unknown[] = [];
    agent.on('narration', (e: unknown) => events.push(e));
    agent.on('explanation', (e: unknown) => events.push(e));
    agent.on('anomaly', (e: unknown) => events.push(e));

    agent.connect(adapter).start();
    for (let t = 100; t < 200; t++) {
      await agent.tick(makeState(t));
    }
    await flush();

    expect(events).toHaveLength(0);
  });
});
