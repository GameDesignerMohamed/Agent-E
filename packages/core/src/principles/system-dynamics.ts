// P39, P44: System Dynamics Principles

import type { Principle, PrincipleResult } from '../types.js';

export const P39_TheLagPrinciple: Principle = {
  id: 'P39',
  name: 'The Lag Principle',
  category: 'system_dynamics',
  description:
    'Total lag = 3-5× observation interval. If you observe every 5 ticks, ' +
    'expect effects after 15-25 ticks. Adjusting again before lag expires = overshoot. ' +
    'This is enforced by the Planner but diagnosed here.',
  check(metrics, thresholds): PrincipleResult {
    const { inflationRate, netFlow } = metrics;

    // Detect overshoot pattern: inflation flips direction rapidly
    // Proxy: net flow is in opposite direction to inflation rate
    const inflationPositive = inflationRate > 0.05;
    const netFlowNegative = netFlow < -5;
    const inflationNegative = inflationRate < -0.05;
    const netFlowPositive = netFlow > 5;

    const oscillating =
      (inflationPositive && netFlowNegative) || (inflationNegative && netFlowPositive);

    if (oscillating) {
      const lagMin = thresholds.lagMultiplierMin;
      const lagMax = thresholds.lagMultiplierMax;
      return {
        violated: true,
        severity: 5,
        evidence: { inflationRate, netFlow, lagRange: [lagMin, lagMax] },
        suggestedAction: {
          parameterType: 'cost',
          direction: 'increase',
          magnitude: 0.03, // very small — oscillation means over-adjusting
          reasoning:
            'Inflation and net flow moving in opposite directions — overshoot pattern. ' +
            `Wait for lag to resolve (${lagMin}-${lagMax}× observation interval). ` +
            'Apply minimal correction only.',
        },
        confidence: 0.65,
        estimatedLag: thresholds.lagMultiplierMax * 5, // conservative
      };
    }

    return { violated: false };
  },
};

export const P44_ComplexityBudget: Principle = {
  id: 'P44',
  name: 'Complexity Budget',
  category: 'system_dynamics',
  description:
    'More than 20 active adjustable parameters → exponential debugging cost. ' +
    'Each parameter that affects <5% of a core metric should be pruned. ' +
    'AgentE tracks active parameters and flags when budget exceeded.',
  check(metrics, thresholds): PrincipleResult {
    // This is enforced by the Planner's parameter tracking.
    // As a diagnostic: if many custom metrics are registered with low correlation
    // to core metrics, complexity budget is likely exceeded.
    // Simple proxy: if there are many custom metrics with small values, flag.
    const customMetricCount = Object.keys(metrics.custom).length;

    if (customMetricCount > thresholds.complexityBudgetMax) {
      return {
        violated: true,
        severity: 3,
        evidence: { customMetricCount, budgetMax: thresholds.complexityBudgetMax },
        suggestedAction: {
          parameterType: 'fee', scope: { tags: ['transaction'] },
          direction: 'decrease',
          magnitude: 0.01,
          reasoning:
            `${customMetricCount} custom metrics tracked (budget: ${thresholds.complexityBudgetMax}). ` +
            'Consider pruning low-impact parameters. ' +
            'Applying minimal correction to avoid adding complexity.',
        },
        confidence: 0.40,
        estimatedLag: 0,
      };
    }

    return { violated: false };
  },
};

export const SYSTEM_DYNAMICS_PRINCIPLES: Principle[] = [
  P39_TheLagPrinciple,
  P44_ComplexityBudget,
];
