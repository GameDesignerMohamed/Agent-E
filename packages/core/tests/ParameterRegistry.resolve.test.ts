import { describe, it, expect } from 'vitest';
import { ParameterRegistry } from '../src/ParameterRegistry.js';
import type { RegisteredParameter } from '../src/ParameterRegistry.js';

function makeParam(overrides: Partial<RegisteredParameter> & { key: string; type: string }): RegisteredParameter {
  return {
    flowImpact: 'neutral',
    ...overrides,
  } as RegisteredParameter;
}

describe('ParameterRegistry.resolve() — specificity scoring + priority tiebreaker', () => {
  // ── Specificity scoring ─────────────────────────────────────────────────

  it('prefers system+currency+tag match over system+currency only', () => {
    const registry = new ParameterRegistry();
    const full = makeParam({
      key: 'full',
      type: 'cost',
      scope: { system: 'crafting', currency: 'gold', tags: ['entry'] },
    });
    const partial = makeParam({
      key: 'partial',
      type: 'cost',
      scope: { system: 'crafting', currency: 'gold' },
    });

    registry.registerAll([partial, full]);

    const result = registry.resolve('cost', {
      system: 'crafting',
      currency: 'gold',
      tags: ['entry'],
    });
    // full: 10+5+3=18, partial: 10+5=15
    expect(result?.key).toBe('full');
  });

  it('system match (+10) outweighs currency+tag (+5+3=8)', () => {
    const registry = new ParameterRegistry();
    const sysOnly = makeParam({
      key: 'sysOnly',
      type: 'fee',
      scope: { system: 'marketplace' },
    });
    const curTag = makeParam({
      key: 'curTag',
      type: 'fee',
      scope: { currency: 'gold', tags: ['transaction'] },
    });

    registry.registerAll([sysOnly, curTag]);

    const result = registry.resolve('fee', {
      system: 'marketplace',
      currency: 'gold',
      tags: ['transaction'],
    });
    // sysOnly: 10, curTag: -Infinity (system not 'marketplace' — no system on param, so 0) + 5 + 3 = 8
    // Actually curTag has no system field so no system disqualification: score = 0 + 5 + 3 = 8
    // sysOnly: 10 + 0 + 0 = 10
    expect(result?.key).toBe('sysOnly');
  });

  it('disqualifies all → returns undefined', () => {
    const registry = new ParameterRegistry();
    const a = makeParam({
      key: 'a',
      type: 'fee',
      scope: { system: 'marketplace' },
    });
    const b = makeParam({
      key: 'b',
      type: 'fee',
      scope: { system: 'staking' },
    });

    registry.registerAll([a, b]);

    // Both disqualified: system mismatch
    const result = registry.resolve('fee', { system: 'crafting' });
    expect(result).toBeUndefined();
  });

  // ── Priority tiebreaker ─────────────────────────────────────────────────

  it('uses priority to break ties when specificity scores are equal', () => {
    const registry = new ParameterRegistry();
    const low = makeParam({
      key: 'lowPrio',
      type: 'cost',
      scope: { system: 'crafting' },
      priority: 1,
    });
    const high = makeParam({
      key: 'highPrio',
      type: 'cost',
      scope: { system: 'crafting' },
      priority: 10,
    });

    // Register low first, then high
    registry.registerAll([low, high]);

    const result = registry.resolve('cost', { system: 'crafting' });
    // Both score +10 (system match), but highPrio has priority 10 > 1
    expect(result?.key).toBe('highPrio');
  });

  it('registration order wins when priorities are also equal', () => {
    const registry = new ParameterRegistry();
    const first = makeParam({
      key: 'first',
      type: 'cost',
      scope: { system: 'crafting' },
      priority: 5,
    });
    const second = makeParam({
      key: 'second',
      type: 'cost',
      scope: { system: 'crafting' },
      priority: 5,
    });

    registry.registerAll([first, second]);

    const result = registry.resolve('cost', { system: 'crafting' });
    // Same score, same priority → first registered wins (strict >)
    expect(result?.key).toBe('first');
  });

  it('default priority is 0', () => {
    const registry = new ParameterRegistry();
    const noPrio = makeParam({
      key: 'noPrio',
      type: 'cost',
      scope: { system: 'crafting' },
    });
    const withPrio = makeParam({
      key: 'withPrio',
      type: 'cost',
      scope: { system: 'crafting' },
      priority: 1,
    });

    registry.registerAll([noPrio, withPrio]);

    const result = registry.resolve('cost', { system: 'crafting' });
    // noPrio: score=10, priority=0. withPrio: score=10, priority=1
    expect(result?.key).toBe('withPrio');
  });

  // ── New FlowImpact types ───────────────────────────────────────────────

  it('accepts friction and redistribution as valid FlowImpact values', () => {
    const registry = new ParameterRegistry();
    registry.register(makeParam({
      key: 'lockPeriod',
      type: 'penalty',
      flowImpact: 'friction',
    }));
    registry.register(makeParam({
      key: 'taxRedist',
      type: 'fee',
      flowImpact: 'redistribution',
    }));

    expect(registry.get('lockPeriod')?.flowImpact).toBe('friction');
    expect(registry.get('taxRedist')?.flowImpact).toBe('redistribution');
  });
});
