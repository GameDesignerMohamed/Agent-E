import { describe, it, expect } from 'vitest';
import {
  P12_OnePrimaryFaucet,
} from '../../src/principles/currency-flow.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('P12 — One Primary Faucet', () => {
  it('fires on inflationary currency and includes currency in action', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      netFlowByCurrency: { gold: 15, gems: 0 },
      faucetVolumeByCurrency: { gold: 20, gems: 0 },
      sinkVolumeByCurrency: { gold: 5, gems: 0 },
    };
    const result = P12_OnePrimaryFaucet.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gold');
      expect(result.suggestedAction.scope?.currency).toBe('gold');
      expect(result.suggestedAction.direction).toBe('increase');
    }
  });

  it('fires on deflationary currency', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      netFlowByCurrency: { gold: 0, gems: -15 },
      faucetVolumeByCurrency: { gold: 5, gems: 0 },
      sinkVolumeByCurrency: { gold: 5, gems: 15 },
    };
    const result = P12_OnePrimaryFaucet.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gems');
      expect(result.suggestedAction.scope?.currency).toBe('gems');
      expect(result.suggestedAction.direction).toBe('decrease');
    }
  });

  it('does not fire when all currencies have balanced flow', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      netFlowByCurrency: { gold: 3, gems: -2 },
    };
    const result = P12_OnePrimaryFaucet.check(m, t);
    expect(result.violated).toBe(false);
  });
});
