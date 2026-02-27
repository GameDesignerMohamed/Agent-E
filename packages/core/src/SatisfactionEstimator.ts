// Behavioral satisfaction estimation from observable economic signals
// Derives a 0–100 satisfaction score per agent when the developer
// does not provide agentSatisfaction explicitly.
//
// Signals used (all already present in EconomyState):
//   - Balance trajectory (growing / stable / declining)
//   - Transaction frequency (engaged vs disengaged)
//   - Inventory diversity (exploring the economy vs stuck)
//   - Recency of activity (recent = healthy, stale = unhappy)
//   - Balance relative to population median (falling behind = frustrated)
//
// The score evolves each tick with exponential smoothing so it
// reflects trends, not just the latest snapshot.

import type { EconomyState, EconomicEvent } from './types.js';

// ── Configuration ──

export interface SatisfactionConfig {
  /** Smoothing factor for score updates. Default: 0.15 (slower drift) */
  smoothing: number;

  /** Ticks of inactivity before score starts decaying. Default: 10 */
  inactivityThreshold: number;

  /** Score decay per tick of inactivity (after threshold). Default: 1.5 */
  inactivityDecayRate: number;

  /** Rolling history window (ticks). Default: 30 */
  historyWindow: number;

  /** Default score for newly seen agents. Default: 70 */
  initialScore: number;
}

const DEFAULT_CONFIG: SatisfactionConfig = {
  smoothing: 0.15,
  inactivityThreshold: 10,
  inactivityDecayRate: 1.5,
  historyWindow: 30,
  initialScore: 70,
};

// ── Per-agent tracking ──

interface AgentHistory {
  firstSeen: number;
  lastActive: number;
  score: number;            // current smoothed satisfaction (0–100)
  balances: number[];       // rolling total holdings
  txCounts: number[];       // rolling tx count per tick
  inventorySizes: number[]; // rolling distinct item count
}

// ── Estimator ──

export class SatisfactionEstimator {
  private agents = new Map<string, AgentHistory>();
  private config: SatisfactionConfig;

  constructor(config?: Partial<SatisfactionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ingest a state snapshot + events and update per-agent satisfaction.
   * Call once per tick. If the state already has agentSatisfaction, this
   * is a no-op — the caller should skip estimation in that case.
   */
  update(state: EconomyState, events?: EconomicEvent[]): void {
    if (!state.agentBalances) return;
    const tick = state.tick;

    // Build tx counts per agent from events
    const txCounts = new Map<string, number>();
    if (events) {
      for (const e of events) {
        for (const id of [e.actor, e.from, e.to]) {
          if (!id) continue;
          txCounts.set(id, (txCounts.get(id) ?? 0) + 1);
        }
      }
    }

    // Population-wide median balance (for relative standing)
    const allTotals: number[] = [];
    for (const balances of Object.values(state.agentBalances)) {
      allTotals.push(Object.values(balances).reduce((s, v) => s + v, 0));
    }
    allTotals.sort((a, b) => a - b);
    const medianBalance = allTotals.length > 0
      ? allTotals[Math.floor(allTotals.length / 2)]!
      : 0;

    // Update each agent
    for (const [agentId, balances] of Object.entries(state.agentBalances)) {
      const totalHoldings = Object.values(balances).reduce((s, v) => s + v, 0);
      const inventorySize = Object.keys(state.agentInventories[agentId] ?? {}).length;
      const agentTx = txCounts.get(agentId) ?? 0;

      let record = this.agents.get(agentId);
      if (!record) {
        record = {
          firstSeen: tick,
          lastActive: tick,
          score: this.config.initialScore,
          balances: [],
          txCounts: [],
          inventorySizes: [],
        };
      }

      // Push rolling data
      record.balances.push(totalHoldings);
      record.txCounts.push(agentTx);
      record.inventorySizes.push(inventorySize);

      // Trim to window
      const w = this.config.historyWindow;
      if (record.balances.length > w) record.balances = record.balances.slice(-w);
      if (record.txCounts.length > w) record.txCounts = record.txCounts.slice(-w);
      if (record.inventorySizes.length > w) record.inventorySizes = record.inventorySizes.slice(-w);

      if (agentTx > 0) record.lastActive = tick;

      // ── Compute raw signal score (0–100) ──
      const rawScore = this.computeRaw(record, totalHoldings, medianBalance, tick);

      // Exponential smoothing
      const alpha = this.config.smoothing;
      record.score = record.score * (1 - alpha) + rawScore * alpha;

      // Clamp
      record.score = Math.max(0, Math.min(100, record.score));

      this.agents.set(agentId, record);
    }

    // Prune agents gone from state for 2× history window
    if (tick % this.config.historyWindow === 0) {
      for (const [id, rec] of this.agents) {
        if (tick - rec.lastActive > this.config.historyWindow * 2 && !(id in state.agentBalances)) {
          this.agents.delete(id);
        }
      }
    }
  }

  /**
   * Return estimated satisfaction as Record<string, number> (same shape
   * as EconomyState.agentSatisfaction).
   */
  getEstimates(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [id, rec] of this.agents) {
      result[id] = Math.round(rec.score * 10) / 10;
    }
    return result;
  }

  // ── Private: compute raw satisfaction signal for one agent ──

  private computeRaw(
    record: AgentHistory,
    currentBalance: number,
    medianBalance: number,
    currentTick: number,
  ): number {
    let score = 50; // neutral baseline

    // 1. Balance trajectory (+/- 15 pts)
    //    Compare recent half vs earlier half of balance history
    const bals = record.balances;
    if (bals.length >= 4) {
      const half = Math.floor(bals.length / 2);
      const earlyAvg = bals.slice(0, half).reduce((s, v) => s + v, 0) / half;
      const lateAvg = bals.slice(half).reduce((s, v) => s + v, 0) / (bals.length - half);

      if (earlyAvg > 0) {
        const change = (lateAvg - earlyAvg) / earlyAvg;
        // Growing = good (+15 max), declining = bad (-15 max)
        score += Math.max(-15, Math.min(15, change * 50));
      }
    }

    // 2. Transaction engagement (+/- 15 pts)
    //    Recent tx activity relative to own history
    const txs = record.txCounts;
    if (txs.length >= 4) {
      const recentTx = txs.slice(-5).reduce((s, v) => s + v, 0);
      const totalTx = txs.reduce((s, v) => s + v, 0);
      const avgTx = totalTx / txs.length;

      if (avgTx > 0) {
        const recentAvg = recentTx / Math.min(5, txs.length);
        const ratio = recentAvg / avgTx;
        // Increasing activity = good, declining = bad
        score += Math.max(-15, Math.min(15, (ratio - 1) * 20));
      } else if (recentTx > 0) {
        // Was inactive, now active = positive signal
        score += 10;
      }
    }

    // 3. Inventory diversity (+/- 10 pts)
    //    More diverse inventory = more engaged with the economy
    const invs = record.inventorySizes;
    if (invs.length >= 2) {
      const latestInv = invs[invs.length - 1]!;
      const earliestInv = invs[0]!;

      if (latestInv > earliestInv) {
        score += Math.min(10, (latestInv - earliestInv) * 2);
      } else if (latestInv < earliestInv && earliestInv > 0) {
        score -= Math.min(10, (earliestInv - latestInv) * 2);
      }
    }

    // 4. Relative standing vs population (+/- 10 pts)
    //    Falling far below median = frustration
    if (medianBalance > 0) {
      const standing = currentBalance / medianBalance;
      if (standing < 0.3) {
        score -= 10;  // far below median
      } else if (standing < 0.6) {
        score -= 5;   // somewhat below
      } else if (standing > 2.0) {
        score += 5;   // well above — comfortable
      }
    }

    // 5. Inactivity penalty (-20 max)
    //    Score decays if agent hasn't transacted recently
    const ticksSinceActive = currentTick - record.lastActive;
    if (ticksSinceActive > this.config.inactivityThreshold) {
      const decayTicks = ticksSinceActive - this.config.inactivityThreshold;
      score -= Math.min(20, decayTicks * this.config.inactivityDecayRate);
    }

    return Math.max(0, Math.min(100, score));
  }
}
