// Stage 1: Observer — translates raw EconomyState into EconomyMetrics

import type { EconomyState, EconomyMetrics, EconomicEvent } from './types.js';
import { emptyMetrics } from './types.js';

export class Observer {
  private previousMetrics: EconomyMetrics | null = null;
  private previousPrices: Record<string, number> = {};
  private customMetricFns: Record<string, (state: EconomyState) => number> = {};
  private anchorBaseline: { goldPerHour: number; itemsPerGold: number } | null = null;

  registerCustomMetric(name: string, fn: (state: EconomyState) => number): void {
    this.customMetricFns[name] = fn;
  }

  compute(state: EconomyState, recentEvents: EconomicEvent[]): EconomyMetrics {
    const tick = state.tick;
    const balances = Object.values(state.agentBalances);
    const roles = Object.values(state.agentRoles);
    const totalAgents = balances.length;

    // ── Currency ──
    const totalSupply = balances.reduce((s, b) => s + b, 0);
    const faucetVolume = recentEvents
      .filter(e => e.type === 'mint' || e.type === 'spawn')
      .reduce((s, e) => s + (e.amount ?? 0), 0);
    const sinkVolume = recentEvents
      .filter(e => e.type === 'burn' || e.type === 'consume')
      .reduce((s, e) => s + (e.amount ?? 0), 0);
    const netFlow = faucetVolume - sinkVolume;
    const tapSinkRatio = sinkVolume > 0 ? faucetVolume / sinkVolume : faucetVolume > 0 ? Infinity : 1;

    const prevSupply = this.previousMetrics?.totalSupply ?? totalSupply;
    const inflationRate = prevSupply > 0 ? (totalSupply - prevSupply) / prevSupply : 0;

    const tradeEvents = recentEvents.filter(e => e.type === 'trade');
    const velocity = totalSupply > 0 ? tradeEvents.length / totalSupply : 0;

    // ── Wealth distribution ──
    const sortedBalances = [...balances].sort((a, b) => a - b);
    const meanBalance = totalAgents > 0 ? totalSupply / totalAgents : 0;
    const medianBalance = computeMedian(sortedBalances);
    const top10Idx = Math.floor(totalAgents * 0.9);
    const top10Sum = sortedBalances.slice(top10Idx).reduce((s, b) => s + b, 0);
    const top10PctShare = totalSupply > 0 ? top10Sum / totalSupply : 0;
    const giniCoefficient = computeGini(sortedBalances);
    const meanMedianDivergence =
      medianBalance > 0 ? Math.abs(meanBalance - medianBalance) / medianBalance : 0;

    // ── Population ──
    const populationByRole: Record<string, number> = {};
    const roleShares: Record<string, number> = {};
    for (const role of roles) {
      populationByRole[role] = (populationByRole[role] ?? 0) + 1;
    }
    for (const [role, count] of Object.entries(populationByRole)) {
      roleShares[role] = count / Math.max(1, totalAgents);
    }

    const churnByRole: Record<string, number> = {};
    const roleChanges = recentEvents.filter(e => e.type === 'churn' || e.type === 'role_change');
    for (const e of roleChanges) {
      const role = e.role ?? 'unknown';
      churnByRole[role] = (churnByRole[role] ?? 0) + 1;
    }
    const churnCount = recentEvents.filter(e => e.type === 'churn').length;
    const churnRate = churnCount / Math.max(1, totalAgents);

    // ── Market ──
    const prices: Record<string, number> = { ...state.marketPrices };
    const priceVolatility: Record<string, number> = {};
    for (const [resource, price] of Object.entries(prices)) {
      const prev = this.previousPrices[resource] ?? price;
      priceVolatility[resource] = prev > 0 ? Math.abs(price - prev) / prev : 0;
    }
    this.previousPrices = { ...prices };

    // Compute price index (equal-weight basket)
    const priceValues = Object.values(prices);
    const priceIndex =
      priceValues.length > 0 ? priceValues.reduce((s, p) => s + p, 0) / priceValues.length : 0;

    // Supply from agent inventories
    const supplyByResource: Record<string, number> = {};
    for (const inv of Object.values(state.agentInventories)) {
      for (const [resource, qty] of Object.entries(inv)) {
        supplyByResource[resource] = (supplyByResource[resource] ?? 0) + qty;
      }
    }

    // Demand signals: approximate from recent trade events
    const demandSignals: Record<string, number> = {};
    for (const e of tradeEvents) {
      if (e.resource) {
        demandSignals[e.resource] = (demandSignals[e.resource] ?? 0) + (e.amount ?? 1);
      }
    }

    // Pinch points: resources where demand > 2× supply or supply > 3× demand
    const pinchPoints: Record<string, 'optimal' | 'oversupplied' | 'scarce'> = {};
    for (const resource of new Set([...Object.keys(supplyByResource), ...Object.keys(demandSignals)])) {
      const s = supplyByResource[resource] ?? 0;
      const d = demandSignals[resource] ?? 0;
      if (d > 2 && s / d < 0.5) {
        pinchPoints[resource] = 'scarce';
      } else if (s > 3 && d > 0 && s / d > 3) {
        pinchPoints[resource] = 'oversupplied';
      } else {
        pinchPoints[resource] = 'optimal';
      }
    }

    const productionIndex = recentEvents
      .filter(e => e.type === 'produce')
      .reduce((s, e) => s + (e.amount ?? 1), 0);

    const maxPossibleProduction = productionIndex + sinkVolume;
    const capacityUsage =
      maxPossibleProduction > 0 ? productionIndex / maxPossibleProduction : 0;

    // ── Satisfaction ──
    const satisfactions = Object.values(state.agentSatisfaction ?? {});
    const avgSatisfaction =
      satisfactions.length > 0
        ? satisfactions.reduce((s, v) => s + v, 0) / satisfactions.length
        : 80;

    const blockedAgentCount = satisfactions.filter(s => s < 20).length;
    const timeToValue = tick > 0 ? Math.max(0, 20 - tick * 0.1) : 20; // simple proxy

    // ── Pools ──
    const poolSizes: Record<string, number> = { ...(state.poolSizes ?? {}) };

    // ── Anchor ratio ──
    if (!this.anchorBaseline && tick === 1 && totalSupply > 0) {
      this.anchorBaseline = {
        goldPerHour: totalSupply / Math.max(1, totalAgents),
        itemsPerGold: priceIndex > 0 ? 1 / priceIndex : 0,
      };
    }
    let anchorRatioDrift = 0;
    if (this.anchorBaseline && totalAgents > 0) {
      const currentGoldPerHour = totalSupply / totalAgents;
      anchorRatioDrift =
        this.anchorBaseline.goldPerHour > 0
          ? (currentGoldPerHour - this.anchorBaseline.goldPerHour) /
            this.anchorBaseline.goldPerHour
          : 0;
    }

    // ── Custom metrics ──
    const custom: Record<string, number> = {};
    for (const [name, fn] of Object.entries(this.customMetricFns)) {
      try {
        custom[name] = fn(state);
      } catch {
        custom[name] = NaN;
      }
    }

    const metrics: EconomyMetrics = {
      tick,
      timestamp: Date.now(),
      totalSupply,
      netFlow,
      velocity,
      inflationRate,
      populationByRole,
      roleShares,
      totalAgents,
      churnRate,
      churnByRole,
      personaDistribution: {}, // populated by PersonaTracker
      giniCoefficient,
      medianBalance,
      meanBalance,
      top10PctShare,
      meanMedianDivergence,
      priceIndex,
      productionIndex,
      capacityUsage,
      prices,
      priceVolatility,
      supplyByResource,
      demandSignals,
      pinchPoints,
      avgSatisfaction,
      blockedAgentCount,
      timeToValue,
      faucetVolume,
      sinkVolume,
      tapSinkRatio,
      poolSizes,
      anchorRatioDrift,
      extractionRatio: NaN,
      newUserDependency: NaN,
      smokeTestRatio: NaN,
      currencyInsulation: NaN,
      sharkToothPeaks: this.previousMetrics?.sharkToothPeaks ?? [],
      sharkToothValleys: this.previousMetrics?.sharkToothValleys ?? [],
      eventCompletionRate: NaN,
      custom,
    };

    this.previousMetrics = metrics;
    return metrics;
  }
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function computeGini(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * (sorted[i] ?? 0);
  }
  return Math.abs(numerator) / (n * sum);
}
