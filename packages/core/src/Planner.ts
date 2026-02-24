// Stage 4: Planner — converts validated diagnosis into a concrete, constrained action plan

import type {
  Diagnosis,
  ActionPlan,
  Thresholds,
  EconomyMetrics,
  SimulationResult,
} from './types.js';
import type { ParameterRegistry, ParameterScope } from './ParameterRegistry.js';

interface ParameterConstraint {
  min: number;
  max: number;
}

export class Planner {
  private lockedParams = new Set<string>();
  private constraints = new Map<string, ParameterConstraint>();
  private cooldowns = new Map<string, number>(); // param → last-applied-tick
  private typeCooldowns = new Map<string, number>(); // type+scope key → last-applied-tick
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
   * - no matching parameter in registry
   */
  plan(
    diagnosis: Diagnosis,
    metrics: EconomyMetrics,
    simulationResult: SimulationResult,
    currentParams: Record<string, number>,
    thresholds: Thresholds,
    registry?: ParameterRegistry,
  ): ActionPlan | null {
    const action = diagnosis.violation.suggestedAction;

    // Type-level cooldown: prevent re-planning the same parameterType+scope before registry resolution
    const typeKey = this.typeCooldownKey(action.parameterType, action.scope);
    if (this.isTypeCooldown(typeKey, metrics.tick, thresholds.cooldownTicks)) return null;

    // Resolve parameterType + scope to a concrete key via registry
    let param: string;
    let resolvedBaseline: number | undefined;
    let scope: ParameterScope | undefined;

    if (registry) {
      const resolved = registry.resolve(action.parameterType, action.scope);
      if (!resolved) return null; // no matching parameter registered
      param = resolved.key;
      resolvedBaseline = resolved.currentValue;
      scope = resolved.scope as ParameterScope | undefined;
      action.resolvedParameter = param;
    } else {
      // Fallback: use parameterType as param name directly
      param = action.resolvedParameter ?? action.parameterType;
      scope = action.scope as ParameterScope | undefined;
    }

    // Hard checks
    if (this.lockedParams.has(param)) return null;
    if (this.isOnCooldown(param, metrics.tick, thresholds.cooldownTicks)) return null;
    if (!simulationResult.netImprovement) return null;
    if (!simulationResult.noNewProblems) return null;

    // Complexity budget (P44)
    if (this.activePlanCount >= thresholds.complexityBudgetMax) return null;

    // Compute target value
    // Prefer registry's currentValue, then currentParams, then absoluteValue, then 1.0
    const currentValue = resolvedBaseline ?? currentParams[param] ?? action.absoluteValue ?? 1.0;
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
      ...(scope !== undefined ? { scope } : {}),
      currentValue,
      targetValue,
      maxChangePercent: thresholds.maxAdjustmentPercent,
      cooldownTicks: thresholds.cooldownTicks,
      rollbackCondition: {
        metric: 'avgSatisfaction',
        direction: 'below',
        threshold: Math.max(20, metrics.avgSatisfaction - 10),
        checkAfterTick: metrics.tick + estimatedLag + 3,
      },
      simulationResult,
      estimatedLag,
    };

    return plan;
  }

  recordApplied(plan: ActionPlan, tick: number): void {
    this.cooldowns.set(plan.parameter, tick);
    // Also record type-level cooldown from the diagnosis action
    const action = plan.diagnosis.violation.suggestedAction;
    const typeKey = this.typeCooldownKey(action.parameterType, action.scope);
    this.typeCooldowns.set(typeKey, tick);
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
    this.typeCooldowns.clear();
  }

  /** V1.5.2: Reset active plan count (e.g., on system restart) */
  resetActivePlans(): void {
    this.activePlanCount = 0;
  }

  /** V1.5.2: Current active plan count (for diagnostics) */
  getActivePlanCount(): number {
    return this.activePlanCount;
  }

  private typeCooldownKey(type: string, scope?: Partial<ParameterScope>): string {
    const parts = [type];
    if (scope?.system) parts.push(`sys:${scope.system}`);
    if (scope?.currency) parts.push(`cur:${scope.currency}`);
    if (scope?.tags?.length) parts.push(`tags:${scope.tags.sort().join(',')}`);
    return parts.join('|');
  }

  private isTypeCooldown(typeKey: string, currentTick: number, cooldownTicks: number): boolean {
    const lastApplied = this.typeCooldowns.get(typeKey);
    if (lastApplied === undefined) return false;
    return currentTick - lastApplied < cooldownTicks;
  }
}
