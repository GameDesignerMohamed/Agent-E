import { describe, it, expect } from 'vitest';
import { Observer } from '../src/Observer.js';
import type { EconomyState, EconomicEvent } from '../src/types.js';

function makeState(overrides: Partial<EconomyState> = {}): EconomyState {
  return {
    tick: 10,
    roles: ['consumer', 'producer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 }, a2: { gold: 50 } },
    agentRoles: { a1: 'consumer', a2: 'producer' },
    agentInventories: { a1: { itemA: 1 }, a2: { itemA: 2 } },
    agentSatisfaction: { a1: 80, a2: 70 },
    marketPrices: { gold: { itemA: 10 } },
    recentTransactions: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Observer — per-system and per-source/sink tracking', () => {
  // ── 1. 'enter' event adds to faucet volume ───────────────────────────────
  describe('enter event type', () => {
    it('adds to faucetVolumeByCurrency like mint', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'enter', timestamp: 10, actor: 'a1', amount: 25 },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.faucetVolumeByCurrency['gold']).toBe(25);
      expect(metrics.faucetVolume).toBe(25);
    });

    it('combines enter and mint into total faucet volume', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'enter', timestamp: 10, actor: 'a1', amount: 25 },
        { type: 'mint', timestamp: 10, actor: 'a2', amount: 15 },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.faucetVolumeByCurrency['gold']).toBe(40);
      expect(metrics.faucetVolume).toBe(40);
    });

    it('uses the specified currency for enter events', () => {
      const observer = new Observer();
      const state = makeState({ currencies: ['gold', 'gems'] });
      const events: EconomicEvent[] = [
        { type: 'enter', timestamp: 10, actor: 'a1', amount: 50, currency: 'gems' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.faucetVolumeByCurrency['gems']).toBe(50);
      expect(metrics.faucetVolumeByCurrency['gold']).toBeUndefined();
    });
  });

  // ── 2. Per-system flow tracking ──────────────────────────────────────────
  describe('flowBySystem', () => {
    it('tracks positive flow for mint events in a system', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 30, system: 'marketplace' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySystem['marketplace']).toBe(30);
    });

    it('does NOT track enter events in per-system flow (enter is global-only faucet)', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'enter', timestamp: 10, actor: 'a1', amount: 20, system: 'onboarding' },
      ];

      const metrics = observer.compute(state, events);

      // 'enter' no longer counts as a faucet in per-system flow tracking
      expect(metrics.flowBySystem['onboarding']).toBeUndefined();
      // But still counted in activity
      expect(metrics.activityBySystem['onboarding']).toBe(1);
    });

    it('tracks negative flow for burn events in a system', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 15, system: 'marketplace' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySystem['marketplace']).toBe(-15);
    });

    it('tracks negative flow for consume events in a system', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'consume', timestamp: 10, actor: 'a1', amount: 8, system: 'crafting' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySystem['crafting']).toBe(-8);
    });

    it('computes net flow across mixed events in the same system', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 100, system: 'marketplace' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 40, system: 'marketplace' },
        { type: 'enter', timestamp: 10, actor: 'a1', amount: 10, system: 'marketplace' },
      ];

      const metrics = observer.compute(state, events);

      // net = +100 - 40 = 60 (enter is no longer counted in per-system flow)
      expect(metrics.flowBySystem['marketplace']).toBe(60);
    });

    it('tracks multiple systems independently', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 50, system: 'marketplace' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 20, system: 'crafting' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySystem['marketplace']).toBe(50);
      expect(metrics.flowBySystem['crafting']).toBe(-20);
    });
  });

  // ── 3. Per-system activity counting ──────────────────────────────────────
  describe('activityBySystem', () => {
    it('counts all events from the same system', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 10, system: 'marketplace' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 5, system: 'marketplace' },
        { type: 'trade', timestamp: 10, actor: 'a1', amount: 1, system: 'marketplace' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.activityBySystem['marketplace']).toBe(3);
    });

    it('counts across multiple systems independently', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 10, system: 'marketplace' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 5, system: 'crafting' },
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 3, system: 'crafting' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.activityBySystem['marketplace']).toBe(1);
      expect(metrics.activityBySystem['crafting']).toBe(2);
    });
  });

  // ── 4. Per-system participant counting (unique actors) ───────────────────
  describe('participantsBySystem', () => {
    it('counts unique actors per system', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 10, system: 'marketplace' },
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 5, system: 'marketplace' },
        { type: 'trade', timestamp: 10, actor: 'a2', amount: 1, system: 'marketplace' },
      ];

      const metrics = observer.compute(state, events);

      // a1 appears twice but should only be counted once
      expect(metrics.participantsBySystem['marketplace']).toBe(2);
    });

    it('counts participants in different systems independently', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 10, system: 'marketplace' },
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 5, system: 'crafting' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 3, system: 'crafting' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.participantsBySystem['marketplace']).toBe(1);
      expect(metrics.participantsBySystem['crafting']).toBe(2);
    });

    it('same actor in multiple systems counted in each', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 10, system: 'marketplace' },
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 5, system: 'crafting' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.participantsBySystem['marketplace']).toBe(1);
      expect(metrics.participantsBySystem['crafting']).toBe(1);
    });
  });

  // ── 5. Source/sink tracking ──────────────────────────────────────────────
  describe('flowBySource and flowBySink', () => {
    it('routes mint events to flowBySource by sourceOrSink name', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 100, sourceOrSink: 'daily_reward' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySource['daily_reward']).toBe(100);
      expect(metrics.flowBySink['daily_reward']).toBeUndefined();
    });

    it('does NOT route enter events to flowBySource (enter is global-only faucet)', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'enter', timestamp: 10, actor: 'a1', amount: 50, sourceOrSink: 'signup_bonus' },
      ];

      const metrics = observer.compute(state, events);

      // 'enter' no longer counts as a source in per-source tracking
      expect(metrics.flowBySource['signup_bonus']).toBeUndefined();
    });

    it('routes burn events to flowBySink by sourceOrSink name', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 30, sourceOrSink: 'upgrade_cost' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySink['upgrade_cost']).toBe(30);
      expect(metrics.flowBySource['upgrade_cost']).toBeUndefined();
    });

    it('routes consume events to flowBySink by sourceOrSink name', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'consume', timestamp: 10, actor: 'a2', amount: 12, sourceOrSink: 'crafting_fee' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySink['crafting_fee']).toBe(12);
    });

    it('aggregates multiple events for the same source', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 40, sourceOrSink: 'daily_reward' },
        { type: 'mint', timestamp: 10, actor: 'a2', amount: 60, sourceOrSink: 'daily_reward' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySource['daily_reward']).toBe(100);
    });

    it('tracks multiple sources and sinks independently', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 40, sourceOrSink: 'daily_reward' },
        { type: 'mint', timestamp: 10, actor: 'a2', amount: 60, sourceOrSink: 'quest_reward' },
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 20, sourceOrSink: 'upgrade_cost' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 10, sourceOrSink: 'tax' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySource['daily_reward']).toBe(40);
      expect(metrics.flowBySource['quest_reward']).toBe(60);
      expect(metrics.flowBySink['upgrade_cost']).toBe(20);
      expect(metrics.flowBySink['tax']).toBe(10);
    });
  });

  // ── 6. Source share calculation ──────────────────────────────────────────
  describe('sourceShare and sinkShare', () => {
    it('sourceShare sums to 1.0 across all sources', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 40, sourceOrSink: 'daily_reward' },
        { type: 'mint', timestamp: 10, actor: 'a2', amount: 60, sourceOrSink: 'quest_reward' },
      ];

      const metrics = observer.compute(state, events);

      const totalShare = Object.values(metrics.sourceShare).reduce((s, v) => s + v, 0);
      expect(totalShare).toBeCloseTo(1.0);
    });

    it('sourceShare proportions are correct', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 40, sourceOrSink: 'daily_reward' },
        { type: 'mint', timestamp: 10, actor: 'a2', amount: 60, sourceOrSink: 'quest_reward' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.sourceShare['daily_reward']).toBeCloseTo(0.4);
      expect(metrics.sourceShare['quest_reward']).toBeCloseTo(0.6);
    });

    it('sinkShare sums to 1.0 across all sinks', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 25, sourceOrSink: 'upgrade_cost' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 75, sourceOrSink: 'tax' },
      ];

      const metrics = observer.compute(state, events);

      const totalShare = Object.values(metrics.sinkShare).reduce((s, v) => s + v, 0);
      expect(totalShare).toBeCloseTo(1.0);
    });

    it('sinkShare proportions are correct', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 25, sourceOrSink: 'upgrade_cost' },
        { type: 'consume', timestamp: 10, actor: 'a2', amount: 75, sourceOrSink: 'tax' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.sinkShare['upgrade_cost']).toBeCloseTo(0.25);
      expect(metrics.sinkShare['tax']).toBeCloseTo(0.75);
    });

    it('single source gets 100% share', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 50, sourceOrSink: 'only_source' },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.sourceShare['only_source']).toBeCloseTo(1.0);
    });
  });

  // ── 7. Empty events produce empty system metrics ─────────────────────────
  describe('empty events', () => {
    it('produces empty objects when no events have system or sourceOrSink', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 10 },
        { type: 'trade', timestamp: 10, actor: 'a2', amount: 5 },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.flowBySystem).toEqual({});
      expect(metrics.activityBySystem).toEqual({});
      expect(metrics.participantsBySystem).toEqual({});
      expect(metrics.flowBySource).toEqual({});
      expect(metrics.flowBySink).toEqual({});
      expect(metrics.sourceShare).toEqual({});
      expect(metrics.sinkShare).toEqual({});
    });

    it('produces empty objects when there are zero events', () => {
      const observer = new Observer();
      const state = makeState();

      const metrics = observer.compute(state, []);

      expect(metrics.flowBySystem).toEqual({});
      expect(metrics.activityBySystem).toEqual({});
      expect(metrics.participantsBySystem).toEqual({});
      expect(metrics.flowBySource).toEqual({});
      expect(metrics.flowBySink).toEqual({});
      expect(metrics.sourceShare).toEqual({});
      expect(metrics.sinkShare).toEqual({});
    });
  });

  // ── 8. Backward compatibility ────────────────────────────────────────────
  describe('backward compatibility', () => {
    it('events without system still contribute to faucet/sink volume', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 50 },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 20 },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.faucetVolumeByCurrency['gold']).toBe(50);
      expect(metrics.sinkVolumeByCurrency['gold']).toBe(20);
      expect(metrics.netFlow).toBe(30);
    });

    it('events without sourceOrSink still work for aggregate metrics', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'enter', timestamp: 10, actor: 'a1', amount: 100 },
        { type: 'consume', timestamp: 10, actor: 'a2', amount: 40 },
      ];

      const metrics = observer.compute(state, events);

      expect(metrics.faucetVolume).toBe(100);
      expect(metrics.sinkVolume).toBe(40);
      expect(metrics.flowBySource).toEqual({});
      expect(metrics.flowBySink).toEqual({});
    });

    it('mixed events — some with system/sourceOrSink, some without', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'mint', timestamp: 10, actor: 'a1', amount: 60, system: 'marketplace', sourceOrSink: 'daily_reward' },
        { type: 'mint', timestamp: 10, actor: 'a2', amount: 40 },
        { type: 'burn', timestamp: 10, actor: 'a1', amount: 10, system: 'crafting' },
        { type: 'burn', timestamp: 10, actor: 'a2', amount: 20, sourceOrSink: 'tax' },
      ];

      const metrics = observer.compute(state, events);

      // Aggregate: faucet = 60 + 40 = 100, sink = 10 + 20 = 30
      expect(metrics.faucetVolume).toBe(100);
      expect(metrics.sinkVolume).toBe(30);

      // Per-system: only events with system field
      expect(metrics.flowBySystem['marketplace']).toBe(60);
      expect(metrics.flowBySystem['crafting']).toBe(-10);
      expect(metrics.activityBySystem['marketplace']).toBe(1);
      expect(metrics.activityBySystem['crafting']).toBe(1);

      // Per-source/sink: only events with sourceOrSink field
      expect(metrics.flowBySource['daily_reward']).toBe(60);
      expect(metrics.flowBySink['tax']).toBe(20);
      expect(metrics.sourceShare['daily_reward']).toBeCloseTo(1.0);
      expect(metrics.sinkShare['tax']).toBeCloseTo(1.0);
    });

    it('trade events with system are counted in activity but not in flow', () => {
      const observer = new Observer();
      const state = makeState();
      const events: EconomicEvent[] = [
        { type: 'trade', timestamp: 10, actor: 'a1', amount: 5, system: 'marketplace' },
      ];

      const metrics = observer.compute(state, events);

      // Trade events contribute to activityBySystem
      expect(metrics.activityBySystem['marketplace']).toBe(1);
      expect(metrics.participantsBySystem['marketplace']).toBe(1);
      // But trade events do NOT add to flowBySystem (only mint/enter/burn/consume do)
      expect(metrics.flowBySystem['marketplace']).toBeUndefined();
    });
  });
});
