// Stage 5: Executor — applies actions to the host system and monitors rollback conditions

import type { ActionPlan, EconomyMetrics, EconomyAdapter } from './types.js';

export type ExecutionResult = 'applied' | 'rolled_back' | 'rollback_skipped';

interface ActivePlan {
  plan: ActionPlan;
  originalValue: number;
}

export class Executor {
  private activePlans: ActivePlan[] = [];

  async apply(
    plan: ActionPlan,
    adapter: EconomyAdapter,
    currentParams: Record<string, number>,
  ): Promise<void> {
    const originalValue = currentParams[plan.parameter] ?? plan.currentValue;
    await adapter.setParam(plan.parameter, plan.targetValue, plan.scope);
    plan.appliedAt = plan.diagnosis.tick;

    this.activePlans.push({ plan, originalValue });
  }

  /**
   * Check all active plans for rollback conditions.
   * Returns { rolledBack, settled } — plans that were undone and plans that passed their window.
   */
  async checkRollbacks(
    metrics: EconomyMetrics,
    adapter: EconomyAdapter,
  ): Promise<{ rolledBack: ActionPlan[]; settled: ActionPlan[] }> {
    const rolledBack: ActionPlan[] = [];
    const settled: ActionPlan[] = [];
    const remaining: ActivePlan[] = [];

    for (const active of this.activePlans) {
      const { plan, originalValue } = active;
      const rc = plan.rollbackCondition;

      // Hard TTL: evict plans that have been active for too long
      const maxActiveTicks = 200;
      if (plan.appliedAt !== undefined && metrics.tick - plan.appliedAt > maxActiveTicks) {
        settled.push(plan);
        continue;
      }

      // Not ready to check yet
      if (metrics.tick < rc.checkAfterTick) {
        remaining.push(active);
        continue;
      }

      // Check rollback condition
      const metricValue = this.getMetricValue(metrics, rc.metric);

      // Fail-safe: if metric is unresolvable, trigger rollback
      if (Number.isNaN(metricValue)) {
        console.warn(
          `[AgentE] Rollback check: metric path '${rc.metric}' resolved to NaN for plan '${plan.id}'. Triggering rollback as fail-safe.`
        );
        await adapter.setParam(plan.parameter, originalValue, plan.scope);
        rolledBack.push(plan);
        continue;
      }

      const shouldRollback =
        rc.direction === 'below'
          ? metricValue < rc.threshold
          : metricValue > rc.threshold;

      if (shouldRollback) {
        // Undo the adjustment
        await adapter.setParam(plan.parameter, originalValue, plan.scope);
        rolledBack.push(plan);
      } else {
        // Plan has passed its check window — consider it settled
        const settledTick = rc.checkAfterTick + 10;
        if (metrics.tick > settledTick) {
          settled.push(plan);
        } else {
          remaining.push(active);
        }
      }
    }

    this.activePlans = remaining;
    return { rolledBack, settled };
  }

  private getMetricValue(metrics: EconomyMetrics, metricPath: string): number {
    // Support dotted paths like 'poolSizes.competitive' or 'custom.myMetric'
    const parts = metricPath.split('.');
    let value: unknown = metrics;
    for (const part of parts) {
      if (value !== null && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return NaN;
      }
    }
    return typeof value === 'number' ? value : NaN;
  }

  getActivePlans(): ActionPlan[] {
    return this.activePlans.map(a => a.plan);
  }
}
