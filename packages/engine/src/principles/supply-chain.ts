// P1: Supply Chain — Production ↔ Consumption (Community)

import type { Principle, PrincipleResult } from '../types.js';

export const P1_ProductionMatchesConsumption: Principle = {
  id: 'P1',
  name: 'Production Must Match Consumption',
  category: 'supply_chain',
  description:
    'If producer rate < consumer rate, supply deficit kills the economy. ' +
    'Raw materials piling at production locations happened because this was out of balance.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, demandSignals, populationByRole } = metrics;

    // Look for resources with high demand signals but low / declining supply
    const violations: string[] = [];
    for (const resource of Object.keys(demandSignals)) {
      const demand = demandSignals[resource] ?? 0;
      const supply = supplyByResource[resource] ?? 0;
      // Deficit: demand exceeds supply by >50% with meaningful demand
      if (demand > 5 && supply / Math.max(1, demand) < 0.5) {
        violations.push(resource);
      }
    }

    // Also check: population imbalance between roles (producers vs consumers)
    const roleEntries = Object.entries(populationByRole).sort((a, b) => b[1] - a[1]);
    const totalPop = metrics.totalAgents;
    const dominantRole = roleEntries[0];
    const dominantCount = dominantRole?.[1] ?? 0;
    const dominantShare = totalPop > 0 ? dominantCount / totalPop : 0;

    // If dominant role > 40% but their key resources are scarce, production can't keep up
    const populationImbalance = dominantShare > 0.4 && violations.length > 0;

    if (violations.length > 0 || populationImbalance) {
      return {
        violated: true,
        severity: 7,
        evidence: { scarceResources: violations, dominantRole: dominantRole?.[0], dominantShare },
        suggestedAction: {
          parameterType: 'cost',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning: 'Lower production cost to incentivise more production.',
        },
        confidence: violations.length > 0 ? 0.85 : 0.6,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const SUPPLY_CHAIN_PRINCIPLES: Principle[] = [P1_ProductionMatchesConsumption];
