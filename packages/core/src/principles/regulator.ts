// P25-P28, P38: Regulator Behavior Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P25_CorrectLeversForCorrectProblems: Principle = {
  id: 'P25',
  name: 'Target the Correct Lever',
  category: 'regulator',
  description:
    'Adjusting sinks for supply-side inflation is wrong. ' +
    'Inflation from too much gathering → reduce yield rate. ' +
    'Inflation from pot payout → reduce reward multiplier. ' +
    'Matching lever to cause prevents oscillation.',
  check(metrics, thresholds): PrincipleResult {
    const { netFlow, supplyByResource } = metrics;

    // Check ALL resources: if any single resource's supply exceeds 3× the average
    const resourceEntries = Object.entries(supplyByResource);
    if (resourceEntries.length === 0) return { violated: false };

    const totalSupply = resourceEntries.reduce((sum, [_, s]) => sum + s, 0);
    const avgSupply = totalSupply / resourceEntries.length;

    for (const [resource, supply] of resourceEntries) {
      if (supply > avgSupply * 3 && netFlow > thresholds.netFlowWarnThreshold) {
        return {
          violated: true,
          severity: 4,
          evidence: {
            resource,
            supply,
            avgSupply,
            ratio: supply / Math.max(1, avgSupply),
            netFlow
          },
          suggestedAction: {
            parameterType: 'yield',
            direction: 'decrease',
            magnitude: 0.15,
            reasoning:
              `Inflation with ${resource} backlog (${supply} units, ${(supply / Math.max(1, avgSupply)).toFixed(1)}× average). ` +
              'Root cause is gathering. Correct lever: yieldRate, not fees.',
          },
          confidence: 0.75,
          estimatedLag: 8,
        };
      }
    }

    return { violated: false };
  },
};

export const P26_ContinuousPressureBeatsThresholdCuts: Principle = {
  id: 'P26',
  name: 'Continuous 1%/tick > One-Time 10% Cut',
  category: 'regulator',
  description:
    'Large one-time adjustments cause overshoot and oscillation. ' +
    '1% per tick for 10 ticks reaches the same destination with far less disruption. ' +
    'This principle is enforced by maxAdjustmentPercent in the Planner.',
  check(metrics, thresholds): PrincipleResult {
    // Detect oscillation: if a metric swings back and forth with high amplitude
    // Proxy: if net flow alternates sign significantly in recent history
    // (This would need history — for now we check the current state for oscillation signals)

    const { inflationRate } = metrics;
    // Rapid sign change in inflationRate with large magnitude suggests overcorrection
    if (Math.abs(inflationRate) > 0.20) {
      return {
        violated: true,
        severity: 4,
        evidence: { inflationRate },
        suggestedAction: {
          parameterType: 'cost',
          direction: inflationRate > 0 ? 'increase' : 'decrease',
          magnitude: Math.min(thresholds.maxAdjustmentPercent, 0.05), // force smaller step
          reasoning:
            `Inflation rate ${(inflationRate * 100).toFixed(1)}% — possible oscillation. ` +
            'Apply smaller correction to avoid overshoot.',
        },
        confidence: 0.60,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const P27_AdjustmentsNeedCooldowns: Principle = {
  id: 'P27',
  name: 'Adjustments Need Cooldowns',
  category: 'regulator',
  description:
    'High churn + low satisfaction may indicate oscillation from rapid adjustments. ' +
    'Cooldown enforcement is structural (Planner). This is a symptom detector.',
  check(metrics, _thresholds): PrincipleResult {
    // This principle is enforced structurally by the Planner.
    // As a diagnostic, we flag if churn rate is high AND satisfaction is volatile
    // (which correlates with oscillating economy from rapid adjustments)
    const { churnRate, avgSatisfaction } = metrics;

    if (churnRate > 0.08 && avgSatisfaction < 50) {
      return {
        violated: true,
        severity: 4,
        evidence: { churnRate, avgSatisfaction },
        suggestedAction: {
          parameterType: 'fee', scope: { tags: ['entry'] },
          direction: 'decrease',
          magnitude: 0.05,
          reasoning:
            `High churn (${(churnRate * 100).toFixed(1)}%) with low satisfaction. ` +
            'Possible oscillation from rapid adjustments. Apply small correction only.',
        },
        confidence: 0.50,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

/** @deprecated Merged into P8_RegulatorCannotFightDesign in v1.6.7. Use P8 instead. */
export { P8_RegulatorCannotFightDesign as P28_StructuralDominanceIsNotPathological } from './incentives.js';

export const P38_CommunicationPreventsRevolt: Principle = {
  id: 'P38',
  name: 'Communication Prevents Revolt',
  category: 'regulator',
  description:
    'High churn may indicate unexplained changes. Logging enforcement is structural ' +
    '(DecisionLog). Flags high churn as signal to review recent decisions.',
  check(metrics, _thresholds): PrincipleResult {
    // This is structurally enforced by DecisionLog. As a diagnostic,
    // we check if churn spiked without any corresponding logged decision.
    // Since we can't access the log here, this is a light sanity check.
    const { churnRate } = metrics;
    if (churnRate > 0.10) {
      return {
        violated: true,
        severity: 3,
        evidence: { churnRate },
        suggestedAction: {
          parameterType: 'reward',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `High churn (${(churnRate * 100).toFixed(1)}%) — agents leaving. ` +
            'Ensure all recent adjustments are logged with reasoning to diagnose cause.',
        },
        confidence: 0.50,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const REGULATOR_PRINCIPLES: Principle[] = [
  P25_CorrectLeversForCorrectProblems,
  P26_ContinuousPressureBeatsThresholdCuts,
  P27_AdjustmentsNeedCooldowns,
  // P28 merged into P8 (v1.6.7)
  P38_CommunicationPreventsRevolt,
];
