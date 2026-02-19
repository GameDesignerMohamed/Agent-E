// Behavioral persona classification (P46)
// Classifies agents into 9 behavioral archetypes based on observable signals

import type { EconomyState, PersonaType } from './types.js';

interface AgentSignals {
  transactionCount: number;
  netExtraction: number;     // gold out - gold in
  uniqueItemsHeld: number;
  holdingDuration: number;   // ticks holding items
  spendAmount: number;
  sessionActivity: number;   // actions per tick
  socialInteractions: number;
}

export class PersonaTracker {
  private agentHistory = new Map<string, AgentSignals[]>();

  /** Ingest a state snapshot and update agent signal history */
  update(state: EconomyState): void {
    for (const agentId of Object.keys(state.agentBalances)) {
      const history = this.agentHistory.get(agentId) ?? [];
      const inv = state.agentInventories[agentId] ?? {};
      const uniqueItems = Object.values(inv).filter(q => q > 0).length;

      history.push({
        transactionCount: 0, // would be computed from events in full impl
        netExtraction: 0,    // gold out vs in
        uniqueItemsHeld: uniqueItems,
        holdingDuration: 1,
        spendAmount: 0,
        sessionActivity: 1,
        socialInteractions: 0,
      });

      // Keep last 50 ticks of history
      if (history.length > 50) history.shift();
      this.agentHistory.set(agentId, history);
    }
  }

  /** Classify all agents and return persona distribution */
  getDistribution(): Record<string, number> {
    const counts: Record<PersonaType, number> = {
      Gamer: 0, Trader: 0, Collector: 0, Speculator: 0, Earner: 0,
      Builder: 0, Social: 0, Whale: 0, Influencer: 0,
    };
    let total = 0;

    for (const [, history] of this.agentHistory) {
      const persona = this.classify(history);
      counts[persona]++;
      total++;
    }

    if (total === 0) return {};

    const distribution: Record<string, number> = {};
    for (const [persona, count] of Object.entries(counts)) {
      distribution[persona] = count / total;
    }
    return distribution;
  }

  private classify(history: AgentSignals[]): PersonaType {
    if (history.length === 0) return 'Gamer';

    const avg = (key: keyof AgentSignals): number => {
      const vals = history.map(h => h[key]);
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    };

    const txRate = avg('transactionCount');
    const extraction = avg('netExtraction');
    const uniqueItems = avg('uniqueItemsHeld');
    const spend = avg('spendAmount');

    // Simple rule-based classification (replace with ML in production)
    if (spend > 1000) return 'Whale';
    if (txRate > 10) return 'Trader';
    if (uniqueItems > 5 && extraction < 0) return 'Collector'; // buys and holds
    if (extraction > 100) return 'Earner';
    if (extraction > 50) return 'Speculator';
    return 'Gamer'; // default: plays for engagement, not profit
  }
}
