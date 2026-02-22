// P51-P54: LiveOps Principles (from Naavik research)

import type { Principle, PrincipleResult } from '../types.js';

export const P51_SharkTooth: Principle = {
  id: 'P51',
  name: 'Shark Tooth Pattern',
  category: 'liveops',
  description:
    'Each event peak should be ≥95% of the previous peak. ' +
    'If peaks are shrinking (shark tooth becoming flat), event fatigue is setting in. ' +
    'If valleys are deepening, the off-event economy is failing to sustain engagement.',
  check(metrics, thresholds): PrincipleResult {
    const { sharkToothPeaks, sharkToothValleys } = metrics;
    if (sharkToothPeaks.length < 2) return { violated: false };

    const lastPeak = sharkToothPeaks[sharkToothPeaks.length - 1] ?? 0;
    const prevPeak = sharkToothPeaks[sharkToothPeaks.length - 2] ?? 0;

    if (prevPeak > 0 && lastPeak / prevPeak < thresholds.sharkToothPeakDecay) {
      return {
        violated: true,
        severity: 5,
        evidence: {
          lastPeak,
          prevPeak,
          ratio: lastPeak / prevPeak,
          threshold: thresholds.sharkToothPeakDecay,
        },
        suggestedAction: {
          parameter: 'arenaReward',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Peak engagement dropped to ${(lastPeak / prevPeak * 100).toFixed(0)}% of previous peak ` +
            `(threshold: ${(thresholds.sharkToothPeakDecay * 100).toFixed(0)}%). Event fatigue detected. ` +
            'Boost event rewards to restore peak engagement.',
        },
        confidence: 0.75,
        estimatedLag: 30,
      };
    }

    if (sharkToothValleys.length >= 2) {
      const lastValley = sharkToothValleys[sharkToothValleys.length - 1] ?? 0;
      const prevValley = sharkToothValleys[sharkToothValleys.length - 2] ?? 0;
      if (prevValley > 0 && lastValley / prevValley < thresholds.sharkToothValleyDecay) {
        return {
          violated: true,
          severity: 4,
          evidence: { lastValley, prevValley, ratio: lastValley / prevValley },
          suggestedAction: {
            parameter: 'craftingCost',
            direction: 'decrease',
            magnitude: 0.10,
            reasoning:
              'Between-event engagement declining (deepening valleys). ' +
              'Base economy not sustaining participants between events. ' +
              'Lower production costs to improve off-event value.',
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
  category: 'liveops',
  description:
    'Players who never owned premium items do not value them. ' +
    'Free trial events that let players experience premium items drive conversions ' +
    'because ownership creates perceived value (endowment effect).',
  check(metrics, _thresholds): PrincipleResult {
    const { avgSatisfaction, churnRate } = metrics;

    // Proxy: if event completion is high but satisfaction is still low,
    // events are not creating the endowment effect (players complete but don't value the rewards)
    const { eventCompletionRate } = metrics;
    if (isNaN(eventCompletionRate)) return { violated: false };

    if (eventCompletionRate > 0.90 && avgSatisfaction < 60) {
      return {
        violated: true,
        severity: 4,
        evidence: { eventCompletionRate, avgSatisfaction, churnRate },
        suggestedAction: {
          parameter: 'arenaReward',
          direction: 'increase',
          magnitude: 0.15,
          reasoning:
            `${(eventCompletionRate * 100).toFixed(0)}% event completion but satisfaction only ${avgSatisfaction.toFixed(0)}. ` +
            'Events not creating perceived value. Increase reward quality/quantity.',
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
  name: 'Event Completion Rate Sweet Spot',
  category: 'liveops',
  description:
    'Free completion at 60-80% is the sweet spot. ' +
    '<40% = predatory design. >80% = no monetization pressure. ' +
    '100% free = zero reason to ever spend.',
  check(metrics, thresholds): PrincipleResult {
    const { eventCompletionRate } = metrics;
    if (isNaN(eventCompletionRate)) return { violated: false };

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
          parameter: 'craftingCost',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `Event completion rate ${(eventCompletionRate * 100).toFixed(0)}% — predatory territory ` +
            `(min: ${(thresholds.eventCompletionMin * 100).toFixed(0)}%). ` +
            'Too hard for free players. Lower barriers to participation.',
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
          parameter: 'arenaEntryFee',
          direction: 'increase',
          magnitude: 0.05,
          reasoning:
            `Event completion rate ${(eventCompletionRate * 100).toFixed(0)}% — no monetization pressure ` +
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

export const P54_LiveOpsCadence: Principle = {
  id: 'P54',
  name: 'LiveOps Cadence',
  category: 'liveops',
  description:
    '>50% of events that are re-wrapped existing content → staleness. ' +
    'The cadence must include genuinely new content at regular intervals. ' +
    'This is an advisory principle — AgentE can flag but cannot fix content.',
  check(metrics, _thresholds): PrincipleResult {
    // Proxy: declining engagement velocity over time = staleness
    const { velocity, avgSatisfaction } = metrics;

    if (velocity < 2 && avgSatisfaction < 55 && metrics.tick > 100) {
      return {
        violated: true,
        severity: 3,
        evidence: { velocity, avgSatisfaction, tick: metrics.tick },
        suggestedAction: {
          parameter: 'arenaReward',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            'Low velocity and satisfaction after long runtime. ' +
            'Possible content staleness. Increase rewards as bridge while ' +
            'new content is developed (developer action required).',
        },
        confidence: 0.40,
        estimatedLag: 30,
      };
    }

    return { violated: false };
  },
};

export const P56_ContentDropShock: Principle = {
  id: 'P56',
  name: 'Content-Drop Shock',
  category: 'liveops',
  description:
    'Every new-item injection shatters existing price equilibria — arbitrage spikes ' +
    'as participants re-price. Build cooldown windows for price discovery before ' +
    'measuring post-drop economic health.',
  check(metrics, thresholds): PrincipleResult {
    const { contentDropAge, arbitrageIndex } = metrics;

    // Only fires during the cooldown window after a content drop
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
            parameter: 'auctionFee',
            direction: 'decrease',
            magnitude: 0.10,
            reasoning:
              `Content drop ${contentDropAge} ticks ago — arbitrage at ${arbitrageIndex.toFixed(2)} ` +
              `exceeds post-drop max (${thresholds.postDropArbitrageMax}). ` +
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

export const LIVEOPS_PRINCIPLES: Principle[] = [
  P51_SharkTooth,
  P52_EndowmentEffect,
  P53_EventCompletionRate,
  P54_LiveOpsCadence,
  P56_ContentDropShock,
];
