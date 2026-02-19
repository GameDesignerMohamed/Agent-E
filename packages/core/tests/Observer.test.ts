import { describe, it, expect } from 'vitest';
import { Observer } from '../src/Observer.js';
import type { EconomyState } from '../src/types.js';

function makeState(overrides: Partial<EconomyState> = {}): EconomyState {
  return {
    tick: 10,
    roles: ['Fighter', 'Crafter', 'Gatherer'],
    resources: ['ore', 'weapons'],
    currency: 'gold',
    agentBalances: { a1: 100, a2: 50, a3: 200 },
    agentRoles: { a1: 'Fighter', a2: 'Crafter', a3: 'Gatherer' },
    agentInventories: {
      a1: { weapons: 1, ore: 0 },
      a2: { weapons: 2, ore: 4 },
      a3: { ore: 8, wood: 3 },
    },
    agentSatisfaction: { a1: 80, a2: 60, a3: 70 },
    marketPrices: { ore: 15, wood: 12, weapons: 50, potions: 40 },
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
    expect(m.roleShares['Fighter']).toBeCloseTo(1 / 3);
    expect(m.roleShares['Crafter']).toBeCloseTo(1 / 3);
    expect(m.roleShares['Gatherer']).toBeCloseTo(1 / 3);
  });

  it('computes supply by resource from inventories', () => {
    const obs = new Observer();
    const m = obs.compute(makeState(), []);
    // a1: weapons 1, a2: weapons 2 + ore 4, a3: ore 8 + wood 3
    expect(m.supplyByResource['weapons']).toBe(3); // 1 + 2
    expect(m.supplyByResource['ore']).toBe(12);    // 4 + 8
    expect(m.supplyByResource['wood']).toBe(3);
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
      const fighters = Object.values(state.agentRoles).filter(r => r === 'Fighter').length;
      const weapons = Object.values(state.agentInventories)
        .reduce((s, inv) => s + (inv['weapons'] ?? 0), 0);
      return fighters - weapons;
    });
    const m = obs.compute(makeState(), []);
    expect(m.custom['weaponDeficit']).toBe(1 - 3); // 1 fighter, 3 weapons
  });
});
