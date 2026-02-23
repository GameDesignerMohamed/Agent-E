// P31, P41: Measurement Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P31_AnchorValueTracking: Principle = {
  id: 'P31',
  name: 'Anchor Value Tracking',
  category: 'measurement',
  description:
    '1 period of activity = X currency = Y resources. If this ratio drifts, the economy ' +
    'is inflating or deflating in ways that participants feel before metrics catch it. ' +
    'Track the ratio constantly.',
  check(metrics, _thresholds): PrincipleResult {
    const { anchorRatioDrift, inflationRate } = metrics;

    if (Math.abs(anchorRatioDrift) > 0.25) {
      return {
        violated: true,
        severity: 5,
        evidence: { anchorRatioDrift, inflationRate },
        suggestedAction: {
          parameter: 'productionCost',
          direction: anchorRatioDrift > 0 ? 'increase' : 'decrease',
          magnitude: 0.10,
          reasoning:
            `Anchor ratio has drifted ${(anchorRatioDrift * 100).toFixed(0)}% from baseline. ` +
            'Time-to-value for participants is changing. Adjust production costs to restore.',
        },
        confidence: 0.65,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const P41_MultiResolutionMonitoring: Principle = {
  id: 'P41',
  name: 'Multi-Resolution Monitoring',
  category: 'measurement',
  description:
    'Single-resolution monitoring misses crises that develop slowly (coarse only) ' +
    'or explode suddenly (fine only). Monitor at fine (per-tick), medium ' +
    '(per-10-ticks), and coarse (per-100-ticks) simultaneously.',
  check(metrics, _thresholds): PrincipleResult {
    // This principle is enforced structurally by MetricStore.
    // As a diagnostic: if gini is climbing but satisfaction is still high,
    // a coarse-only monitor would miss the early warning.
    const { giniCoefficient, avgSatisfaction } = metrics;

    if (giniCoefficient > 0.50 && avgSatisfaction > 65) {
      // Gini rising but agents still happy — coarse monitor would not trigger.
      // Fine monitor catches it early.
      return {
        violated: true,
        severity: 4,
        evidence: { giniCoefficient, avgSatisfaction },
        suggestedAction: {
          parameter: 'transactionFee',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Gini ${giniCoefficient.toFixed(2)} rising despite okay satisfaction. ` +
            'Early warning from fine-resolution monitoring. ' +
            'Raise trading fees to slow wealth concentration before it hurts satisfaction.',
        },
        confidence: 0.70,
        estimatedLag: 20,
      };
    }

    return { violated: false };
  },
};

export const P55_ArbitrageThermometer: Principle = {
  id: 'P55',
  name: 'Arbitrage Thermometer',
  category: 'measurement',
  description:
    'A virtual economy is never in true equilibrium — it oscillates around it. ' +
    'The aggregate arbitrage window across relative prices is a live health metric: ' +
    'rising arbitrage signals destabilization, falling signals recovery.',
  check(metrics, thresholds): PrincipleResult {
    const { arbitrageIndex } = metrics;

    if (arbitrageIndex > thresholds.arbitrageIndexCritical) {
      return {
        violated: true,
        severity: 7,
        evidence: {
          arbitrageIndex,
          warning: thresholds.arbitrageIndexWarning,
          critical: thresholds.arbitrageIndexCritical,
        },
        suggestedAction: {
          parameter: 'transactionFee',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `Arbitrage index ${arbitrageIndex.toFixed(2)} exceeds critical threshold ` +
            `(${thresholds.arbitrageIndexCritical}). Relative prices are diverging — ` +
            'economy destabilizing. Lower trading friction to accelerate price convergence.',
        },
        confidence: 0.75,
        estimatedLag: 8,
      };
    }

    if (arbitrageIndex > thresholds.arbitrageIndexWarning) {
      return {
        violated: true,
        severity: 4,
        evidence: {
          arbitrageIndex,
          warning: thresholds.arbitrageIndexWarning,
        },
        suggestedAction: {
          parameter: 'transactionFee',
          direction: 'decrease',
          magnitude: 0.08,
          reasoning:
            `Arbitrage index ${arbitrageIndex.toFixed(2)} above warning threshold ` +
            `(${thresholds.arbitrageIndexWarning}). Early sign of price divergence. ` +
            'Gently reduce friction to support self-correction.',
        },
        confidence: 0.65,
        estimatedLag: 12,
      };
    }

    return { violated: false };
  },
};

export const P59_GiftEconomyNoise: Principle = {
  id: 'P59',
  name: 'Gift-Economy Noise',
  category: 'measurement',
  description:
    'Non-market exchanges — gifts, charity trades, social signaling — contaminate ' +
    'price signals. Filter gift-like and below-market transactions before computing ' +
    'economic indicators.',
  check(metrics, thresholds): PrincipleResult {
    const { giftTradeRatio } = metrics;

    if (giftTradeRatio > thresholds.giftTradeFilterRatio) {
      return {
        violated: true,
        severity: 4,
        evidence: {
          giftTradeRatio,
          threshold: thresholds.giftTradeFilterRatio,
        },
        suggestedAction: {
          parameter: 'transactionFee',
          direction: 'increase',
          magnitude: 0.05,
          reasoning:
            `${(giftTradeRatio * 100).toFixed(0)}% of trades are gift-like (price = 0 or <30% market). ` +
            `Exceeds filter threshold (${(thresholds.giftTradeFilterRatio * 100).toFixed(0)}%). ` +
            'Price signals contaminated. Slightly raise trading fees to discourage zero-value listings. ' +
            'ADVISORY: Consider filtering sub-market trades from price index computation.',
        },
        confidence: 0.70,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const MEASUREMENT_PRINCIPLES: Principle[] = [
  P31_AnchorValueTracking,
  P41_MultiResolutionMonitoring,
  P55_ArbitrageThermometer,
  P59_GiftEconomyNoise,
];
