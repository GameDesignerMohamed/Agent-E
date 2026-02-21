// P1-P4: Supply Chain Principles
// Source: V0.0-V0.4.6 development failures — ore piling at Forge, hand-off blockage

import type { Principle, PrincipleResult } from '../types.js';

export const P1_ProductionMatchesConsumption: Principle = {
  id: 'P1',
  name: 'Production Must Match Consumption',
  category: 'supply_chain',
  description:
    'If producer rate < consumer rate, supply deficit kills the economy. ' +
    '105 ore rotting at Forge (V0.4.6) happened because this was out of balance.',
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

    // Also check: if producer roles are outnumbered relative to consumer roles
    const crafters = (populationByRole['Crafter'] ?? 0) + (populationByRole['Alchemist'] ?? 0);
    const consumers = (populationByRole['Fighter'] ?? 0);
    const productionDeficit = consumers > 0 && crafters / consumers < 0.1;

    if (violations.length > 0 || productionDeficit) {
      return {
        violated: true,
        severity: 7,
        evidence: { scarceResources: violations, crafters, consumers },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning: 'Lower crafting cost to incentivise more production.',
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
    'Gatherers delivering ore directly to Crafters at the Forge is faster and cleaner.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, prices, velocity } = metrics;

    // Signal: raw materials (ore, wood) have high supply but low velocity
    // This suggests they are listed but not being bought
    const ore = supplyByResource['ore'] ?? 0;
    const wood = supplyByResource['wood'] ?? 0;
    const orePrice = prices['ore'] ?? 0;
    const woodPrice = prices['wood'] ?? 0;

    const oreBacklog = ore > 50 && orePrice > 0;
    const woodBacklog = wood > 50 && woodPrice > 0;
    const stagnant = velocity < 3;

    if ((oreBacklog || woodBacklog) && stagnant) {
      return {
        violated: true,
        severity: 5,
        evidence: { ore, wood, velocity },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'increase',
          magnitude: 0.20,
          reasoning:
            'Raise AH fees to discourage raw material listings. ' +
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
    'anything first. Crafter starting with 15g but needing 30g to accept ore hand-off ' +
    'blocks the entire supply chain from tick 1.',
  check(metrics, _thresholds): PrincipleResult {
    const { populationByRole, supplyByResource, prices } = metrics;

    // Proxy: if there are producers but supply of their output is zero or near-zero
    // despite producers existing, bootstrap likely failed
    const crafters = populationByRole['Crafter'] ?? 0;
    const alchemists = populationByRole['Alchemist'] ?? 0;
    const weapons = supplyByResource['weapons'] ?? 0;
    const potions = supplyByResource['potions'] ?? 0;

    const crafterBootstrapFail = crafters > 0 && weapons === 0 && (prices['ore'] ?? 0) > 0;
    const alchemistBootstrapFail = alchemists > 0 && potions === 0 && (prices['wood'] ?? 0) > 0;

    if (crafterBootstrapFail || alchemistBootstrapFail) {
      return {
        violated: true,
        severity: 8,
        evidence: { crafters, alchemists, weapons, potions },
        suggestedAction: {
          parameter: 'craftingCost',
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

    return { violated: false };
  },
};

export const P4_MaterialsFlowFasterThanCooldown: Principle = {
  id: 'P4',
  name: 'Materials Flow Faster Than Cooldown',
  category: 'supply_chain',
  description:
    'Input delivery rate must exceed or match production cooldown rate. ' +
    'If Crafters craft every 5 ticks but only receive ore every 10 ticks, ' +
    'they starve regardless of supply levels.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, populationByRole, velocity } = metrics;

    const gatherers = populationByRole['Gatherer'] ?? 0;
    const crafters = populationByRole['Crafter'] ?? 0;
    const alchemists = populationByRole['Alchemist'] ?? 0;

    // Rough proxy: if ore supply is growing (gatherers > 0) but weapons aren't
    // being produced (weapons supply static), delivery is outpacing consumption
    // or consumption is bottlenecked by material shortage
    const producers = crafters + alchemists;
    const gathererToProcuderRatio = gatherers / Math.max(1, producers);

    // Too few gatherers: producers will starve
    if (producers > 0 && gathererToProcuderRatio < 0.5 && velocity < 5) {
      return {
        violated: true,
        severity: 5,
        evidence: { gatherers, crafters, alchemists, gathererToProcuderRatio },
        suggestedAction: {
          parameter: 'miningYield',
          direction: 'increase',
          magnitude: 0.15,
          reasoning: 'Too few gatherers relative to producers. Increase yield to compensate.',
        },
        confidence: 0.65,
        estimatedLag: 8,
      };
    }

    // Too many: materials pile up
    const ore = supplyByResource['ore'] ?? 0;
    const wood = supplyByResource['wood'] ?? 0;
    if (ore > 80 || wood > 80) {
      return {
        violated: true,
        severity: 4,
        evidence: { ore, wood, gatherers, producers },
        suggestedAction: {
          parameter: 'miningYield',
          direction: 'decrease',
          magnitude: 0.20,
          reasoning: 'Raw materials piling up. Gatherers outpacing producers.',
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
          parameter: 'craftingCost',
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
