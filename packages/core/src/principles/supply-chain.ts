// P1-P4: Supply Chain Principles
// Source: Supply-chain failure patterns — resource accumulation at bottlenecks, hand-off blockage

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

export const P2_ClosedLoopsNeedDirectHandoff: Principle = {
  id: 'P2',
  name: 'Closed Loops Need Direct Handoff',
  category: 'supply_chain',
  description:
    'Raw materials listed on an open market create noise and liquidity problems. ' +
    'Gatherers delivering raw materials directly to producers at production zones is faster and cleaner.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, prices, velocity, totalAgents } = metrics;

    // Signal: raw materials have high supply but low velocity
    // This suggests they are listed but not being bought
    const avgSupplyPerAgent = totalAgents > 0
      ? Object.values(supplyByResource).reduce((s, v) => s + v, 0) / totalAgents
      : 0;

    // Check for ANY resource with excessive supply relative to average
    const backlogResources: string[] = [];
    for (const [resource, supply] of Object.entries(supplyByResource)) {
      const price = prices[resource] ?? 0;
      if (supply > avgSupplyPerAgent * 0.5 && price > 0) {
        backlogResources.push(resource);
      }
    }

    const stagnant = velocity < 3;

    if (backlogResources.length > 0 && stagnant) {
      return {
        violated: true,
        severity: 5,
        evidence: { backlogResources, velocity },
        suggestedAction: {
          parameterType: 'fee',
          scope: { tags: ['transaction'] },
          direction: 'increase',
          magnitude: 0.20,
          reasoning:
            'Raise market fees to discourage raw material listings. ' +
            'Direct hand-off at production zones is the correct channel.',
        },
        confidence: 0.70,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const P3_BootstrapCapitalCoversFirstTransaction: Principle = {
  id: 'P3',
  name: 'Bootstrap Capital Covers First Transaction',
  category: 'supply_chain',
  description:
    'A new producer must be able to afford their first transaction without selling ' +
    'anything first. Producer starting with low currency but needing more to accept raw material hand-off ' +
    'blocks the entire supply chain from tick 1.',
  check(metrics, _thresholds): PrincipleResult {
    const { populationByRole, supplyByResource, prices, totalAgents } = metrics;

    // Proxy: if there are agents but supply of ANY produced resource is zero
    // despite positive prices for inputs, bootstrap likely failed
    const totalProducers = Object.values(populationByRole).reduce((s, v) => s + v, 0);

    if (totalProducers > 0) {
      // Check for any resource with zero supply but positive input prices
      for (const [resource, supply] of Object.entries(supplyByResource)) {
        if (supply === 0) {
          // Check if there are any priced inputs (suggesting materials available but not being produced)
          const anyInputPriced = Object.values(prices).some(p => p > 0);
          if (anyInputPriced) {
            return {
              violated: true,
              severity: 8,
              evidence: { resource, totalProducers, supply },
              suggestedAction: {
                parameterType: 'cost',
                direction: 'decrease',
                magnitude: 0.30,
                reasoning:
                  'Producers cannot complete first transaction. ' +
                  'Lower production cost to unblock bootstrap.',
              },
              confidence: 0.80,
              estimatedLag: 3,
            };
          }
        }
      }
    }

    return { violated: false };
  },
};

export const P4_MaterialsFlowFasterThanCooldown: Principle = {
  id: 'P4',
  name: 'Materials Flow Faster Than Cooldown',
  category: 'supply_chain',
  description:
    'Input delivery rate must exceed or match production cooldown rate. ' +
    'If producers produce every 5 ticks but only receive raw materials every 10 ticks, ' +
    'they starve regardless of supply levels.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, populationByRole, velocity, totalAgents } = metrics;

    // Check total raw material supply vs total population
    const totalSupply = Object.values(supplyByResource).reduce((s, v) => s + v, 0);
    const avgSupplyPerAgent = totalAgents > 0 ? totalSupply / totalAgents : 0;

    // Check population ratio across all roles
    const roleEntries = Object.entries(populationByRole);
    const totalRoles = roleEntries.length;

    // If there's significant population imbalance and low velocity, may indicate flow issues
    if (totalRoles >= 2 && velocity < 5 && avgSupplyPerAgent < 0.5) {
      return {
        violated: true,
        severity: 5,
        evidence: { avgSupplyPerAgent, velocity, totalRoles },
        suggestedAction: {
          parameterType: 'yield',
          direction: 'increase',
          magnitude: 0.15,
          reasoning: 'Low supply per agent with stagnant velocity. Increase yield to compensate.',
        },
        confidence: 0.65,
        estimatedLag: 8,
      };
    }

    // Too much supply piling up: materials accumulating faster than being consumed
    if (avgSupplyPerAgent > 2) {
      return {
        violated: true,
        severity: 4,
        evidence: { avgSupplyPerAgent, totalSupply, totalAgents },
        suggestedAction: {
          parameterType: 'yield',
          direction: 'decrease',
          magnitude: 0.20,
          reasoning: 'Raw materials piling up. Extractors outpacing producers.',
        },
        confidence: 0.80,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const P60_SurplusDisposalAsymmetry: Principle = {
  id: 'P60',
  name: 'Surplus Disposal Asymmetry',
  category: 'supply_chain',
  description:
    'Most trades liquidate unwanted surplus, not deliberate production. ' +
    'Price signals from disposal trades are weaker demand indicators than ' +
    'production-for-sale trades — weight them accordingly.',
  check(metrics, thresholds): PrincipleResult {
    const { disposalTradeRatio } = metrics;

    // If majority of trades are disposal, price signals are unreliable
    if (disposalTradeRatio > 0.60) {
      return {
        violated: true,
        severity: 5,
        evidence: {
          disposalTradeRatio,
          discount: thresholds.disposalTradeWeightDiscount,
        },
        suggestedAction: {
          parameterType: 'cost',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            `${(disposalTradeRatio * 100).toFixed(0)}% of trades are surplus disposal. ` +
            'Price signals unreliable as demand indicators. ' +
            'Lower production costs to shift balance toward deliberate production-for-sale. ' +
            `ADVISORY: Weight disposal-trade prices at ${thresholds.disposalTradeWeightDiscount}× ` +
            'in index calculations.',
        },
        confidence: 0.65,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const SUPPLY_CHAIN_PRINCIPLES: Principle[] = [
  P1_ProductionMatchesConsumption,
  P2_ClosedLoopsNeedDirectHandoff,
  P3_BootstrapCapitalCoversFirstTransaction,
  P4_MaterialsFlowFasterThanCooldown,
  P60_SurplusDisposalAsymmetry,
];
