// Multi-resolution metric time-series storage (P41)
// Three resolutions: fine (every tick), medium (configurable window), coarse (configurable epoch)

import type { EconomyMetrics, MetricResolution, MetricQuery, MetricQueryResult, TickConfig } from './types.js';
import { emptyMetrics } from './types.js';
import { DEFAULT_TICK_CONFIG } from './defaults.js';

function getNestedValue(obj: Record<string, unknown>, path: string): number {
  const parts = path.split('.');
  let val: unknown = obj;
  for (const part of parts) {
    if (val !== null && typeof val === 'object') {
      val = (val as Record<string, unknown>)[part];
    } else {
      return NaN;
    }
  }
  return typeof val === 'number' ? val : NaN;
}

class RingBuffer<T> {
  private buf: T[];
  private head = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** All items in chronological order (oldest first) */
  toArray(): T[] {
    if (this.count === 0) return [];
    const result: T[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buf[(start + i) % this.capacity]!);
    }
    return result;
  }

  last(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buf[idx];
  }

  get length(): number {
    return this.count;
  }
}

export class MetricStore {
  /** Fine: last 200 ticks, one entry per tick */
  private fine = new RingBuffer<EconomyMetrics>(200);
  /** Medium: last 200 windows */
  private medium = new RingBuffer<EconomyMetrics>(200);
  /** Coarse: last 200 epochs */
  private coarse = new RingBuffer<EconomyMetrics>(200);

  private mediumWindow: number;
  private coarseWindow: number;
  private ticksSinceLastMedium = 0;
  private ticksSinceLastCoarse = 0;
  private mediumAccumulator: EconomyMetrics[] = [];
  private coarseAccumulator: EconomyMetrics[] = [];

  constructor(tickConfig?: Partial<TickConfig>) {
    const config = { ...DEFAULT_TICK_CONFIG, ...tickConfig };
    this.mediumWindow = config.mediumWindow!;
    this.coarseWindow = config.coarseWindow!;
  }

  record(metrics: EconomyMetrics): void {
    this.fine.push(metrics);

    this.mediumAccumulator.push(metrics);
    this.ticksSinceLastMedium++;
    if (this.ticksSinceLastMedium >= this.mediumWindow) {
      this.medium.push(this.aggregate(this.mediumAccumulator));
      this.mediumAccumulator = [];
      this.ticksSinceLastMedium = 0;
    }

    this.coarseAccumulator.push(metrics);
    this.ticksSinceLastCoarse++;
    if (this.ticksSinceLastCoarse >= this.coarseWindow) {
      this.coarse.push(this.aggregate(this.coarseAccumulator));
      this.coarseAccumulator = [];
      this.ticksSinceLastCoarse = 0;
    }
  }

  latest(resolution: MetricResolution = 'fine'): EconomyMetrics {
    const buf = this.bufferFor(resolution);
    return buf.last() ?? emptyMetrics();
  }

  query(q: MetricQuery): MetricQueryResult {
    const resolution: MetricResolution = q.resolution ?? 'fine';
    const buf = this.bufferFor(resolution);
    const all = buf.toArray();

    const filtered = all.filter(m => {
      if (q.from !== undefined && m.tick < q.from) return false;
      if (q.to !== undefined && m.tick > q.to) return false;
      return true;
    });

    const points = filtered.map(m => ({
      tick: m.tick,
      value: getNestedValue(m as unknown as Record<string, unknown>, q.metric as string),
    }));

    return { metric: q.metric as string, resolution, points };
  }

  /** Summarized recent history for dashboard charts */
  recentHistory(count = 100): Array<{
    tick: number;
    health: number;
    giniCoefficient: number;
    totalSupply: number;
    netFlow: number;
    velocity: number;
    inflationRate: number;
    avgSatisfaction: number;
    churnRate: number;
    totalAgents: number;
    priceIndex: number;
  }> {
    const all = this.fine.toArray();
    const slice = all.slice(-count);
    return slice.map(m => {
      // Compute health inline (same formula as AgentE.getHealth())
      let health = 100;
      if (m.avgSatisfaction < 65) health -= 15;
      if (m.avgSatisfaction < 50) health -= 10;
      if (m.giniCoefficient > 0.45) health -= 15;
      if (m.giniCoefficient > 0.60) health -= 10;
      if (Math.abs(m.netFlow) > 10) health -= 15;
      if (Math.abs(m.netFlow) > 20) health -= 10;
      if (m.churnRate > 0.05) health -= 15;
      health = Math.max(0, Math.min(100, health));

      return {
        tick: m.tick,
        health,
        giniCoefficient: m.giniCoefficient,
        totalSupply: m.totalSupply,
        netFlow: m.netFlow,
        velocity: m.velocity,
        inflationRate: m.inflationRate,
        avgSatisfaction: m.avgSatisfaction,
        churnRate: m.churnRate,
        totalAgents: m.totalAgents,
        priceIndex: m.priceIndex,
      };
    });
  }

  /** Check if fine and coarse resolution metrics diverge significantly */
  divergenceDetected(): boolean {
    const f = this.fine.last();
    const c = this.coarse.last();
    if (!f || !c) return false;
    const fineSat = f.avgSatisfaction;
    const coarseSat = c.avgSatisfaction;
    return Math.abs(fineSat - coarseSat) > 20;
  }

  private bufferFor(resolution: MetricResolution): RingBuffer<EconomyMetrics> {
    if (resolution === 'medium') return this.medium;
    if (resolution === 'coarse') return this.coarse;
    return this.fine;
  }

  private aggregate(snapshots: EconomyMetrics[]): EconomyMetrics {
    if (snapshots.length === 0) return emptyMetrics();
    const last = snapshots[snapshots.length - 1]!;
    // Average numeric scalars, take last for maps/arrays
    const avg = (key: keyof EconomyMetrics): number => {
      const vals = snapshots.map(s => s[key] as number).filter(v => !Number.isNaN(v));
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const avgRecord = (key: keyof EconomyMetrics): Record<string, number> => {
      const allKeys = new Set<string>();
      for (const s of snapshots) {
        const rec = s[key];
        if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
          Object.keys(rec as Record<string, unknown>).forEach(k => allKeys.add(k));
        }
      }
      const result: Record<string, number> = {};
      for (const k of allKeys) {
        const vals = snapshots
          .map(s => (s[key] as Record<string, number>)?.[k])
          .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
        result[k] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      }
      return result;
    };

    return {
      ...last,
      totalSupply: avg('totalSupply'),
      netFlow: avg('netFlow'),
      velocity: avg('velocity'),
      inflationRate: avg('inflationRate'),
      giniCoefficient: avg('giniCoefficient'),
      medianBalance: avg('medianBalance'),
      meanBalance: avg('meanBalance'),
      top10PctShare: avg('top10PctShare'),
      meanMedianDivergence: avg('meanMedianDivergence'),
      avgSatisfaction: avg('avgSatisfaction'),
      churnRate: avg('churnRate'),
      blockedAgentCount: avg('blockedAgentCount'),
      faucetVolume: avg('faucetVolume'),
      sinkVolume: avg('sinkVolume'),
      tapSinkRatio: avg('tapSinkRatio'),
      productionIndex: avg('productionIndex'),
      capacityUsage: avg('capacityUsage'),
      anchorRatioDrift: avg('anchorRatioDrift'),
      // Per-currency averages
      totalSupplyByCurrency: avgRecord('totalSupplyByCurrency'),
      netFlowByCurrency: avgRecord('netFlowByCurrency'),
      velocityByCurrency: avgRecord('velocityByCurrency'),
      inflationRateByCurrency: avgRecord('inflationRateByCurrency'),
      faucetVolumeByCurrency: avgRecord('faucetVolumeByCurrency'),
      sinkVolumeByCurrency: avgRecord('sinkVolumeByCurrency'),
      tapSinkRatioByCurrency: avgRecord('tapSinkRatioByCurrency'),
      anchorRatioDriftByCurrency: avgRecord('anchorRatioDriftByCurrency'),
      giniCoefficientByCurrency: avgRecord('giniCoefficientByCurrency'),
      medianBalanceByCurrency: avgRecord('medianBalanceByCurrency'),
      meanBalanceByCurrency: avgRecord('meanBalanceByCurrency'),
      top10PctShareByCurrency: avgRecord('top10PctShareByCurrency'),
      meanMedianDivergenceByCurrency: avgRecord('meanMedianDivergenceByCurrency'),
    };
  }
}
