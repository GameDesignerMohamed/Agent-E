// P51-P54, P56: Operations Principles (from Naavik research)

import type { Principle, PrincipleResult } from '../types.js';

export const P51_CyclicalEngagement: Principle = {
  id: 'P51',
  name: 'Cyclical Engagement Pattern',
  category: 'operations',
  description:
    'Each activity peak should be >=95% of the previous peak. ' +
    'If peaks are shrinking (cyclical engagement becoming flat), activity fatigue is setting in. ' +
    'If valleys are deepening, the off-activity economy is failing to sustain engagement.',
  check(metrics, thresholds): PrincipleResult {
    const { cyclicalPeaks, cyclicalValleys } = metrics;
    if (cyclicalPeaks.length < 2) return { violated: false };

    const lastPeak = cyclicalPeaks[cyclicalPeaks.length - 1] ?? 0;
    const prevPeak = cyclicalPeaks[cyclicalPeaks.length - 2] ?? 0;

    if (prevPeak > 0 && lastPeak / prevPeak < thresholds.cyclicalPeakDecay) {
      return {
        violated: true,
        severity: 5,
        evidence: {
          lastPeak,
          prevPeak,
          ratio: lastPeak / prevPeak,
          threshold: thresholds.cyclicalPeakDecay,
        },
        suggestedAction: {
          parameterType: 'reward',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Peak engagement dropped to ${(lastPeak / prevPeak * 100).toFixed(0)}% of previous peak ` +
            `(threshold: ${(thresholds.cyclicalPeakDecay * 100).toFixed(0)}%). Activity fatigue detected. ` +
            'Boost activity rewards to restore peak engagement.',
        },
        confidence: 0.75,
        estimatedLag: 30,
      };
    }

    if (cyclicalValleys.length >= 2) {
      const lastValley = cyclicalValleys[cyclicalValleys.length - 1] ?? 0;
      const prevValley = cyclicalValleys[cyclicalValleys.length - 2] ?? 0;
      if (prevValley > 0 && lastValley / prevValley < thresholds.cyclicalValleyDecay) {
        return {
          violated: true,
          severity: 4,
          evidence: { lastValley, prevValley, ratio: lastValley / prevValley },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'decrease',
            magnitude: 0.10,
            reasoning:
              'Between-activity engagement declining (deepening valleys). ' +
              'Base economy not sustaining participants between activities. ' +
              'Lower production costs to improve off-activity value.',
          },
          confidence: 0.65,
          estimatedLag: 20,
        };
      }
    }

    return { violated: false };
  },
};

export const P52_EndowmentEffect: Principle = {
  id: 'P52',
  name: 'Endowment Effect',
  category: 'operations',
  description:
    'Participants who never owned premium assets do not value them. ' +
    'Free trial activities that let participants experience premium assets drive conversions ' +
    'because ownership creates perceived value (endowment effect).',
  check(metrics, _thresholds): PrincipleResult {
    const { avgSatisfaction, churnRate } = metrics;

    // Proxy: if activity completion is high but satisfaction is still low,
    // activities are not creating the endowment effect (participants complete but don't value the rewards)
    const { eventCompletionRate } = metrics;
    if (Number.isNaN(eventCompletionRate)) return { violated: false };

    if (eventCompletionRate > 0.90 && avgSatisfaction < 60) {
      return {
        violated: true,
        severity: 4,
        evidence: { eventCompletionRate, avgSatisfaction, churnRate },
        suggestedAction: {
          parameterType: 'reward',
          direction: 'increase',
          magnitude: 0.15,
          reasoning:
            `${(eventCompletionRate * 100).toFixed(0)}% activity completion but satisfaction only ${avgSatisfaction.toFixed(0)}. ` +
            'Activities not creating perceived value. Increase reward quality/quantity.',
        },
        confidence: 0.60,
        estimatedLag: 20,
      };
    }

    return { violated: false };
  },
};

export const P53_EventCompletionRate: Principle = {
  id: 'P53',
  name: 'Activity Completion Rate Sweet Spot',
  category: 'operations',
  description:
    'Free completion at 60-80% is the sweet spot. ' +
    '<40% = predatory design. >80% = no monetization pressure. ' +
    '100% free = zero reason to ever spend.',
  check(metrics, thresholds): PrincipleResult {
    const { eventCompletionRate } = metrics;
    if (Number.isNaN(eventCompletionRate)) return { violated: false };

    if (eventCompletionRate < thresholds.eventCompletionMin) {
      return {
        violated: true,
        severity: 6,
        evidence: {
          eventCompletionRate,
          min: thresholds.eventCompletionMin,
          max: thresholds.eventCompletionMax,
        },
        suggestedAction: {
          parameterType: 'cost',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `Activity completion rate ${(eventCompletionRate * 100).toFixed(0)}% — predatory territory ` +
            `(min: ${(thresholds.eventCompletionMin * 100).toFixed(0)}%). ` +
            'Too hard for free participants. Lower barriers to participation.',
        },
        confidence: 0.80,
        estimatedLag: 10,
      };
    }

    if (eventCompletionRate > thresholds.eventCompletionMax) {
      return {
        violated: true,
        severity: 3,
        evidence: { eventCompletionRate, max: thresholds.eventCompletionMax },
        suggestedAction: {
          parameterType: 'fee', scope: { tags: ['entry'] },
          direction: 'increase',
          magnitude: 0.05,
          reasoning:
            `Activity completion rate ${(eventCompletionRate * 100).toFixed(0)}% — no monetization pressure ` +
            `(max: ${(thresholds.eventCompletionMax * 100).toFixed(0)}%). ` +
            'Slightly raise costs to create meaningful premium differentiation.',
        },
        confidence: 0.55,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const P54_OperationalCadence: Principle = {
  id: 'P54',
  name: 'Operational Cadence',
  category: 'operations',
  description:
    '>50% of activities that are re-wrapped existing supply → stagnation. ' +
    'The cadence must include genuinely new supply at regular intervals. ' +
    'This is an advisory principle — AgentE can flag but cannot fix supply.',
  check(metrics, _thresholds): PrincipleResult {
    // Proxy: declining engagement velocity over time = stagnation
    const { velocity, avgSatisfaction } = metrics;

    if (velocity < 2 && avgSatisfaction < 55 && metrics.tick > 100) {
      return {
        violated: true,
        severity: 3,
        evidence: { velocity, avgSatisfaction, tick: metrics.tick },
        suggestedAction: {
          parameterType: 'reward',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            'Low velocity and satisfaction after long runtime. ' +
            'Possible supply stagnation. Increase rewards as bridge while ' +
            'new supply is developed (developer action required).',
        },
        confidence: 0.40,
        estimatedLag: 30,
      };
    }

    return { violated: false };
  },
};

export const P56_SupplyShockAbsorption: Principle = {
  id: 'P56',
  name: 'Supply Shock Absorption',
  category: 'operations',
  description:
    'Every new-item injection shatters existing price equilibria — arbitrage spikes ' +
    'as participants re-price. Build stabilization windows for price discovery before ' +
    'measuring post-injection economic health.',
  check(metrics, thresholds): PrincipleResult {
    const { contentDropAge, arbitrageIndex } = metrics;

    // Only fires during the stabilization window after a supply injection
    if (contentDropAge > 0 && contentDropAge <= thresholds.contentDropCooldownTicks) {
      if (arbitrageIndex > thresholds.postDropArbitrageMax) {
        return {
          violated: true,
          severity: 5,
          evidence: {
            contentDropAge,
            arbitrageIndex,
            cooldownTicks: thresholds.contentDropCooldownTicks,
            postDropMax: thresholds.postDropArbitrageMax,
          },
          suggestedAction: {
            parameterType: 'fee', scope: { tags: ['transaction'] },
            direction: 'decrease',
            magnitude: 0.10,
            reasoning:
              `Supply injection ${contentDropAge} ticks ago — arbitrage at ${arbitrageIndex.toFixed(2)} ` +
              `exceeds post-injection max (${thresholds.postDropArbitrageMax}). ` +
              'Price discovery struggling. Lower trading friction temporarily.',
          },
          confidence: 0.60,
          estimatedLag: 5,
        };
      }
    }

    return { violated: false };
  },
};

export const OPERATIONS_PRINCIPLES: Principle[] = [
  P51_CyclicalEngagement,
  P52_EndowmentEffect,
  P53_EventCompletionRate,
  P54_OperationalCadence,
  P56_SupplyShockAbsorption,
];
