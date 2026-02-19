// Multi-resolution metric time-series storage (P41)
// Three resolutions: fine (every tick), medium (every 10 ticks), coarse (every 100 ticks)

import type { EconomyMetrics, MetricResolution, MetricQuery, MetricQueryResult } from './types.js';
import { emptyMetrics } from './types.js';

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
  /** Medium: last 200 windows of 10 ticks */
  private medium = new RingBuffer<EconomyMetrics>(200);
  /** Coarse: last 200 epochs of 100 ticks */
  private coarse = new RingBuffer<EconomyMetrics>(200);

  private ticksSinceLastMedium = 0;
  private ticksSinceLastCoarse = 0;
  private mediumAccumulator: EconomyMetrics[] = [];
  private coarseAccumulator: EconomyMetrics[] = [];

  record(metrics: EconomyMetrics): void {
    this.fine.push(metrics);

    this.mediumAccumulator.push(metrics);
    this.ticksSinceLastMedium++;
    if (this.ticksSinceLastMedium >= 10) {
      this.medium.push(this.aggregate(this.mediumAccumulator));
      this.mediumAccumulator = [];
      this.ticksSinceLastMedium = 0;
    }

    this.coarseAccumulator.push(metrics);
    this.ticksSinceLastCoarse++;
    if (this.ticksSinceLastCoarse >= 100) {
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

    const metricKey = q.metric as keyof EconomyMetrics;
    const points = filtered.map(m => ({
      tick: m.tick,
      value: typeof m[metricKey] === 'number' ? (m[metricKey] as number) : NaN,
    }));

    return { metric: q.metric, resolution, points };
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
      const vals = snapshots.map(s => s[key] as number).filter(v => !isNaN(v));
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
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
    };
  }
}
