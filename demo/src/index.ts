/**
 * AgentE V1 Demo — Connecting to the V0 game
 *
 * This file shows two things:
 * 1. How to wire AgentE V1 to the V0 demo game (index.html)
 * 2. How to run AgentE in a standalone simulation for testing
 *
 * For the V0 game integration, see the comment block at the bottom.
 * For standalone simulation, just run: `node src/index.js`
 */

import { AgentE } from '@agent-e/core';
import { GameAdapter, createV0GameAPI, V0_GAME_CONFIG } from '@agent-e/adapter-game';
import type { V0GameAPI } from '@agent-e/adapter-game';

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE SIMULATION (for testing/development)
// Simulates an economy without the actual V0 game.
// ─────────────────────────────────────────────────────────────────────────────

interface MockAgent {
  id: number;
  role: { name: string };
  balance: number;
  satisfaction: number;
  inventory: { ore: number; wood: number; weapons: number; potions: number };
}

function runStandaloneDemo() {
  console.log('AgentE V1 — Standalone Demo\n');

  // Build mock V0 game state (mimics V0's global variables)
  const gameState: V0GameAPI & { agents: MockAgent[] } = {
    tick: 0,
    agents: [],
    resourcePrices: { ore: 15, wood: 12, weapons: 50, potions: 40 },
    economyParams: {
      miningYield: 1.0,
      lumberYield: 1.0,
      craftingCost: 1.0,
      auctionFee: 0.05,
      arenaEntryFee: 1.0,
      arenaReward: 1.0,
      alchemyCost: 1.0,
    },
    bankPool: 0,
    arenaPot: 1000,
    transactionsThisTick: 0,
    goldInjectedThisTick: 0,
    goldRemovedThisTick: 0,
  };

  // Spawn initial agents
  function spawnAgents() {
    const roles = [
      { name: 'Fighter', count: 80, balance: () => 100 + Math.random() * 50 },
      { name: 'Gatherer', count: 36, balance: () => 0 },
      { name: 'Crafter', count: 27, balance: () => 40 },
      { name: 'Alchemist', count: 18, balance: () => 40 },
      { name: 'Trader', count: 10, balance: () => 10 },
      { name: 'Market Maker', count: 9, balance: () => 20 },
    ];

    let id = 0;
    for (const roleDef of roles) {
      for (let i = 0; i < roleDef.count; i++) {
        gameState.agents.push({
          id: id++,
          role: { name: roleDef.name },
          balance: roleDef.balance(),
          satisfaction: 80,
          inventory: {
            ore: roleDef.name === 'Gatherer' ? 5 : roleDef.name === 'Crafter' ? 4 : 0,
            wood: roleDef.name === 'Gatherer' ? 4 : roleDef.name === 'Alchemist' ? 4 : 0,
            weapons: roleDef.name === 'Crafter' ? 2 : roleDef.name === 'Fighter' ? 1 : 0,
            potions: roleDef.name === 'Alchemist' ? 2 : 0,
          },
        });
      }
    }
  }

  spawnAgents();
  console.log(`Spawned ${gameState.agents.length} agents.\n`);

  // Create adapter
  const adapter = new GameAdapter({ api: createV0GameAPI(gameState) });

  // Create AgentE with V0 preset + enhanced decision logging
  const agentE = new AgentE({
    ...V0_GAME_CONFIG,
    adapter,
    onDecision: (entry) => {
      const { tick, result, reasoning } = entry;
      if (result === 'applied') {
        console.log(`  [Tick ${tick}] ✅ ${reasoning.slice(0, 120)}...`);
      }
    },
    onAlert: (diagnosis) => {
      if (diagnosis.violation.severity >= 7) {
        console.log(`  [Alert] ⚠️  ${diagnosis.principle.id} — ${diagnosis.principle.name} (severity ${diagnosis.violation.severity})`);
      }
    },
    onRollback: (plan, reason) => {
      console.log(`  [Rollback] ↩️  ${plan.parameter} rolled back: ${reason}`);
    },
  });

  agentE.connect(adapter).start();

  // Add a custom metric
  agentE.registerCustomMetric('weaponDeficit', (state) => {
    const fighters = Object.values(state.agentRoles).filter(r => r === 'Fighter').length;
    const totalWeapons = Object.values(state.agentInventories)
      .reduce((s, inv) => s + (inv['weapons'] ?? 0), 0);
    return fighters - totalWeapons;
  });

  // Simulate ticks
  async function simulateTicks(totalTicks: number) {
    for (let i = 1; i <= totalTicks; i++) {
      gameState.tick = i;

      // Simple economy simulation: vary satisfaction and prices
      const tickMod = i % 50;
      if (tickMod === 10) {
        // Simulate gathering surge at tick 10
        gameState.resourcePrices.ore = 8; // ore price crashes
        gameState.goldInjectedThisTick = 500;
      } else if (tickMod === 25) {
        // Simulate weapon scarcity
        gameState.resourcePrices.weapons = 80;
        gameState.goldRemovedThisTick = 200;
      } else {
        gameState.goldInjectedThisTick = Math.random() * 50;
        gameState.goldRemovedThisTick = Math.random() * 40;
      }
      gameState.transactionsThisTick = Math.floor(Math.random() * 20);

      // Vary satisfaction randomly
      for (const agent of gameState.agents) {
        agent.satisfaction = Math.max(10, Math.min(100, agent.satisfaction + (Math.random() - 0.5) * 5));
      }

      await agentE.tick();

      if (i % 25 === 0) {
        const m = agentE.metrics.latest();
        const health = agentE.getHealth();
        console.log(
          `[Tick ${String(i).padStart(3)}] Health: ${health}/100 | ` +
          `Satisfaction: ${m.avgSatisfaction.toFixed(0)} | ` +
          `Gini: ${m.giniCoefficient.toFixed(2)} | ` +
          `Net flow: ${m.netFlow.toFixed(1)} | ` +
          `Decisions: ${agentE.getDecisions({ result: 'applied', since: i - 25 }).length}`,
        );
      }
    }
  }

  simulateTicks(200).then(() => {
    console.log('\n── Final Decision Log (last 10) ──');
    const decisions = agentE.getDecisions({ result: 'applied' }).slice(0, 10);
    for (const d of decisions) {
      console.log(`  [Tick ${d.tick}] ${d.plan.parameter}: ${d.plan.currentValue.toFixed(3)} → ${d.plan.targetValue.toFixed(3)}`);
    }

    console.log('\n── Active Violations ──');
    const violations = agentE.diagnoseNow();
    for (const v of violations.slice(0, 5)) {
      console.log(`  ${v.principle.id} (severity ${v.violation.severity}): ${v.principle.name}`);
    }
    console.log('\nDone.');
  });
}

runStandaloneDemo();

// ─────────────────────────────────────────────────────────────────────────────
// V0 GAME INTEGRATION (browser/index.html)
// ─────────────────────────────────────────────────────────────────────────────
//
// To wire AgentE V1 into the V0 game, add this to index.html's <script>:
//
//   import { AgentE } from '@agent-e/core';
//   import { GameAdapter, createV0GameAPI, V0_GAME_CONFIG } from '@agent-e/adapter-game';
//
//   // Expose the V0 game state as an API object
//   const v0API = createV0GameAPI({
//     tick,              // global var from V0
//     agents,            // global var from V0
//     resourcePrices,    // global var from V0
//     economyParams,     // global var from V0
//     bankPool,          // global var from V0
//     arenaPot,          // global var from V0
//     transactionsThisTick,   // global var from V0
//     goldInjectedThisTick,   // global var from V0
//     goldRemovedThisTick,    // global var from V0
//   });
//
//   const adapter = new GameAdapter({ api: v0API });
//   const agentE = new AgentE({ ...V0_GAME_CONFIG, adapter });
//   agentE.connect(adapter).start();
//
//   // Call once per game tick (inside economicTick()):
//   await agentE.tick();
//
//   // Replace the existing agentEDecide() call with agentE.tick()
//   // Remove the old embedded agentEDecide() function.
//
// ─────────────────────────────────────────────────────────────────────────────
