import { describe, it, expect } from 'vitest';
import {
  P12_OnePrimaryFaucet,
  P13_PotsAreZeroSumAndSelfRegulate,
  P14_TrackActualInjection,
  P15_PoolsNeedCapAndDecay,
  P16_WithdrawalPenaltyScales,
  P32_VelocityAboveSupply,
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

describe('P13 — Pots Self-Regulate', () => {
  it('fires when pool is draining for specific currency', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      poolSizesByCurrency: { arena: { gold: 30, gems: 500 } },
      populationByRole: { warrior: 10 },
    };
    const result = P13_PotsAreZeroSumAndSelfRegulate.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gold');
      expect(result.suggestedAction.scope?.currency).toBe('gold');
    }
  });

  it('does not fire when pools are healthy', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold'],
      poolSizesByCurrency: { arena: { gold: 500 } },
      populationByRole: { warrior: 10 },
    };
    const result = P13_PotsAreZeroSumAndSelfRegulate.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P14 — Track Actual Injection', () => {
  it('fires when supply growth rate exceeds 10% for one currency', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      faucetVolumeByCurrency: { gold: 100, gems: 5 },
      netFlowByCurrency: { gold: 60, gems: 1 },
      totalSupplyByCurrency: { gold: 500, gems: 500 },
    };
    const result = P14_TrackActualInjection.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gold');
      expect(result.suggestedAction.scope?.currency).toBe('gold');
    }
  });

  it('does not fire when supply growth is moderate', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold'],
      netFlowByCurrency: { gold: 10 },
      totalSupplyByCurrency: { gold: 500 },
    };
    const result = P14_TrackActualInjection.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P15 — Pools Need Cap + Decay', () => {
  it('fires when pool exceeds cap for one currency', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      poolSizesByCurrency: { bank: { gold: 100, gems: 5 } },
      totalSupplyByCurrency: { gold: 500, gems: 500 },
    };
    const result = P15_PoolsNeedCapAndDecay.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gold');
      expect(result.suggestedAction.scope?.currency).toBe('gold');
    }
  });

  it('does not fire when pool is within cap', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold'],
      poolSizesByCurrency: { bank: { gold: 10 } },
      totalSupplyByCurrency: { gold: 500 },
    };
    const result = P15_PoolsNeedCapAndDecay.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P16 — Withdrawal Penalty Scales', () => {
  it('fires when pool depleted despite significant staked value', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold'],
      poolSizesByCurrency: { vault: { gold: 5 } },
      totalSupplyByCurrency: { gold: 1000 },
    };
    const result = P16_WithdrawalPenaltyScales.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.suggestedAction.scope?.currency).toBe('gold');
    }
  });

  it('does not fire when pool has sufficient balance', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold'],
      poolSizesByCurrency: { vault: { gold: 200 } },
      totalSupplyByCurrency: { gold: 1000 },
    };
    const result = P16_WithdrawalPenaltyScales.check(m, t);
    expect(result.violated).toBe(false);
  });
});

describe('P32 — Velocity > Supply for Liquidity', () => {
  it('fires on stagnant currency when resources exist', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold', 'gems'],
      velocityByCurrency: { gold: 1, gems: 8 },
      totalSupplyByCurrency: { gold: 500, gems: 500 },
      supplyByResource: { iron: 15, wood: 10 },
    };
    const result = P32_VelocityAboveSupply.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['currency']).toBe('gold');
      expect(result.suggestedAction.scope?.currency).toBe('gold');
      expect(result.suggestedAction.direction).toBe('decrease');
    }
  });

  it('does not fire when velocity is adequate', () => {
    const m = {
      ...emptyMetrics(50),
      currencies: ['gold'],
      velocityByCurrency: { gold: 8 },
      totalSupplyByCurrency: { gold: 500 },
      supplyByResource: { iron: 15, wood: 10 },
    };
    const result = P32_VelocityAboveSupply.check(m, t);
    expect(result.violated).toBe(false);
  });
});
