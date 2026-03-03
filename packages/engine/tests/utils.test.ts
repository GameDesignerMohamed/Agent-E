import { describe, it, expect } from 'vitest';
import { findWorstSystem } from '../src/utils.js';
import { emptyMetrics } from '../src/types.js';

describe('findWorstSystem', () => {
  it('returns the system with the highest score', () => {
    const m = {
      ...emptyMetrics(50),
      systems: ['trading', 'crafting', 'staking'],
      flowBySystem: { trading: 100, crafting: 10, staking: 50 },
    };
    const result = findWorstSystem(m, (sys, met) => met.flowBySystem[sys] ?? 0);
    expect(result).toBeDefined();
    expect(result!.system).toBe('trading');
    expect(result!.score).toBe(100);
  });

  it('returns undefined when no systems', () => {
    const m = { ...emptyMetrics(50), systems: [] };
    const result = findWorstSystem(m, () => 1);
    expect(result).toBeUndefined();
  });

  it('respects tolerancePercent', () => {
    const m = {
      ...emptyMetrics(50),
      systems: ['a', 'b', 'c'],
      flowBySystem: { a: 10, b: 11, c: 12 }, // close together
    };
    // 50% tolerance — worst (12) only exceeds avg (11) by 9%, below 50%
    const result = findWorstSystem(m, (sys, met) => met.flowBySystem[sys] ?? 0, 50);
    expect(result).toBeUndefined();
  });

  it('returns result when excess exceeds tolerancePercent', () => {
    const m = {
      ...emptyMetrics(50),
      systems: ['a', 'b'],
      flowBySystem: { a: 1, b: 100 }, // b dominates
    };
    const result = findWorstSystem(m, (sys, met) => met.flowBySystem[sys] ?? 0, 50);
    expect(result).toBeDefined();
    expect(result!.system).toBe('b');
  });

  it('handles single system (no tolerance check needed)', () => {
    const m = {
      ...emptyMetrics(50),
      systems: ['only'],
      flowBySystem: { only: 42 },
    };
    const result = findWorstSystem(m, (sys, met) => met.flowBySystem[sys] ?? 0);
    expect(result).toBeDefined();
    expect(result!.system).toBe('only');
    expect(result!.score).toBe(42);
  });

  it('handles zero average without dividing by zero', () => {
    const m = {
      ...emptyMetrics(50),
      systems: ['a', 'b'],
      flowBySystem: { a: 0, b: 0 },
    };
    const result = findWorstSystem(m, (sys, met) => met.flowBySystem[sys] ?? 0, 10);
    expect(result).toBeDefined(); // avg=0 case returns immediately
    expect(result!.score).toBe(0);
  });
});
