// P25-P28, P38: Regulator Behavior Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P25_CorrectLeversForCorrectProblems: Principle = {
  id: 'P25',
  name: 'Target the Correct Lever',
  category: 'regulator',
  description:
    'Adjusting sinks for supply-side inflation is wrong. ' +
    'Inflation from too much gathering → reduce mining yield. ' +
    'Inflation from pot payout → reduce reward multiplier. ' +
    'Matching lever to cause prevents oscillation.',
  check(metrics, thresholds): PrincipleResult {
    const { netFlow, supplyByResource } = metrics;

    // Heuristic: if net flow is high AND raw material supply is very high,
    // gathering is the primary source — correct lever is miningYield, not fees
    const ore = supplyByResource['ore'] ?? 0;
    const wood = supplyByResource['wood'] ?? 0;
    const resourceFlood = ore + wood > 100;

    if (netFlow > thresholds.netFlowWarnThreshold && resourceFlood) {
      return {
        violated: true,
        severity: 4,
        evidence: { netFlow, ore, wood },
        suggestedAction: {
          parameter: 'miningYield',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `Inflation with raw material backlog (ore ${ore}, wood ${wood}). ` +
            'Root cause is gathering. Correct lever: miningYield, not fees.',
        },
        confidence: 0.75,
        estimatedLag: 8,
      };
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
          parameter: 'craftingCost',
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
    'Adjusting the same parameter twice in a window causes oscillation. ' +
    'Minimum 15 ticks between same-parameter adjustments. ' +
    'This is enforced in the Planner but checked here as a diagnostic.',
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
          parameter: 'arenaEntryFee',
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

export const P28_StructuralDominanceIsNotPathological: Principle = {
  id: 'P28',
  name: 'Structural Dominance ≠ Pathological Monopoly',
  category: 'regulator',
  description:
    'A designed Fighter majority (55%) should not trigger population suppression. ' +
    'AgentE must distinguish between "this role is dominant BY DESIGN" (configured via ' +
    'dominantRoles) and "this role took over unexpectedly".',
  check(metrics, _thresholds): PrincipleResult {
    // This is enforced by the dominantRoles config.
    // As a check: if the most dominant role has high satisfaction,
    // it's likely structural (they're thriving in their designed role), not pathological.
    const { roleShares, avgSatisfaction } = metrics;

    const dominant = Object.entries(roleShares).sort((a, b) => b[1] - a[1])[0];
    if (!dominant) return { violated: false };

    const [dominantRole, dominantShare] = dominant;
    // Healthy structural dominance: high share + high satisfaction
    if (dominantShare > 0.40 && avgSatisfaction > 70) {
      // Not a violation — this is healthy structural dominance
      return { violated: false };
    }

    // Pathological: high share + low satisfaction (agents trapped, not thriving)
    if (dominantShare > 0.40 && avgSatisfaction < 50) {
      return {
        violated: true,
        severity: 5,
        evidence: { dominantRole, dominantShare, avgSatisfaction },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            `${dominantRole} dominant (${(dominantShare * 100).toFixed(0)}%) with low satisfaction. ` +
            'Pathological dominance — agents trapped, not thriving. ' +
            'Ease costs to allow role switching.',
        },
        confidence: 0.65,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const P38_CommunicationPreventsRevolt: Principle = {
  id: 'P38',
  name: 'Communication Prevents Revolt',
  category: 'regulator',
  description:
    'Every adjustment must be logged with reasoning. ' +
    'An adjustment made without explanation to players causes revolt. ' +
    'AgentE logs every decision — this principle checks that logging is active.',
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
          parameter: 'arenaReward',
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
  P28_StructuralDominanceIsNotPathological,
  P38_CommunicationPreventsRevolt,
];
