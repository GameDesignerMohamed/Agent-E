// Stage 2: Diagnoser — runs all principles, returns sorted violations

import type { Principle, EconomyMetrics, Thresholds, Diagnosis } from './types.js';

export class Diagnoser {
  private principles: Principle[] = [];

  constructor(principles: Principle[]) {
    this.principles = [...principles];
  }

  addPrinciple(principle: Principle): void {
    this.principles.push(principle);
  }

  removePrinciple(id: string): void {
    this.principles = this.principles.filter(p => p.id !== id);
  }

  /**
   * Run all principles against current metrics.
   * Returns violations sorted by severity (highest first).
   * Only one action is taken per cycle — the highest severity violation.
   */
  diagnose(metrics: EconomyMetrics, thresholds: Thresholds): Diagnosis[] {
    const diagnoses: Diagnosis[] = [];

    for (const principle of this.principles) {
      try {
        const result = principle.check(metrics, thresholds);
        if (result.violated) {
          diagnoses.push({
            principle,
            violation: result,
            tick: metrics.tick,
          });
        }
      } catch (err) {
        // Never let a buggy principle crash the engine
        console.warn(`[AgentE] Principle ${principle.id} threw an error:`, err);
      }
    }

    // Sort by severity DESC, then by confidence DESC as tiebreaker
    diagnoses.sort((a, b) => {
      const severityDiff = b.violation.severity - a.violation.severity;
      if (severityDiff !== 0) return severityDiff;
      return b.violation.confidence - a.violation.confidence;
    });

    return diagnoses;
  }

  getPrinciples(): Principle[] {
    return [...this.principles];
  }
}
