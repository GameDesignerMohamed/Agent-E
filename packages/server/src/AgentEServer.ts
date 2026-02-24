// AgentEServer — HTTP + WebSocket transport for AgentE

import * as http from 'node:http';
import {
  AgentE,
  validateEconomyState,
  type AgentEConfig,
  type EconomyAdapter,
  type EconomyState,
  type EconomicEvent,
  type Diagnosis,
  type AgentEMode,
} from '@agent-e/core';
import { createRouteHandler } from './routes.js';
import { createWebSocketHandler } from './websocket.js';

export interface ServerConfig {
  port?: number;
  host?: string;
  agentEConfig?: Partial<Omit<AgentEConfig, 'adapter'>>;
}

interface QueuedAdjustment {
  key: string;
  value: number;
  currency?: string;
}

export class AgentEServer {
  private readonly agentE: AgentE;
  private readonly server: http.Server;
  private lastState: EconomyState | null = null;
  private adjustmentQueue: QueuedAdjustment[] = [];
  private alerts: Diagnosis[] = [];
  private readonly port: number;
  private readonly host: string;
  private readonly startedAt = Date.now();
  private cleanupWs: (() => void) | null = null;

  constructor(config: ServerConfig = {}) {
    this.port = config.port ?? 3000;
    this.host = config.host ?? '0.0.0.0';

    // Build a "remote" adapter — state comes from HTTP/WS, not polled
    const adapter: EconomyAdapter = {
      getState: () => {
        if (!this.lastState) {
          return {
            tick: 0,
            roles: [],
            resources: [],
            currencies: ['default'],
            agentBalances: {},
            agentRoles: {},
            agentInventories: {},
            marketPrices: {},
            recentTransactions: [],
          };
        }
        return this.lastState;
      },
      setParam: (key: string, value: number) => {
        this.adjustmentQueue.push({ key, value });
      },
    };

    const agentEConfig: AgentEConfig = {
      adapter,
      mode: config.agentEConfig?.mode ?? 'autonomous',
      gracePeriod: config.agentEConfig?.gracePeriod ?? 0,
      checkInterval: config.agentEConfig?.checkInterval ?? 1,
      ...(config.agentEConfig?.dominantRoles ? { dominantRoles: config.agentEConfig.dominantRoles } : {}),
      ...(config.agentEConfig?.idealDistribution ? { idealDistribution: config.agentEConfig.idealDistribution } : {}),
      ...(config.agentEConfig?.maxAdjustmentPercent !== undefined ? { maxAdjustmentPercent: config.agentEConfig.maxAdjustmentPercent } : {}),
      ...(config.agentEConfig?.cooldownTicks !== undefined ? { cooldownTicks: config.agentEConfig.cooldownTicks } : {}),
      ...(config.agentEConfig?.thresholds ? { thresholds: config.agentEConfig.thresholds } : {}),
    };

    this.agentE = new AgentE(agentEConfig);

    // Capture alerts during tick
    this.agentE.on('alert', (diagnosis: unknown) => {
      this.alerts.push(diagnosis as Diagnosis);
    });

    this.agentE.connect(adapter).start();

    // Create HTTP server
    const routeHandler = createRouteHandler(this);
    this.server = http.createServer(routeHandler);
  }

  async start(): Promise<void> {
    // Wire up WebSocket upgrade
    this.cleanupWs = createWebSocketHandler(this.server, this);

    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.agentE.stop();
    if (this.cleanupWs) this.cleanupWs();
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getAgentE(): AgentE {
    return this.agentE;
  }

  getAddress(): { port: number; host: string } {
    const addr = this.server.address();
    if (addr && typeof addr === 'object') {
      return { port: addr.port, host: addr.address };
    }
    return { port: this.port, host: this.host };
  }

  getUptime(): number {
    return Date.now() - this.startedAt;
  }

  /**
   * Process a tick with the given state.
   * 1. Clear adjustment queue
   * 2. Set state
   * 3. Ingest events
   * 4. Run agentE.tick(state)
   * 5. Drain adjustment queue
   * 6. Return response
   */
  async processTick(
    state: EconomyState,
    events?: EconomicEvent[],
  ): Promise<{
    adjustments: QueuedAdjustment[];
    alerts: Diagnosis[];
    health: number;
    decisions: ReturnType<AgentE['getDecisions']>;
  }> {
    // Clear queues
    this.adjustmentQueue = [];
    this.alerts = [];

    // Set state
    this.lastState = state;

    // Ingest events
    if (events) {
      for (const event of events) {
        this.agentE.ingest(event);
      }
    }

    // Run tick
    await this.agentE.tick(state);

    // Drain adjustments
    const adjustments = [...this.adjustmentQueue];
    this.adjustmentQueue = [];

    // Cross-reference with decision log
    const decisions = this.agentE.getDecisions({ since: state.tick, until: state.tick });

    return {
      adjustments,
      alerts: [...this.alerts],
      health: this.agentE.getHealth(),
      decisions,
    };
  }

  /**
   * Run Observer + Diagnoser without side effects (no execution)
   */
  diagnoseOnly(state: EconomyState): {
    diagnoses: ReturnType<AgentE['diagnoseNow']>;
    health: number;
  } {
    // Temporarily save and restore state
    const prevState = this.lastState;
    this.lastState = state;

    // Run diagnosis without ticking
    const diagnoser = this.agentE;
    const diagnoses = diagnoser.diagnoseNow();
    const health = diagnoser.getHealth();

    this.lastState = prevState;
    return { diagnoses, health };
  }

  setMode(mode: AgentEMode): void {
    this.agentE.setMode(mode);
  }

  lock(param: string): void {
    this.agentE.lock(param);
  }

  unlock(param: string): void {
    this.agentE.unlock(param);
  }

  constrain(param: string, bounds: { min: number; max: number }): void {
    this.agentE.constrain(param, bounds);
  }
}
