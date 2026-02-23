// Stage 3: Simulator — forward Monte Carlo projection before any action is applied
// The single biggest architectural addition in V1 (vs V0's intuition-based adjustments)

import type {
  EconomyMetrics,
  SuggestedAction,
  SimulationResult,
  SimulationOutcome,
  Thresholds,
} from './types.js';
import { emptyMetrics } from './types.js';
import { Diagnoser } from './Diagnoser.js';
import { ALL_PRINCIPLES } from './principles/index.js';

export class Simulator {
  private diagnoser = new Diagnoser(ALL_PRINCIPLES);
  // Cache beforeViolations for the *current* tick only (one entry max).
  // Using a Map here is intentional but the cache must be bounded — we only
  // care about the tick that is currently being evaluated, so we evict any
  // entries whose key differs from the incoming tick.
  private beforeViolationsCache = new Map<number, Set<string>>();

  /**
   * Simulate the effect of applying `action` to the current economy forward `forwardTicks`.
   * Runs `iterations` Monte Carlo trials and returns the outcome distribution.
   *
   * The inner model is intentionally lightweight — it models how key metrics evolve
   * under a parameter change using simplified dynamics. This is not a full agent simulation;
   * it is a fast inner model that catches obvious over/under-corrections.
   */
  simulate(
    action: SuggestedAction,
    currentMetrics: EconomyMetrics,
    thresholds: Thresholds,
    iterations: number = 100,
    forwardTicks: number = 20,
  ): SimulationResult {
    const actualIterations = Math.max(thresholds.simulationMinIterations, iterations);
    const outcomes: EconomyMetrics[] = [];

    for (let i = 0; i < actualIterations; i++) {
      const projected = this.runForward(currentMetrics, action, forwardTicks, thresholds);
      outcomes.push(projected);
    }

    // Sort outcomes by avgSatisfaction to compute percentiles
    const sorted = [...outcomes].sort((a, b) => a.avgSatisfaction - b.avgSatisfaction);
    const p10 = sorted[Math.floor(actualIterations * 0.10)] ?? emptyMetrics();
    const p50 = sorted[Math.floor(actualIterations * 0.50)] ?? emptyMetrics();
    const p90 = sorted[Math.floor(actualIterations * 0.90)] ?? emptyMetrics();
    const mean = this.averageMetrics(outcomes);

    // Validate: does p50 improve the diagnosed issue?
    const netImprovement = this.checkImprovement(currentMetrics, p50, action);

    // Validate: does the action create new principle violations not present before?
    // Cache beforeViolations per tick to avoid redundant diagnose() calls when
    // evaluating multiple candidate actions at the same tick.
    // IMPORTANT: evict stale entries so the cache stays bounded to 1 entry.
    const tick = currentMetrics.tick;
    if (this.beforeViolationsCache.size > 0 && !this.beforeViolationsCache.has(tick)) {
      this.beforeViolationsCache.clear();
    }
    let beforeViolations = this.beforeViolationsCache.get(tick);
    if (!beforeViolations) {
      beforeViolations = new Set(
        this.diagnoser.diagnose(currentMetrics, thresholds).map(d => d.principle.id),
      );
      this.beforeViolationsCache.set(tick, beforeViolations);
    }
    const afterViolations = new Set(
      this.diagnoser.diagnose(p50, thresholds).map(d => d.principle.id),
    );
    const newViolations = [...afterViolations].filter(id => !beforeViolations.has(id));
    const noNewProblems = newViolations.length === 0;

    // Confidence interval on avgSatisfaction
    const satisfactions = outcomes.map(o => o.avgSatisfaction);
    const meanSat = satisfactions.reduce((s, v) => s + v, 0) / satisfactions.length;
    const stdDev = Math.sqrt(
      satisfactions.reduce((s, v) => s + (v - meanSat) ** 2, 0) / satisfactions.length,
    );
    const ci: [number, number] = [meanSat - 1.96 * stdDev, meanSat + 1.96 * stdDev];

    // Lag estimation: P39 — effect visible after 3-5× observation interval
    const estimatedEffectTick =
      currentMetrics.tick + thresholds.lagMultiplierMin * 5;

    // Overshoot risk: how often does p90 overshoot relative to p50?
    const overshootRisk = sorted
      .slice(Math.floor(actualIterations * 0.80))
      .filter(m => Math.abs(m.netFlow) > Math.abs(currentMetrics.netFlow) * 2).length
      / (actualIterations * 0.20);

    return {
      proposedAction: action,
      iterations: actualIterations,
      forwardTicks,
      outcomes: { p10, p50, p90, mean } as SimulationOutcome,
      netImprovement,
      noNewProblems,
      confidenceInterval: ci,
      estimatedEffectTick,
      overshootRisk: Math.min(1, overshootRisk),
    };
  }

  /**
   * Lightweight forward model: apply action then project key metrics forward.
   * Uses simplified dynamics — not a full agent replay.
   */
  private runForward(
    metrics: EconomyMetrics,
    action: SuggestedAction,
    ticks: number,
    _thresholds: Thresholds,
  ): EconomyMetrics {
    // Apply the action effect as a multiplier on the relevant metric
    const multiplier = this.actionMultiplier(action);

    // Add stochastic noise (Monte Carlo element)
    const noise = () => 1 + (Math.random() - 0.5) * 0.1;

    let supply = metrics.totalSupply;
    let satisfaction = metrics.avgSatisfaction;
    let gini = metrics.giniCoefficient;
    let velocity = metrics.velocity;
    let netFlow = metrics.netFlow;
    const churnRate = metrics.churnRate;

    for (let t = 0; t < ticks; t++) {
      // Apply action effect on net flow (most actions affect flow)
      const effectOnFlow = this.flowEffect(action, metrics) * multiplier * noise();
      netFlow = netFlow * 0.9 + effectOnFlow * 0.1; // smooth convergence

      // Supply drifts with net flow
      supply += netFlow * noise();
      supply = Math.max(0, supply);

      // Satisfaction improves when net flow is balanced and supply is stable
      const satDelta = netFlow > 0 && netFlow < 20 ? 0.5 : netFlow < 0 ? -1 : 0;
      satisfaction = Math.min(100, Math.max(0, satisfaction + satDelta * noise()));

      // Gini slowly reverts (market pressure)
      gini = gini * 0.99 + 0.35 * 0.01 * noise(); // drift toward 0.35

      // Velocity follows supply (more money = more trading)
      velocity = (supply / Math.max(1, metrics.totalAgents)) * 0.01 * noise();

      // Agent churn reduces population over time
      const agentLoss = metrics.totalAgents * churnRate * noise();
      void agentLoss; // tracked but not used in simplified model
    }

    const projected: EconomyMetrics = {
      ...metrics,
      tick: metrics.tick + ticks,
      totalSupply: supply,
      netFlow,
      velocity,
      giniCoefficient: Math.max(0, Math.min(1, gini)),
      avgSatisfaction: satisfaction,
      inflationRate: metrics.totalSupply > 0 ? (supply - metrics.totalSupply) / metrics.totalSupply : 0,
    };

    return projected;
  }

  private actionMultiplier(action: SuggestedAction): number {
    const base = action.magnitude ?? 0.10;
    return action.direction === 'increase' ? 1 + base : 1 - base;
  }

  private flowEffect(action: SuggestedAction, metrics: EconomyMetrics): number {
    // Rough model: which parameters affect net flow, and in which direction?
    const { parameter, direction } = action;
    const sign = direction === 'increase' ? -1 : 1; // increase cost = reduce flow

    // Get dominant role population (highest count)
    const roleEntries = Object.entries(metrics.populationByRole).sort((a, b) => b[1] - a[1]);
    const dominantRoleCount = roleEntries[0]?.[1] ?? 0;

    if (parameter === 'productionCost') {
      return sign * metrics.netFlow * 0.2;
    }
    if (parameter === 'transactionFee') {
      return sign * metrics.velocity * 10 * 0.1;
    }
    if (parameter === 'entryFee') {
      return sign * dominantRoleCount * 0.5;
    }
    if (parameter === 'rewardRate') {
      return -sign * dominantRoleCount * 0.3;
    }
    if (parameter === 'yieldRate') {
      return sign * metrics.faucetVolume * 0.15;
    }
    return sign * metrics.netFlow * 0.1;
  }

  private checkImprovement(
    before: EconomyMetrics,
    after: EconomyMetrics,
    action: SuggestedAction,
  ): boolean {
    // Net improvement: key metrics should be trending better
    const satisfactionImproved = after.avgSatisfaction >= before.avgSatisfaction - 2;
    const flowMoreBalanced = Math.abs(after.netFlow) <= Math.abs(before.netFlow) * 1.2;
    const notWorseGini = after.giniCoefficient <= before.giniCoefficient + 0.05;
    void action; // could be used for targeted checks
    return satisfactionImproved && flowMoreBalanced && notWorseGini;
  }

  private averageMetrics(outcomes: EconomyMetrics[]): EconomyMetrics {
    if (outcomes.length === 0) return emptyMetrics();
    const base = { ...outcomes[0]! };
    const avg = (key: keyof EconomyMetrics) => {
      const vals = outcomes.map(o => o[key] as number).filter(v => typeof v === 'number' && !isNaN(v));
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    return {
      ...base,
      totalSupply: avg('totalSupply'),
      netFlow: avg('netFlow'),
      velocity: avg('velocity'),
      giniCoefficient: avg('giniCoefficient'),
      avgSatisfaction: avg('avgSatisfaction'),
      inflationRate: avg('inflationRate'),
    };
  }
}
