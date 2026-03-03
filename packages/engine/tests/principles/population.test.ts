import { describe, it, expect } from 'vitest';
import {
  P9_RoleSwitchingNeedsFriction,
  P10_EntryWeightingUsesInversePopulation,
  P11_TwoTierPressure,
  P46_PersonaDiversity,
} from '../../src/principles/population.js';
import { emptyMetrics } from '../../src/types.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';

const t = DEFAULT_THRESHOLDS;
const base = () => emptyMetrics(200);

// ── P9: Role Switching Needs Friction ───────────────────────────────────────

describe('P9_RoleSwitchingNeedsFriction', () => {
  it('not violated when churn is below threshold', () => {
    const m = { ...base(), churnByRole: { Fighter: 0.02, Crafter: 0.01 } };
    expect(P9_RoleSwitchingNeedsFriction.check(m, t).violated).toBe(false);
  });

  it('violated when total churn exceeds roleSwitchFrictionMax (0.05)', () => {
    const m = { ...base(), churnByRole: { Fighter: 0.04, Crafter: 0.03 } }; // 0.07 total
    const r = P9_RoleSwitchingNeedsFriction.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(5);
      expect(r.suggestedAction.parameterType).toBe('cost');
      expect(r.suggestedAction.direction).toBe('increase');
      expect(r.evidence).toHaveProperty('totalChurnRate');
    }
  });

  it('boundary: total churn exactly at threshold is not violated', () => {
    const m = { ...base(), churnByRole: { Fighter: 0.03, Crafter: 0.02 } }; // 0.05 = threshold
    expect(P9_RoleSwitchingNeedsFriction.check(m, t).violated).toBe(false);
  });

  it('not violated when churnByRole is empty', () => {
    const m = { ...base(), churnByRole: {} };
    expect(P9_RoleSwitchingNeedsFriction.check(m, t).violated).toBe(false);
  });
});

// ── P10: Entry Weighting Uses Inverse Population ────────────────────────────

describe('P10_EntryWeightingUsesInversePopulation', () => {
  it('not violated when roleShares is empty', () => {
    const m = base();
    expect(P10_EntryWeightingUsesInversePopulation.check(m, t).violated).toBe(false);
  });

  it('not violated when role distribution is balanced (low stdDev)', () => {
    const m = { ...base(), roleShares: { Fighter: 0.35, Crafter: 0.35, Mage: 0.30 } };
    expect(P10_EntryWeightingUsesInversePopulation.check(m, t).violated).toBe(false);
  });

  it('violated when role distribution is highly imbalanced (stdDev >0.20)', () => {
    // Fighter: 0.70, Crafter: 0.20, Mage: 0.10 → mean=0.333, stdDev ≈ 0.25
    const m = { ...base(), roleShares: { Fighter: 0.70, Crafter: 0.20, Mage: 0.10 } };
    const r = P10_EntryWeightingUsesInversePopulation.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(4);
      expect(r.suggestedAction.parameterType).toBe('yield');
      expect(r.suggestedAction.direction).toBe('increase');
      expect(r.evidence).toHaveProperty('stdDev');
      expect(r.evidence).toHaveProperty('leastPopulatedRole');
    }
  });

  it('identifies the least populated role in evidence', () => {
    const m = { ...base(), roleShares: { Fighter: 0.80, Healer: 0.05, Crafter: 0.15 } };
    const r = P10_EntryWeightingUsesInversePopulation.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.evidence['leastPopulatedRole']).toBe('Healer');
    }
  });
});

// ── P11: Two-Tier Pressure ──────────────────────────────────────────────────

describe('P11_TwoTierPressure', () => {
  it('not violated when no role exceeds 45%', () => {
    const m = { ...base(), roleShares: { Fighter: 0.40, Crafter: 0.35, Mage: 0.25 } };
    expect(P11_TwoTierPressure.check(m, t).violated).toBe(false);
  });

  it('violated when a role exceeds 45%', () => {
    const m = { ...base(), roleShares: { Fighter: 0.50, Crafter: 0.30, Mage: 0.20 } };
    const r = P11_TwoTierPressure.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(6);
      expect(r.suggestedAction.parameterType).toBe('fee');
      expect(r.suggestedAction.direction).toBe('increase');
      expect(r.evidence).toHaveProperty('role', 'Fighter');
      expect(r.evidence).toHaveProperty('share', 0.50);
    }
  });

  it('boundary: role at exactly 0.45 is not violated (but other role may be)', () => {
    // Fighter=0.45 is not >0.45, but Crafter=0.55 IS >0.45
    const m1 = { ...base(), roleShares: { Fighter: 0.45, Crafter: 0.55 } };
    const r1 = P11_TwoTierPressure.check(m1, t);
    expect(r1.violated).toBe(true); // fires on Crafter, not Fighter

    // Both at 0.45 — neither exceeds
    const m2 = { ...base(), roleShares: { Fighter: 0.45, Crafter: 0.45 } };
    expect(P11_TwoTierPressure.check(m2, t).violated).toBe(false);
  });

  it('not violated with empty roleShares', () => {
    const m = base();
    expect(P11_TwoTierPressure.check(m, t).violated).toBe(false);
  });
});

// ── P46: Persona Diversity ──────────────────────────────────────────────────

describe('P46_PersonaDiversity', () => {
  it('not violated with empty personaDistribution', () => {
    const m = base();
    expect(P46_PersonaDiversity.check(m, t).violated).toBe(false);
  });

  it('not violated with diverse persona clusters', () => {
    const m = {
      ...base(),
      personaDistribution: { Whale: 0.15, ActiveTrader: 0.30, Accumulator: 0.25, Spender: 0.20, Passive: 0.10 },
    };
    expect(P46_PersonaDiversity.check(m, t).violated).toBe(false);
  });

  it('violated when a single persona exceeds monoculture max (0.40)', () => {
    const m = {
      ...base(),
      personaDistribution: { Whale: 0.50, ActiveTrader: 0.20, Passive: 0.30 },
    };
    const r = P46_PersonaDiversity.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(5);
      expect(r.suggestedAction.parameterType).toBe('reward');
      expect(r.evidence).toHaveProperty('dominantPersona', 'Whale');
      expect(r.evidence).toHaveProperty('share', 0.50);
    }
  });

  it('boundary: persona at exactly 0.40 is not violated', () => {
    const m = {
      ...base(),
      personaDistribution: { Whale: 0.40, ActiveTrader: 0.30, Passive: 0.30 },
    };
    expect(P46_PersonaDiversity.check(m, t).violated).toBe(false);
  });

  it('violated when fewer than 3 significant clusters (>=15% each)', () => {
    const m = {
      ...base(),
      personaDistribution: { Whale: 0.35, ActiveTrader: 0.35, Passive: 0.10, Spender: 0.10, Dormant: 0.10 },
    };
    const r = P46_PersonaDiversity.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      expect(r.severity).toBe(3);
      expect(r.suggestedAction.parameterType).toBe('fee');
      expect(r.suggestedAction.direction).toBe('decrease');
      expect(r.evidence).toHaveProperty('significantClusters', 2);
    }
  });

  it('monoculture check fires before cluster count check', () => {
    // One persona at 50% + only 1 significant cluster
    const m = {
      ...base(),
      personaDistribution: { Whale: 0.50, Passive: 0.10, Dormant: 0.10, Spender: 0.10, AtRisk: 0.20 },
    };
    const r = P46_PersonaDiversity.check(m, t);
    expect(r.violated).toBe(true);
    if (r.violated) {
      // Should fire as monoculture (severity 5) not cluster count (severity 3)
      expect(r.severity).toBe(5);
      expect(r.evidence).toHaveProperty('dominantPersona', 'Whale');
    }
  });
});
