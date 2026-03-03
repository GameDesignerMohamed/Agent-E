// P20-P24: Feedback Loop Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P20_DecayPreventsAccumulation: Principle = {
  id: 'P20',
  name: 'Decay Prevents Accumulation',
  category: 'feedback',
  description:
    'Resources without decay create infinite hoarding. ' +
    'A gatherer who never sells has 500 raw materials rotting in their pocket ' +
    'while producers starve. 2-10% decay per period forces circulation.',
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
          parameterType: 'yield',
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
    'If prices only update from market activity, agents with hoarded ' +
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
            parameterType: 'fee', scope: { tags: ['transaction'] },
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
    'Producers who produce without checking market prices will create surpluses ' +
    'that crash prices. Agents need to see prices before deciding to produce.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, prices, productionIndex } = metrics;

    // Calculate median price across all resources
    const priceValues = Object.values(prices).filter(p => p > 0);
    if (priceValues.length === 0) return { violated: false };

    const sortedPrices = [...priceValues].sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)] ?? 0;

    // Check each resource: if price deviates >3× from median while supply is falling
    for (const [resource, price] of Object.entries(prices)) {
      if (price <= 0) continue;

      const supply = supplyByResource[resource] ?? 0;
      const priceDeviation = price / Math.max(1, medianPrice);

      // Price crash: price < 1/3 median, high supply, still producing
      if (priceDeviation < 0.33 && supply > 100 && productionIndex > 0) {
        return {
          violated: true,
          severity: 4,
          evidence: {
            resource,
            price,
            medianPrice,
            priceDeviation,
            supply,
            productionIndex
          },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'increase',
            magnitude: 0.10,
            reasoning:
              `${resource} price ${price.toFixed(0)} is ${(priceDeviation * 100).toFixed(0)}% of median (${medianPrice.toFixed(0)}). ` +
              `Supply ${supply} units but still producing. ` +
              'Producers appear unaware of market. Raise production cost to slow output.',
          },
          confidence: 0.70,
          estimatedLag: 8,
        };
      }
    }

    return { violated: false };
  },
};

export const P23_ProfitabilityFactorsFeasibility: Principle = {
  id: 'P23',
  name: 'Profitability Factors Execution Feasibility',
  category: 'feedback',
  description:
    'An agent who calculates profit = goods_price - materials_cost but has no currency ' +
    'to buy raw materials is chasing phantom profit. ' +
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
          parameterType: 'cost',
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
          parameterType: 'fee', scope: { tags: ['transaction'] },
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
