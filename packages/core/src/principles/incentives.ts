// P5-P8: Incentive Alignment Principles
// Source: Incentive failure patterns — population stampedes, regulator suppressing bootstrap

import type { Principle, PrincipleResult } from '../types.js';

export const P5_ProfitabilityIsCompetitive: Principle = {
  id: 'P5',
  name: 'Profitability Is Competitive, Not Absolute',
  category: 'incentive',
  description:
    'Any profitability formula that returns the same number regardless of how many ' +
    'agents are already in that role will cause stampedes. ' +
    '97 intermediaries happened because profit = transactions × 10 with no competition denominator.',
  check(metrics, thresholds): PrincipleResult {
    const { roleShares, populationByRole } = metrics;

    // Look for roles with disproportionate share that shouldn't dominate
    // Heuristic: any non-primary role above 40% share is suspicious
    const highShareRoles: string[] = [];
    for (const [role, share] of Object.entries(roleShares)) {
      if (share > 0.45) highShareRoles.push(role); // >45% = stampede signal; dominant role at ~44% is healthy design
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
          parameterType: 'fee', scope: { tags: ['transaction'] },
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
            parameterType: 'cost',
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
    'In zero-sum pools (competitive pool, staking), the math only works if non-specialists ' +
    'overpay relative to specialists. If the pool is >70% specialists, ' +
    'there is no one left to subsidise and the pot drains.',
  check(metrics, _thresholds): PrincipleResult {
    const { poolSizes } = metrics;

    // Check ALL pools: if any pool is growing while participant count is stagnant/declining
    for (const [poolName, poolSize] of Object.entries(poolSizes)) {
      if (poolSize <= 0) continue;

      // Get the dominant role (likely the specialist for this pool)
      const roleEntries = Object.entries(metrics.populationByRole);
      if (roleEntries.length === 0) continue;

      const [dominantRole, dominantPop] = roleEntries.reduce((max, entry) =>
        entry[1] > max[1] ? entry : max
      );

      const total = metrics.totalAgents;
      const dominantShare = dominantPop / Math.max(1, total);

      // If dominant role exceeds 70% and pool is small, pool is draining
      if (dominantShare > 0.70 && poolSize < 100) {
        return {
          violated: true,
          severity: 6,
          evidence: { poolName, poolSize, dominantRole, dominantShare },
          suggestedAction: {
            parameterType: 'fee', scope: { tags: ['entry'] },
            direction: 'decrease',
            magnitude: 0.10,
            reasoning:
              `Pool "${poolName}" draining (${poolSize}) — ${dominantRole} at ${(dominantShare * 100).toFixed(0)}%. ` +
              'Too many specialists, not enough subsidising non-specialists. ' +
              'Lower entry fee to attract diverse participants.',
          },
          confidence: 0.75,
          estimatedLag: 5,
        };
      }
    }

    return { violated: false };
  },
};

export const P8_RegulatorCannotFightDesign: Principle = {
  id: 'P8',
  name: 'Regulator Cannot Fight the Design',
  category: 'incentive',
  description:
    'If the economy is designed to have a majority role (e.g. dominant role exceeds 55%), ' +
    'the regulator must know this and exempt that role from population suppression. ' +
    'AgentE at tick 1 seeing dominant role exceeds 55% and slashing competitive pool rewards is overreach.',
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
            parameterType: 'reward',
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
