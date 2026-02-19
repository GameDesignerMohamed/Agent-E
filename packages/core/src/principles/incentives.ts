// P5-P8: Incentive Alignment Principles
// Source: 97-Trader stampede (V0.4.6), regulator killing bootstrap (V0.4.4)

import type { Principle, PrincipleResult } from '../types.js';

export const P5_ProfitabilityIsCompetitive: Principle = {
  id: 'P5',
  name: 'Profitability Is Competitive, Not Absolute',
  category: 'incentive',
  description:
    'Any profitability formula that returns the same number regardless of how many ' +
    'agents are already in that role will cause stampedes. ' +
    '97 Traders happened because profit = transactions × 10 with no competition denominator.',
  check(metrics, thresholds): PrincipleResult {
    const { roleShares, populationByRole } = metrics;

    // Look for roles with disproportionate share that shouldn't dominate
    // Heuristic: any non-primary role above 40% share is suspicious
    const highShareRoles: string[] = [];
    for (const [role, share] of Object.entries(roleShares)) {
      if (share > 0.45) highShareRoles.push(role); // >45% = stampede signal; Fighter at ~44% is healthy design
    }

    if (highShareRoles.length > 0) {
      const dominantRole = highShareRoles[0]!;
      return {
        violated: true,
        severity: 6,
        evidence: {
          dominantRole,
          share: roleShares[dominantRole],
          population: populationByRole[dominantRole],
        },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'increase',
          magnitude: thresholds.maxAdjustmentPercent,
          reasoning:
            `${dominantRole} share at ${((roleShares[dominantRole] ?? 0) * 100).toFixed(0)}%. ` +
            'Likely stampede from non-competitive profitability formula. ' +
            'Raise market friction to slow role accumulation.',
        },
        confidence: 0.75,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const P6_CrowdingMultiplierOnAllRoles: Principle = {
  id: 'P6',
  name: 'Crowding Multiplier Applies to ALL Roles',
  category: 'incentive',
  description:
    'Every role needs an inverse-population profitability scaling. ' +
    'A role without crowding pressure is a stampede waiting to happen.',
  check(metrics, _thresholds): PrincipleResult {
    const { roleShares } = metrics;

    // Any role above 35% is likely lacking crowding pressure
    // (healthy max for any single role in a diverse economy)
    for (const [role, share] of Object.entries(roleShares)) {
      if (share > 0.35) {
        return {
          violated: true,
          severity: 5,
          evidence: { role, share },
          suggestedAction: {
            parameter: 'craftingCost',
            direction: 'increase',
            magnitude: 0.10,
            reasoning:
              `${role} at ${(share * 100).toFixed(0)}% — no crowding pressure detected. ` +
              'Apply role-specific cost increase to simulate saturation.',
          },
          confidence: 0.70,
          estimatedLag: 10,
        };
      }
    }

    return { violated: false };
  },
};

export const P7_NonSpecialistsSubsidiseSpecialists: Principle = {
  id: 'P7',
  name: 'Non-Specialists Subsidise Specialists in Zero-Sum Games',
  category: 'incentive',
  description:
    'In zero-sum pools (arena, staking), the math only works if non-specialists ' +
    'overpay relative to specialists. If the pool is >70% specialists, ' +
    'there is no one left to subsidise and the pot drains.',
  check(metrics, _thresholds): PrincipleResult {
    const { populationByRole, poolSizes } = metrics;

    // Check: if arena pot exists, are Fighters overwhelming it?
    const arenaPot = poolSizes['arena'] ?? poolSizes['arenaPot'] ?? 0;
    if (arenaPot <= 0) return { violated: false };

    const fighters = populationByRole['Fighter'] ?? 0;
    const total = metrics.totalAgents;
    const fighterShare = fighters / Math.max(1, total);

    if (fighterShare > 0.70 && arenaPot < 100) {
      return {
        violated: true,
        severity: 6,
        evidence: { fighterShare, arenaPot },
        suggestedAction: {
          parameter: 'arenaEntryFee',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            'Arena pot draining — too many specialists, not enough subsidising non-specialists. ' +
            'Lower entry fee to attract diverse participants.',
        },
        confidence: 0.75,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const P8_RegulatorCannotFightDesign: Principle = {
  id: 'P8',
  name: 'Regulator Cannot Fight the Design',
  category: 'incentive',
  description:
    'If the economy is designed to have a majority role (e.g. 55% Fighters), ' +
    'the regulator must know this and exempt that role from population suppression. ' +
    'AgentE at tick 1 seeing 55% Fighters and slashing arena rewards is overreach.',
  check(metrics, _thresholds): PrincipleResult {
    // This principle is mostly enforced by configuration (dominantRoles).
    // Here we detect a possible signal: dominant role's satisfaction is dropping
    // while their share is also dropping — both together suggest regulator overreach.
    const { roleShares, avgSatisfaction } = metrics;

    // If average satisfaction is low (<45) and some role dominates,
    // it may be suppression causing satisfaction decay
    if (avgSatisfaction < 45) {
      const dominantRole = Object.entries(roleShares).sort((a, b) => b[1] - a[1])[0];
      if (dominantRole && dominantRole[1] > 0.30) {
        return {
          violated: true,
          severity: 4,
          evidence: { dominantRole: dominantRole[0], share: dominantRole[1], avgSatisfaction },
          suggestedAction: {
            parameter: 'arenaReward',
            direction: 'increase',
            magnitude: 0.10,
            reasoning:
              `Low satisfaction with ${dominantRole[0]} dominant. ` +
              'Regulator may be suppressing a structurally necessary role. ' +
              'Ease pressure on dominant role rewards.',
          },
          confidence: 0.55,
          estimatedLag: 8,
        };
      }
    }

    return { violated: false };
  },
};

export const INCENTIVE_PRINCIPLES: Principle[] = [
  P5_ProfitabilityIsCompetitive,
  P6_CrowdingMultiplierOnAllRoles,
  P7_NonSpecialistsSubsidiseSpecialists,
  P8_RegulatorCannotFightDesign,
];
