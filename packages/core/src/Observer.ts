// Stage 1: Observer — translates raw EconomyState into EconomyMetrics

import type { EconomyState, EconomyMetrics, EconomicEvent, TickConfig } from './types.js';
import { emptyMetrics } from './types.js';
import { DEFAULT_TICK_CONFIG } from './defaults.js';

export class Observer {
  private previousMetrics: EconomyMetrics | null = null;
  private previousPricesByCurrency: Record<string, Record<string, number>> = {};
  private customMetricFns: Record<string, (state: EconomyState) => number> = {};
  private anchorBaselineByCurrency: Record<string, { currencyPerPeriod: number; itemsPerCurrency: number }> = {};
  private tickConfig: TickConfig;

  constructor(tickConfig?: Partial<TickConfig>) {
    this.tickConfig = { ...DEFAULT_TICK_CONFIG, ...tickConfig };
  }

  registerCustomMetric(name: string, fn: (state: EconomyState) => number): void {
    this.customMetricFns[name] = fn;
  }

  compute(state: EconomyState, recentEvents: EconomicEvent[]): EconomyMetrics {
    if (!state.currencies || state.currencies.length === 0) {
      console.warn('[AgentE] Warning: state.currencies is empty. Metrics will be zeroed.');
    }
    if (!state.agentBalances || Object.keys(state.agentBalances).length === 0) {
      console.warn('[AgentE] Warning: state.agentBalances is empty.');
    }

    const tick = state.tick;
    const roles = Object.values(state.agentRoles);
    const totalAgents = Object.keys(state.agentBalances).length;

    // ── Event classification (single pass, per-currency) ──
    let productionAmount = 0;
    const faucetVolumeByCurrency: Record<string, number> = {};
    const sinkVolumeByCurrency: Record<string, number> = {};
    const tradeEvents: EconomicEvent[] = [];
    const roleChangeEvents: EconomicEvent[] = [];
    let churnCount = 0;
    const defaultCurrency = state.currencies[0] ?? 'default';

    for (const e of recentEvents) {
      const curr = e.currency ?? defaultCurrency;
      switch (e.type) {
        case 'mint':
        case 'enter':
          faucetVolumeByCurrency[curr] = (faucetVolumeByCurrency[curr] ?? 0) + (e.amount ?? 0);
          break;
        case 'burn':
        case 'consume':
          sinkVolumeByCurrency[curr] = (sinkVolumeByCurrency[curr] ?? 0) + (e.amount ?? 0);
          break;
        case 'produce':
          productionAmount += e.amount ?? 1;
          break;
        case 'trade':
          tradeEvents.push(e);
          break;
        case 'churn':
          churnCount++;
          roleChangeEvents.push(e);
          break;
        case 'role_change':
          roleChangeEvents.push(e);
          break;
      }
    }

    // ── Per-system & per-source/sink tracking ──
    const flowBySystem: Record<string, number> = {};
    const activityBySystem: Record<string, number> = {};
    const actorsBySystem: Record<string, Set<string>> = {};
    const flowBySource: Record<string, number> = {};
    const flowBySink: Record<string, number> = {};

    for (const e of recentEvents) {
      if (e.system) {
        activityBySystem[e.system] = (activityBySystem[e.system] ?? 0) + 1;
        if (!actorsBySystem[e.system]) actorsBySystem[e.system] = new Set();
        actorsBySystem[e.system]!.add(e.actor);

        const amt = e.amount ?? 0;
        if (e.type === 'mint') {
          flowBySystem[e.system] = (flowBySystem[e.system] ?? 0) + amt;
        } else if (e.type === 'burn' || e.type === 'consume') {
          flowBySystem[e.system] = (flowBySystem[e.system] ?? 0) - amt;
        }
      }
      if (e.sourceOrSink) {
        const amt = e.amount ?? 0;
        if (e.type === 'mint') {
          flowBySource[e.sourceOrSink] = (flowBySource[e.sourceOrSink] ?? 0) + amt;
        } else if (e.type === 'burn' || e.type === 'consume') {
          flowBySink[e.sourceOrSink] = (flowBySink[e.sourceOrSink] ?? 0) + amt;
        }
      }
    }

    const participantsBySystem: Record<string, number> = {};
    for (const [sys, actors] of Object.entries(actorsBySystem)) {
      participantsBySystem[sys] = actors.size;
    }

    const totalSourceFlow = Object.values(flowBySource).reduce((s, v) => s + v, 0);
    const sourceShare: Record<string, number> = {};
    for (const [src, vol] of Object.entries(flowBySource)) {
      sourceShare[src] = totalSourceFlow > 0 ? vol / totalSourceFlow : 0;
    }

    const totalSinkFlow = Object.values(flowBySink).reduce((s, v) => s + v, 0);
    const sinkShare: Record<string, number> = {};
    for (const [snk, vol] of Object.entries(flowBySink)) {
      sinkShare[snk] = totalSinkFlow > 0 ? vol / totalSinkFlow : 0;
    }

    const currencies = state.currencies;

    // ── Per-currency supply ──
    const totalSupplyByCurrency: Record<string, number> = {};
    const balancesByCurrency: Record<string, number[]> = {};

    for (const [_agentId, balances] of Object.entries(state.agentBalances)) {
      for (const [curr, bal] of Object.entries(balances)) {
        totalSupplyByCurrency[curr] = (totalSupplyByCurrency[curr] ?? 0) + bal;
        if (!balancesByCurrency[curr]) balancesByCurrency[curr] = [];
        balancesByCurrency[curr]!.push(bal);
      }
    }

    // ── Per-currency flow ──
    const netFlowByCurrency: Record<string, number> = {};
    const tapSinkRatioByCurrency: Record<string, number> = {};
    const inflationRateByCurrency: Record<string, number> = {};
    const velocityByCurrency: Record<string, number> = {};

    for (const curr of currencies) {
      const faucet = faucetVolumeByCurrency[curr] ?? 0;
      const sink = sinkVolumeByCurrency[curr] ?? 0;
      netFlowByCurrency[curr] = faucet - sink;
      tapSinkRatioByCurrency[curr] = sink > 0 ? Math.min(faucet / sink, 100) : faucet > 0 ? 100 : 1;

      const prevSupply = this.previousMetrics?.totalSupplyByCurrency?.[curr] ?? totalSupplyByCurrency[curr] ?? 0;
      const currSupply = totalSupplyByCurrency[curr] ?? 0;
      inflationRateByCurrency[curr] = prevSupply > 0 ? (currSupply - prevSupply) / prevSupply : 0;

      // Velocity: trades involving this currency / supply
      const currTrades = tradeEvents.filter(e => (e.currency ?? defaultCurrency) === curr);
      velocityByCurrency[curr] = currSupply > 0 ? currTrades.length / currSupply : 0;
    }

    // ── Per-currency wealth distribution ──
    const giniCoefficientByCurrency: Record<string, number> = {};
    const medianBalanceByCurrency: Record<string, number> = {};
    const meanBalanceByCurrency: Record<string, number> = {};
    const top10PctShareByCurrency: Record<string, number> = {};
    const meanMedianDivergenceByCurrency: Record<string, number> = {};

    for (const curr of currencies) {
      const bals = balancesByCurrency[curr] ?? [];
      const sorted = [...bals].sort((a, b) => a - b);
      const supply = totalSupplyByCurrency[curr] ?? 0;
      const count = sorted.length;

      const median = computeMedian(sorted);
      const mean = count > 0 ? supply / count : 0;
      const top10Idx = Math.floor(count * 0.9);
      const top10Sum = sorted.slice(top10Idx).reduce((s, b) => s + b, 0);

      giniCoefficientByCurrency[curr] = computeGini(sorted);
      medianBalanceByCurrency[curr] = median;
      meanBalanceByCurrency[curr] = mean;
      top10PctShareByCurrency[curr] = supply > 0 ? top10Sum / supply : 0;
      meanMedianDivergenceByCurrency[curr] = median > 0 ? Math.abs(mean - median) / median : 0;
    }

    // ── Aggregates (sum/avg across all currencies) ──
    const avgOf = (rec: Record<string, number>): number => {
      const vals = Object.values(rec);
      return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    };

    const totalSupply = Object.values(totalSupplyByCurrency).reduce((s, v) => s + v, 0);
    const faucetVolume = Object.values(faucetVolumeByCurrency).reduce((s, v) => s + v, 0);
    const sinkVolume = Object.values(sinkVolumeByCurrency).reduce((s, v) => s + v, 0);
    const netFlow = faucetVolume - sinkVolume;
    const tapSinkRatio = sinkVolume > 0 ? Math.min(faucetVolume / sinkVolume, 100) : faucetVolume > 0 ? 100 : 1;
    const velocity = totalSupply > 0 ? tradeEvents.length / totalSupply : 0;
    const prevTotalSupply = this.previousMetrics?.totalSupply ?? totalSupply;
    const inflationRate = prevTotalSupply > 0 ? (totalSupply - prevTotalSupply) / prevTotalSupply : 0;

    // Aggregate wealth: average across currencies
    const giniCoefficient = avgOf(giniCoefficientByCurrency);
    const medianBalance = avgOf(medianBalanceByCurrency);
    const meanBalance = totalAgents > 0 ? totalSupply / totalAgents : 0;
    const top10PctShare = avgOf(top10PctShareByCurrency);
    const meanMedianDivergence = avgOf(meanMedianDivergenceByCurrency);

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
    for (const e of roleChangeEvents) {
      const role = e.role ?? 'unknown';
      churnByRole[role] = (churnByRole[role] ?? 0) + 1;
    }
    const churnRate = churnCount / Math.max(1, totalAgents);

    // ── Per-currency prices ──
    const pricesByCurrency: Record<string, Record<string, number>> = {};
    const priceVolatilityByCurrency: Record<string, Record<string, number>> = {};
    const priceIndexByCurrency: Record<string, number> = {};

    for (const [curr, resourcePrices] of Object.entries(state.marketPrices)) {
      pricesByCurrency[curr] = { ...resourcePrices };
      const pricePrev = this.previousPricesByCurrency?.[curr] ?? {};
      const volMap: Record<string, number> = {};
      for (const [resource, price] of Object.entries(resourcePrices)) {
        const prev = pricePrev[resource] ?? price;
        volMap[resource] = prev > 0 ? Math.abs(price - prev) / prev : 0;
      }
      priceVolatilityByCurrency[curr] = volMap;

      const pVals = Object.values(resourcePrices);
      priceIndexByCurrency[curr] = pVals.length > 0 ? pVals.reduce((s, p) => s + p, 0) / pVals.length : 0;
    }
    this.previousPricesByCurrency = Object.fromEntries(
      Object.entries(pricesByCurrency).map(([c, p]) => [c, { ...p }])
    );

    // Aggregate prices: use first currency as default
    const prices = pricesByCurrency[defaultCurrency] ?? {};
    const priceVolatility = priceVolatilityByCurrency[defaultCurrency] ?? {};
    const priceIndex = priceIndexByCurrency[defaultCurrency] ?? 0;

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
      if (d > 0 && d > 2 && s / d < 0.5) {
        pinchPoints[resource] = 'scarce';
      } else if (d > 0 && s > 3 && s / d > 3) {
        pinchPoints[resource] = 'oversupplied';
      } else {
        pinchPoints[resource] = 'optimal';
      }
    }

    const productionIndex = productionAmount;

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
    const timeToValue = totalAgents > 0 ? blockedAgentCount / totalAgents * 100 : 0;

    // ── Per-currency pools ──
    const poolSizesByCurrency: Record<string, Record<string, number>> = {};
    const poolSizesAggregate: Record<string, number> = {};

    if (state.poolSizes) {
      for (const [pool, currencyAmounts] of Object.entries(state.poolSizes)) {
        poolSizesByCurrency[pool] = { ...currencyAmounts };
        poolSizesAggregate[pool] = Object.values(currencyAmounts).reduce((s, v) => s + v, 0);
      }
    }

    // ── Per-currency anchor baseline ──
    const anchorRatioDriftByCurrency: Record<string, number> = {};
    if (tick === 1) {
      for (const curr of currencies) {
        const supply = totalSupplyByCurrency[curr] ?? 0;
        if (supply > 0) {
          this.anchorBaselineByCurrency[curr] = {
            currencyPerPeriod: supply / Math.max(1, totalAgents),
            itemsPerCurrency: (priceIndexByCurrency[curr] ?? 0) > 0 ? 1 / priceIndexByCurrency[curr]! : 0,
          };
        }
      }
    }
    for (const curr of currencies) {
      const baseline = this.anchorBaselineByCurrency[curr];
      if (baseline && totalAgents > 0) {
        const currentCPP = (totalSupplyByCurrency[curr] ?? 0) / totalAgents;
        anchorRatioDriftByCurrency[curr] = baseline.currencyPerPeriod > 0
          ? (currentCPP - baseline.currencyPerPeriod) / baseline.currencyPerPeriod
          : 0;
      } else {
        anchorRatioDriftByCurrency[curr] = 0;
      }
    }
    const anchorRatioDrift = avgOf(anchorRatioDriftByCurrency);

    // ── V1.1 Metrics ──

    // ── Per-currency arbitrage index ──
    // O(n) arbitrage index: standard deviation of log prices
    const arbitrageIndexByCurrency: Record<string, number> = {};
    for (const curr of currencies) {
      const cPrices = pricesByCurrency[curr] ?? {};
      const logPrices = Object.values(cPrices).filter(p => p > 0).map(p => Math.log(p));
      if (logPrices.length >= 2) {
        const mean = logPrices.reduce((s, v) => s + v, 0) / logPrices.length;
        const variance = logPrices.reduce((s, v) => s + (v - mean) ** 2, 0) / logPrices.length;
        arbitrageIndexByCurrency[curr] = Math.min(1, Math.sqrt(variance));
      } else {
        arbitrageIndexByCurrency[curr] = 0;
      }
    }
    const arbitrageIndex = avgOf(arbitrageIndexByCurrency);

    // contentDropAge: ticks since last 'produce' event with metadata.contentDrop === true
    const contentDropEvents = recentEvents.filter(
      e => e.metadata?.['contentDrop'] === true
    );
    const contentDropAge = contentDropEvents.length > 0
      ? tick - Math.max(...contentDropEvents.map(e => e.timestamp))
      : (this.previousMetrics?.contentDropAge ?? 0) + 1;

    // ── Per-currency gift/disposal trade ratios ──
    const giftTradeRatioByCurrency: Record<string, number> = {};
    const disposalTradeRatioByCurrency: Record<string, number> = {};
    for (const curr of currencies) {
      const currTrades = tradeEvents.filter(e => (e.currency ?? defaultCurrency) === curr);
      const cPrices = pricesByCurrency[curr] ?? {};
      let gifts = 0;
      let disposals = 0;
      for (const e of currTrades) {
        const marketPrice = cPrices[e.resource ?? ''] ?? 0;
        const tradePrice = e.price ?? 0;
        if (tradePrice === 0 || (marketPrice > 0 && tradePrice < marketPrice * 0.3)) gifts++;
        if (e.from && e.resource) {
          const sellerInv = state.agentInventories[e.from]?.[e.resource] ?? 0;
          const avgInv = (supplyByResource[e.resource] ?? 0) / Math.max(1, totalAgents);
          if (sellerInv > avgInv * 3) disposals++;
        }
      }
      giftTradeRatioByCurrency[curr] = currTrades.length > 0 ? gifts / currTrades.length : 0;
      disposalTradeRatioByCurrency[curr] = currTrades.length > 0 ? disposals / currTrades.length : 0;
    }
    const giftTradeRatio = avgOf(giftTradeRatioByCurrency);
    const disposalTradeRatio = avgOf(disposalTradeRatioByCurrency);

    // ── Custom metrics ──
    const custom: Record<string, number> = {};
    for (const [name, fn] of Object.entries(this.customMetricFns)) {
      try {
        custom[name] = fn(state);
      } catch (err) {
        console.warn(`[AgentE] Custom metric '${name}' threw an error:`, err);
        custom[name] = NaN;
      }
    }

    const metrics: EconomyMetrics = {
      tick,
      timestamp: Date.now(),
      currencies,

      // Per-currency
      totalSupplyByCurrency,
      netFlowByCurrency,
      velocityByCurrency,
      inflationRateByCurrency,
      faucetVolumeByCurrency,
      sinkVolumeByCurrency,
      tapSinkRatioByCurrency,
      anchorRatioDriftByCurrency,
      giniCoefficientByCurrency,
      medianBalanceByCurrency,
      meanBalanceByCurrency,
      top10PctShareByCurrency,
      meanMedianDivergenceByCurrency,
      priceIndexByCurrency,
      pricesByCurrency,
      priceVolatilityByCurrency,
      poolSizesByCurrency,
      extractionRatioByCurrency: {},
      newUserDependencyByCurrency: {},
      currencyInsulationByCurrency: {},
      arbitrageIndexByCurrency,
      giftTradeRatioByCurrency,
      disposalTradeRatioByCurrency,

      // Aggregates
      totalSupply,
      netFlow,
      velocity,
      inflationRate,
      faucetVolume,
      sinkVolume,
      tapSinkRatio,
      anchorRatioDrift,
      giniCoefficient,
      medianBalance,
      meanBalance,
      top10PctShare,
      meanMedianDivergence,
      priceIndex,
      prices,
      priceVolatility,
      poolSizes: poolSizesAggregate,
      extractionRatio: 0,
      newUserDependency: 0,
      smokeTestRatio: 0,
      currencyInsulation: 0,
      arbitrageIndex,
      giftTradeRatio,
      disposalTradeRatio,

      // Unchanged
      populationByRole,
      roleShares,
      totalAgents,
      churnRate,
      churnByRole,
      personaDistribution: {}, // populated by PersonaTracker
      productionIndex,
      capacityUsage,
      supplyByResource,
      demandSignals,
      pinchPoints,
      avgSatisfaction,
      blockedAgentCount,
      timeToValue,
      sharkToothPeaks: this.previousMetrics?.sharkToothPeaks ?? [],
      sharkToothValleys: this.previousMetrics?.sharkToothValleys ?? [],
      eventCompletionRate: 0,
      contentDropAge,
      systems: state.systems ?? [],
      sources: state.sources ?? [],
      sinks: state.sinks ?? [],
      flowBySystem,
      activityBySystem,
      participantsBySystem,
      flowBySource,
      flowBySink,
      sourceShare,
      sinkShare,
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
  return Math.min(1, Math.abs(numerator) / (n * sum));
}
