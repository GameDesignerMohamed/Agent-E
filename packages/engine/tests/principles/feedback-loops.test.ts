import { describe, it, expect } from 'vitest';
import { P20_DecayPreventsAccumulation } from '../../src/principles/feedback-loops.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('P20 — Decay Prevents Accumulation', () => {
  it('fires when resources per agent > 20 and velocity < 3 (hoarding)', () => {
    const m = {
      ...emptyMetrics(10),
      totalAgents: 5,
      supplyByResource: { ore: 60, wood: 50 }, // 110 total / 5 agents = 22 per agent
      velocity: 1,
    };
    const result = P20_DecayPreventsAccumulation.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(4);
      expect(result.suggestedAction.direction).toBe('decrease');
      expect(result.suggestedAction.parameterType).toBe('yield');
      expect(result.evidence['resourcesPerAgent']).toBeGreaterThan(20);
      expect(result.evidence['velocity']).toBe(1);
    }
  });

  it('does not fire when velocity >= 3 even with high resources per agent', () => {
    const m = {
      ...emptyMetrics(10),
      totalAgents: 5,
      supplyByResource: { ore: 60, wood: 50 }, // 22 per agent
      velocity: 5,
    };
    const result = P20_DecayPreventsAccumulation.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire when resources per agent <= 20', () => {
    const m = {
      ...emptyMetrics(10),
      totalAgents: 10,
      supplyByResource: { ore: 100 }, // 10 per agent
      velocity: 1,
    };
    const result = P20_DecayPreventsAccumulation.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('handles zero agents gracefully (no divide-by-zero)', () => {
    const m = {
      ...emptyMetrics(10),
      totalAgents: 0,
      supplyByResource: { ore: 1000 },
      velocity: 0,
    };
    // Should not throw; totalAgents=0 → denominator clamps to 1 → 1000/1 = 1000 per agent
    expect(() => P20_DecayPreventsAccumulation.check(m, t)).not.toThrow();
    const result = P20_DecayPreventsAccumulation.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('does not fire when economy is empty (no resources)', () => {
    const m = {
      ...emptyMetrics(10),
      totalAgents: 50,
      supplyByResource: {},
      velocity: 0,
    };
    const result = P20_DecayPreventsAccumulation.check(m, t);
    expect(result.violated).toBe(false);
  });
});
