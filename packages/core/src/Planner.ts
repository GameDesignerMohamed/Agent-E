// Stage 4: Planner — converts validated diagnosis into a concrete, constrained action plan

import type {
  Diagnosis,
  ActionPlan,
  Thresholds,
  EconomyMetrics,
  SimulationResult,
} from './types.js';

interface ParameterConstraint {
  min: number;
  max: number;
}

export class Planner {
  private lockedParams = new Set<string>();
  private constraints = new Map<string, ParameterConstraint>();
  private cooldowns = new Map<string, number>(); // param → last-applied-tick
  private activePlanCount = 0;

  lock(param: string): void {
    this.lockedParams.add(param);
  }

  unlock(param: string): void {
    this.lockedParams.delete(param);
  }

  constrain(param: string, constraint: ParameterConstraint): void {
    this.constraints.set(param, constraint);
  }

  /**
   * Convert a diagnosis into an ActionPlan.
   * Returns null if:
   * - parameter is locked
   * - parameter is still in cooldown
   * - simulation result failed
   * - complexity budget exceeded
   */
  plan(
    diagnosis: Diagnosis,
    metrics: EconomyMetrics,
    simulationResult: SimulationResult,
    currentParams: Record<string, number>,
    thresholds: Thresholds,
  ): ActionPlan | null {
    const action = diagnosis.violation.suggestedAction;
    const param = action.parameter;

    // Hard checks
    if (this.lockedParams.has(param)) return null;
    if (this.isOnCooldown(param, metrics.tick, thresholds.cooldownTicks)) return null;
    if (!simulationResult.netImprovement) return null;
    if (!simulationResult.noNewProblems) return null;

    // Complexity budget (P44)
    if (this.activePlanCount >= thresholds.complexityBudgetMax) return null;

    // Compute target value
    // NOTE: currentParams may not have this param yet (first adjustment).
    // If the action provides absoluteValue, prefer it as baseline.
    // Otherwise fall back to 1.0 — which is why 'set' actions are preferred
    // for first-time corrections.
    const currentValue = currentParams[param] ?? action.absoluteValue ?? 1.0;
    const magnitude = Math.min(action.magnitude ?? 0.10, thresholds.maxAdjustmentPercent);
    let targetValue: number;

    if (action.direction === 'set' && action.absoluteValue !== undefined) {
      targetValue = action.absoluteValue;
    } else if (action.direction === 'increase') {
      targetValue = currentValue * (1 + magnitude);
    } else {
      targetValue = currentValue * (1 - magnitude);
    }

    // Apply constraints
    const constraint = this.constraints.get(param);
    if (constraint) {
      targetValue = Math.max(constraint.min, Math.min(constraint.max, targetValue));
    }

    // Don't plan if target === current (nothing to do)
    if (Math.abs(targetValue - currentValue) < 0.001) return null;

    const estimatedLag =
      diagnosis.violation.estimatedLag ?? simulationResult.estimatedEffectTick - metrics.tick;

    const plan: ActionPlan = {
      id: `plan_${metrics.tick}_${param}`,
      diagnosis,
      parameter: param,
      ...(action.currency !== undefined ? { currency: action.currency } : {}),
      currentValue,
      targetValue,
      maxChangePercent: thresholds.maxAdjustmentPercent,
      cooldownTicks: thresholds.cooldownTicks,
      rollbackCondition: {
        metric: 'avgSatisfaction',
        direction: 'below',
        threshold: Math.max(20, metrics.avgSatisfaction - 10), // rollback if sat drops >10 pts
        checkAfterTick: metrics.tick + estimatedLag + 3,
      },
      simulationResult,
      estimatedLag,
    };

    return plan;
  }

  recordApplied(plan: ActionPlan, tick: number): void {
    this.cooldowns.set(plan.parameter, tick);
    this.activePlanCount++;
  }

  recordRolledBack(_plan: ActionPlan): void {
    this.activePlanCount = Math.max(0, this.activePlanCount - 1);
  }

  recordSettled(_plan: ActionPlan): void {
    this.activePlanCount = Math.max(0, this.activePlanCount - 1);
  }

  isOnCooldown(param: string, currentTick: number, cooldownTicks: number): boolean {
    const lastApplied = this.cooldowns.get(param);
    if (lastApplied === undefined) return false;
    return currentTick - lastApplied < cooldownTicks;
  }

  /** Reset all cooldowns (useful for testing) */
  resetCooldowns(): void {
    this.cooldowns.clear();
  }
}
