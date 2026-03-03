import { describe, it, expect } from 'vitest';
import {
  OPERATIONS_PRINCIPLES,
  P51_CyclicalEngagement,
  P52_EndowmentEffect,
  P53_EventCompletionRate,
  P54_OperationalCadence,
  P56_SupplyShockAbsorption,
} from '../src/principles/operations.js';

describe('operations principles — category and exports', () => {
  it('all principles have category "operations"', () => {
    for (const p of OPERATIONS_PRINCIPLES) {
      expect(p.category).toBe('operations');
    }
  });

  it('OPERATIONS_PRINCIPLES exports all 5 operations principles', () => {
    expect(OPERATIONS_PRINCIPLES).toHaveLength(5);
    const ids = OPERATIONS_PRINCIPLES.map(p => p.id);
    expect(ids).toEqual(['P51', 'P52', 'P53', 'P54', 'P56']);
  });

  it('renamed exports are accessible by new names', () => {
    expect(P51_CyclicalEngagement.id).toBe('P51');
    expect(P51_CyclicalEngagement.name).toBe('Cyclical Engagement Pattern');

    expect(P54_OperationalCadence.id).toBe('P54');
    expect(P54_OperationalCadence.name).toBe('Operational Cadence');

    expect(P56_SupplyShockAbsorption.id).toBe('P56');
    expect(P56_SupplyShockAbsorption.name).toBe('Supply Shock Absorption');
  });

  it('P52 and P53 are still available', () => {
    expect(P52_EndowmentEffect.id).toBe('P52');
    expect(P53_EventCompletionRate.id).toBe('P53');
  });

  it('P56 description mentions stabilization windows, not cooldown windows', () => {
    expect(P56_SupplyShockAbsorption.description).toContain('stabilization windows');
    expect(P56_SupplyShockAbsorption.description).not.toContain('cooldown windows');
  });

  it('P54 description uses "supply" and "stagnation", not "content" and "staleness"', () => {
    expect(P54_OperationalCadence.description).toContain('supply');
    expect(P54_OperationalCadence.description).toContain('stagnation');
    expect(P54_OperationalCadence.description).not.toContain('staleness');
  });
});
