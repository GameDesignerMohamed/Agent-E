// Full-transparency decision logging
// Every decision AgentE makes is logged with diagnosis, plan, simulation proof, and outcome

import type { DecisionEntry, DecisionResult, Diagnosis, ActionPlan, EconomyMetrics } from './types.js';

export class DecisionLog {
  private entries: DecisionEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  record(
    diagnosis: Diagnosis,
    plan: ActionPlan,
    result: DecisionResult,
    metrics: EconomyMetrics,
  ): DecisionEntry {
    const entry: DecisionEntry = {
      id: `decision_${metrics.tick}_${plan.parameter}`,
      tick: metrics.tick,
      timestamp: Date.now(),
      diagnosis,
      plan,
      result,
      reasoning: this.buildReasoning(diagnosis, plan, result),
      metricsSnapshot: metrics,
    };

    this.entries.push(entry); // oldest first, newest at end
    if (this.entries.length > this.maxEntries * 1.5) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return entry;
  }

  recordSkip(
    diagnosis: Diagnosis,
    result: DecisionResult,
    metrics: EconomyMetrics,
    reason: string,
  ): void {
    const entry: DecisionEntry = {
      id: `skip_${metrics.tick}_${diagnosis.principle.id}`,
      tick: metrics.tick,
      timestamp: Date.now(),
      diagnosis,
      plan: this.stubPlan(diagnosis, metrics),
      result,
      reasoning: reason,
      metricsSnapshot: metrics,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries * 1.5) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  query(filter?: {
    since?: number;
    until?: number;
    issue?: string;
    parameter?: string;
    result?: DecisionResult;
  }): DecisionEntry[] {
    return this.entries.filter(e => {
      if (filter?.since !== undefined && e.tick < filter.since) return false;
      if (filter?.until !== undefined && e.tick > filter.until) return false;
      if (filter?.issue && e.diagnosis.principle.id !== filter.issue) return false;
      if (filter?.parameter && e.plan.parameter !== filter.parameter) return false;
      if (filter?.result && e.result !== filter.result) return false;
      return true;
    });
  }

  latest(n = 30): DecisionEntry[] {
    return this.entries.slice(-n).reverse();
  }

  export(format: 'json' | 'text' = 'json'): string {
    if (format === 'text') {
      return this.entries
        .map(e => `[Tick ${e.tick}] ${e.result.toUpperCase()} — ${e.reasoning}`)
        .join('\n');
    }
    return JSON.stringify(this.entries, null, 2);
  }

  private buildReasoning(
    diagnosis: Diagnosis,
    plan: ActionPlan,
    result: DecisionResult,
  ): string {
    const sim = plan.simulationResult;
    const simSummary =
      `Simulation (${sim.iterations} iterations, ${sim.forwardTicks} ticks forward): ` +
      `p50 satisfaction ${sim.outcomes.p50.avgSatisfaction.toFixed(0)}, ` +
      `net improvement ${sim.netImprovement}, ` +
      `no new problems ${sim.noNewProblems}, ` +
      `overshoot risk ${(sim.overshootRisk * 100).toFixed(0)}%.`;

    const actionSummary =
      `[${diagnosis.principle.id}] ${diagnosis.principle.name}: ` +
      `${plan.parameter} ${plan.currentValue.toFixed(3)} → ${plan.targetValue.toFixed(3)}. ` +
      `Severity ${diagnosis.violation.severity}/10, confidence ${(diagnosis.violation.confidence * 100).toFixed(0)}%.`;

    if (result === 'applied') {
      return `${actionSummary} ${simSummary} Expected effect in ${plan.estimatedLag} ticks.`;
    }

    return `${actionSummary} Skipped (${result}). ${simSummary}`;
  }

  private stubPlan(diagnosis: Diagnosis, metrics: EconomyMetrics): ActionPlan {
    const action = diagnosis.violation.suggestedAction;
    return {
      id: `stub_${metrics.tick}`,
      diagnosis,
      parameter: action.resolvedParameter ?? action.parameterType,
      ...(action.scope !== undefined ? { scope: action.scope } : {}),
      currentValue: 1,
      targetValue: 1,
      maxChangePercent: 0,
      cooldownTicks: 0,
      rollbackCondition: {
        metric: 'avgSatisfaction',
        direction: 'below',
        threshold: 0,
        checkAfterTick: 0,
      },
      simulationResult: {
        proposedAction: action,
        iterations: 0,
        forwardTicks: 0,
        outcomes: {
          p10: metrics,
          p50: metrics,
          p90: metrics,
          mean: metrics,
        },
        netImprovement: false,
        noNewProblems: true,
        confidenceInterval: [0, 0],
        estimatedEffectTick: 0,
        overshootRisk: 0,
      },
      estimatedLag: 0,
    };
  }
}
