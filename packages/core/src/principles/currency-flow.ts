// P12-P16, P32: Currency Flow Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P12_OnePrimaryFaucet: Principle = {
  id: 'P12',
  name: 'One Primary Faucet',
  category: 'currency',
  description:
    'Multiple independent currency sources (gathering + production + activities) each ' +
    'creating currency causes uncontrolled inflation. One clear primary faucet ' +
    'makes the economy predictable and auditable.',
  check(metrics, thresholds): PrincipleResult {
    for (const curr of metrics.currencies) {
      const netFlow = metrics.netFlowByCurrency[curr] ?? 0;
      const faucetVolume = metrics.faucetVolumeByCurrency[curr] ?? 0;
      const sinkVolume = metrics.sinkVolumeByCurrency[curr] ?? 0;

      if (netFlow > thresholds.netFlowWarnThreshold) {
        return {
          violated: true,
          severity: 5,
          evidence: { currency: curr, netFlow, faucetVolume, sinkVolume },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'increase',
            scope: { currency: curr },
            magnitude: 0.15,
            reasoning:
              `[${curr}] Net flow +${netFlow.toFixed(1)}/tick. Inflationary. ` +
              'Increase production cost (primary sink) to balance faucet output.',
          },
          confidence: 0.80,
          estimatedLag: 8,
        };
      }

      if (netFlow < -thresholds.netFlowWarnThreshold) {
        return {
          violated: true,
          severity: 4,
          evidence: { currency: curr, netFlow, faucetVolume, sinkVolume },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'decrease',
            scope: { currency: curr },
            magnitude: 0.15,
            reasoning:
              `[${curr}] Net flow ${netFlow.toFixed(1)}/tick. Deflationary. ` +
              'Decrease production cost to ease sink pressure.',
          },
          confidence: 0.80,
          estimatedLag: 8,
        };
      }
    }

    return { violated: false };
  },
};

export const P13_PotsAreZeroSumAndSelfRegulate: Principle = {
  id: 'P13',
  name: 'Pots Self-Regulate with Correct Multiplier',
  category: 'currency',
  description:
    'Competitive pot math: winRate × multiplier > (1 - houseCut) drains the pot. ' +
    'At 65% win rate, multiplier must be ≤ 1.38. We use 1.5 for slight surplus buffer.',
  check(metrics, thresholds): PrincipleResult {
    const { populationByRole } = metrics;

    const roleEntries = Object.entries(populationByRole).sort((a, b) => b[1] - a[1]);
    const dominantCount = roleEntries[0]?.[1] ?? 0;

    for (const [poolName, currencyAmounts] of Object.entries(metrics.poolSizesByCurrency)) {
      for (const curr of metrics.currencies) {
        const poolSize = currencyAmounts[curr] ?? 0;

        if (dominantCount > 5 && poolSize < 50) {
          const { poolWinRate, poolHouseCut } = thresholds;
          const maxSustainableMultiplier = (1 - poolHouseCut) / poolWinRate;

          return {
            violated: true,
            severity: 7,
            evidence: { currency: curr, pool: poolName, poolSize, participants: dominantCount, maxSustainableMultiplier },
            suggestedAction: {
              parameterType: 'reward',
              direction: 'decrease',
              scope: { currency: curr },
              magnitude: 0.15,
              reasoning:
                `[${curr}] ${poolName} pool at ${poolSize.toFixed(0)} currency with ${dominantCount} active participants. ` +
                `Sustainable multiplier ≤ ${maxSustainableMultiplier.toFixed(2)}. ` +
                'Reduce reward multiplier to prevent pool drain.',
            },
            confidence: 0.85,
            estimatedLag: 3,
          };
        }
      }
    }

    return { violated: false };
  },
};

export const P14_TrackActualInjection: Principle = {
  id: 'P14',
  name: 'Track Actual Currency Injection, Not Value Creation',
  category: 'currency',
  description:
    'Counting resource gathering as "currency injected" is misleading. ' +
    'Currency enters through faucet mechanisms (entering, rewards). ' +
    'Fake metrics break every downstream decision.',
  check(metrics, _thresholds): PrincipleResult {
    for (const curr of metrics.currencies) {
      const faucetVolume = metrics.faucetVolumeByCurrency[curr] ?? 0;
      const netFlow = metrics.netFlowByCurrency[curr] ?? 0;
      const totalSupply = metrics.totalSupplyByCurrency[curr] ?? 0;

      const supplyGrowthRate = Math.abs(netFlow) / Math.max(1, totalSupply);

      if (supplyGrowthRate > 0.10) {
        return {
          violated: true,
          severity: 4,
          evidence: { currency: curr, faucetVolume, netFlow, supplyGrowthRate },
          suggestedAction: {
            parameterType: 'yield',
            direction: 'decrease',
            scope: { currency: curr },
            magnitude: 0.10,
            reasoning:
              `[${curr}] Supply growing at ${(supplyGrowthRate * 100).toFixed(1)}%/tick. ` +
              'Verify currency injection tracking. Resources should not create currency directly.',
          },
          confidence: 0.55,
          estimatedLag: 5,
        };
      }
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
    'A pool at 42% of total supply means 42% of the economy is frozen. ' +
    'Cap at 5%, decay at 2%/tick.',
  check(metrics, thresholds): PrincipleResult {
    const { poolCapPercent } = thresholds;

    for (const [pool, currencyAmounts] of Object.entries(metrics.poolSizesByCurrency)) {
      for (const curr of metrics.currencies) {
        const size = currencyAmounts[curr] ?? 0;
        const totalSupply = metrics.totalSupplyByCurrency[curr] ?? 0;
        const shareOfSupply = size / Math.max(1, totalSupply);

        if (shareOfSupply > poolCapPercent * 2) {
          return {
            violated: true,
            severity: 6,
            evidence: { currency: curr, pool, size, shareOfSupply, cap: poolCapPercent },
            suggestedAction: {
              parameterType: 'fee',
              direction: 'decrease',
              scope: { tags: ['transaction'], currency: curr },
              magnitude: 0.10,
              reasoning:
                `[${curr}] ${pool} pool at ${(shareOfSupply * 100).toFixed(1)}% of supply ` +
                `(cap: ${(poolCapPercent * 100).toFixed(0)}%). Currency frozen. ` +
                'Lower fees to encourage circulation over accumulation.',
            },
            confidence: 0.85,
            estimatedLag: 5,
          };
        }
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
    for (const [poolName, currencyAmounts] of Object.entries(metrics.poolSizesByCurrency)) {
      for (const curr of metrics.currencies) {
        const poolSize = currencyAmounts[curr] ?? 0;
        const totalSupply = metrics.totalSupplyByCurrency[curr] ?? 0;
        const stakedEstimate = totalSupply * 0.15;

        if (poolSize < 10 && stakedEstimate > 100) {
          return {
            violated: true,
            severity: 3,
            evidence: { currency: curr, pool: poolName, poolSize, estimatedStaked: stakedEstimate },
            suggestedAction: {
              parameterType: 'fee',
              direction: 'increase',
              scope: { tags: ['transaction'], currency: curr },
              magnitude: 0.05,
              reasoning:
                `[${curr}] ${poolName} pool depleted while significant currency should be locked. ` +
                'Early withdrawals may be draining the pool. ' +
                'Ensure withdrawal penalty scales with lock duration.',
            },
            confidence: 0.45,
            estimatedLag: 10,
          };
        }
      }
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
    const { supplyByResource } = metrics;
    const totalResources = Object.values(supplyByResource).reduce((s, v) => s + v, 0);

    for (const curr of metrics.currencies) {
      const velocity = metrics.velocityByCurrency[curr] ?? 0;
      const totalSupply = metrics.totalSupplyByCurrency[curr] ?? 0;

      if (velocity < 3 && totalSupply > 100 && totalResources > 20) {
        return {
          violated: true,
          severity: 4,
          evidence: { currency: curr, velocity, totalSupply, totalResources },
          suggestedAction: {
            parameterType: 'fee',
            direction: 'decrease',
            scope: { tags: ['transaction'], currency: curr },
            magnitude: 0.20,
            reasoning:
              `[${curr}] Velocity ${velocity}/t with ${totalResources} resources in system. ` +
              'Economy stagnant despite available supply. Lower trading friction.',
          },
          confidence: 0.75,
          estimatedLag: 5,
        };
      }
    }

    return { violated: false };
  },
};

export const P58_NoNaturalNumeraire: Principle = {
  id: 'P58',
  name: 'No Natural Numéraire',
  category: 'currency',
  description:
    'No single commodity naturally stabilizes as currency in barter-heavy economies. ' +
    'Multiple items rotate as de facto units of account, but none locks in. ' +
    'If a numéraire is needed, design and enforce it — emergence alone will not produce one.',
  check(metrics, _thresholds): PrincipleResult {
    for (const curr of metrics.currencies) {
      const currPrices = metrics.pricesByCurrency[curr] ?? {};
      const velocity = metrics.velocityByCurrency[curr] ?? 0;
      const totalSupply = metrics.totalSupplyByCurrency[curr] ?? 0;

      const priceValues = Object.values(currPrices).filter(p => p > 0);
      if (priceValues.length < 3) continue;

      const mean = priceValues.reduce((s, p) => s + p, 0) / priceValues.length;
      const coeffOfVariation = mean > 0
        ? Math.sqrt(
            priceValues.reduce((s, p) => s + (p - mean) ** 2, 0) / priceValues.length
          ) / mean
        : 0;

      if (coeffOfVariation < 0.25 && velocity > 5 && totalSupply > 100) {
        return {
          violated: true,
          severity: 3,
          evidence: {
            currency: curr,
            coeffOfVariation,
            velocity,
            numResources: priceValues.length,
            meanPrice: mean,
          },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'increase',
            scope: { currency: curr },
            magnitude: 0.10,
            reasoning:
              `[${curr}] Price coefficient of variation ${coeffOfVariation.toFixed(2)} with velocity ${velocity.toFixed(1)}. ` +
              'All items priced similarly in an active economy — no natural numéraire emerging. ' +
              'If a designated currency exists, increase its sink demand to differentiate it.',
          },
          confidence: 0.50,
          estimatedLag: 20,
        };
      }
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
  P58_NoNaturalNumeraire,
];
