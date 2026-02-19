// P17-P19: Bootstrap Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P17_GracePeriodBeforeIntervention: Principle = {
  id: 'P17',
  name: 'Grace Period Before Intervention',
  category: 'bootstrap',
  description:
    'Any intervention before tick 50 is premature. The economy needs time to ' +
    'bootstrap with designed distributions. AgentE intervening at tick 1 against ' +
    '55% Fighters (designed) killed the economy instantly.',
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
          parameter: 'arenaEntryFee',
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
    'A Crafter with 0 weapons and 0 gold must sell nothing to get gold before ' +
    'they can buy ore. This creates a chicken-and-egg freeze. ' +
    'Starting inventory (2 weapons + 4 ore + 40g) breaks the deadlock.',
  check(metrics, _thresholds): PrincipleResult {
    if (metrics.tick > 20) return { violated: false }; // bootstrap window over

    const weapons = metrics.supplyByResource['weapons'] ?? 0;
    const potions = metrics.supplyByResource['potions'] ?? 0;
    const crafters = metrics.populationByRole['Crafter'] ?? 0;
    const alchemists = metrics.populationByRole['Alchemist'] ?? 0;

    // If producers exist but their products don't, bootstrap inventory wasn't provided
    if ((crafters > 0 && weapons === 0) || (alchemists > 0 && potions === 0)) {
      return {
        violated: true,
        severity: 8,
        evidence: { tick: metrics.tick, weapons, potions, crafters, alchemists },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'decrease',
          magnitude: 0.50,
          reasoning:
            'Bootstrap failure: producers have no products on tick 1-20. ' +
            'Drastically reduce production cost to allow immediate output.',
        },
        confidence: 0.90,
        estimatedLag: 2,
      };
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
    'Early scarcity creates an AH gridlock where everyone wants to buy ' +
    'and nobody has anything to sell.',
  check(metrics, _thresholds): PrincipleResult {
    if (metrics.tick > 30) return { violated: false }; // only relevant early

    const fighters = metrics.populationByRole['Fighter'] ?? 0;
    const weapons = metrics.supplyByResource['weapons'] ?? 0;
    const potions = metrics.supplyByResource['potions'] ?? 0;

    // Each fighter needs a weapon. If weapons < 50% of fighters at start, cold-start likely
    if (fighters > 5 && weapons < fighters * 0.5) {
      return {
        violated: true,
        severity: 6,
        evidence: { fighters, weapons, potions, weaponsPerFighter: weapons / Math.max(1, fighters) },
        suggestedAction: {
          parameter: 'arenaReward',
          direction: 'increase',
          magnitude: 0.20,
          reasoning:
            `${fighters} fighters but only ${weapons} weapons. Cold-start scarcity. ` +
            'Boost arena reward to attract fighters even without weapons.',
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
