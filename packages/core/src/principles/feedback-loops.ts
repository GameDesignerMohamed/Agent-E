// P20-P24: Feedback Loop Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P20_DecayPreventsAccumulation: Principle = {
  id: 'P20',
  name: 'Decay Prevents Accumulation',
  category: 'feedback',
  description:
    'Resources without decay create infinite hoarding. ' +
    'A Gatherer who never sells has 500 ore rotting in their pocket ' +
    'while Crafters starve. 2-10% decay per period forces circulation.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, velocity, totalAgents } = metrics;

    // High supply + low velocity = hoarding, not abundance
    const totalResources = Object.values(supplyByResource).reduce((s, v) => s + v, 0);
    const resourcesPerAgent = totalResources / Math.max(1, totalAgents);

    if (resourcesPerAgent > 20 && velocity < 3) {
      return {
        violated: true,
        severity: 4,
        evidence: { totalResources, resourcesPerAgent, velocity },
        suggestedAction: {
          parameter: 'miningYield',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            `${totalResources.toFixed(0)} resources with velocity ${velocity}/t. ` +
            'Likely hoarding. Reduce yield to increase scarcity and force circulation.',
        },
        confidence: 0.65,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const P21_PriceFromGlobalSupply: Principle = {
  id: 'P21',
  name: 'Price Reflects Global Supply, Not Just AH Listings',
  category: 'feedback',
  description:
    'If prices only update from Auction House activity, agents with hoarded ' +
    'inventory see artificially high prices and keep gathering when they should stop.',
  check(metrics, _thresholds): PrincipleResult {
    const { priceVolatility, supplyByResource, prices } = metrics;

    // High price volatility with stable supply = price disconnected from fundamentals
    for (const resource of Object.keys(prices)) {
      const volatility = priceVolatility[resource] ?? 0;
      const supply = supplyByResource[resource] ?? 0;

      if (volatility > 0.30 && supply > 30) {
        return {
          violated: true,
          severity: 3,
          evidence: { resource, volatility, supply, price: prices[resource] },
          suggestedAction: {
            parameter: 'auctionFee',
            direction: 'increase',
            magnitude: 0.05,
            reasoning:
              `${resource} price volatile (${(volatility * 100).toFixed(0)}%) despite supply ${supply}. ` +
              'Price may not reflect global inventory. Increase trading friction to stabilise.',
          },
          confidence: 0.55,
          estimatedLag: 10,
        };
      }
    }

    return { violated: false };
  },
};

export const P22_MarketAwarenessPreventsSurplus: Principle = {
  id: 'P22',
  name: 'Market Awareness Prevents Overproduction',
  category: 'feedback',
  description:
    'Producers who craft without checking market prices will create surpluses ' +
    'that crash prices. Agents need to see prices before deciding to produce.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, prices, productionIndex } = metrics;

    // Signal: weapons supply very high, weapon price very low, but Crafters still producing
    const weapons = supplyByResource['weapons'] ?? 0;
    const weaponPrice = prices['weapons'] ?? 0;
    const healthyWeaponPrice = 30; // approximate floor

    if (weapons > 100 && weaponPrice < healthyWeaponPrice * 0.5 && productionIndex > 0) {
      return {
        violated: true,
        severity: 4,
        evidence: { weapons, weaponPrice, productionIndex },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `${weapons} weapons with price ${weaponPrice.toFixed(0)}g but still producing. ` +
            'Producers appear unaware of market. Raise production cost to slow output.',
        },
        confidence: 0.70,
        estimatedLag: 8,
      };
    }

    return { violated: false };
  },
};

export const P23_ProfitabilityFactorsFeasibility: Principle = {
  id: 'P23',
  name: 'Profitability Factors Execution Feasibility',
  category: 'feedback',
  description:
    'An agent who calculates profit = weapon_price - ore_cost but has no gold ' +
    'to buy ore is chasing phantom profit. ' +
    'Feasibility (can I afford the inputs?) must be part of the profitability calc.',
  check(metrics, _thresholds): PrincipleResult {
    const { avgSatisfaction, blockedAgentCount, totalAgents } = metrics;

    const blockedFraction = blockedAgentCount / Math.max(1, totalAgents);
    if (blockedFraction > 0.20 && avgSatisfaction < 60) {
      return {
        violated: true,
        severity: 5,
        evidence: { blockedFraction, blockedAgentCount, avgSatisfaction },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `${(blockedFraction * 100).toFixed(0)}% of agents blocked with low satisfaction. ` +
            'Agents may have roles they cannot afford to execute. ' +
            'Lower production costs to restore feasibility.',
        },
        confidence: 0.70,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const P24_BlockedAgentsDecayFaster: Principle = {
  id: 'P24',
  name: 'Blocked Agents Decay Faster',
  category: 'feedback',
  description:
    'An agent who cannot perform their preferred activity loses satisfaction faster ' +
    'and churns sooner. Blocked agents must be identified and unblocked, ' +
    'or they become silent bottlenecks that skew churn data.',
  check(metrics, thresholds): PrincipleResult {
    const { blockedAgentCount, totalAgents, churnRate } = metrics;
    const blockedFraction = blockedAgentCount / Math.max(1, totalAgents);

    if (blockedFraction > thresholds.blockedAgentMaxFraction) {
      return {
        violated: true,
        severity: 5,
        evidence: { blockedFraction, blockedAgentCount, churnRate },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `${(blockedFraction * 100).toFixed(0)}% of agents blocked. ` +
            'Blocked agents churn silently, skewing metrics. ' +
            'Lower fees to unblock market participation.',
        },
        confidence: 0.75,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const FEEDBACK_LOOP_PRINCIPLES: Principle[] = [
  P20_DecayPreventsAccumulation,
  P21_PriceFromGlobalSupply,
  P22_MarketAwarenessPreventsSurplus,
  P23_ProfitabilityFactorsFeasibility,
  P24_BlockedAgentsDecayFaster,
];
