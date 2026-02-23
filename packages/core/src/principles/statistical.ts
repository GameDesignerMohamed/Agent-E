// P42-P43: Statistical Balancing Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P42_TheMedianPrinciple: Principle = {
  id: 'P42',
  name: 'The Median Principle',
  category: 'statistical',
  description:
    'When (mean - median) / median > 0.3, mean is a lie. ' +
    'A few high-balance agents raise the mean while most agents have low balances. ' +
    'Always balance to median when divergence exceeds 30%.',
  check(metrics, thresholds): PrincipleResult {
    const { meanMedianDivergence, giniCoefficient } = metrics;

    if (meanMedianDivergence > thresholds.meanMedianDivergenceMax) {
      return {
        violated: true,
        severity: 5,
        evidence: {
          meanMedianDivergence,
          giniCoefficient,
          meanBalance: metrics.meanBalance,
          medianBalance: metrics.medianBalance,
        },
        suggestedAction: {
          parameter: 'transactionFee',
          direction: 'increase',
          magnitude: 0.15,
          reasoning:
            `Mean/median divergence ${(meanMedianDivergence * 100).toFixed(0)}% ` +
            `(threshold: ${(thresholds.meanMedianDivergenceMax * 100).toFixed(0)}%). ` +
            'Economy has outliers skewing metrics. Use median for decisions. ' +
            'Raise auction fees to redistribute wealth.',
        },
        confidence: 0.85,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const P43_SimulationMinimum: Principle = {
  id: 'P43',
  name: 'Simulation Minimum (100 Iterations)',
  category: 'statistical',
  description:
    'Fewer than 100 Monte Carlo iterations produces unreliable predictions. ' +
    'The variance of a 10-iteration simulation is so high that you might as well ' +
    'be guessing. This principle enforces the minimum in the Simulator.',
  check(metrics, thresholds): PrincipleResult {
    // This is enforced structurally by the Simulator (iterations >= 100).
    // As a diagnostic: if inflationRate is oscillating wildly, it may indicate
    // decisions were made on insufficient simulation data.
    const { inflationRate } = metrics;

    if (Math.abs(inflationRate) > 0.30) {
      return {
        violated: true,
        severity: 3,
        evidence: { inflationRate, minIterations: thresholds.simulationMinIterations },
        suggestedAction: {
          parameter: 'productionCost',
          direction: inflationRate > 0 ? 'increase' : 'decrease',
          magnitude: 0.05,
          reasoning:
            `Large inflation rate swing (${(inflationRate * 100).toFixed(0)}%). ` +
            `Ensure all decisions use ≥${thresholds.simulationMinIterations} simulation iterations. ` +
            'Apply conservative correction.',
        },
        confidence: 0.50,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const STATISTICAL_PRINCIPLES: Principle[] = [
  P42_TheMedianPrinciple,
  P43_SimulationMinimum,
];
