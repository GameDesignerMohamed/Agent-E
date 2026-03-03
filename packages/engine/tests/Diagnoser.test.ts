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
      currencies: ['credits'],
      totalAgents: 200,
      avgSatisfaction: 30,
      giniCoefficient: 0.70,
      giniCoefficientByCurrency: { credits: 0.70 },
      churnRate: 0.12,
      supplyByResource: { goodA: 0, materialA: 5, goodB: 0 },
      demandSignals: { goodA: 50 },
      prices: { materialA: 15, goodA: 50 },
      pricesByCurrency: { credits: { materialA: 15, goodA: 50 } },
      populationByRole: { consumer: 50, producer: 2, extractor: 5 },
      roleShares: { consumer: 0.25, producer: 0.01, extractor: 0.025 },
      poolSizes: { poolA: 10 },
      poolSizesByCurrency: { poolA: { credits: 10 } },
      netFlow: 0,
      netFlowByCurrency: { credits: 0 },
      faucetVolume: 0,
      faucetVolumeByCurrency: { credits: 0 },
      sinkVolume: 0,
      sinkVolumeByCurrency: { credits: 0 },
      totalSupplyByCurrency: { credits: 0 },
      velocityByCurrency: { credits: 0 },
      meanMedianDivergenceByCurrency: { credits: 0 },
      medianBalanceByCurrency: { credits: 0 },
      meanBalanceByCurrency: { credits: 0 },
      top10PctShareByCurrency: { credits: 0 },
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
    const healthyThresholds = { ...t, dominantRoles: ['consumer'] };
    const m = {
      ...emptyMetrics(200),
      tick: 200,
      currencies: ['credits'],
      totalAgents: 180,
      avgSatisfaction: 75,
      giniCoefficient: 0.38,
      giniCoefficientByCurrency: { credits: 0.38 },
      churnRate: 0.02,
      velocity: 10,
      velocityByCurrency: { credits: 10 },
      netFlow: 0,
      netFlowByCurrency: { credits: 0 },
      faucetVolume: 50,
      faucetVolumeByCurrency: { credits: 50 },
      sinkVolume: 50,
      sinkVolumeByCurrency: { credits: 50 },
      supplyByResource: { goodA: 30, materialA: 15, goodB: 20 },
      demandSignals: { goodA: 20, goodB: 10 },
      prices: { materialA: 15, goodA: 50, goodB: 40 },
      pricesByCurrency: { credits: { materialA: 15, goodA: 50, goodB: 40 } },
      populationByRole: { consumer: 80, producer: 30, extractor: 35, refiner: 20, Trader: 10, 'Market Maker': 5 },
      roleShares: { consumer: 0.44, producer: 0.17, extractor: 0.19, refiner: 0.11, Trader: 0.06, 'Market Maker': 0.03 },
      poolSizes: { poolA: 500, poolB: 200 },
      poolSizesByCurrency: { poolA: { credits: 500 }, poolB: { credits: 200 } },
      totalSupply: 8000,
      totalSupplyByCurrency: { credits: 8000 },
      blockedAgentCount: 5,
      medianBalance: 40,
      medianBalanceByCurrency: { credits: 40 },
      meanBalance: 44,
      meanBalanceByCurrency: { credits: 44 },
      meanMedianDivergence: 0.10,
      meanMedianDivergenceByCurrency: { credits: 0.10 },
      top10PctShare: 0.35,
      top10PctShareByCurrency: { credits: 0.35 },
      pinchPoints: { goodA: 'optimal' as const, goodB: 'optimal' as const },
      // V1.5.2: these were NaN (skipped by principles), now 0 → set healthy values
      extractionRatio: 0.30,
      smokeTestRatio: 0.50,
      currencyInsulation: 0.30,
      newUserDependency: 0.20,
      eventCompletionRate: 0.60,
    };

    const diagnoses = diagnoser.diagnose(m, healthyThresholds);
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
              parameterType: 'cost',
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

  it('detects multi-currency violations on the unhealthy currency', () => {
    const diagnoser = new Diagnoser(ALL_PRINCIPLES);
    const m = {
      ...emptyMetrics(60),
      tick: 60,
      currencies: ['gold', 'gems'],
      totalAgents: 100,
      avgSatisfaction: 75,
      // Gold is healthy
      giniCoefficient: 0.55,
      giniCoefficientByCurrency: { gold: 0.38, gems: 0.72 },
      // Gems has high gini → should trigger P33
      totalSupply: 1000,
      totalSupplyByCurrency: { gold: 800, gems: 200 },
      netFlowByCurrency: { gold: 0, gems: 0 },
      faucetVolumeByCurrency: { gold: 0, gems: 0 },
      sinkVolumeByCurrency: { gold: 0, gems: 0 },
      velocityByCurrency: { gold: 5, gems: 5 },
      meanMedianDivergenceByCurrency: { gold: 0.10, gems: 0.10 },
      medianBalanceByCurrency: { gold: 7, gems: 1.5 },
      meanBalanceByCurrency: { gold: 8, gems: 2 },
      top10PctShareByCurrency: { gold: 0.30, gems: 0.30 },
      populationByRole: { consumer: 60, producer: 40 },
      roleShares: { consumer: 0.6, producer: 0.4 },
      supplyByResource: { goodA: 20 },
      prices: { goodA: 50 },
      pricesByCurrency: { gold: { goodA: 50 }, gems: { goodA: 10 } },
      poolSizes: {},
      poolSizesByCurrency: {},
    };

    const diagnoses = diagnoser.diagnose(m, t);
    // P33 should fire for gems (gini 0.72 > giniRedThreshold)
    const p33 = diagnoses.find(d => d.principle.id === 'P33');
    expect(p33).toBeDefined();
    if (p33) {
      expect(p33.violation.evidence['currency']).toBe('gems');
      expect(p33.violation.suggestedAction.scope?.currency).toBe('gems');
    }
  });
});
