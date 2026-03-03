import { describe, it, expect } from 'vitest';
import { validateEconomyState } from '../src/StateValidator.js';

function validMinimalState() {
  return {
    tick: 0,
    roles: ['Fighter'],
    resources: [],
    currencies: ['gold'],
    agentBalances: {},
    agentRoles: {},
    agentInventories: {},
    marketPrices: {},
    recentTransactions: [],
  };
}

describe('StateValidator', () => {
  it('valid minimal state passes', () => {
    const result = validateEconomyState(validMinimalState());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing currencies → error', () => {
    const state = validMinimalState() as Record<string, unknown>;
    delete state['currencies'];
    const result = validateEconomyState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'currencies')).toBe(true);
  });

  it('empty currencies → error', () => {
    const state = { ...validMinimalState(), currencies: [] };
    const result = validateEconomyState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'currencies')).toBe(true);
  });

  it('agentBalances with string value → error with path', () => {
    const state = {
      ...validMinimalState(),
      agentBalances: { agent1: { gold: 'not-a-number' } },
    };
    const result = validateEconomyState(state);
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.path === 'agentBalances.agent1.gold');
    expect(err).toBeDefined();
    expect(err!.expected).toContain('number');
  });

  it('agentRoles value not in roles → error', () => {
    const state = {
      ...validMinimalState(),
      agentRoles: { agent1: 'Wizard' },
    };
    const result = validateEconomyState(state);
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.path === 'agentRoles.agent1');
    expect(err).toBeDefined();
    expect(err!.message).toContain('Wizard');
  });

  it('tick negative → error', () => {
    const state = { ...validMinimalState(), tick: -1 };
    const result = validateEconomyState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'tick')).toBe(true);
  });

  it('marketPrices outer key not in currencies → error', () => {
    const state = {
      ...validMinimalState(),
      marketPrices: { gems: { ore: 10 } },
    };
    const result = validateEconomyState(state);
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.path === 'marketPrices.gems');
    expect(err).toBeDefined();
    expect(err!.message).toContain('gems');
  });

  it('agent with balance but no role → valid + warning', () => {
    const state = {
      ...validMinimalState(),
      agentBalances: { agent1: { gold: 100 } },
      agentRoles: {},
    };
    const result = validateEconomyState(state);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.message.includes('agent1'))).toBe(true);
  });

  it('optional fields absent → valid', () => {
    const state = validMinimalState();
    const result = validateEconomyState(state);
    expect(result.valid).toBe(true);
    // agentSatisfaction, poolSizes, customData are all absent — still valid
    expect(result.errors).toHaveLength(0);
  });

  it('poolSizes correct nested shape → valid', () => {
    const state = {
      ...validMinimalState(),
      poolSizes: {
        gold: { arena: 500, bank: 200 },
      },
    };
    const result = validateEconomyState(state);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
