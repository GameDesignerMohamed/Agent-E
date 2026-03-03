// P33: Participant Experience — Fair ≠ Equal (Community)

import type { Principle, PrincipleResult } from '../types.js';

export const P33_FairNotEqual: Principle = {
  id: 'P33',
  name: 'Fair ≠ Equal',
  category: 'participant_experience',
  description:
    'Gini = 0 is boring — everyone has the same and there is nothing to strive for. ' +
    'Healthy inequality from skill/effort is fine. Inequality from money (pay-to-win) ' +
    'is toxic. Below 0.10 Gini = too flat; above configurable thresholds = oligarchy.',
  check(metrics, thresholds): PrincipleResult {
    for (const curr of metrics.currencies) {
      const giniCoefficient = metrics.giniCoefficientByCurrency[curr] ?? 0;

      if (giniCoefficient < 0.10) {
        return {
          violated: true,
          severity: 3,
          evidence: { currency: curr, giniCoefficient },
          suggestedAction: {
            parameterType: 'reward',
            direction: 'increase',
            scope: { currency: curr },
            magnitude: 0.10,
            reasoning:
              `[${curr}] Gini ${giniCoefficient.toFixed(2)} — near-perfect equality. Economy lacks stakes. ` +
              'Increase winner rewards to create meaningful spread.',
          },
          confidence: 0.60,
          estimatedLag: 20,
        };
      }

      if (giniCoefficient > thresholds.giniRedThreshold) {
        return {
          violated: true,
          severity: 7,
          evidence: { currency: curr, giniCoefficient },
          suggestedAction: {
            parameterType: 'fee',
            direction: 'increase',
            scope: { tags: ['transaction'], currency: curr },
            magnitude: 0.20,
            reasoning:
              `[${curr}] Gini ${giniCoefficient.toFixed(2)} — oligarchy level. Toxic inequality. ` +
              'Raise transaction fees to redistribute wealth from rich to pool.',
          },
          confidence: 0.85,
          estimatedLag: 10,
        };
      }

      if (giniCoefficient > thresholds.giniWarnThreshold) {
        return {
          violated: true,
          severity: 4,
          evidence: { currency: curr, giniCoefficient },
          suggestedAction: {
            parameterType: 'fee',
            direction: 'increase',
            scope: { tags: ['transaction'], currency: curr },
            magnitude: 0.10,
            reasoning:
              `[${curr}] Gini ${giniCoefficient.toFixed(2)} — high inequality warning. ` +
              'Gently raise fees to slow wealth concentration.',
          },
          confidence: 0.75,
          estimatedLag: 15,
        };
      }
    }

    return { violated: false };
  },
};

export const PARTICIPANT_EXPERIENCE_PRINCIPLES: Principle[] = [P33_FairNotEqual];
