// P35, P40, P49: Resource Management Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P35_DestructionCreatesValue: Principle = {
  id: 'P35',
  name: 'Destruction Creates Value',
  category: 'resource',
  description:
    'If nothing is ever permanently lost, inflation is inevitable. ' +
    'Weapon durability (breaks after 3 fights), potion consumption on use, ' +
    'and ore costs for crafting are all destruction mechanisms. ' +
    'Without them, supply grows without bound.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, sinkVolume, netFlow } = metrics;

    // High supply of consumables + low sink volume = destruction not working
    const weapons = supplyByResource['weapons'] ?? 0;
    const potions = supplyByResource['potions'] ?? 0;

    if ((weapons > 200 || potions > 200) && sinkVolume < 5 && netFlow > 0) {
      return {
        violated: true,
        severity: 6,
        evidence: { weapons, potions, sinkVolume, netFlow },
        suggestedAction: {
          parameter: 'arenaEntryFee',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            `${weapons} weapons + ${potions} potions with low destruction (sink ${sinkVolume}/t). ` +
            'Consumables not being consumed. Lower arena entry to increase weapon/potion usage.',
        },
        confidence: 0.70,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const P40_ReplacementRate: Principle = {
  id: 'P40',
  name: 'Replacement Rate ≥ 2× Consumption',
  category: 'resource',
  description:
    'Respawn/production rate must be at least 2× consumption rate for equilibrium. ' +
    'At 1× you drift toward depletion. At 2× you have a buffer for demand spikes.',
  check(metrics, thresholds): PrincipleResult {
    const { productionIndex, sinkVolume } = metrics;

    if (sinkVolume > 0 && productionIndex > 0) { // skip if production not tracked (productionIndex=0)
      const replacementRatio = productionIndex / sinkVolume;
      if (replacementRatio < 1.0) {
        return {
          violated: true,
          severity: 6,
          evidence: { productionIndex, sinkVolume, replacementRatio },
          suggestedAction: {
            parameter: 'miningYield',
            direction: 'increase',
            magnitude: 0.15,
            reasoning:
              `Replacement rate ${replacementRatio.toFixed(2)} (need ≥${thresholds.replacementRateMultiplier}). ` +
              'Production below consumption. Resources will deplete. Increase yield.',
          },
          confidence: 0.80,
          estimatedLag: 5,
        };
      } else if (replacementRatio > thresholds.replacementRateMultiplier * 3) {
        return {
          violated: true,
          severity: 3,
          evidence: { productionIndex, sinkVolume, replacementRatio },
          suggestedAction: {
            parameter: 'miningYield',
            direction: 'decrease',
            magnitude: 0.10,
            reasoning:
              `Replacement rate ${replacementRatio.toFixed(2)} — overproducing. ` +
              'Production far exceeds consumption. Reduce yield to prevent glut.',
          },
          confidence: 0.70,
          estimatedLag: 8,
        };
      }
    }

    return { violated: false };
  },
};

export const P49_IdleAssetTax: Principle = {
  id: 'P49',
  name: 'Idle Asset Tax',
  category: 'resource',
  description:
    'Appreciating assets without holding cost → wealth concentration. ' +
    'If hoarding an asset makes you richer just by holding it, everyone hoards. ' +
    'Decay rates, storage costs, or expiry are "idle asset taxes" that force circulation.',
  check(metrics, _thresholds): PrincipleResult {
    const { giniCoefficient, top10PctShare, velocity } = metrics;

    // High Gini + low velocity + high top-10% share = idle asset hoarding
    if (giniCoefficient > 0.55 && top10PctShare > 0.60 && velocity < 5) {
      return {
        violated: true,
        severity: 5,
        evidence: { giniCoefficient, top10PctShare, velocity },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'increase',
          magnitude: 0.15,
          reasoning:
            `Gini ${giniCoefficient.toFixed(2)}, top 10% hold ${(top10PctShare * 100).toFixed(0)}%, velocity ${velocity}. ` +
            'Wealth concentrated in idle assets. Raise trading costs to simulate holding tax.',
        },
        confidence: 0.70,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const RESOURCE_MGMT_PRINCIPLES: Principle[] = [
  P35_DestructionCreatesValue,
  P40_ReplacementRate,
  P49_IdleAssetTax,
];
