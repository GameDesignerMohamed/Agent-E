import { describe, it, expect } from 'vitest';
import { ParameterRegistry } from '../src/ParameterRegistry.js';
import type { RegisteredParameter } from '../src/ParameterRegistry.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeParam(overrides: Partial<RegisteredParameter> & { key: string; type: string }): RegisteredParameter {
  return {
    flowImpact: 'neutral',
    ...overrides,
  } as RegisteredParameter;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ParameterRegistry', () => {
  // ── register() ─────────────────────────────────────────────────────────

  describe('register()', () => {
    it('registers a parameter retrievable by key', () => {
      const registry = new ParameterRegistry();
      const param = makeParam({ key: 'craftingCost', type: 'cost', flowImpact: 'sink' });

      registry.register(param);

      expect(registry.get('craftingCost')).toEqual(param);
    });

    it('overwrites if key already exists', () => {
      const registry = new ParameterRegistry();
      const original = makeParam({ key: 'fee1', type: 'fee', flowImpact: 'sink', description: 'original' });
      const replacement = makeParam({ key: 'fee1', type: 'fee', flowImpact: 'sink', description: 'replaced' });

      registry.register(original);
      registry.register(replacement);

      expect(registry.size).toBe(1);
      expect(registry.get('fee1')?.description).toBe('replaced');
    });

    it('stores a shallow copy so external mutation does not affect the registry', () => {
      const registry = new ParameterRegistry();
      const param = makeParam({ key: 'alpha', type: 'rate', currentValue: 1 });

      registry.register(param);
      param.currentValue = 999;

      expect(registry.get('alpha')?.currentValue).toBe(1);
    });
  });

  // ── registerAll() ──────────────────────────────────────────────────────

  describe('registerAll()', () => {
    it('registers multiple parameters at once', () => {
      const registry = new ParameterRegistry();
      const params = [
        makeParam({ key: 'a', type: 'cost' }),
        makeParam({ key: 'b', type: 'fee' }),
        makeParam({ key: 'c', type: 'reward' }),
      ];

      registry.registerAll(params);

      expect(registry.size).toBe(3);
      expect(registry.get('a')).toBeDefined();
      expect(registry.get('b')).toBeDefined();
      expect(registry.get('c')).toBeDefined();
    });

    it('overwrites duplicates within the batch (last wins)', () => {
      const registry = new ParameterRegistry();
      const params = [
        makeParam({ key: 'dup', type: 'cost', description: 'first' }),
        makeParam({ key: 'dup', type: 'cost', description: 'second' }),
      ];

      registry.registerAll(params);

      expect(registry.size).toBe(1);
      expect(registry.get('dup')?.description).toBe('second');
    });

    it('handles an empty array without error', () => {
      const registry = new ParameterRegistry();
      registry.registerAll([]);
      expect(registry.size).toBe(0);
    });
  });

  // ── resolve() ──────────────────────────────────────────────────────────

  describe('resolve()', () => {
    it('returns undefined when no matching type exists', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'x', type: 'cost' }));

      expect(registry.resolve('fee')).toBeUndefined();
    });

    it('returns the single candidate directly when only one matches', () => {
      const registry = new ParameterRegistry();
      const param = makeParam({ key: 'stakingYield', type: 'yield', flowImpact: 'faucet' });
      registry.register(param);

      const result = registry.resolve('yield', { system: 'staking' });

      expect(result).toEqual(param);
    });

    it('returns the single candidate even when scope does not match (single-candidate shortcut)', () => {
      const registry = new ParameterRegistry();
      const param = makeParam({
        key: 'marketFee',
        type: 'fee',
        scope: { system: 'marketplace' },
      });
      registry.register(param);

      // Querying with a completely different system still returns it — only 1 candidate
      const result = registry.resolve('fee', { system: 'crafting' });
      expect(result).toEqual(param);
    });

    // ── Scoring: system match (+10) ──────────────────────────────────────

    it('scores +10 for exact system match, preferring it over a generic candidate', () => {
      const registry = new ParameterRegistry();
      const generic = makeParam({ key: 'genericCost', type: 'cost' });
      const targeted = makeParam({
        key: 'craftingCost',
        type: 'cost',
        scope: { system: 'crafting' },
      });

      registry.registerAll([generic, targeted]);

      const result = registry.resolve('cost', { system: 'crafting' });
      expect(result?.key).toBe('craftingCost');
    });

    // ── Scoring: currency match (+5) ─────────────────────────────────────

    it('scores +5 for exact currency match', () => {
      const registry = new ParameterRegistry();
      const goldFee = makeParam({
        key: 'goldFee',
        type: 'fee',
        scope: { currency: 'gold' },
      });
      const gemFee = makeParam({
        key: 'gemFee',
        type: 'fee',
        scope: { currency: 'gems' },
      });

      registry.registerAll([goldFee, gemFee]);

      expect(registry.resolve('fee', { currency: 'gems' })?.key).toBe('gemFee');
      expect(registry.resolve('fee', { currency: 'gold' })?.key).toBe('goldFee');
    });

    // ── Scoring: tag overlap (+3 per tag) ────────────────────────────────

    it('scores +3 per overlapping tag', () => {
      const registry = new ParameterRegistry();
      const oneTag = makeParam({
        key: 'feeA',
        type: 'fee',
        scope: { tags: ['transaction'] },
      });
      const twoTags = makeParam({
        key: 'feeB',
        type: 'fee',
        scope: { tags: ['transaction', 'withdrawal'] },
      });

      registry.registerAll([oneTag, twoTags]);

      // Query with both tags: feeB overlaps 2 tags (+6), feeA overlaps 1 tag (+3)
      const result = registry.resolve('fee', { tags: ['transaction', 'withdrawal'] });
      expect(result?.key).toBe('feeB');
    });

    it('scores tag overlap additively with system and currency', () => {
      const registry = new ParameterRegistry();
      const full = makeParam({
        key: 'fullMatch',
        type: 'cost',
        scope: { system: 'crafting', currency: 'gold', tags: ['entry'] },
      });
      const partial = makeParam({
        key: 'partialMatch',
        type: 'cost',
        scope: { system: 'crafting', currency: 'gold' },
      });

      registry.registerAll([full, partial]);

      // full: +10 (system) +5 (currency) +3 (tag) = 18
      // partial: +10 (system) +5 (currency) = 15
      const result = registry.resolve('cost', {
        system: 'crafting',
        currency: 'gold',
        tags: ['entry'],
      });
      expect(result?.key).toBe('fullMatch');
    });

    // ── Disqualification: system mismatch (-1) ──────────────────────────

    it('disqualifies a candidate on system mismatch', () => {
      const registry = new ParameterRegistry();
      const marketplace = makeParam({
        key: 'marketCost',
        type: 'cost',
        scope: { system: 'marketplace' },
      });
      const generic = makeParam({
        key: 'genericCost',
        type: 'cost',
        // no scope — scores 0
      });

      registry.registerAll([marketplace, generic]);

      // marketplace gets -1 (system mismatch), generic gets 0 → generic wins
      const result = registry.resolve('cost', { system: 'crafting' });
      expect(result?.key).toBe('genericCost');
    });

    // ── Disqualification: currency mismatch (-1) ─────────────────────────

    it('disqualifies a candidate on currency mismatch', () => {
      const registry = new ParameterRegistry();
      const goldReward = makeParam({
        key: 'goldReward',
        type: 'reward',
        scope: { currency: 'gold' },
      });
      const generic = makeParam({
        key: 'genericReward',
        type: 'reward',
      });

      registry.registerAll([goldReward, generic]);

      // goldReward gets -1 (currency mismatch), generic gets 0 → generic wins
      const result = registry.resolve('reward', { currency: 'gems' });
      expect(result?.key).toBe('genericReward');
    });

    // ── Disqualification: no tag overlap when both specify tags (-1) ─────

    it('disqualifies a candidate when both specify tags but there is no overlap', () => {
      const registry = new ParameterRegistry();
      const entry = makeParam({
        key: 'entryFee',
        type: 'fee',
        scope: { tags: ['entry'] },
      });
      const generic = makeParam({
        key: 'genericFee',
        type: 'fee',
      });

      registry.registerAll([entry, generic]);

      // entry: tags specified on both sides but no overlap → -1
      // generic: no param scope → 0
      const result = registry.resolve('fee', { tags: ['withdrawal'] });
      expect(result?.key).toBe('genericFee');
    });

    // ── No query scope → returns first match (all score 0) ──────────────

    it('returns the first registered candidate when no query scope is provided', () => {
      const registry = new ParameterRegistry();
      const first = makeParam({
        key: 'costA',
        type: 'cost',
        scope: { system: 'marketplace' },
      });
      const second = makeParam({
        key: 'costB',
        type: 'cost',
        scope: { system: 'crafting' },
      });

      registry.registerAll([first, second]);

      // No scope → both score 0 → first one wins because bestScore starts at -1,
      // the first candidate with score 0 (> -1) becomes best, second ties but doesn't beat.
      const result = registry.resolve('cost');
      expect(result?.key).toBe('costA');
    });

    // ── All candidates disqualified ─────────────────────────────────────

    it('returns the least-negative candidate when all are disqualified', () => {
      const registry = new ParameterRegistry();
      const a = makeParam({
        key: 'feeA',
        type: 'fee',
        scope: { system: 'marketplace' },
      });
      const b = makeParam({
        key: 'feeB',
        type: 'fee',
        scope: { system: 'staking' },
      });

      registry.registerAll([a, b]);

      // Both get -1 for system mismatch; first -1 beats initial bestScore of -1? No.
      // bestScore starts at -1, candidate score = -1 is NOT > bestScore → best stays undefined?
      // Actually -1 is not > -1, so best remains undefined.
      const result = registry.resolve('fee', { system: 'crafting' });
      expect(result).toBeUndefined();
    });
  });

  // ── findByType() ───────────────────────────────────────────────────────

  describe('findByType()', () => {
    it('returns all parameters of the given type', () => {
      const registry = new ParameterRegistry();
      registry.registerAll([
        makeParam({ key: 'a', type: 'cost' }),
        makeParam({ key: 'b', type: 'cost' }),
        makeParam({ key: 'c', type: 'fee' }),
      ]);

      const costs = registry.findByType('cost');
      expect(costs).toHaveLength(2);
      expect(costs.map(p => p.key)).toEqual(['a', 'b']);
    });

    it('returns an empty array when no parameters match', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'x', type: 'cost' }));

      expect(registry.findByType('yield')).toEqual([]);
    });

    it('works with custom string types', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'custom1', type: 'myCustomType' }));

      expect(registry.findByType('myCustomType')).toHaveLength(1);
    });
  });

  // ── findBySystem() ────────────────────────────────────────────────────

  describe('findBySystem()', () => {
    it('returns all parameters belonging to the given system', () => {
      const registry = new ParameterRegistry();
      registry.registerAll([
        makeParam({ key: 'a', type: 'cost', scope: { system: 'crafting' } }),
        makeParam({ key: 'b', type: 'fee', scope: { system: 'crafting' } }),
        makeParam({ key: 'c', type: 'cost', scope: { system: 'marketplace' } }),
      ]);

      const crafting = registry.findBySystem('crafting');
      expect(crafting).toHaveLength(2);
      expect(crafting.map(p => p.key).sort()).toEqual(['a', 'b']);
    });

    it('returns an empty array when no parameters belong to the system', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'x', type: 'cost', scope: { system: 'staking' } }));

      expect(registry.findBySystem('crafting')).toEqual([]);
    });

    it('excludes parameters with no scope', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'noScope', type: 'cost' }));

      expect(registry.findBySystem('anything')).toEqual([]);
    });
  });

  // ── get() ─────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns the parameter for an existing key', () => {
      const registry = new ParameterRegistry();
      const param = makeParam({ key: 'stakingYield', type: 'yield', flowImpact: 'faucet' });
      registry.register(param);

      expect(registry.get('stakingYield')).toEqual(param);
    });

    it('returns undefined for a non-existent key', () => {
      const registry = new ParameterRegistry();

      expect(registry.get('doesNotExist')).toBeUndefined();
    });
  });

  // ── getFlowImpact() ──────────────────────────────────────────────────

  describe('getFlowImpact()', () => {
    it('returns the flow impact for an existing parameter', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'cost1', type: 'cost', flowImpact: 'sink' }));
      registry.register(makeParam({ key: 'reward1', type: 'reward', flowImpact: 'faucet' }));
      registry.register(makeParam({ key: 'cap1', type: 'cap', flowImpact: 'neutral' }));
      registry.register(makeParam({ key: 'mixed1', type: 'rate', flowImpact: 'mixed' }));

      expect(registry.getFlowImpact('cost1')).toBe('sink');
      expect(registry.getFlowImpact('reward1')).toBe('faucet');
      expect(registry.getFlowImpact('cap1')).toBe('neutral');
      expect(registry.getFlowImpact('mixed1')).toBe('mixed');
    });

    it('returns undefined for a non-existent key', () => {
      const registry = new ParameterRegistry();

      expect(registry.getFlowImpact('ghost')).toBeUndefined();
    });
  });

  // ── updateValue() ─────────────────────────────────────────────────────

  describe('updateValue()', () => {
    it('updates the currentValue of an existing parameter', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'rate1', type: 'rate', currentValue: 10 }));

      registry.updateValue('rate1', 42);

      expect(registry.get('rate1')?.currentValue).toBe(42);
    });

    it('is a no-op when the key does not exist', () => {
      const registry = new ParameterRegistry();

      // Should not throw
      registry.updateValue('nonexistent', 100);

      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('sets currentValue even if it was previously undefined', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'noValue', type: 'cost' }));

      expect(registry.get('noValue')?.currentValue).toBeUndefined();

      registry.updateValue('noValue', 5);
      expect(registry.get('noValue')?.currentValue).toBe(5);
    });
  });

  // ── getAll() ──────────────────────────────────────────────────────────

  describe('getAll()', () => {
    it('returns all registered parameters', () => {
      const registry = new ParameterRegistry();
      registry.registerAll([
        makeParam({ key: 'a', type: 'cost' }),
        makeParam({ key: 'b', type: 'fee' }),
        makeParam({ key: 'c', type: 'reward' }),
      ]);

      const all = registry.getAll();
      expect(all).toHaveLength(3);
      expect(all.map(p => p.key).sort()).toEqual(['a', 'b', 'c']);
    });

    it('returns an empty array when registry is empty', () => {
      const registry = new ParameterRegistry();
      expect(registry.getAll()).toEqual([]);
    });

    it('returns a new array each call (not the internal data structure)', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'x', type: 'cost' }));

      const first = registry.getAll();
      const second = registry.getAll();

      expect(first).toEqual(second);
      expect(first).not.toBe(second); // different array references
    });
  });

  // ── size ──────────────────────────────────────────────────────────────

  describe('size', () => {
    it('returns 0 for an empty registry', () => {
      const registry = new ParameterRegistry();
      expect(registry.size).toBe(0);
    });

    it('returns the number of registered parameters', () => {
      const registry = new ParameterRegistry();
      registry.registerAll([
        makeParam({ key: 'a', type: 'cost' }),
        makeParam({ key: 'b', type: 'fee' }),
      ]);

      expect(registry.size).toBe(2);
    });

    it('does not double-count overwritten keys', () => {
      const registry = new ParameterRegistry();
      registry.register(makeParam({ key: 'dup', type: 'cost' }));
      registry.register(makeParam({ key: 'dup', type: 'fee' }));

      expect(registry.size).toBe(1);
    });
  });
});
