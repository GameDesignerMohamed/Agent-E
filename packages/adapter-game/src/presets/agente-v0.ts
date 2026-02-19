// Preset: AgentE V0 demo game
// Shows exactly how to wire the V0 index.html game to AgentE V1.
// The V0 game exposes a global `window.agentEGameAPI` — this preset bridges it.

import type { GameAPI } from '../GameAdapter.js';
import type { EconomicEvent } from '@agent-e/core';

/**
 * The shape of the V0 game's global state.
 * In the V0 index.html, these are module-level `let` variables.
 * This preset expects them to be exposed on `window.agentEGameAPI`.
 */
export interface V0GameAPI {
  tick: number;
  agents: Array<{
    id: number;
    role: { name: string };
    balance: number;
    satisfaction: number;
    inventory: { ore: number; wood: number; weapons: number; potions: number };
  }>;
  resourcePrices: { ore: number; wood: number; weapons: number; potions: number };
  economyParams: Record<string, number>;
  bankPool: number;
  arenaPot: number;
  transactionsThisTick: number;
  goldInjectedThisTick: number;
  goldRemovedThisTick: number;
}

export function createV0GameAPI(gameState: V0GameAPI): GameAPI {
  return {
    getTick: () => gameState.tick,

    getRoles: () => ['Fighter', 'Crafter', 'Gatherer', 'Trader', 'Alchemist', 'Market Maker'],

    getAgentRoles: () => {
      const roles: Record<string, string> = {};
      for (const a of gameState.agents) {
        roles[String(a.id)] = a.role.name;
      }
      return roles;
    },

    getAgentBalances: () => {
      const balances: Record<string, number> = {};
      for (const a of gameState.agents) {
        balances[String(a.id)] = a.balance;
      }
      return balances;
    },

    getAgentInventories: () => {
      const inventories: Record<string, Record<string, number>> = {};
      for (const a of gameState.agents) {
        inventories[String(a.id)] = { ...a.inventory };
      }
      return inventories;
    },

    getAgentSatisfaction: () => {
      const satisfaction: Record<string, number> = {};
      for (const a of gameState.agents) {
        satisfaction[String(a.id)] = a.satisfaction;
      }
      return satisfaction;
    },

    getMarketPrices: () => ({ ...gameState.resourcePrices }),

    getPoolSizes: () => ({
      bank: gameState.bankPool,
      arena: gameState.arenaPot,
    }),

    getRecentEvents: () => {
      // Synthesise events from per-tick counters
      const events: EconomicEvent[] = [];
      if (gameState.goldInjectedThisTick > 0) {
        events.push({
          type: 'mint',
          timestamp: gameState.tick,
          actor: 'economy',
          amount: gameState.goldInjectedThisTick,
        });
      }
      if (gameState.goldRemovedThisTick > 0) {
        events.push({
          type: 'burn',
          timestamp: gameState.tick,
          actor: 'economy',
          amount: gameState.goldRemovedThisTick,
        });
      }
      for (let i = 0; i < gameState.transactionsThisTick; i++) {
        events.push({
          type: 'trade',
          timestamp: gameState.tick,
          actor: 'auction_house',
        });
      }
      return events;
    },

    setParam: (key: string, value: number) => {
      gameState.economyParams[key] = value;
      // Also update the game's live economyParams so it takes effect immediately
      (gameState.economyParams as Record<string, number>)[key] = value;
    },
  };
}

/**
 * AgentE V1 config preset for the V0 demo game.
 * Pass this to `new AgentE(V0_GAME_PRESET)` after setting the adapter.
 */
export const V0_GAME_CONFIG = {
  mode: 'autonomous' as const,
  dominantRoles: ['Fighter'],           // Fighters are structurally dominant — never suppress
  idealDistribution: {
    Fighter: 0.45,
    Gatherer: 0.20,
    Crafter: 0.15,
    Alchemist: 0.10,
    Trader: 0.05,
    'Market Maker': 0.05,
  },
  gracePeriod: 50,                      // No intervention before tick 50 (P17)
  checkInterval: 5,                     // Check every 5 ticks
  maxAdjustmentPercent: 0.15,           // Max 15% change per cycle (P26)
  cooldownTicks: 15,                    // Cooldown between same-param adjustments (P27)
};
