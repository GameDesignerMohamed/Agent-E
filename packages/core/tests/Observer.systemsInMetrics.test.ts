import { describe, it, expect } from 'vitest';
import { Observer } from '../src/Observer.js';
import type { EconomyState } from '../src/types.js';

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

describe('Observer — systems/sources/sinks populated from state', () => {
  it('populates metrics.systems from state.systems', () => {
    const observer = new Observer();
    const state = makeState({
      systems: ['marketplace', 'staking', 'production'],
    });

    const metrics = observer.compute(state, []);

    expect(metrics.systems).toEqual(['marketplace', 'staking', 'production']);
  });

  it('populates metrics.sources from state.sources', () => {
    const observer = new Observer();
    const state = makeState({
      sources: ['daily_reward', 'quest_reward'],
    });

    const metrics = observer.compute(state, []);

    expect(metrics.sources).toEqual(['daily_reward', 'quest_reward']);
  });

  it('populates metrics.sinks from state.sinks', () => {
    const observer = new Observer();
    const state = makeState({
      sinks: ['upgrade_cost', 'tax'],
    });

    const metrics = observer.compute(state, []);

    expect(metrics.sinks).toEqual(['upgrade_cost', 'tax']);
  });

  it('defaults to empty arrays when state does not provide them', () => {
    const observer = new Observer();
    const state = makeState();
    // No systems, sources, sinks in state

    const metrics = observer.compute(state, []);

    expect(metrics.systems).toEqual([]);
    expect(metrics.sources).toEqual([]);
    expect(metrics.sinks).toEqual([]);
  });

  it('all three can be populated simultaneously', () => {
    const observer = new Observer();
    const state = makeState({
      systems: ['marketplace'],
      sources: ['daily_reward'],
      sinks: ['upgrade_cost'],
    });

    const metrics = observer.compute(state, []);

    expect(metrics.systems).toEqual(['marketplace']);
    expect(metrics.sources).toEqual(['daily_reward']);
    expect(metrics.sinks).toEqual(['upgrade_cost']);
  });
});
