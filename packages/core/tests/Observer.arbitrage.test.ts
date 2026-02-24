import { describe, it, expect } from 'vitest';
import { Observer } from '../src/Observer.js';
import type { EconomyState } from '../src/types.js';

function makeState(prices: Record<string, number>): EconomyState {
  return {
    tick: 10,
    roles: ['consumer'],
    resources: Object.keys(prices),
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 } },
    agentRoles: { a1: 'consumer' },
    agentInventories: { a1: {} },
    agentSatisfaction: { a1: 80 },
    marketPrices: { gold: prices },
    recentTransactions: [],
  };
}

describe('Observer — O(n) arbitrage index', () => {
  it('arbitrage index computed with log-price std dev', () => {
    const observer = new Observer();
    // Prices: 10, 100 → log(10)=2.3, log(100)=4.6 → mean=3.45, variance=1.32, stddev=1.15 → capped at 1
    const state = makeState({ sword: 10, shield: 100 });
    const metrics = observer.compute(state, []);

    expect(metrics.arbitrageIndexByCurrency['gold']).toBeGreaterThan(0);
    expect(metrics.arbitrageIndexByCurrency['gold']).toBeLessThanOrEqual(1);
  });

  it('arbitrage index = 0 when fewer than 2 positive prices', () => {
    const observer = new Observer();
    const state = makeState({ sword: 10 });
    const metrics = observer.compute(state, []);

    expect(metrics.arbitrageIndexByCurrency['gold']).toBe(0);
  });

  it('arbitrage index = 0 when all prices equal', () => {
    const observer = new Observer();
    const state = makeState({ sword: 50, shield: 50, potion: 50 });
    const metrics = observer.compute(state, []);

    // All same price → stddev of log prices = 0
    expect(metrics.arbitrageIndexByCurrency['gold']).toBe(0);
  });

  it('arbitrage index increases with price dispersion', () => {
    const observer = new Observer();

    // Low dispersion
    const lowState = makeState({ a: 10, b: 12, c: 11 });
    const lowMetrics = observer.compute(lowState, []);
    const lowArb = lowMetrics.arbitrageIndexByCurrency['gold']!;

    // High dispersion — need fresh observer to avoid previousMetrics crossover
    const observer2 = new Observer();
    const highState = makeState({ a: 1, b: 100, c: 1000 });
    const highMetrics = observer2.compute(highState, []);
    const highArb = highMetrics.arbitrageIndexByCurrency['gold']!;

    expect(highArb).toBeGreaterThan(lowArb);
  });

  it('performance: 1000 resources in < 50ms', () => {
    const observer = new Observer();
    const prices: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      prices[`resource_${i}`] = Math.random() * 100 + 1;
    }
    const state = makeState(prices);

    const start = performance.now();
    observer.compute(state, []);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
