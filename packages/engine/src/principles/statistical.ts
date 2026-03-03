// P43: Statistical — Simulation Minimum (Community)

import type { Principle, PrincipleResult } from '../types.js';

export const P43_SimulationMinimum: Principle = {
  id: 'P43',
  name: 'Simulation Minimum (100 Iterations)',
  category: 'statistical',
  description:
    'Wild inflation swings (>30%) may indicate insufficient simulation data. ' +
    'Minimum iteration enforcement is structural (Simulator config). Symptom detector.',
  check(metrics, thresholds): PrincipleResult {
    // This is enforced structurally by the Simulator (iterations >= 100).
    // As a diagnostic: if inflationRate is oscillating wildly, it may indicate
    // decisions were made on insufficient simulation data.
    const { inflationRate } = metrics;

    if (Math.abs(inflationRate) > 0.30) {
      return {
        violated: true,
        severity: 3,
        evidence: { inflationRate, minIterations: thresholds.simulationMinIterations },
        suggestedAction: {
          parameterType: 'cost',
          direction: inflationRate > 0 ? 'increase' : 'decrease',
          magnitude: 0.05,
          reasoning:
            `Large inflation rate swing (${(inflationRate * 100).toFixed(0)}%). ` +
            `Ensure all decisions use ≥${thresholds.simulationMinIterations} simulation iterations. ` +
            'Apply conservative correction.',
        },
        confidence: 0.50,
        estimatedLag: 5,
      };
    }

    return { violated: false };
  },
};

export const STATISTICAL_PRINCIPLES: Principle[] = [P43_SimulationMinimum];
