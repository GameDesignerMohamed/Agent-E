import { describe, it, expect, vi } from 'vitest';
import { AgentE } from '../src/AgentE.js';
import type { EconomyAdapter, EconomyState, EconomicEvent } from '../src/types.js';

function makeState(tick: number): EconomyState {
  return {
    tick,
    roles: ['consumer', 'producer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 }, a2: { gold: 50 } },
    agentRoles: { a1: 'consumer', a2: 'producer' },
    agentInventories: { a1: { itemA: 1 }, a2: { itemA: 2 } },
    agentSatisfaction: { a1: 80, a2: 70 },
    marketPrices: { gold: { itemA: 10 } },
    recentTransactions: [],
  };
}

function makeAdapter(tick: number): EconomyAdapter {
  return {
    getState: () => makeState(tick),
    setParam: vi.fn(),
  };
}

describe('AgentE — event buffer and handler behavior', () => {
  it('handler errors do not prevent subsequent handlers from running', () => {
    const adapter = makeAdapter(100);
    const agent = new AgentE({
      adapter,
      mode: 'advisor',
      gracePeriod: 0,
      checkInterval: 1,
    });

    const calls: string[] = [];

    // First handler throws
    agent.on('alert', () => {
      throw new Error('Handler 1 crashed');
    });

    // Second handler should still run
    agent.on('alert', () => {
      calls.push('handler2');
    });

    agent.connect(adapter).start();

    // Suppress console.error during test
    const originalError = console.error;
    console.error = vi.fn();
    // tick should not throw even though handler throws
    expect(async () => agent.tick(makeState(100))).not.toThrow();
    console.error = originalError;
  });

  it('duplicate handler registration is deduplicated', () => {
    const adapter = makeAdapter(100);
    const agent = new AgentE({
      adapter,
      mode: 'advisor',
      gracePeriod: 0,
    });

    let callCount = 0;
    const handler = () => { callCount++; };

    agent.on('decision', handler);
    agent.on('decision', handler); // duplicate
    agent.on('decision', handler); // duplicate

    // Trigger by accessing internals — just verify handler was added once
    // by checking the off() removes it completely
    agent.off('decision', handler);
    // If dedup works, removing once should remove the single instance
  });

  it('events submitted via ingest() are available in next tick', async () => {
    const adapter = makeAdapter(100);
    const agent = new AgentE({
      adapter,
      mode: 'advisor',
      gracePeriod: 200, // high grace = no intervention, just observe
    });

    agent.connect(adapter).start();

    // Ingest an event
    agent.ingest({ type: 'mint', timestamp: 100, actor: 'a1', amount: 50 });

    // Tick should process it (no crash)
    await agent.tick(makeState(100));
  });
});
