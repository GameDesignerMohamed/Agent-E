// @agent-e/adapter-game — GameAdapter
// Translates a game economy's API into AgentE's universal format

import type { EconomyAdapter, EconomyState, EconomicEvent } from '@agent-e/core';

export interface GameAPI {
  /** Return current game tick */
  getTick(): number;
  /** All roles present in the game */
  getRoles(): string[];
  /** Agent ID → role name */
  getAgentRoles(): Record<string, string>;
  /** Agent ID → gold balance */
  getAgentBalances(): Record<string, number>;
  /** Agent ID → inventory { resource: quantity } */
  getAgentInventories(): Record<string, Record<string, number>>;
  /** Agent ID → satisfaction (0-100) */
  getAgentSatisfaction?(): Record<string, number>;
  /** resource → current market price */
  getMarketPrices(): Record<string, number>;
  /** Events since last poll */
  getRecentEvents?(): EconomicEvent[];
  /** Pool name → gold amount (e.g. arenaPot, bankPool) */
  getPoolSizes?(): Record<string, number>;
  /** Set an economy parameter (key/value) */
  setParam(key: string, value: number): void;
}

export interface GameAdapterConfig {
  api: GameAPI;
  resources?: string[];
  currency?: string;
}

export class GameAdapter implements EconomyAdapter {
  private api: GameAPI;
  private eventHandlers: Array<(event: EconomicEvent) => void> = [];

  constructor(config: GameAdapterConfig) {
    this.api = config.api;
  }

  getState(): EconomyState {
    const tick = this.api.getTick();
    return {
      tick,
      roles: this.api.getRoles(),
      resources: [],
      currency: 'gold',
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
