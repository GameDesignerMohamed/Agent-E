import { describe, it, expect } from 'vitest';
import {
  P51_CyclicalEngagement,
  P52_EndowmentEffect,
  P53_EventCompletionRate,
  P54_OperationalCadence,
  P56_SupplyShockAbsorption,
} from '../../src/principles/operations.js';
import { emptyMetrics } from '../../src/types.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';

const t = DEFAULT_THRESHOLDS;
const base = () => emptyMetrics(200);

// ── P51: Cyclical Engagement ────────────────────────────────────────────────

describe('P51_CyclicalEngagement', () => {
  it('not violated with fewer than 2 peaks', () => {
    const m = { ...base(), cyclicalPeaks: [100] };
    expect(P51_CyclicalEngagement.check(m, t).violated).toBe(false);
  });

  it('not violated when last peak >= 95% of previous', () => {
    const m = { ...base(), cyclicalPeaks: [100, 96] };
    expect(P51_CyclicalEngagement.check(m, t).violated).toBe(false);
  });

  it('violated when peaks decay below threshold', () => {
    const m = { ...base(), cyclicalPeaks: [100, 80] }; // 80% < 95%
    const r = P51_CyclicalEngagement.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(5);
      expect(r.suggestedAction.parameterType).toBe('reward');
      expect(r.suggestedAction.direction).toBe('increase');
      expect(r.evidence).toHaveProperty('ratio');
    }
  });

  it('violated when valleys deepen below threshold', () => {
    // Peaks healthy, but valleys declining
    const m = {
      ...base(),
      cyclicalPeaks: [100, 98],
      cyclicalValleys: [50, 40], // 80% < 90% cyclicalValleyDecay
    };
    const r = P51_CyclicalEngagement.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(4);
      expect(r.suggestedAction.parameterType).toBe('cost');
      expect(r.suggestedAction.direction).toBe('decrease');
    }
  });

  it('not violated when valleys are stable', () => {
    const m = {
      ...base(),
      cyclicalPeaks: [100, 98],
      cyclicalValleys: [50, 48], // 96% > 90%
    };
    expect(P51_CyclicalEngagement.check(m, t).violated).toBe(false);
  });

  it('prevPeak=0 does not trigger (avoids division by zero)', () => {
    const m = { ...base(), cyclicalPeaks: [0, 50] };
    expect(P51_CyclicalEngagement.check(m, t).violated).toBe(false);
  });

  it('prevValley=0 does not trigger valley check', () => {
    const m = {
      ...base(),
      cyclicalPeaks: [100, 98],
      cyclicalValleys: [0, 10],
    };
    expect(P51_CyclicalEngagement.check(m, t).violated).toBe(false);
  });
});

// ── P52: Endowment Effect ───────────────────────────────────────────────────

describe('P52_EndowmentEffect', () => {
  it('not violated when eventCompletionRate is NaN', () => {
    const m = { ...base(), eventCompletionRate: NaN };
    expect(P52_EndowmentEffect.check(m, t).violated).toBe(false);
  });

  it('not violated when completion high and satisfaction high', () => {
    const m = { ...base(), eventCompletionRate: 0.95, avgSatisfaction: 75 };
    expect(P52_EndowmentEffect.check(m, t).violated).toBe(false);
  });

  it('violated when completion >90% but satisfaction <60', () => {
    const m = { ...base(), eventCompletionRate: 0.92, avgSatisfaction: 50 };
    const r = P52_EndowmentEffect.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(4);
      expect(r.suggestedAction.parameterType).toBe('reward');
      expect(r.evidence).toHaveProperty('eventCompletionRate');
      expect(r.evidence).toHaveProperty('avgSatisfaction');
    }
  });

  it('not violated at boundary: completion exactly 0.90', () => {
    const m = { ...base(), eventCompletionRate: 0.90, avgSatisfaction: 50 };
    expect(P52_EndowmentEffect.check(m, t).violated).toBe(false);
  });

  it('not violated at boundary: satisfaction exactly 60', () => {
    const m = { ...base(), eventCompletionRate: 0.95, avgSatisfaction: 60 };
    expect(P52_EndowmentEffect.check(m, t).violated).toBe(false);
  });
});

// ── P53: Event Completion Rate Sweet Spot ───────────────────────────────────

describe('P53_EventCompletionRate', () => {
  it('not violated when eventCompletionRate is NaN', () => {
    const m = { ...base(), eventCompletionRate: NaN };
    expect(P53_EventCompletionRate.check(m, t).violated).toBe(false);
  });

  it('not violated in the sweet spot (40%–80%)', () => {
    const m = { ...base(), eventCompletionRate: 0.65 };
    expect(P53_EventCompletionRate.check(m, t).violated).toBe(false);
  });

  it('violated below min threshold (predatory territory)', () => {
    const m = { ...base(), eventCompletionRate: 0.30 };
    const r = P53_EventCompletionRate.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(6);
      expect(r.suggestedAction.parameterType).toBe('cost');
      expect(r.suggestedAction.direction).toBe('decrease');
    }
  });

  it('violated above max threshold (no monetization pressure)', () => {
    const m = { ...base(), eventCompletionRate: 0.90 };
    const r = P53_EventCompletionRate.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(3);
      expect(r.suggestedAction.parameterType).toBe('fee');
      expect(r.suggestedAction.direction).toBe('increase');
    }
  });

  it('boundary: exactly at min (0.40) is not violated', () => {
    const m = { ...base(), eventCompletionRate: 0.40 };
    expect(P53_EventCompletionRate.check(m, t).violated).toBe(false);
  });

  it('boundary: exactly at max (0.80) is not violated', () => {
    const m = { ...base(), eventCompletionRate: 0.80 };
    expect(P53_EventCompletionRate.check(m, t).violated).toBe(false);
  });
});

// ── P54: Operational Cadence ────────────────────────────────────────────────

describe('P54_OperationalCadence', () => {
  it('not violated when velocity >= 2', () => {
    const m = { ...base(), velocity: 5, avgSatisfaction: 40 };
    m.tick = 200;
    expect(P54_OperationalCadence.check(m, t).violated).toBe(false);
  });

  it('not violated when satisfaction >= 55', () => {
    const m = { ...base(), velocity: 1, avgSatisfaction: 60 };
    m.tick = 200;
    expect(P54_OperationalCadence.check(m, t).violated).toBe(false);
  });

  it('not violated before tick 100', () => {
    const m = { ...base(), velocity: 1, avgSatisfaction: 40 };
    m.tick = 50;
    expect(P54_OperationalCadence.check(m, t).violated).toBe(false);
  });

  it('violated when velocity <2, satisfaction <55, tick >100', () => {
    const m = { ...base(), velocity: 1, avgSatisfaction: 40 };
    m.tick = 150;
    const r = P54_OperationalCadence.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(3);
      expect(r.suggestedAction.parameterType).toBe('reward');
      expect(r.evidence).toHaveProperty('velocity');
      expect(r.evidence).toHaveProperty('avgSatisfaction');
    }
  });
});

// ── P56: Supply Shock Absorption ────────────────────────────────────────────

describe('P56_SupplyShockAbsorption', () => {
  it('not violated when contentDropAge is 0 (no recent drop)', () => {
    const m = { ...base(), contentDropAge: 0, arbitrageIndex: 0.8 };
    expect(P56_SupplyShockAbsorption.check(m, t).violated).toBe(false);
  });

  it('not violated when contentDropAge exceeds cooldown window', () => {
    const m = { ...base(), contentDropAge: 50, arbitrageIndex: 0.8 }; // >30 cooldown
    expect(P56_SupplyShockAbsorption.check(m, t).violated).toBe(false);
  });

  it('not violated when arbitrageIndex is within limits during cooldown', () => {
    const m = { ...base(), contentDropAge: 10, arbitrageIndex: 0.30 }; // <0.45
    expect(P56_SupplyShockAbsorption.check(m, t).violated).toBe(false);
  });

  it('violated when arbitrage spikes during cooldown window', () => {
    const m = { ...base(), contentDropAge: 10, arbitrageIndex: 0.60 }; // >0.45 postDropMax
    const r = P56_SupplyShockAbsorption.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(5);
      expect(r.suggestedAction.parameterType).toBe('fee');
      expect(r.suggestedAction.direction).toBe('decrease');
      expect(r.evidence).toHaveProperty('contentDropAge');
      expect(r.evidence).toHaveProperty('arbitrageIndex');
    }
  });

  it('boundary: contentDropAge exactly at cooldown ticks (30) is within window', () => {
    const m = { ...base(), contentDropAge: 30, arbitrageIndex: 0.60 };
    const r = P56_SupplyShockAbsorption.check(m, t);
    expect(r.violated).toBe(true);
  });

  it('boundary: contentDropAge at cooldown+1 is outside window', () => {
    const m = { ...base(), contentDropAge: 31, arbitrageIndex: 0.60 };
    expect(P56_SupplyShockAbsorption.check(m, t).violated).toBe(false);
  });
});
