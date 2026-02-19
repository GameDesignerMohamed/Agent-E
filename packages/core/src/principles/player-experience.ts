// P33, P37, P45, P50: Player Experience Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P33_FairNotEqual: Principle = {
  id: 'P33',
  name: 'Fair ≠ Equal',
  category: 'player_experience',
  description:
    'Gini = 0 is boring — everyone has the same and there is nothing to strive for. ' +
    'Healthy inequality from skill/effort is fine. Inequality from money (pay-to-win) ' +
    'is toxic. Target Gini 0.3-0.45: meaningful spread, not oligarchy.',
  check(metrics, thresholds): PrincipleResult {
    const { giniCoefficient } = metrics;

    if (giniCoefficient < 0.10) {
      return {
        violated: true,
        severity: 3,
        evidence: { giniCoefficient },
        suggestedAction: {
          parameter: 'arenaReward',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Gini ${giniCoefficient.toFixed(2)} — near-perfect equality. Economy lacks stakes. ` +
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
        evidence: { giniCoefficient },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'increase',
          magnitude: 0.20,
          reasoning:
            `Gini ${giniCoefficient.toFixed(2)} — oligarchy level. Toxic inequality. ` +
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
        evidence: { giniCoefficient },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Gini ${giniCoefficient.toFixed(2)} — high inequality warning. ` +
            'Gently raise fees to slow wealth concentration.',
        },
        confidence: 0.75,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const P37_LatecommerProblem: Principle = {
  id: 'P37',
  name: 'Latecomer Problem',
  category: 'player_experience',
  description:
    'A new participant must reach viability in reasonable time. ' +
    'If all the good roles are saturated and prices are high, ' +
    'new agents cannot contribute and churn immediately.',
  check(metrics, _thresholds): PrincipleResult {
    const { timeToValue, avgSatisfaction, churnRate } = metrics;

    // High churn + low satisfaction + slow time-to-value = latecomer problem
    if (churnRate > 0.08 && avgSatisfaction < 55 && timeToValue > 20) {
      return {
        violated: true,
        severity: 6,
        evidence: { timeToValue, avgSatisfaction, churnRate },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `New agents taking ${timeToValue} ticks to reach viability. ` +
            `Churn ${(churnRate * 100).toFixed(1)}%, satisfaction ${avgSatisfaction.toFixed(0)}. ` +
            'Lower production costs to help new participants contribute faster.',
        },
        confidence: 0.70,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const P45_TimeBudget: Principle = {
  id: 'P45',
  name: 'Time Budget',
  category: 'player_experience',
  description:
    'required_time ≤ available_time × 0.8. If the economy requires more engagement ' +
    'than participants can realistically give, it is a disguised paywall. ' +
    'The 0.8 buffer accounts for real life.',
  check(metrics, thresholds): PrincipleResult {
    const { timeToValue, avgSatisfaction } = metrics;

    // If time to value is very high AND satisfaction is dropping,
    // the economy demands too much time
    const timePressure = timeToValue > 30;
    const dissatisfied = avgSatisfaction < 55;

    if (timePressure && dissatisfied) {
      return {
        violated: true,
        severity: 5,
        evidence: { timeToValue, avgSatisfaction, timeBudgetRatio: thresholds.timeBudgetRatio },
        suggestedAction: {
          parameter: 'arenaEntryFee',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `Time-to-value ${timeToValue} ticks with ${avgSatisfaction.toFixed(0)} satisfaction. ` +
            'Economy requires too much time investment. Lower barriers to participation.',
        },
        confidence: 0.65,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const P50_PayPowerRatio: Principle = {
  id: 'P50',
  name: 'Pay-Power Ratio',
  category: 'player_experience',
  description:
    'spender / non-spender power ratio > 2.0 = pay-to-win territory. ' +
    'Target 1.5 (meaningful advantage without shutting out non-payers). ' +
    'Above 2.0, non-paying participants start leaving.',
  check(metrics, thresholds): PrincipleResult {
    const { top10PctShare, giniCoefficient } = metrics;

    // Proxy for pay-power: if top 10% hold disproportionate wealth AND gini is high,
    // wealth advantage is likely translating to power advantage
    const wealthToTopFraction = top10PctShare;

    if (wealthToTopFraction > 0.70 && giniCoefficient > 0.55) {
      return {
        violated: true,
        severity: 6,
        evidence: {
          top10PctShare,
          giniCoefficient,
          threshold: thresholds.payPowerRatioMax,
        },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'increase',
          magnitude: 0.20,
          reasoning:
            `Top 10% hold ${(top10PctShare * 100).toFixed(0)}% of wealth (Gini ${giniCoefficient.toFixed(2)}). ` +
            'Wealth advantage may exceed pay-power ratio threshold. ' +
            'Redistribute via higher trading fees.',
        },
        confidence: 0.65,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const PLAYER_EXPERIENCE_PRINCIPLES: Principle[] = [
  P33_FairNotEqual,
  P37_LatecommerProblem,
  P45_TimeBudget,
  P50_PayPowerRatio,
];
