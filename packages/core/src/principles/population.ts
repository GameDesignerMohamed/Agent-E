// P9-P11, P46: Population Dynamics Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P9_RoleSwitchingNeedsFriction: Principle = {
  id: 'P9',
  name: 'Role Switching Needs Friction',
  category: 'population',
  description:
    'If >5% of the population switches roles in a single evaluation period, ' +
    'it is a herd movement, not rational rebalancing. Without friction ' +
    '(satisfaction cost, cooldown), one good tick causes mass migration.',
  check(metrics, thresholds): PrincipleResult {
    const { churnByRole, roleShares } = metrics;

    // Heuristic: any single role that gained >5% share this period
    // We approximate from churnByRole — high churn in one role + gain in another
    const totalChurn = Object.values(churnByRole).reduce((s, v) => s + v, 0);
    if (totalChurn > thresholds.roleSwitchFrictionMax) {
      return {
        violated: true,
        severity: 5,
        evidence: { totalChurnRate: totalChurn, churnByRole },
        suggestedAction: {
          parameterType: 'cost',
          direction: 'increase',
          magnitude: 0.05,
          reasoning:
            `Role switch rate ${(totalChurn * 100).toFixed(1)}% exceeds friction threshold. ` +
            'Increase production costs to slow herd movement.',
        },
        confidence: 0.65,
        estimatedLag: 20,
      };
    }

    // Also: if a role went from <10% to >30% very quickly (large share jump)
    // we can't detect this without a previous snapshot, so we rely on churn proxy above.
    void roleShares; // suppresses unused warning

    return { violated: false };
  },
};

export const P10_SpawnWeightingUsesInversePopulation: Principle = {
  id: 'P10',
  name: 'Entry Weighting Uses Inverse Population',
  category: 'population',
  description:
    'New entrants should preferentially fill the least-populated roles. ' +
    'Flat entry probability causes initial imbalances to compound.',
  check(metrics, _thresholds): PrincipleResult {
    const { roleShares } = metrics;
    if (Object.keys(roleShares).length === 0) return { violated: false };

    const shares = Object.values(roleShares);
    const mean = shares.reduce((s, v) => s + v, 0) / shares.length;
    // High variance in role shares is a signal that entry is not balancing
    const variance = shares.reduce((s, v) => s + (v - mean) ** 2, 0) / shares.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0.20) {
      const minRole = Object.entries(roleShares).sort((a, b) => a[1] - b[1])[0];
      return {
        violated: true,
        severity: 4,
        evidence: { roleShares, stdDev, leastPopulatedRole: minRole?.[0] },
        suggestedAction: {
          parameterType: 'yield',
          direction: 'increase',
          magnitude: 0.05,
          reasoning:
            `High role share variance (σ=${stdDev.toFixed(2)}). ` +
            'Entry weighting may not be filling under-populated roles. ' +
            'Increasing yield makes under-populated producer roles more attractive.',
        },
        confidence: 0.60,
        estimatedLag: 20,
      };
    }

    return { violated: false };
  },
};

export const P11_TwoTierPressure: Principle = {
  id: 'P11',
  name: 'Two-Tier Pressure (Continuous + Hard)',
  category: 'population',
  description:
    'Corrections only at thresholds create delayed response. ' +
    'Continuous gentle pressure (1% per tick toward ideal) plus hard cuts ' +
    'for extreme cases catches imbalances early.',
  check(metrics, _thresholds): PrincipleResult {
    const { roleShares } = metrics;

    // Detect if any role is trending away from ideal for many ticks without correction
    // Proxy: if a role is >40% (hard threshold territory) it means continuous pressure failed
    for (const [role, share] of Object.entries(roleShares)) {
      if (share > 0.45) {
        return {
          violated: true,
          severity: 6,
          evidence: { role, share },
          suggestedAction: {
            parameterType: 'fee', scope: { tags: ['transaction'] },
            direction: 'increase',
            magnitude: 0.15,
            reasoning:
              `${role} at ${(share * 100).toFixed(0)}% — continuous pressure was insufficient. ` +
              'Hard intervention needed alongside resumed continuous pressure.',
          },
          confidence: 0.80,
          estimatedLag: 10,
        };
      }
    }

    return { violated: false };
  },
};

export const P46_PersonaDiversity: Principle = {
  id: 'P46',
  name: 'Persona Diversity',
  category: 'population',
  description:
    'Any single behavioral persona above 40% = monoculture. ' +
    'Need at least 3 distinct persona clusters each above 15%.',
  check(metrics, thresholds): PrincipleResult {
    const { personaDistribution } = metrics;
    if (Object.keys(personaDistribution).length === 0) return { violated: false };

    // Check for monoculture
    for (const [persona, share] of Object.entries(personaDistribution)) {
      if (share > thresholds.personaMonocultureMax) {
        return {
          violated: true,
          severity: 5,
          evidence: { dominantPersona: persona, share, personaDistribution },
          suggestedAction: {
            parameterType: 'reward',
            direction: 'increase',
            magnitude: 0.10,
            reasoning:
              `${persona} persona at ${(share * 100).toFixed(0)}% — behavioral monoculture. ` +
              'Diversify reward structures to attract other persona types.',
          },
          confidence: 0.70,
          estimatedLag: 30,
        };
      }
    }

    // Check for minimum cluster count
    const significantClusters = Object.values(personaDistribution).filter(s => s >= 0.15).length;
    if (significantClusters < thresholds.personaMinClusters) {
      return {
        violated: true,
        severity: 3,
        evidence: { significantClusters, required: thresholds.personaMinClusters },
        suggestedAction: {
          parameterType: 'fee', scope: { tags: ['transaction'] },
          direction: 'decrease',
          magnitude: 0.05,
          reasoning:
            `Only ${significantClusters} significant persona clusters (need ${thresholds.personaMinClusters}). ` +
            'Lower trade barriers to attract non-dominant persona types.',
        },
        confidence: 0.55,
        estimatedLag: 40,
      };
    }

    return { violated: false };
  },
};

export const POPULATION_PRINCIPLES: Principle[] = [
  P9_RoleSwitchingNeedsFriction,
  P10_SpawnWeightingUsesInversePopulation,
  P11_TwoTierPressure,
  P46_PersonaDiversity,
];
