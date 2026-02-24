import { describe, it, expect } from 'vitest';
import { ParameterRegistry } from '../src/ParameterRegistry.js';
import type { RegisteredParameter } from '../src/ParameterRegistry.js';

function makeParam(overrides: Partial<RegisteredParameter> & { key: string; type: string }): RegisteredParameter {
  return {
    flowImpact: 'neutral',
    ...overrides,
  } as RegisteredParameter;
}

describe('ParameterRegistry.validate()', () => {
  it('returns valid=true for an empty registry', () => {
    const registry = new ParameterRegistry();
    const result = registry.validate();
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=true for a well-configured registry', () => {
    const registry = new ParameterRegistry();
    registry.registerAll([
      makeParam({ key: 'craftingCost', type: 'cost', flowImpact: 'sink', scope: { system: 'crafting' } }),
      makeParam({ key: 'marketFee', type: 'fee', flowImpact: 'sink', scope: { system: 'marketplace' } }),
      makeParam({ key: 'miningReward', type: 'reward', flowImpact: 'faucet', scope: { system: 'mining' } }),
    ]);

    const result = registry.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error when multiple unscoped parameters share the same type', () => {
    const registry = new ParameterRegistry();
    registry.registerAll([
      makeParam({ key: 'costA', type: 'cost', flowImpact: 'sink' }),
      makeParam({ key: 'costB', type: 'cost', flowImpact: 'sink' }),
    ]);

    const result = registry.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Type 'cost'");
    expect(result.errors[0]).toContain('unscoped');
  });

  it('does not error when same type has scoped differentiation', () => {
    const registry = new ParameterRegistry();
    registry.registerAll([
      makeParam({ key: 'costA', type: 'cost', flowImpact: 'sink', scope: { system: 'crafting' } }),
      makeParam({ key: 'costB', type: 'cost', flowImpact: 'sink', scope: { system: 'marketplace' } }),
    ]);

    const result = registry.validate();
    expect(result.valid).toBe(true);
  });

  it('warns when a parameter has no flowImpact', () => {
    const registry = new ParameterRegistry();
    registry.register({
      key: 'mysterious',
      type: 'rate',
      flowImpact: undefined as never,
    });

    const result = registry.validate();
    // Warning, not error
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('mysterious');
  });

  it('returns the RegistryValidationResult interface correctly', () => {
    const registry = new ParameterRegistry();
    registry.register(makeParam({ key: 'x', type: 'cost', flowImpact: 'sink' }));

    const result = registry.validate();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
