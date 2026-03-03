import { describe, it, expect } from 'vitest';
import {
  P35_DestructionCreatesValue,
  P40_ReplacementRate,
  P49_IdleAssetTax,
} from '../../src/principles/resource-mgmt.js';
import { emptyMetrics } from '../../src/types.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';

const t = DEFAULT_THRESHOLDS;
const base = () => emptyMetrics(200);

// ── P35: Destruction Creates Value ──────────────────────────────────────────

describe('P35_DestructionCreatesValue', () => {
  it('not violated when supplyByResource is empty', () => {
    const m = base();
    expect(P35_DestructionCreatesValue.check(m, t).violated).toBe(false);
  });

  it('not violated when supply is low (<=200)', () => {
    const m = { ...base(), supplyByResource: { ore: 150 }, sinkVolume: 2, netFlow: 5 };
    expect(P35_DestructionCreatesValue.check(m, t).violated).toBe(false);
  });

  it('not violated when sinkVolume is adequate (>=5)', () => {
    const m = { ...base(), supplyByResource: { ore: 500 }, sinkVolume: 10, netFlow: 5 };
    expect(P35_DestructionCreatesValue.check(m, t).violated).toBe(false);
  });

  it('not violated when netFlow <= 0 (economy is draining)', () => {
    const m = { ...base(), supplyByResource: { ore: 500 }, sinkVolume: 2, netFlow: -5 };
    expect(P35_DestructionCreatesValue.check(m, t).violated).toBe(false);
  });

  it('violated when high supply + low destruction + positive netFlow', () => {
    const m = { ...base(), supplyByResource: { ore: 500 }, sinkVolume: 2, netFlow: 10 };
    const r = P35_DestructionCreatesValue.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(6);
      expect(r.suggestedAction.parameterType).toBe('fee');
      expect(r.evidence).toHaveProperty('resource', 'ore');
    }
  });

  it('fires on first resource that matches criteria', () => {
    const m = {
      ...base(),
      supplyByResource: { ore: 100, wood: 300 },
      sinkVolume: 3,
      netFlow: 5,
    };
    const r = P35_DestructionCreatesValue.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.evidence).toHaveProperty('resource', 'wood');
    }
  });

  it('boundary: supply exactly 200 does not trigger', () => {
    const m = { ...base(), supplyByResource: { ore: 200 }, sinkVolume: 2, netFlow: 5 };
    expect(P35_DestructionCreatesValue.check(m, t).violated).toBe(false);
  });
});

// ── P40: Replacement Rate ───────────────────────────────────────────────────

describe('P40_ReplacementRate', () => {
  it('not violated when sinkVolume is 0 (no consumption tracked)', () => {
    const m = { ...base(), productionIndex: 10, sinkVolume: 0 };
    expect(P40_ReplacementRate.check(m, t).violated).toBe(false);
  });

  it('not violated when productionIndex is 0 (no production tracked)', () => {
    const m = { ...base(), productionIndex: 0, sinkVolume: 5 };
    expect(P40_ReplacementRate.check(m, t).violated).toBe(false);
  });

  it('not violated when replacement ratio is in healthy range (1.0–6.0)', () => {
    const m = { ...base(), productionIndex: 8, sinkVolume: 4 }; // ratio = 2.0
    expect(P40_ReplacementRate.check(m, t).violated).toBe(false);
  });

  it('violated when replacement ratio < 1.0 (depletion)', () => {
    const m = { ...base(), productionIndex: 3, sinkVolume: 5 }; // ratio = 0.6
    const r = P40_ReplacementRate.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(6);
      expect(r.suggestedAction.parameterType).toBe('yield');
      expect(r.suggestedAction.direction).toBe('increase');
      expect(r.evidence).toHaveProperty('replacementRatio');
    }
  });

  it('violated when replacement ratio > 3× multiplier (overproduction)', () => {
    // replacementRateMultiplier = 2.0, so 3× = 6.0
    const m = { ...base(), productionIndex: 50, sinkVolume: 5 }; // ratio = 10.0
    const r = P40_ReplacementRate.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(3);
      expect(r.suggestedAction.parameterType).toBe('yield');
      expect(r.suggestedAction.direction).toBe('decrease');
    }
  });

  it('boundary: ratio exactly 1.0 is not violated (depletion check is <1.0)', () => {
    const m = { ...base(), productionIndex: 5, sinkVolume: 5 }; // ratio = 1.0
    expect(P40_ReplacementRate.check(m, t).violated).toBe(false);
  });

  it('boundary: ratio exactly 6.0 is not violated (overproduction is >6.0)', () => {
    const m = { ...base(), productionIndex: 30, sinkVolume: 5 }; // ratio = 6.0
    expect(P40_ReplacementRate.check(m, t).violated).toBe(false);
  });
});

// ── P49: Idle Asset Tax ─────────────────────────────────────────────────────

describe('P49_IdleAssetTax', () => {
  it('not violated when gini is healthy', () => {
    const m = { ...base(), giniCoefficient: 0.30, top10PctShare: 0.70, velocity: 3 };
    expect(P49_IdleAssetTax.check(m, t).violated).toBe(false);
  });

  it('not violated when top10PctShare is low', () => {
    const m = { ...base(), giniCoefficient: 0.60, top10PctShare: 0.50, velocity: 3 };
    expect(P49_IdleAssetTax.check(m, t).violated).toBe(false);
  });

  it('not violated when velocity is high (assets circulating)', () => {
    const m = { ...base(), giniCoefficient: 0.60, top10PctShare: 0.70, velocity: 10 };
    expect(P49_IdleAssetTax.check(m, t).violated).toBe(false);
  });

  it('violated when gini >0.55, top10% >60%, velocity <5', () => {
    const m = { ...base(), giniCoefficient: 0.65, top10PctShare: 0.75, velocity: 2 };
    const r = P49_IdleAssetTax.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(5);
      expect(r.suggestedAction.parameterType).toBe('fee');
      expect(r.suggestedAction.direction).toBe('increase');
      expect(r.evidence).toHaveProperty('giniCoefficient');
      expect(r.evidence).toHaveProperty('top10PctShare');
      expect(r.evidence).toHaveProperty('velocity');
    }
  });

  it('boundary: gini exactly 0.55 does not trigger', () => {
    const m = { ...base(), giniCoefficient: 0.55, top10PctShare: 0.70, velocity: 3 };
    expect(P49_IdleAssetTax.check(m, t).violated).toBe(false);
  });

  it('boundary: velocity exactly 5 does not trigger', () => {
    const m = { ...base(), giniCoefficient: 0.60, top10PctShare: 0.70, velocity: 5 };
    expect(P49_IdleAssetTax.check(m, t).violated).toBe(false);
  });
});
