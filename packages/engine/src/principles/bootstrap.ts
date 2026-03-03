// P17-P19: Bootstrap Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P17_GracePeriodBeforeIntervention: Principle = {
  id: 'P17',
  name: 'Grace Period Before Intervention',
  category: 'bootstrap',
  description:
    'Any intervention before tick 30 is premature. The economy needs time to ' +
    'bootstrap with designed distributions. Early intervention against designed ' +
    'dominance can kill the economy instantly.',
  check(metrics, _thresholds): PrincipleResult {
    // This principle is enforced in the AgentE pipeline itself (gracePeriod config).
    // Here we flag if grace period appears to have ended too early by checking:
    // low satisfaction at very early ticks.
    if (metrics.tick < 30 && metrics.avgSatisfaction < 40) {
      return {
        violated: true,
        severity: 7,
        evidence: { tick: metrics.tick, avgSatisfaction: metrics.avgSatisfaction },
        suggestedAction: {
          parameterType: 'fee', scope: { tags: ['entry'] },
          direction: 'decrease',
          magnitude: 0.20,
          reasoning:
            `Very low satisfaction at tick ${metrics.tick}. ` +
            'Intervention may have fired during grace period. ' +
            'Ease all costs to let economy bootstrap.',
        },
        confidence: 0.70,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const P18_FirstProducerNeedsStartingInventory: Principle = {
  id: 'P18',
  name: 'First Producer Needs Starting Inventory + Capital',
  category: 'bootstrap',
  description:
    'A producer with 0 resources and 0 currency must sell nothing to get currency before ' +
    'they can buy raw materials. This creates a chicken-and-egg freeze. ' +
    'Starting inventory (2 goods + 4 raw materials + 40 currency) breaks the deadlock.',
  check(metrics, _thresholds): PrincipleResult {
    if (metrics.tick > 20) return { violated: false }; // bootstrap window over

    // Check all resources: if ANY resource has zero supply while agents exist
    const hasAgents = metrics.totalAgents > 0;
    for (const [resource, supply] of Object.entries(metrics.supplyByResource)) {
      if (supply === 0 && hasAgents) {
        return {
          violated: true,
          severity: 8,
          evidence: { tick: metrics.tick, resource, supply, totalAgents: metrics.totalAgents },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'decrease',
            magnitude: 0.50,
            reasoning:
              `Bootstrap failure: ${resource} supply is 0 at tick ${metrics.tick} with ${metrics.totalAgents} agents. ` +
              'Drastically reduce production cost to allow immediate output.',
          },
          confidence: 0.90,
          estimatedLag: 2,
        };
      }
    }

    return { violated: false };
  },
};

export const P19_StartingSupplyExceedsDemand: Principle = {
  id: 'P19',
  name: 'Starting Supply Exceeds Initial Demand',
  category: 'bootstrap',
  description:
    'Launch with more consumables than you think you need. ' +
    'Early scarcity creates a market gridlock where everyone wants to buy ' +
    'and nobody has anything to sell.',
  check(metrics, _thresholds): PrincipleResult {
    if (metrics.tick > 30) return { violated: false }; // only relevant early

    // Find the most-populated role
    const roleEntries = Object.entries(metrics.populationByRole);
    if (roleEntries.length === 0) return { violated: false };

    const [mostPopulatedRole, population] = roleEntries.reduce((max, entry) =>
      entry[1] > max[1] ? entry : max
    );

    if (population < 5) return { violated: false }; // not enough agents to matter

    // Check if this role has zero access to ANY resource they would consume
    // (Heuristic: check all resources - if total supply across all resources < 50% of population)
    const totalResourceSupply = Object.values(metrics.supplyByResource).reduce((sum, s) => sum + s, 0);
    const resourcesPerAgent = totalResourceSupply / Math.max(1, population);

    if (resourcesPerAgent < 0.5) {
      return {
        violated: true,
        severity: 6,
        evidence: {
          mostPopulatedRole,
          population,
          totalResourceSupply,
          resourcesPerAgent
        },
        suggestedAction: {
          parameterType: 'reward',
          direction: 'increase',
          magnitude: 0.20,
          reasoning:
            `${mostPopulatedRole} (${population} agents) has insufficient resources (${resourcesPerAgent.toFixed(2)} per agent). ` +
            'Cold-start scarcity. Boost pool reward to attract participation despite scarcity.',
        },
        confidence: 0.75,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const BOOTSTRAP_PRINCIPLES: Principle[] = [
  P17_GracePeriodBeforeIntervention,
  P18_FirstProducerNeedsStartingInventory,
  P19_StartingSupplyExceedsDemand,
];
