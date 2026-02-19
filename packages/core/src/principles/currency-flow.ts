// P12-P16, P32: Currency Flow Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P12_OnePrimaryFaucet: Principle = {
  id: 'P12',
  name: 'One Primary Faucet',
  category: 'currency',
  description:
    'Multiple independent currency sources (gathering + crafting + quests) each ' +
    'creating gold causes uncontrolled inflation. One clear primary faucet ' +
    'makes the economy predictable and auditable.',
  check(metrics, thresholds): PrincipleResult {
    const { netFlow, faucetVolume, sinkVolume } = metrics;

    if (netFlow > thresholds.netFlowWarnThreshold) {
      return {
        violated: true,
        severity: 5,
        evidence: { netFlow, faucetVolume, sinkVolume },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'increase',
          magnitude: 0.15,
          reasoning:
            `Net flow +${netFlow.toFixed(1)} g/t. Inflationary. ` +
            'Increase crafting cost (primary sink) to balance faucet output.',
        },
        confidence: 0.80,
        estimatedLag: 8,
      };
    }

    if (netFlow < -thresholds.netFlowWarnThreshold) {
      return {
        violated: true,
        severity: 4,
        evidence: { netFlow, faucetVolume, sinkVolume },
        suggestedAction: {
          parameter: 'craftingCost',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `Net flow ${netFlow.toFixed(1)} g/t. Deflationary. ` +
            'Decrease crafting cost to ease sink pressure.',
        },
        confidence: 0.80,
        estimatedLag: 8,
      };
    }

    return { violated: false };
  },
};

export const P13_PotsAreZeroSumAndSelfRegulate: Principle = {
  id: 'P13',
  name: 'Pots Self-Regulate with Correct Multiplier',
  category: 'currency',
  description:
    'Arena pot math: winRate × multiplier > (1 - houseCut) drains the pot. ' +
    'At 65% win rate, multiplier must be ≤ 1.38. We use 1.5 for slight surplus buffer.',
  check(metrics, thresholds): PrincipleResult {
    const { poolSizes } = metrics;
    const arenaPot = poolSizes['arena'] ?? poolSizes['arenaPot'] ?? 0;

    // Pot is draining if it's near zero despite fights happening
    const fighters = metrics.populationByRole['Fighter'] ?? 0;
    if (fighters > 5 && arenaPot < 50) {
      // Estimate if the multiplier math is sustainable
      const { arenaWinRate, arenaHouseCut } = thresholds;
      const maxSustainableMultiplier = (1 - arenaHouseCut) / arenaWinRate;

      return {
        violated: true,
        severity: 7,
        evidence: { arenaPot, fighters, maxSustainableMultiplier },
        suggestedAction: {
          parameter: 'arenaReward',
          direction: 'decrease',
          magnitude: 0.15,
          reasoning:
            `Arena pot at ${arenaPot.toFixed(0)}g with ${fighters} fighters. ` +
            `Sustainable multiplier ≤ ${maxSustainableMultiplier.toFixed(2)}. ` +
            'Reduce reward multiplier to prevent pot drain.',
        },
        confidence: 0.85,
        estimatedLag: 3,
      };
    }

    return { violated: false };
  },
};

export const P14_TrackActualInjection: Principle = {
  id: 'P14',
  name: 'Track Actual Gold Injection, Not Value Creation',
  category: 'currency',
  description:
    'Counting resource gathering as "gold injected" is a lie. ' +
    'Gold only enters when Fighters spawn (100-150g each). ' +
    'Fake metrics break every downstream decision.',
  check(metrics, _thresholds): PrincipleResult {
    const { faucetVolume, netFlow, totalSupply } = metrics;

    // If faucetVolume is suspiciously large relative to any real injection mechanism
    // (spawning), flag for audit. Proxy: if supply grows faster than expected.
    const supplyGrowthRate = Math.abs(netFlow) / Math.max(1, totalSupply);

    if (supplyGrowthRate > 0.10) {
      return {
        violated: true,
        severity: 4,
        evidence: { faucetVolume, netFlow, supplyGrowthRate },
        suggestedAction: {
          parameter: 'miningYield',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            `Supply growing at ${(supplyGrowthRate * 100).toFixed(1)}%/tick. ` +
            'Verify gold injection tracking. Resources should not create gold directly.',
        },
        confidence: 0.55,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const P15_PoolsNeedCapAndDecay: Principle = {
  id: 'P15',
  name: 'Pools Need Cap + Decay',
  category: 'currency',
  description:
    'Any pool (bank, reward pool) without a cap accumulates infinitely. ' +
    'Bank pool at 42% of gold supply means 42% of the economy is frozen. ' +
    'Cap at 5%, decay at 2%/tick.',
  check(metrics, thresholds): PrincipleResult {
    const { poolSizes, totalSupply } = metrics;
    const { poolCapPercent } = thresholds;

    for (const [pool, size] of Object.entries(poolSizes)) {
      if (pool === 'arena' || pool === 'arenaPot') continue; // pot has different rules
      const shareOfSupply = size / Math.max(1, totalSupply);
      if (shareOfSupply > poolCapPercent * 2) { // trigger at 2× cap
        return {
          violated: true,
          severity: 6,
          evidence: { pool, size, shareOfSupply, cap: poolCapPercent },
          suggestedAction: {
            parameter: 'auctionFee',
            direction: 'decrease',
            magnitude: 0.10,
            reasoning:
              `${pool} pool at ${(shareOfSupply * 100).toFixed(1)}% of supply ` +
              `(cap: ${(poolCapPercent * 100).toFixed(0)}%). Gold frozen. ` +
              'Lower fees to encourage circulation over accumulation.',
          },
          confidence: 0.85,
          estimatedLag: 5,
        };
      }
    }

    return { violated: false };
  },
};

export const P16_WithdrawalPenaltyScales: Principle = {
  id: 'P16',
  name: 'Withdrawal Penalty Scales with Lock Duration',
  category: 'currency',
  description:
    'A 50-tick lock period with a penalty calculated as /100 means agents can ' +
    'exit after 1 tick and keep 99% of accrued yield. ' +
    'Penalty must scale linearly: (1 - ticksStaked/lockDuration) × yield.',
  check(metrics, _thresholds): PrincipleResult {
    const { poolSizes, totalSupply } = metrics;
    const bankPool = poolSizes['bank'] ?? poolSizes['bankPool'] ?? 0;

    // If bank pool is small but staked gold is large, early withdrawal penalty is weak
    // (people staking but pulling out early, depleting the pool)
    const stakedEstimate = totalSupply * 0.15; // rough: if 15% staked is healthy
    if (bankPool < 10 && stakedEstimate > 100) {
      return {
        violated: true,
        severity: 3,
        evidence: { bankPool, estimatedStaked: stakedEstimate },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'increase',
          magnitude: 0.05,
          reasoning:
            'Bank pool depleted while significant gold should be staked. ' +
            'Early withdrawals may be draining yield pool. ' +
            'Ensure withdrawal penalty scales with lock duration.',
        },
        confidence: 0.45,
        estimatedLag: 10,
      };
    }

    return { violated: false };
  },
};

export const P32_VelocityAboveSupply: Principle = {
  id: 'P32',
  name: 'Velocity > Supply for Liquidity',
  category: 'currency',
  description:
    'Low transactions despite adequate supply means liquidity is trapped. ' +
    'High supply with low velocity = stagnation, not abundance.',
  check(metrics, _thresholds): PrincipleResult {
    const { velocity, totalSupply, supplyByResource } = metrics;
    const totalResources = Object.values(supplyByResource).reduce((s, v) => s + v, 0);

    // Stagnation: resources exist, gold exists, but nobody is trading
    if (velocity < 3 && totalSupply > 100 && totalResources > 20) {
      return {
        violated: true,
        severity: 4,
        evidence: { velocity, totalSupply, totalResources },
        suggestedAction: {
          parameter: 'auctionFee',
          direction: 'decrease',
          magnitude: 0.20,
          reasoning:
            `Velocity ${velocity}/t with ${totalResources} resources in system. ` +
            'Economy stagnant despite available supply. Lower trading friction.',
        },
        confidence: 0.75,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const CURRENCY_FLOW_PRINCIPLES: Principle[] = [
  P12_OnePrimaryFaucet,
  P13_PotsAreZeroSumAndSelfRegulate,
  P14_TrackActualInjection,
  P15_PoolsNeedCapAndDecay,
  P16_WithdrawalPenaltyScales,
  P32_VelocityAboveSupply,
];
