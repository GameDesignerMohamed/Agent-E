import { describe, it, expect } from 'vitest';
import {
  P17_GracePeriodBeforeIntervention,
  P18_FirstProducerNeedsStartingInventory,
  P19_StartingSupplyExceedsDemand,
} from '../../src/principles/bootstrap.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

// ── P17: Grace Period Before Intervention ──────────────────────────────────

describe('P17 — Grace Period Before Intervention', () => {
  it('fires when satisfaction is low at early tick', () => {
    const m = { ...emptyMetrics(10), tick: 10, avgSatisfaction: 30 };
    const result = P17_GracePeriodBeforeIntervention.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(7);
      expect(result.evidence['tick']).toBe(10);
    }
  });

  it('does not fire at early tick with good satisfaction', () => {
    const m = { ...emptyMetrics(10), tick: 10, avgSatisfaction: 70 };
    const result = P17_GracePeriodBeforeIntervention.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire after tick 30 even with low satisfaction', () => {
    const m = { ...emptyMetrics(50), tick: 50, avgSatisfaction: 30 };
    const result = P17_GracePeriodBeforeIntervention.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('boundary: tick 29 with satisfaction 39 fires', () => {
    const m = { ...emptyMetrics(29), tick: 29, avgSatisfaction: 39 };
    const result = P17_GracePeriodBeforeIntervention.check(m, t);
    expect(result.violated).toBe(true);
  });

  it('boundary: tick 30 does not fire', () => {
    const m = { ...emptyMetrics(30), tick: 30, avgSatisfaction: 10 };
    const result = P17_GracePeriodBeforeIntervention.check(m, t);
    expect(result.violated).toBe(false);
  });
});

// ── P18: First Producer Needs Starting Inventory ───────────────────────────

describe('P18 — First Producer Needs Starting Inventory', () => {
  it('fires when a resource has zero supply at early tick', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      totalAgents: 10,
      supplyByResource: { ore: 0, wood: 5 },
    };
    const result = P18_FirstProducerNeedsStartingInventory.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(8);
      expect(result.evidence['resource']).toBe('ore');
    }
  });

  it('does not fire when all resources have supply', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      totalAgents: 10,
      supplyByResource: { ore: 3, wood: 5 },
    };
    const result = P18_FirstProducerNeedsStartingInventory.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire after tick 20', () => {
    const m = {
      ...emptyMetrics(25),
      tick: 25,
      totalAgents: 10,
      supplyByResource: { ore: 0 },
    };
    const result = P18_FirstProducerNeedsStartingInventory.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire when no agents exist', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      totalAgents: 0,
      supplyByResource: { ore: 0 },
    };
    const result = P18_FirstProducerNeedsStartingInventory.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('boundary: tick 20 with zero supply fires', () => {
    const m = {
      ...emptyMetrics(20),
      tick: 20,
      totalAgents: 5,
      supplyByResource: { ore: 0 },
    };
    const result = P18_FirstProducerNeedsStartingInventory.check(m, t);
    expect(result.violated).toBe(true);
  });
});

// ── P19: Starting Supply Exceeds Initial Demand ────────────────────────────

describe('P19 — Starting Supply Exceeds Initial Demand', () => {
  it('fires when resources per agent is below 0.5 at early tick', () => {
    const m = {
      ...emptyMetrics(10),
      tick: 10,
      totalAgents: 20,
      populationByRole: { consumer: 20 },
      supplyByResource: { itemA: 3, itemB: 2 }, // 5 total, 0.25 per agent
    };
    const result = P19_StartingSupplyExceedsDemand.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBe(6);
      expect(result.evidence['mostPopulatedRole']).toBe('consumer');
      expect(result.evidence['resourcesPerAgent']).toBeLessThan(0.5);
    }
  });

  it('does not fire when resources are sufficient', () => {
    const m = {
      ...emptyMetrics(10),
      tick: 10,
      totalAgents: 10,
      populationByRole: { consumer: 10 },
      supplyByResource: { itemA: 30, itemB: 20 }, // 50 total, 5 per agent
    };
    const result = P19_StartingSupplyExceedsDemand.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire after tick 30', () => {
    const m = {
      ...emptyMetrics(50),
      tick: 50,
      totalAgents: 20,
      populationByRole: { consumer: 20 },
      supplyByResource: { itemA: 1 },
    };
    const result = P19_StartingSupplyExceedsDemand.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire with too few agents (<5)', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      totalAgents: 3,
      populationByRole: { consumer: 3 },
      supplyByResource: { itemA: 0 },
    };
    const result = P19_StartingSupplyExceedsDemand.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('does not fire with no roles', () => {
    const m = {
      ...emptyMetrics(5),
      tick: 5,
      totalAgents: 0,
      populationByRole: {},
      supplyByResource: {},
    };
    const result = P19_StartingSupplyExceedsDemand.check(m, t);
    expect(result.violated).toBe(false);
  });

  it('picks the most populated role for evidence', () => {
    const m = {
      ...emptyMetrics(10),
      tick: 10,
      totalAgents: 30,
      populationByRole: { producer: 5, consumer: 25 },
      supplyByResource: { itemA: 2 }, // 0.08 per agent
    };
    const result = P19_StartingSupplyExceedsDemand.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.evidence['mostPopulatedRole']).toBe('consumer');
    }
  });
});
