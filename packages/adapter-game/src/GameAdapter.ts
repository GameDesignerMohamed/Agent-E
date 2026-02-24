// @agent-e/adapter-game — GameAdapter
// Translates a game economy's API into AgentE's universal format (V1.3+ multi-currency)

import type { EconomyAdapter, EconomyState, EconomicEvent } from '@agent-e/core';

export interface GameAPI {
  /** Return current game tick */
  getTick(): number;
  /** All roles present in the game */
  getRoles(): string[];
  /** All currencies in the game */
  getCurrencies(): string[];
  /** All resource types in the game */
  getResources(): string[];
  /** Agent ID → role name */
  getAgentRoles(): Record<string, string>;
  /** Agent ID → { currency → balance } */
  getAgentBalances(): Record<string, Record<string, number>>;
  /** Agent ID → inventory { resource: quantity } */
  getAgentInventories(): Record<string, Record<string, number>>;
  /** Agent ID → satisfaction (0-100) */
  getAgentSatisfaction?(): Record<string, number>;
  /** currency → { resource → price } */
  getMarketPrices(): Record<string, Record<string, number>>;
  /** Events since last poll */
  getRecentEvents?(): EconomicEvent[];
  /** currency → { poolName → amount } */
  getPoolSizes?(): Record<string, Record<string, number>>;
  /** Set an economy parameter (key/value), optionally scoped to a currency */
  setParam(key: string, value: number, currency?: string): void;
}

export interface GameAdapterConfig {
  api: GameAPI;
}

export class GameAdapter implements EconomyAdapter {
  private api: GameAPI;
  private eventHandlers: Array<(event: EconomicEvent) => void> = [];

  constructor(config: GameAdapterConfig) {
    this.api = config.api;
  }

  getState(): EconomyState {
    return {
      tick: this.api.getTick(),
      roles: this.api.getRoles(),
      resources: this.api.getResources(),
      currencies: this.api.getCurrencies(),
      agentBalances: this.api.getAgentBalances(),
      agentRoles: this.api.getAgentRoles(),
      agentInventories: this.api.getAgentInventories(),
      ...(this.api.getAgentSatisfaction ? { agentSatisfaction: this.api.getAgentSatisfaction() } : {}),
      marketPrices: this.api.getMarketPrices(),
      recentTransactions: this.api.getRecentEvents?.() ?? [],
      ...(this.api.getPoolSizes ? { poolSizes: this.api.getPoolSizes() } : {}),
    };
  }

  setParam(key: string, value: number): void {
    this.api.setParam(key, value);
  }

  onEvent(handler: (event: EconomicEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  /** Call this from your game loop to push events to AgentE */
  pushEvent(event: EconomicEvent): void {
    for (const h of this.eventHandlers) h(event);
  }
}
