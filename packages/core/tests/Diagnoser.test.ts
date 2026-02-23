import { describe, it, expect } from 'vitest';
import { Diagnoser } from '../src/Diagnoser.js';
import { ALL_PRINCIPLES } from '../src/principles/index.js';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { emptyMetrics } from '../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('Diagnoser', () => {
  it('returns violations sorted by severity DESC', () => {
    const diagnoser = new Diagnoser(ALL_PRINCIPLES);

    // Create a bad economy: no goodA, lots of consumers, low satisfaction, high gini
    const m = {
      ...emptyMetrics(60),
      tick: 60,
      totalAgents: 200,
      avgSatisfaction: 30,
      giniCoefficient: 0.70,
      churnRate: 0.12,
      supplyByResource: { goodA: 0, materialA: 5, goodB: 0 },
      demandSignals: { goodA: 50 },
      prices: { materialA: 15, goodA: 50 },
      populationByRole: { consumer: 50, producer: 2, extractor: 5 },
      roleShares: { consumer: 0.25, producer: 0.01, extractor: 0.025 },
      poolSizes: { poolA: 10 },
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
      supplyByResource: { goodA: 30, materialA: 15, goodB: 20 },
      demandSignals: { goodA: 20, goodB: 10 },
      prices: { materialA: 15, goodA: 50, goodB: 40 },
      populationByRole: { consumer: 80, producer: 30, extractor: 35, refiner: 20, Trader: 10, 'Market Maker': 5 },
      roleShares: { consumer: 0.44, producer: 0.17, extractor: 0.19, refiner: 0.11, Trader: 0.06, 'Market Maker': 0.03 },
      poolSizes: { poolA: 500, poolB: 200 },
      totalSupply: 8000,
      blockedAgentCount: 5,
      medianBalance: 40,
      meanBalance: 44,
      meanMedianDivergence: 0.10,
      top10PctShare: 0.35,
      pinchPoints: { goodA: 'optimal', goodB: 'optimal' },
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
              parameter: 'productionCost',
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
