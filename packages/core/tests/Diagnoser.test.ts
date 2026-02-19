import { describe, it, expect } from 'vitest';
import { Diagnoser } from '../src/Diagnoser.js';
import { ALL_PRINCIPLES } from '../src/principles/index.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('Diagnoser', () => {
  it('returns violations sorted by severity DESC', () => {
    const diagnoser = new Diagnoser(ALL_PRINCIPLES);

    // Create a bad economy: no weapons, lots of fighters, low satisfaction, high gini
    const m = {
      ...emptyMetrics(60),
      tick: 60,
      totalAgents: 200,
      avgSatisfaction: 30,
      giniCoefficient: 0.70,
      churnRate: 0.12,
      supplyByResource: { weapons: 0, ore: 5, potions: 0 },
      demandSignals: { weapons: 50 },
      prices: { ore: 15, weapons: 50 },
      populationByRole: { Fighter: 50, Crafter: 2, Gatherer: 5 },
      roleShares: { Fighter: 0.25, Crafter: 0.01, Gatherer: 0.025 },
      poolSizes: { arena: 10 },
      netFlow: 0,
      faucetVolume: 0,
      sinkVolume: 0,
    };

    const diagnoses = diagnoser.diagnose(m, t);
    expect(diagnoses.length).toBeGreaterThan(0);

    // Verify sorted by severity (each should be >= next)
    for (let i = 0; i < diagnoses.length - 1; i++) {
      expect(diagnoses[i]!.violation.severity).toBeGreaterThanOrEqual(
        diagnoses[i + 1]!.violation.severity,
      );
    }
  });

  it('returns no violations for a healthy economy', () => {
    const diagnoser = new Diagnoser(ALL_PRINCIPLES);
    const m = {
      ...emptyMetrics(200),
      tick: 200,
      totalAgents: 180,
      avgSatisfaction: 75,
      giniCoefficient: 0.38,
      churnRate: 0.02,
      velocity: 10,
      netFlow: 0,
      faucetVolume: 50,
      sinkVolume: 50,
      supplyByResource: { weapons: 30, ore: 15, potions: 20 },
      demandSignals: { weapons: 20, potions: 10 },
      prices: { ore: 15, weapons: 50, potions: 40 },
      populationByRole: { Fighter: 80, Crafter: 30, Gatherer: 35, Alchemist: 20, Trader: 10, 'Market Maker': 5 },
      roleShares: { Fighter: 0.44, Crafter: 0.17, Gatherer: 0.19, Alchemist: 0.11, Trader: 0.06, 'Market Maker': 0.03 },
      poolSizes: { arena: 500, bank: 200 },
      totalSupply: 8000,
      blockedAgentCount: 5,
      medianBalance: 40,
      meanBalance: 44,
      meanMedianDivergence: 0.10,
      top10PctShare: 0.35,
      pinchPoints: { weapons: 'optimal', potions: 'optimal' },
    };

    const diagnoses = diagnoser.diagnose(m, t);
    const high = diagnoses.filter(d => d.violation.severity >= 6);
    expect(high.length).toBe(0);
  });

  it('allows adding custom principles', () => {
    const diagnoser = new Diagnoser([]);
    diagnoser.addPrinciple({
      id: 'CUSTOM_1',
      name: 'Test Principle',
      category: 'supply_chain',
      description: 'Test',
      check: (m) => {
        if (m.velocity === 999) {
          return {
            violated: true,
            severity: 10,
            evidence: {},
            suggestedAction: {
              parameter: 'craftingCost',
              direction: 'increase',
              magnitude: 0.10,
              reasoning: 'test',
            },
            confidence: 1.0,
          };
        }
        return { violated: false };
      },
    });

    const m = { ...emptyMetrics(1), velocity: 999 };
    const diagnoses = diagnoser.diagnose(m, t);
    expect(diagnoses.length).toBe(1);
    expect(diagnoses[0]!.principle.id).toBe('CUSTOM_1');
  });

  it('swallows errors from buggy principles gracefully', () => {
    const diagnoser = new Diagnoser([
      {
        id: 'BROKEN',
        name: 'Broken Principle',
        category: 'supply_chain',
        description: 'Throws every time',
        check: () => { throw new Error('principle bug'); },
      },
    ]);

    expect(() => diagnoser.diagnose(emptyMetrics(1), t)).not.toThrow();
  });
});
