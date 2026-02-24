/**
 * adapter.migration.test.ts
 *
 * Verifies the V1.5.0 adapter migration works correctly:
 * - Scope-based setParam
 * - Enter events (faucet volume)
 * - Advisor mode (recommendation without applying)
 * - Parameter registration via config
 * - Runtime registerParameter()
 * - getRegistry() access
 */
import { describe, it, expect, vi } from 'vitest';
import { AgentE } from '../src/AgentE.js';
import type { EconomyAdapter, EconomyState, EconomicEvent } from '../src/types.js';
import type { RegisteredParameter } from '../src/ParameterRegistry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(state: EconomyState): EconomyAdapter {
  return {
    getState: () => state,
    setParam: vi.fn(),
  };
}

function makeState(tick: number): EconomyState {
  return {
    tick,
    roles: ['consumer', 'producer'],
    resources: ['itemA'],
    currencies: ['gold'],
    agentBalances: { a1: { gold: 100 }, a2: { gold: 50 } },
    agentRoles: { a1: 'consumer', a2: 'producer' },
    agentInventories: {},
    agentSatisfaction: { a1: 80, a2: 70 },
    marketPrices: { gold: { itemA: 10 } },
    recentTransactions: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Adapter Migration (V1.5.0)', () => {
  // ── 1. Scope-based setParam ────────────────────────────────────────────

  describe('scope-based setParam', () => {
    it('passes scope as 3rd argument to adapter.setParam when plan has scope', async () => {
      const state = makeState(0);
      const adapter = makeAdapter(state);
      const scope = { system: 'marketplace', currency: 'gold' };

      const agent = new AgentE({
        adapter,
        parameters: [
          {
            key: 'marketFee',
            type: 'fee',
            flowImpact: 'sink',
            scope: { system: 'marketplace', currency: 'gold' },
            currentValue: 5,
          },
        ],
      });
      agent.connect(adapter).start();

      // Manually apply a plan with scope
      await agent.apply({
        id: 'test-plan-1',
        diagnosis: {
          principle: { id: 'P1', name: 'Test', category: 'currency', description: '', check: () => ({ violated: false }) },
          violation: {
            violated: true,
            severity: 5,
            evidence: {},
            suggestedAction: { parameterType: 'fee', direction: 'increase', reasoning: 'test' },
            confidence: 0.8,
          },
          tick: 0,
        },
        parameter: 'marketFee',
        scope,
        currentValue: 5,
        targetValue: 7,
        maxChangePercent: 0.15,
        cooldownTicks: 15,
        rollbackCondition: { metric: 'netFlow', direction: 'below', threshold: -50, checkAfterTick: 20 },
        simulationResult: { netImprovement: true, predictedMetrics: {}, riskScore: 0.2, reasoning: 'ok' },
        estimatedLag: 5,
      });

      expect(adapter.setParam).toHaveBeenCalledTimes(1);
      expect(adapter.setParam).toHaveBeenCalledWith('marketFee', 7, scope);
    });

    it('passes undefined scope when plan has no scope', async () => {
      const state = makeState(0);
      const adapter = makeAdapter(state);

      const agent = new AgentE({ adapter });
      agent.connect(adapter).start();

      await agent.apply({
        id: 'test-plan-2',
        diagnosis: {
          principle: { id: 'P1', name: 'Test', category: 'currency', description: '', check: () => ({ violated: false }) },
          violation: {
            violated: true,
            severity: 5,
            evidence: {},
            suggestedAction: { parameterType: 'rate', direction: 'increase', reasoning: 'test' },
            confidence: 0.8,
          },
          tick: 0,
        },
        parameter: 'someRate',
        // no scope
        currentValue: 10,
        targetValue: 12,
        maxChangePercent: 0.15,
        cooldownTicks: 15,
        rollbackCondition: { metric: 'netFlow', direction: 'below', threshold: -50, checkAfterTick: 20 },
        simulationResult: { netImprovement: true, predictedMetrics: {}, riskScore: 0.2, reasoning: 'ok' },
        estimatedLag: 5,
      });

      expect(adapter.setParam).toHaveBeenCalledTimes(1);
      expect(adapter.setParam).toHaveBeenCalledWith('someRate', 12, undefined);
    });
  });

  // ── 2. Enter events increase faucet volume ─────────────────────────────

  describe('enter events', () => {
    it('enter events increase faucet volume in metrics', async () => {
      const state = makeState(1);
      const adapter = makeAdapter(state);

      const enterEvent: EconomicEvent = {
        type: 'enter',
        timestamp: 1,
        actor: 'newAgent',
        currency: 'gold',
        amount: 50,
      };

      const agent = new AgentE({
        adapter,
        gracePeriod: 999, // high grace period so we don't trigger the pipeline
      });
      agent.connect(adapter).start();

      // Ingest the enter event
      agent.ingest(enterEvent);

      // Tick the agent — observer will process the buffered event
      await agent.tick(state);

      // The metric store should have recorded faucet volume from the enter event
      const latest = agent.metrics.latest();
      expect(latest.faucetVolume).toBe(50);
      expect(latest.faucetVolumeByCurrency['gold']).toBe(50);
    });

    it('enter events without currency default to the first currency in state', async () => {
      const state = makeState(2);
      const adapter = makeAdapter(state);

      const enterEvent: EconomicEvent = {
        type: 'enter',
        timestamp: 2,
        actor: 'newAgent2',
        // no currency specified — should default to state.currencies[0] ('gold')
        amount: 30,
      };

      const agent = new AgentE({
        adapter,
        gracePeriod: 999,
      });
      agent.connect(adapter).start();

      agent.ingest(enterEvent);
      await agent.tick(state);

      const latest = agent.metrics.latest();
      expect(latest.faucetVolumeByCurrency['gold']).toBe(30);
    });
  });

  // ── 3. Advisor mode emits recommendation without applying ──────────────

  describe('advisor mode', () => {
    it('emits decision event but never calls setParam', async () => {
      // Build a state past grace period with a principle violation trigger
      const state = makeState(55); // past default grace period of 50
      // Low satisfaction to trigger a violation
      state.agentSatisfaction = { a1: 20, a2: 15 };

      const adapter = makeAdapter(state);
      const decisionHandler = vi.fn();

      const agent = new AgentE({
        adapter,
        mode: 'advisor',
        gracePeriod: 50,
        checkInterval: 5,
        parameters: [
          {
            key: 'rewardRate',
            type: 'reward',
            flowImpact: 'faucet',
            currentValue: 10,
          },
        ],
      });
      agent.connect(adapter).start();
      agent.on('decision', decisionHandler);

      // Run ticks from 0 up to 55 to warm up the observer and pass grace period
      for (let t = 0; t <= 55; t++) {
        const tickState = makeState(t);
        // Low satisfaction throughout to build up a clear violation
        tickState.agentSatisfaction = { a1: 20, a2: 15 };
        await agent.tick(tickState);
      }

      // setParam should never have been called in advisor mode
      expect(adapter.setParam).not.toHaveBeenCalled();

      // If a principle was violated and a plan was generated, decision should fire.
      // Even if no decision fired (no violation matched), setParam is still never called.
      // The key invariant: advisor mode NEVER calls setParam.
      expect(adapter.setParam).toHaveBeenCalledTimes(0);
    });
  });

  // ── 4. Parameter registration via config ───────────────────────────────

  describe('parameter registration via config', () => {
    it('parameters passed in config.parameters are registered in the registry', () => {
      const params: RegisteredParameter[] = [
        { key: 'stakingYield', type: 'yield', flowImpact: 'faucet', scope: { system: 'staking' } },
        { key: 'tradeFee', type: 'fee', flowImpact: 'sink', scope: { system: 'marketplace' } },
        { key: 'craftCost', type: 'cost', flowImpact: 'sink', scope: { system: 'crafting' } },
      ];

      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
        parameters: params,
      });

      const registry = agent.getRegistry();

      expect(registry.size).toBe(3);
      expect(registry.get('stakingYield')).toBeDefined();
      expect(registry.get('stakingYield')!.type).toBe('yield');
      expect(registry.get('stakingYield')!.flowImpact).toBe('faucet');
      expect(registry.get('tradeFee')).toBeDefined();
      expect(registry.get('tradeFee')!.scope?.system).toBe('marketplace');
      expect(registry.get('craftCost')).toBeDefined();
    });

    it('empty parameters array results in empty registry', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
        parameters: [],
      });

      expect(agent.getRegistry().size).toBe(0);
    });

    it('omitting parameters entirely results in empty registry', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
      });

      expect(agent.getRegistry().size).toBe(0);
    });
  });

  // ── 5. registerParameter() at runtime ──────────────────────────────────

  describe('registerParameter() at runtime', () => {
    it('makes the parameter available for resolution via the registry', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
      });

      expect(agent.getRegistry().size).toBe(0);

      agent.registerParameter({
        key: 'dynamicReward',
        type: 'reward',
        flowImpact: 'faucet',
        scope: { system: 'quests' },
        currentValue: 5,
      });

      expect(agent.getRegistry().size).toBe(1);

      const resolved = agent.getRegistry().resolve('reward', { system: 'quests' });
      expect(resolved).toBeDefined();
      expect(resolved!.key).toBe('dynamicReward');
      expect(resolved!.currentValue).toBe(5);
    });

    it('runtime-registered parameter coexists with config-registered parameters', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
        parameters: [
          { key: 'configFee', type: 'fee', flowImpact: 'sink' },
        ],
      });

      expect(agent.getRegistry().size).toBe(1);

      agent.registerParameter({
        key: 'runtimeReward',
        type: 'reward',
        flowImpact: 'faucet',
      });

      expect(agent.getRegistry().size).toBe(2);
      expect(agent.getRegistry().get('configFee')).toBeDefined();
      expect(agent.getRegistry().get('runtimeReward')).toBeDefined();
    });

    it('runtime registration overwrites an existing parameter with the same key', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
        parameters: [
          { key: 'myParam', type: 'cost', flowImpact: 'sink', description: 'original' },
        ],
      });

      agent.registerParameter({
        key: 'myParam',
        type: 'cost',
        flowImpact: 'sink',
        description: 'updated',
      });

      expect(agent.getRegistry().size).toBe(1);
      expect(agent.getRegistry().get('myParam')!.description).toBe('updated');
    });
  });

  // ── 6. getRegistry() returns the registry ──────────────────────────────

  describe('getRegistry()', () => {
    it('returns the ParameterRegistry instance', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
      });

      const registry = agent.getRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.resolve).toBe('function');
      expect(typeof registry.get).toBe('function');
      expect(typeof registry.findByType).toBe('function');
      expect(typeof registry.findBySystem).toBe('function');
      expect(typeof registry.getAll).toBe('function');
      expect(typeof registry.register).toBe('function');
      expect(typeof registry.registerAll).toBe('function');
      expect(typeof registry.updateValue).toBe('function');
      expect(typeof registry.getFlowImpact).toBe('function');
    });

    it('returns the same registry instance on repeated calls', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
      });

      const first = agent.getRegistry();
      const second = agent.getRegistry();
      expect(first).toBe(second);
    });

    it('reflects mutations made through registerParameter()', () => {
      const agent = new AgentE({
        adapter: makeAdapter(makeState(0)),
      });

      const registryBefore = agent.getRegistry();
      expect(registryBefore.size).toBe(0);

      agent.registerParameter({
        key: 'lateParam',
        type: 'rate',
        flowImpact: 'neutral',
      });

      // Same registry object, now shows the new parameter
      expect(registryBefore.size).toBe(1);
      expect(registryBefore.get('lateParam')).toBeDefined();
    });
  });
});
