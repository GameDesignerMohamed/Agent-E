import { describe, it, expect } from 'vitest';
import {
  P55_ArbitrageThermometer,
  P59_GiftEconomyNoise,
} from '../../src/principles/measurement.js';
import { P56_ContentDropShock } from '../../src/principles/liveops.js';
import { P57_CombinatorialPriceSpace } from '../../src/principles/market-dynamics.js';
import { P58_NoNaturalNumeraire } from '../../src/principles/currency-flow.js';
import { P60_SurplusDisposalAsymmetry } from '../../src/principles/supply-chain.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

// ── P55 — Arbitrage Thermometer ──────────────────────────────────────────────

describe('P55 — Arbitrage Thermometer', () => {
  it('fires critical when arbitrageIndex exceeds critical threshold', () => {
    const m = { ...emptyMetrics(100), arbitrageIndex: 0.60 };
    const result = P55_ArbitrageThermometer.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBeGreaterThanOrEqual(6);
    }
  });

  it('fires warning when arbitrageIndex exceeds warning threshold', () => {
    const m = { ...emptyMetrics(100), arbitrageIndex: 0.40 };
    const result = P55_ArbitrageThermometer.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBeLessThanOrEqual(5);
    }
  });

  it('does not fire when arbitrageIndex is healthy', () => {
    const m = { ...emptyMetrics(100), arbitrageIndex: 0.20 };
    const result = P55_ArbitrageThermometer.check(m, t);
    expect(result.violated).toBe(false);
  });
});

// ── P56 — Content-Drop Shock ─────────────────────────────────────────────────

describe('P56 — Content-Drop Shock', () => {
  it('fires during cooldown when arbitrage exceeds post-drop max', () => {
    const m = {
      ...emptyMetrics(100),
      contentDropAge: 10,   // within cooldown window (default 30)
      arbitrageIndex: 0.50, // above postDropArbitrageMax (default 0.45)
    };
    const result = P56_ContentDropShock.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('does not fire after cooldown expires', () => {
    const m = {
      ...emptyMetrics(100),
      contentDropAge: 50,   // beyond cooldown window
      arbitrageIndex: 0.60,
    };
    const result = P56_ContentDropShock.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire during cooldown when arbitrage is acceptable', () => {
    const m = {
      ...emptyMetrics(100),
      contentDropAge: 10,
      arbitrageIndex: 0.30, // below postDropArbitrageMax
    };
    const result = P56_ContentDropShock.check(m, t);
    expect(result.violated).toBe(false);
  });
});

// ── P57 — Combinatorial Price Space ──────────────────────────────────────────

describe('P57 — Combinatorial Price Space', () => {
  it('fires when convergence rate is low with 4+ items', () => {
    const m = {
      ...emptyMetrics(100),
      prices: { iron: 10, wood: 50, cloth: 5, gems: 200 },
      priceVolatility: { iron: 0.40, wood: 0.35, cloth: 0.50, gems: 0.60 },
    };
    const result = P57_CombinatorialPriceSpace.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('does not fire with fewer than 4 items', () => {
    const m = {
      ...emptyMetrics(100),
      prices: { iron: 10, wood: 50 },
      priceVolatility: { iron: 0.40, wood: 0.35 },
    };
    const result = P57_CombinatorialPriceSpace.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire when all prices are stable', () => {
    const m = {
      ...emptyMetrics(100),
      prices: { iron: 10, wood: 12, cloth: 11, gems: 13 },
      priceVolatility: { iron: 0.05, wood: 0.03, cloth: 0.04, gems: 0.02 },
    };
    const result = P57_CombinatorialPriceSpace.check(m, t);
    expect(result.violated).toBe(false);
  });
});

// ── P58 — No Natural Numéraire ───────────────────────────────────────────────

describe('P58 — No Natural Numéraire', () => {
  it('fires when all items priced similarly in active barter economy', () => {
    const m = {
      ...emptyMetrics(100),
      currencies: ['credits'],
      pricesByCurrency: { credits: { iron: 10, wood: 11, cloth: 9, gems: 10.5 } },
      velocityByCurrency: { credits: 8 },
      totalSupplyByCurrency: { credits: 500 },
      // Keep aggregate for backward compat
      prices: { iron: 10, wood: 11, cloth: 9, gems: 10.5 },
      velocity: 8,
      totalSupply: 500,
    };
    const result = P58_NoNaturalNumeraire.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('does not fire when prices vary (numéraire likely exists)', () => {
    const m = {
      ...emptyMetrics(100),
      currencies: ['credits'],
      pricesByCurrency: { credits: { iron: 10, wood: 50, gems: 200 } },
      velocityByCurrency: { credits: 8 },
      totalSupplyByCurrency: { credits: 500 },
      prices: { iron: 10, wood: 50, gems: 200 },
      velocity: 8,
      totalSupply: 500,
    };
    const result = P58_NoNaturalNumeraire.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire with low velocity (not barter-heavy)', () => {
    const m = {
      ...emptyMetrics(100),
      currencies: ['credits'],
      pricesByCurrency: { credits: { iron: 10, wood: 11, cloth: 9 } },
      velocityByCurrency: { credits: 2 },
      totalSupplyByCurrency: { credits: 500 },
      prices: { iron: 10, wood: 11, cloth: 9 },
      velocity: 2,
      totalSupply: 500,
    };
    const result = P58_NoNaturalNumeraire.check(m, t);
    expect(result.violated).toBe(false);
  });
});

// ── P59 — Gift-Economy Noise ─────────────────────────────────────────────────

describe('P59 — Gift-Economy Noise', () => {
  it('fires when gift trade ratio exceeds threshold', () => {
    const m = { ...emptyMetrics(100), giftTradeRatio: 0.25 };
    const result = P59_GiftEconomyNoise.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('does not fire when gift ratio is low', () => {
    const m = { ...emptyMetrics(100), giftTradeRatio: 0.05 };
    const result = P59_GiftEconomyNoise.check(m, t);
    expect(result.violated).toBe(false);
  });
});

// ── P60 — Surplus Disposal Asymmetry ─────────────────────────────────────────

describe('P60 — Surplus Disposal Asymmetry', () => {
  it('fires when majority of trades are disposal', () => {
    const m = { ...emptyMetrics(100), disposalTradeRatio: 0.75 };
    const result = P60_SurplusDisposalAsymmetry.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.suggestedAction.parameter).toBe('productionCost');
    }
  });

  it('does not fire when disposal ratio is moderate', () => {
    const m = { ...emptyMetrics(100), disposalTradeRatio: 0.40 };
    const result = P60_SurplusDisposalAsymmetry.check(m, t);
    expect(result.violated).toBe(false);
  });
});
