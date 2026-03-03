import { describe, it, expect } from 'vitest';
import { Observer } from '../src/Observer.js';
import type { EconomyState, EconomicEvent } from '../src/types.js';

function makeState(overrides: Partial<EconomyState> = {}): EconomyState {
  return {
    tick: 10,
    roles: ['consumer', 'producer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 }, a2: { gold: 50 } },
    agentRoles: { a1: 'consumer', a2: 'producer' },
    agentInventories: { a1: { itemA: 1 }, a2: { itemA: 2 } },
    agentSatisfaction: { a1: 80, a2: 70 },
    marketPrices: { gold: { itemA: 10 } },
    recentTransactions: [],
    ...overrides,
  };
}

describe('Observer — numeric stability', () => {
  it('tapSinkRatio capped at 100 when sink is 0', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'mint', timestamp: 10, actor: 'a1', amount: 500 },
    ];

    const metrics = observer.compute(state, events);

    // Faucet > 0, sink = 0 → should be capped at 100, not Infinity
    expect(metrics.tapSinkRatioByCurrency['gold']).toBe(100);
    expect(metrics.tapSinkRatio).toBe(100);
    expect(Number.isFinite(metrics.tapSinkRatio)).toBe(true);
  });

  it('tapSinkRatio computed correctly when sink > 0', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'mint', timestamp: 10, actor: 'a1', amount: 100 },
      { type: 'burn', timestamp: 10, actor: 'a2', amount: 50 },
    ];

    const metrics = observer.compute(state, events);

    expect(metrics.tapSinkRatioByCurrency['gold']).toBe(2); // 100/50
    expect(metrics.tapSinkRatio).toBe(2);
  });

  it('tapSinkRatio capped even when ratio > 100', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'mint', timestamp: 10, actor: 'a1', amount: 10000 },
      { type: 'burn', timestamp: 10, actor: 'a2', amount: 1 },
    ];

    const metrics = observer.compute(state, events);

    // 10000/1 = 10000, should be capped at 100
    expect(metrics.tapSinkRatioByCurrency['gold']).toBe(100);
  });

  it('extractionRatio initializes to 0, not NaN', () => {
    const observer = new Observer();
    const metrics = observer.compute(makeState(), []);

    expect(metrics.extractionRatio).toBe(0);
    expect(Number.isNaN(metrics.extractionRatio)).toBe(false);
  });

  it('newUserDependency initializes to 0, not NaN', () => {
    const observer = new Observer();
    const metrics = observer.compute(makeState(), []);

    expect(metrics.newUserDependency).toBe(0);
    expect(Number.isNaN(metrics.newUserDependency)).toBe(false);
  });

  it('eventCompletionRate initializes to 0, not NaN', () => {
    const observer = new Observer();
    const metrics = observer.compute(makeState(), []);

    expect(metrics.eventCompletionRate).toBe(0);
    expect(Number.isNaN(metrics.eventCompletionRate)).toBe(false);
  });

  it('Gini coefficient clamped to [0, 1]', () => {
    const observer = new Observer();
    // Extreme wealth inequality
    const state = makeState({
      agentBalances: {
        a1: { gold: 1000000 },
        a2: { gold: 0 },
        a3: { gold: 0 },
        a4: { gold: 0 },
      },
    });

    const metrics = observer.compute(state, []);

    expect(metrics.giniCoefficient).toBeGreaterThanOrEqual(0);
    expect(metrics.giniCoefficient).toBeLessThanOrEqual(1);
  });

  it('no Infinity values in metrics after observe()', () => {
    const observer = new Observer();
    const events: EconomicEvent[] = [
      { type: 'mint', timestamp: 10, actor: 'a1', amount: 999 },
    ];
    const metrics = observer.compute(makeState(), events);

    // Check all numeric fields for Infinity
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `metrics.${key} should be finite but is ${value}`).toBe(true);
      }
    }
  });

  it('no NaN values in core metrics after observe()', () => {
    const observer = new Observer();
    const metrics = observer.compute(makeState(), []);

    const coreNumericKeys = [
      'totalSupply', 'netFlow', 'velocity', 'inflationRate',
      'faucetVolume', 'sinkVolume', 'tapSinkRatio', 'giniCoefficient',
      'avgSatisfaction', 'extractionRatio', 'newUserDependency',
      'smokeTestRatio', 'currencyInsulation', 'eventCompletionRate',
    ] as const;

    for (const key of coreNumericKeys) {
      expect(Number.isNaN(metrics[key]), `metrics.${key} should not be NaN`).toBe(false);
    }
  });
});
