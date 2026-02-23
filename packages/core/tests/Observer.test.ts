import { describe, it, expect } from 'vitest';
import { Observer } from '../src/Observer.js';
import type { EconomyState } from '../src/types.js';

function makeState(overrides: Partial<EconomyState> = {}): EconomyState {
  return {
    tick: 10,
    roles: ['consumer', 'producer', 'extractor'],
    resources: ['materialA', 'goodA'],
    currency: 'gold',
    agentBalances: { a1: 100, a2: 50, a3: 200 },
    agentRoles: { a1: 'consumer', a2: 'producer', a3: 'extractor' },
    agentInventories: {
      a1: { goodA: 1, materialA: 0 },
      a2: { goodA: 2, materialA: 4 },
      a3: { materialA: 8, materialB: 3 },
    },
    agentSatisfaction: { a1: 80, a2: 60, a3: 70 },
    marketPrices: { materialA: 15, materialB: 12, goodA: 50, goodB: 40 },
    recentTransactions: [],
    ...overrides,
  };
}

describe('Observer', () => {
  it('computes total supply correctly', () => {
    const obs = new Observer();
    const m = obs.compute(makeState(), []);
    expect(m.totalSupply).toBe(350); // 100 + 50 + 200
  });

  it('computes mean and median balance', () => {
    const obs = new Observer();
    const m = obs.compute(makeState(), []);
    expect(m.meanBalance).toBeCloseTo(350 / 3);
    expect(m.medianBalance).toBe(100); // sorted: 50, 100, 200
  });

  it('computes gini coefficient (3 agents: 50, 100, 200)', () => {
    const obs = new Observer();
    const m = obs.compute(makeState(), []);
    // With balances [50, 100, 200], Gini should be >0 and <1
    expect(m.giniCoefficient).toBeGreaterThan(0);
    expect(m.giniCoefficient).toBeLessThan(1);
  });

  it('computes role shares correctly', () => {
    const obs = new Observer();
    const m = obs.compute(makeState(), []);
    expect(m.roleShares['consumer']).toBeCloseTo(1 / 3);
    expect(m.roleShares['producer']).toBeCloseTo(1 / 3);
    expect(m.roleShares['extractor']).toBeCloseTo(1 / 3);
  });

  it('computes supply by resource from inventories', () => {
    const obs = new Observer();
    const m = obs.compute(makeState(), []);
    // a1: goodA 1, a2: goodA 2 + materialA 4, a3: materialA 8 + materialB 3
    expect(m.supplyByResource['goodA']).toBe(3); // 1 + 2
    expect(m.supplyByResource['materialA']).toBe(12);    // 4 + 8
    expect(m.supplyByResource['materialB']).toBe(3);
  });

  it('computes avg satisfaction', () => {
    const obs = new Observer();
    const m = obs.compute(makeState(), []);
    expect(m.avgSatisfaction).toBeCloseTo((80 + 60 + 70) / 3);
  });

  it('mint events increase faucet volume', () => {
    const obs = new Observer();
    const events = [
      { type: 'mint' as const, timestamp: 10, actor: 'economy', amount: 100 },
      { type: 'mint' as const, timestamp: 10, actor: 'economy', amount: 50 },
    ];
    const m = obs.compute(makeState(), events);
    expect(m.faucetVolume).toBe(150);
  });

  it('burn events increase sink volume', () => {
    const obs = new Observer();
    const events = [
      { type: 'burn' as const, timestamp: 10, actor: 'economy', amount: 30 },
    ];
    const m = obs.compute(makeState(), events);
    expect(m.sinkVolume).toBe(30);
    expect(m.netFlow).toBe(-30);
  });

  it('supports custom metrics', () => {
    const obs = new Observer();
    obs.registerCustomMetric('weaponDeficit', (state) => {
      const consumers = Object.values(state.agentRoles).filter(r => r === 'consumer').length;
      const goodA = Object.values(state.agentInventories)
        .reduce((s, inv) => s + (inv['goodA'] ?? 0), 0);
      return consumers - goodA;
    });
    const m = obs.compute(makeState(), []);
    expect(m.custom['weaponDeficit']).toBe(1 - 3); // 1 consumer, 3 goodA
  });
});
