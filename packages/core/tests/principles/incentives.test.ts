import { describe, it, expect } from 'vitest';
import { P5_ProfitabilityIsCompetitive } from '../../src/principles/incentives.js';
import { DEFAULT_THRESHOLDS } from '../../src/defaults.js';
import { emptyMetrics } from '../../src/types.js';

const t = DEFAULT_THRESHOLDS;

describe('P5 — Profitability Is Competitive', () => {
  it('fires when 97 Traders dominate (the V0.4.6 scenario)', () => {
    // Real V0.4.6 screenshot: 97+50+23+18+9+11 = 208 total agents
    const total = 208;
    const m = {
      ...emptyMetrics(184),
      tick: 184,
      totalAgents: total,
      populationByRole: { Trader: 97, consumer: 50, producer: 23, extractor: 18, refiner: 9, 'Market Maker': 11 },
      // Trader share = 97/208 = 0.466 > 0.45 threshold → should fire
      roleShares: { Trader: 97 / total, consumer: 50 / total, producer: 23 / total, extractor: 18 / total, refiner: 9 / total, 'Market Maker': 11 / total },
    };
    const result = P5_ProfitabilityIsCompetitive.check(m, t);
    expect(result.violated).toBe(true);
    if (result.violated) {
      expect(result.severity).toBeGreaterThanOrEqual(5);
      expect(result.evidence['dominantRole']).toBe('Trader');
    }
  });

  it('does not fire with balanced economy', () => {
    const total = 180;
    const m = {
      ...emptyMetrics(200),
      totalAgents: total,
      roleShares: { consumer: 0.4, extractor: 0.2, producer: 0.15, refiner: 0.1, Trader: 0.1, 'Market Maker': 0.05 },
      populationByRole: { consumer: 72, extractor: 36, producer: 27, refiner: 18, Trader: 18, 'Market Maker': 9 },
    };
    const result = P5_ProfitabilityIsCompetitive.check(m, t);
    expect(result.violated).toBe(false);
  });
});
