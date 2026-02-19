// P31, P41: Measurement Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P31_AnchorValueTracking: Principle = {
  id: 'P31',
  name: 'Anchor Value Tracking',
  category: 'measurement',
  description:
    '1 hour of play = X gold = Y items. If this ratio drifts, the economy ' +
    'is inflating or deflating in ways that players feel before metrics catch it. ' +
    'Track the ratio constantly.',
  check(metrics, _thresholds): PrincipleResult {
    const { anchorRatioDrift, inflationRate } = metrics;

    if (Math.abs(anchorRatioDrift) > 0.25) {
      return {
        violated: true,
        severity: 5,
        evidence: { anchorRatioDrift, inflationRate },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: anchorRatioDrift > 0 ? 'increase' : 'decrease',
          magnitude: 0.10,
          reasoning:
            `Anchor ratio has drifted ${(anchorRatioDrift * 100).toFixed(0)}% from baseline. ` +
            'Time-to-value for players is changing. Adjust production costs to restore.',
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
          parameter: 'auctionFee',
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

export const MEASUREMENT_PRINCIPLES: Principle[] = [
  P31_AnchorValueTracking,
  P41_MultiResolutionMonitoring,
];
