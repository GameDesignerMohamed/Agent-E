// Behavioral persona auto-classification
// Classifies agents into 9 universal archetypes from observable signals
// All thresholds are RELATIVE (percentile-based) — no magic numbers

import type {
  EconomyState,
  EconomicEvent,
  PersonaType,
} from './types.js';

// ── Configuration ──

export interface PersonaConfig {
  /** Top X% by holdings = Whale. Default: 0.05 (5%) */
  whalePercentile: number;

  /** Top X% by tx frequency = Active Trader. Default: 0.20 (20%) */
  activeTraderPercentile: number;

  /** Ticks to consider an agent "new." Default: 10 */
  newEntrantWindow: number;

  /** Ticks with zero activity = Dormant. Default: 20 */
  dormantWindow: number;

  /** Activity drop threshold for At-Risk. Default: 0.5 (50% drop) */
  atRiskDropThreshold: number;

  /** Min distinct systems for Power User. Default: 3 */
  powerUserMinSystems: number;

  /** Rolling history window size (ticks). Default: 50 */
  historyWindow: number;

  /** Ticks between full reclassification. Default: 10 */
  reclassifyInterval: number;
}

const DEFAULT_PERSONA_CONFIG: PersonaConfig = {
  whalePercentile: 0.05,
  activeTraderPercentile: 0.20,
  newEntrantWindow: 10,
  dormantWindow: 20,
  atRiskDropThreshold: 0.5,
  powerUserMinSystems: 3,
  historyWindow: 50,
  reclassifyInterval: 10,
};

// ── Per-agent rolling signals ──

interface AgentSnapshot {
  totalHoldings: number;
  txCount: number;
  txVolume: number;
  systems: Set<string>;
}

interface AgentRecord {
  firstSeen: number;
  lastActive: number;
  snapshots: AgentSnapshot[];
  previousTxRate: number;   // tx frequency in prior window (for At-Risk detection)
}

// ── Classifier ──

export class PersonaTracker {
  private agents = new Map<string, AgentRecord>();
  private config: PersonaConfig;
  private cachedDistribution: Record<string, number> = {};
  private lastClassifiedTick = -Infinity;

  constructor(config?: Partial<PersonaConfig>) {
    this.config = { ...DEFAULT_PERSONA_CONFIG, ...config };
  }

  /**
   * Ingest a state snapshot + events and update per-agent signals.
   * Call this once per tick BEFORE getDistribution().
   */
  update(state: EconomyState, events?: EconomicEvent[]): void {
    if (!state.agentBalances) return;
    const tick = state.tick;
    const txByAgent = new Map<string, { count: number; volume: number; systems: Set<string> }>();

    // Tally events per agent
    if (events) {
      for (const e of events) {
        const agents = [e.actor];
        if (e.from) agents.push(e.from);
        if (e.to) agents.push(e.to);

        for (const id of agents) {
          if (!id) continue;
          const entry = txByAgent.get(id) ?? { count: 0, volume: 0, systems: new Set() };
          entry.count++;
          entry.volume += e.amount ?? 0;
          if (e.system) entry.systems.add(e.system);
          txByAgent.set(id, entry);
        }
      }
    }

    // Update each agent's record
    for (const [agentId, balances] of Object.entries(state.agentBalances)) {
      const totalHoldings = Object.values(balances).reduce((s, v) => s + v, 0);
      const tx = txByAgent.get(agentId);

      const record = this.agents.get(agentId) ?? {
        firstSeen: tick,
        lastActive: tick,
        snapshots: [],
        previousTxRate: 0,
      };

      const snapshot: AgentSnapshot = {
        totalHoldings,
        txCount: tx?.count ?? 0,
        txVolume: tx?.volume ?? 0,
        systems: tx?.systems ?? new Set(),
      };

      record.snapshots.push(snapshot);

      // Trim to history window
      if (record.snapshots.length > this.config.historyWindow) {
        // Before trimming, save the old tx rate for At-Risk comparison
        const oldHalf = record.snapshots.slice(0, Math.floor(record.snapshots.length / 2));
        record.previousTxRate = oldHalf.reduce((s, sn) => s + sn.txCount, 0) / Math.max(1, oldHalf.length);
        record.snapshots = record.snapshots.slice(-this.config.historyWindow);
      }

      if ((tx?.count ?? 0) > 0) {
        record.lastActive = tick;
      }

      this.agents.set(agentId, record);
    }

    // Prune agents gone from state for >2× dormant window
    const pruneThreshold = this.config.dormantWindow * 2;
    if (tick % this.config.dormantWindow === 0) {
      for (const [id, rec] of this.agents) {
        if (tick - rec.lastActive > pruneThreshold && !(id in state.agentBalances)) {
          this.agents.delete(id);
        }
      }
    }
  }

  /**
   * Classify all tracked agents and return the population distribution.
   * Returns { Whale: 0.05, ActiveTrader: 0.18, Passive: 0.42, ... }
   * Caches results and only reclassifies at `reclassifyInterval` boundaries.
   */
  getDistribution(currentTick?: number): Record<string, number> {
    const tick = currentTick ?? 0;
    if (tick - this.lastClassifiedTick < this.config.reclassifyInterval
        && Object.keys(this.cachedDistribution).length > 0) {
      return this.cachedDistribution;
    }
    this.lastClassifiedTick = tick;
    this.cachedDistribution = this._classify();
    return this.cachedDistribution;
  }

  private _classify(): Record<string, number> {
    const agentIds = [...this.agents.keys()];
    const total = agentIds.length;
    if (total === 0) return {};

    // ── Compute population-wide statistics ──

    // Holdings for percentile calculation
    const holdings = agentIds.map(id => {
      const rec = this.agents.get(id)!;
      const latest = rec.snapshots[rec.snapshots.length - 1];
      return latest?.totalHoldings ?? 0;
    }).sort((a, b) => a - b);

    const whaleThreshold = percentile(holdings, 1 - this.config.whalePercentile);

    // Tx frequency for percentile calculation
    const txRatesUnsorted = agentIds.map(id => {
      const rec = this.agents.get(id)!;
      return rec.snapshots.reduce((s, sn) => s + sn.txCount, 0) / Math.max(1, rec.snapshots.length);
    });
    const txRates = [...txRatesUnsorted].sort((a, b) => a - b);

    const activeTraderThreshold = percentile(txRates, 1 - this.config.activeTraderPercentile);
    const medianTxRate = percentile(txRates, 0.5);

    // ── Classify each agent ──

    const counts: Record<string, number> = {};
    const currentTick = Math.max(...agentIds.map(id => this.agents.get(id)!.lastActive), 0);

    for (let i = 0; i < agentIds.length; i++) {
      const id = agentIds[i]!;
      const rec = this.agents.get(id)!;
      const snaps = rec.snapshots;
      if (snaps.length === 0) continue;

      const latestHoldings = snaps[snaps.length - 1]!.totalHoldings;
      const agentTxRate = txRatesUnsorted[i]!;
      const ticksSinceFirst = currentTick - rec.firstSeen;
      const ticksSinceActive = currentTick - rec.lastActive;

      // Balance delta: compare first half vs second half of history
      const halfIdx = Math.floor(snaps.length / 2);
      const earlyAvg = snaps.slice(0, Math.max(1, halfIdx))
        .reduce((s, sn) => s + sn.totalHoldings, 0) / Math.max(1, halfIdx);
      const lateAvg = snaps.slice(halfIdx)
        .reduce((s, sn) => s + sn.totalHoldings, 0) / Math.max(1, snaps.length - halfIdx);
      const balanceDelta = lateAvg - earlyAvg;

      // System diversity
      const allSystems = new Set<string>();
      for (const sn of snaps) {
        for (const sys of sn.systems) allSystems.add(sys);
      }

      // Current window tx rate (for At-Risk comparison)
      const recentSnaps = snaps.slice(-Math.min(10, snaps.length));
      const recentTxRate = recentSnaps.reduce((s, sn) => s + sn.txCount, 0) / Math.max(1, recentSnaps.length);

      // ── Priority-ordered classification ──
      let persona: PersonaType;

      if (ticksSinceFirst <= this.config.newEntrantWindow) {
        persona = 'NewEntrant';
      } else if (latestHoldings > 0 && ticksSinceActive > this.config.dormantWindow) {
        persona = 'Dormant';
      } else if (rec.previousTxRate > 0 && recentTxRate < rec.previousTxRate * (1 - this.config.atRiskDropThreshold)) {
        persona = 'AtRisk';
      } else if (latestHoldings >= whaleThreshold && whaleThreshold > 0) {
        persona = 'Whale';
      } else if (allSystems.size >= this.config.powerUserMinSystems) {
        persona = 'PowerUser';
      } else if (agentTxRate >= activeTraderThreshold && activeTraderThreshold > 0) {
        persona = 'ActiveTrader';
      } else if (balanceDelta > 0 && agentTxRate < medianTxRate) {
        persona = 'Accumulator';
      } else if (balanceDelta < 0 && agentTxRate >= medianTxRate) {
        persona = 'Spender';
      } else {
        persona = 'Passive';
      }

      counts[persona] = (counts[persona] ?? 0) + 1;
    }

    // Convert to fractions
    const distribution: Record<string, number> = {};
    for (const [persona, count] of Object.entries(counts)) {
      distribution[persona] = count / total;
    }
    return distribution;
  }
}

// ── Helpers ──

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}
