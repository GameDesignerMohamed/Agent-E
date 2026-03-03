import { describe, it, expect } from 'vitest';
import { MetricStore } from '../src/MetricStore.js';
import { emptyMetrics } from '../src/types.js';

describe('MetricStore — aggregate avgRecord', () => {
  it('medium resolution averages per-currency fields correctly', () => {
    const store = new MetricStore({ mediumWindow: 2 });

    store.record({
      ...emptyMetrics(1),
      tick: 1,
      netFlowByCurrency: { gold: 10, gems: -4 },
      totalSupplyByCurrency: { gold: 100, gems: 200 },
    });
    store.record({
      ...emptyMetrics(2),
      tick: 2,
      netFlowByCurrency: { gold: 20, gems: -6 },
      totalSupplyByCurrency: { gold: 120, gems: 180 },
    });

    const result = store.latest('medium');
    expect(result.netFlowByCurrency['gold']).toBe(15);
    expect(result.netFlowByCurrency['gems']).toBe(-5);
    expect(result.totalSupplyByCurrency['gold']).toBe(110);
    expect(result.totalSupplyByCurrency['gems']).toBe(190);
  });

  it('avgRecord handles missing keys across snapshots', () => {
    const store = new MetricStore({ mediumWindow: 2 });

    store.record({
      ...emptyMetrics(1),
      tick: 1,
      giniCoefficientByCurrency: { gold: 0.4 },
    });
    store.record({
      ...emptyMetrics(2),
      tick: 2,
      giniCoefficientByCurrency: { gold: 0.6, gems: 0.3 },
    });

    const result = store.latest('medium');
    expect(result.giniCoefficientByCurrency['gold']).toBe(0.5);
    expect(result.giniCoefficientByCurrency['gems']).toBe(0.3);
  });
});

describe('MetricStore — query dotted paths', () => {
  it('query resolves dotted path for per-currency metric', () => {
    const store = new MetricStore();

    store.record({
      ...emptyMetrics(50),
      tick: 50,
      netFlowByCurrency: { gold: 42, gems: -7 },
    });

    const result = store.query({ metric: 'netFlowByCurrency.gold', resolution: 'fine' });
    expect(result.points.length).toBe(1);
    expect(result.points[0]!.value).toBe(42);
  });

  it('query returns NaN for nonexistent currency key', () => {
    const store = new MetricStore();

    store.record({
      ...emptyMetrics(50),
      tick: 50,
      netFlowByCurrency: { gold: 42 },
    });

    const result = store.query({ metric: 'netFlowByCurrency.gems', resolution: 'fine' });
    expect(result.points.length).toBe(1);
    expect(result.points[0]!.value).toBeNaN();
  });

  it('query resolves deeply nested ByCurrency fields', () => {
    const store = new MetricStore();

    store.record({
      ...emptyMetrics(50),
      tick: 50,
      giniCoefficientByCurrency: { gems: 0.55 },
    });

    const result = store.query({ metric: 'giniCoefficientByCurrency.gems', resolution: 'fine' });
    expect(result.points.length).toBe(1);
    expect(result.points[0]!.value).toBe(0.55);
  });
});

describe('MetricStore — divergenceDetected', () => {
  it('detects divergence between fine and coarse resolution', () => {
    const store = new MetricStore({ coarseWindow: 2 });

    // Record 2 ticks with high satisfaction — fills one coarse bucket at 80
    store.record({ ...emptyMetrics(1), tick: 1, avgSatisfaction: 80 });
    store.record({ ...emptyMetrics(2), tick: 2, avgSatisfaction: 80 });
    // Now coarse has one entry at avgSatisfaction = 80

    // Record 1 tick with low satisfaction — fine shows 40, coarse still 80
    store.record({ ...emptyMetrics(3), tick: 3, avgSatisfaction: 40 });

    expect(store.divergenceDetected()).toBe(true);
  });

  it('no divergence when resolutions agree', () => {
    const store = new MetricStore({ coarseWindow: 2 });

    store.record({ ...emptyMetrics(1), tick: 1, avgSatisfaction: 75 });
    store.record({ ...emptyMetrics(2), tick: 2, avgSatisfaction: 75 });
    // Coarse bucket: 75, fine latest: 75
    // Record one more that's still close
    store.record({ ...emptyMetrics(3), tick: 3, avgSatisfaction: 78 });

    expect(store.divergenceDetected()).toBe(false);
  });
});
