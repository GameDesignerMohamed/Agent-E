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

describe('Observer — enter event classification', () => {
  // ── Global: enter IS a faucet ──────────────────────────────────────────

  it('enter adds to global faucetVolumeByCurrency (like mint)', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'enter', timestamp: 10, actor: 'a1', amount: 25 },
    ];

    const metrics = observer.compute(state, events);

    expect(metrics.faucetVolumeByCurrency['gold']).toBe(25);
    expect(metrics.faucetVolume).toBe(25);
    expect(metrics.netFlow).toBe(25);
  });

  it('enter + mint both counted in global faucet', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'enter', timestamp: 10, actor: 'a1', amount: 20 },
      { type: 'mint', timestamp: 10, actor: 'a2', amount: 30 },
    ];

    const metrics = observer.compute(state, events);

    expect(metrics.faucetVolumeByCurrency['gold']).toBe(50);
    expect(metrics.faucetVolume).toBe(50);
  });

  // ── Per-system: enter is NOT a faucet ──────────────────────────────────

  it('enter does NOT add to flowBySystem', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'enter', timestamp: 10, actor: 'a1', amount: 25, system: 'onboarding' },
    ];

    const metrics = observer.compute(state, events);

    // enter should not create flow for the system
    expect(metrics.flowBySystem['onboarding']).toBeUndefined();
    // But still counted in activity
    expect(metrics.activityBySystem['onboarding']).toBe(1);
    expect(metrics.participantsBySystem['onboarding']).toBe(1);
  });

  it('mint still adds to flowBySystem while enter does not', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'mint', timestamp: 10, actor: 'a1', amount: 50, system: 'marketplace' },
      { type: 'enter', timestamp: 10, actor: 'a2', amount: 30, system: 'marketplace' },
    ];

    const metrics = observer.compute(state, events);

    // Only mint counted: 50 (not 50+30=80)
    expect(metrics.flowBySystem['marketplace']).toBe(50);
    // Both counted in activity
    expect(metrics.activityBySystem['marketplace']).toBe(2);
  });

  // ── Per-source: enter is NOT a faucet ──────────────────────────────────

  it('enter does NOT add to flowBySource', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'enter', timestamp: 10, actor: 'a1', amount: 50, sourceOrSink: 'signup_bonus' },
    ];

    const metrics = observer.compute(state, events);

    expect(metrics.flowBySource['signup_bonus']).toBeUndefined();
  });

  it('mint still adds to flowBySource while enter does not', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'mint', timestamp: 10, actor: 'a1', amount: 40, sourceOrSink: 'daily_reward' },
      { type: 'enter', timestamp: 10, actor: 'a2', amount: 60, sourceOrSink: 'signup_bonus' },
    ];

    const metrics = observer.compute(state, events);

    expect(metrics.flowBySource['daily_reward']).toBe(40);
    expect(metrics.flowBySource['signup_bonus']).toBeUndefined();
    // Only daily_reward in sourceShare
    expect(metrics.sourceShare['daily_reward']).toBeCloseTo(1.0);
  });

  // ── Global classification still works ──────────────────────────────────

  it('enter without system/sourceOrSink still contributes to global aggregates', () => {
    const observer = new Observer();
    const state = makeState();
    const events: EconomicEvent[] = [
      { type: 'enter', timestamp: 10, actor: 'a1', amount: 100 },
    ];

    const metrics = observer.compute(state, events);

    expect(metrics.faucetVolume).toBe(100);
    expect(metrics.netFlow).toBe(100);
    expect(metrics.flowBySystem).toEqual({});
    expect(metrics.flowBySource).toEqual({});
  });
});
