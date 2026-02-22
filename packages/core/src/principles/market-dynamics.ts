// P29-P30: Market Dynamics Principles (from Machinations/Naavik research)

import type { Principle, PrincipleResult } from '../types.js';

export const P29_PinchPoint: Principle = {
  id: 'P29',
  name: 'Pinch Point',
  category: 'market_dynamics',
  description:
    'Every economy has a resource that constrains all downstream activity. ' +
    'In AgentE v0: weapons are the pinch point (Fighters need them, Crafters make them). ' +
    'If demand drops → oversupply. If frustration rises → undersupply.',
  check(metrics, _thresholds): PrincipleResult {
    const { pinchPoints, supplyByResource, demandSignals } = metrics;

    // Check each resource marked as a pinch point
    for (const [resource, status] of Object.entries(pinchPoints)) {
      if (status === 'scarce') {
        const supply = supplyByResource[resource] ?? 0;
        const demand = demandSignals[resource] ?? 0;
        return {
          violated: true,
          severity: 7,
          evidence: { resource, supply, demand, status },
          suggestedAction: {
            parameter: 'craftingCost',
            direction: 'decrease',
            magnitude: 0.15,
            reasoning:
              `${resource} is a pinch point and currently SCARCE (supply ${supply}, demand ${demand}). ` +
              'Reduce production cost to increase throughput.',
          },
          confidence: 0.80,
          estimatedLag: 5,
        };
      }

      if (status === 'oversupplied') {
        const supply = supplyByResource[resource] ?? 0;
        return {
          violated: true,
          severity: 4,
          evidence: { resource, supply, status },
          suggestedAction: {
            parameter: 'craftingCost',
            direction: 'increase',
            magnitude: 0.10,
            reasoning:
              `${resource} is a pinch point and OVERSUPPLIED (supply ${supply}). ` +
              'Raise production cost to reduce surplus.',
          },
          confidence: 0.70,
          estimatedLag: 8,
        };
      }
    }

    return { violated: false };
  },
};

export const P30_MovingPinchPoint: Principle = {
  id: 'P30',
  name: 'Moving Pinch Point',
  category: 'market_dynamics',
  description:
    'Player progression shifts the demand curve. A static pinch point that ' +
    'works at level 1 will be cleared at level 10. The pinch point must move ' +
    'with the player to maintain ongoing scarcity and engagement.',
  check(metrics, _thresholds): PrincipleResult {
    const { capacityUsage, supplyByResource, avgSatisfaction } = metrics;

    // Signal: very high capacity usage + high supply of all resources
    // = economy has "outrun" the pinch point (everything is easy to get)
    const totalResources = Object.values(supplyByResource).reduce((s, v) => s + v, 0);
    const resourcesPerAgent = totalResources / Math.max(1, metrics.totalAgents);

    if (capacityUsage > 0.90 && resourcesPerAgent > 15 && avgSatisfaction > 75) {
      // High satisfaction + abundant resources = pinch point cleared, no challenge
      return {
        violated: true,
        severity: 3,
        evidence: { capacityUsage, resourcesPerAgent, avgSatisfaction },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            'Economy operating at full capacity with abundant resources and high satisfaction. ' +
            'Pinch point may have been cleared. Increase production cost to restore scarcity.',
        },
        confidence: 0.55,
        estimatedLag: 20,
      };
    }

    return { violated: false };
  },
};

export const P57_CombinatorialPriceSpace: Principle = {
  id: 'P57',
  name: 'Combinatorial Price Space',
  category: 'market_dynamics',
  description:
    'N tradeable items generate (N−1)N/2 relative prices. With thousands of items ' +
    'no single agent can track them all. Design for distributed self-organization, ' +
    'not centralized pricing.',
  check(metrics, thresholds): PrincipleResult {
    const { prices, priceVolatility } = metrics;

    const priceKeys = Object.keys(prices);
    const n = priceKeys.length;
    const relativePriceCount = (n * (n - 1)) / 2;

    if (n < 2) return { violated: false };

    // Count how many relative prices have converged (low volatility on both sides)
    let convergedPairs = 0;
    for (let i = 0; i < priceKeys.length; i++) {
      for (let j = i + 1; j < priceKeys.length; j++) {
        const volA = priceVolatility[priceKeys[i]!] ?? 0;
        const volB = priceVolatility[priceKeys[j]!] ?? 0;
        // Both items stable = pair converged
        if (volA < 0.20 && volB < 0.20) {
          convergedPairs++;
        }
      }
    }

    const convergenceRate = convergedPairs / Math.max(1, relativePriceCount);

    if (convergenceRate < thresholds.relativePriceConvergenceTarget && n >= 4) {
      return {
        violated: true,
        severity: 4,
        evidence: {
          totalItems: n,
          relativePriceCount,
          convergedPairs,
          convergenceRate,
          target: thresholds.relativePriceConvergenceTarget,
        },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            `Only ${(convergenceRate * 100).toFixed(0)}% of ${relativePriceCount} relative prices ` +
            `have converged (target: ${(thresholds.relativePriceConvergenceTarget * 100).toFixed(0)}%). ` +
            'Price space too complex for distributed discovery. Lower friction to help.',
        },
        confidence: 0.55,
        estimatedLag: thresholds.priceDiscoveryWindowTicks,
      };
    }

    return { violated: false };
  },
};

export const MARKET_DYNAMICS_PRINCIPLES: Principle[] = [
  P29_PinchPoint,
  P30_MovingPinchPoint,
  P57_CombinatorialPriceSpace,
];
