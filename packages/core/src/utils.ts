// Utility functions for economy analysis

import type { EconomyMetrics } from './types.js';

/**
 * Find the system with the worst metric value.
 * Works with flat Record<string, number> maps like flowBySystem.
 *
 * @param metrics - Current economy metrics snapshot
 * @param check - Function that returns a numeric "badness" score per system (higher = worse)
 * @param tolerancePercent - Only flag if the worst system exceeds the average by this % (default 0)
 * @returns The system name and its score, or undefined if no systems or none exceeds tolerance
 */
export function findWorstSystem(
  metrics: EconomyMetrics,
  check: (systemName: string, metrics: EconomyMetrics) => number,
  tolerancePercent: number = 0,
): { system: string; score: number } | undefined {
  const systems = metrics.systems;
  if (systems.length === 0) return undefined;

  let worstSystem: string | undefined;
  let worstScore = -Infinity;
  let totalScore = 0;

  for (const sys of systems) {
    const score = check(sys, metrics);
    totalScore += score;
    if (score > worstScore) {
      worstScore = score;
      worstSystem = sys;
    }
  }

  if (!worstSystem) return undefined;

  // Tolerance check: only flag if worst exceeds average by tolerancePercent
  if (tolerancePercent > 0 && systems.length > 1) {
    const avg = totalScore / systems.length;
    if (avg === 0) return { system: worstSystem, score: worstScore };
    const excessPercent = ((worstScore - avg) / Math.abs(avg)) * 100;
    if (excessPercent < tolerancePercent) return undefined;
  }

  return { system: worstSystem, score: worstScore };
}
