// AgentEServer — HTTP + WebSocket transport for AgentE

import * as http from 'node:http';
import {
  AgentE,
  Observer,
  Diagnoser,
  ALL_PRINCIPLES,
  DEFAULT_THRESHOLDS,
  validateEconomyState,
  type AgentEConfig,
  type EconomyAdapter,
  type EconomyState,
  type EconomicEvent,
  type Diagnosis,
  type AgentEMode,
  type Thresholds,
} from '@agent-e/core';
import { createRouteHandler } from './routes.js';
import { createWebSocketHandler, type WebSocketHandle } from './websocket.js';

export interface ServerConfig {
  port?: number;
  host?: string;
  agentE?: Partial<Omit<AgentEConfig, 'adapter'>>;
  validateState?: boolean;
  corsOrigin?: string;
  serveDashboard?: boolean;
}

export interface EnrichedAdjustment {
  parameter: string;
  value: number;
  scope?: import('@agent-e/core').ParameterScope;
  reasoning: string;
}

interface QueuedAdjustment {
  key: string;
  value: number;
  scope: import('@agent-e/core').ParameterScope | undefined;
}

export class AgentEServer {
  private readonly agentE: AgentE;
  private readonly server: http.Server;
  private lastState: EconomyState | null = null;
  private adjustmentQueue: QueuedAdjustment[] = [];
  private alerts: Diagnosis[] = [];
  readonly port: number;
  private readonly host: string;
  private readonly thresholds: Thresholds;
  private readonly startedAt = Date.now();
  private wsHandle: WebSocketHandle | null = null;
  readonly validateState: boolean;
  readonly corsOrigin: string;
  readonly serveDashboard: boolean;

  constructor(config: ServerConfig = {}) {
    this.port = config.port ?? 3100;
    this.host = config.host ?? '0.0.0.0';
    this.validateState = config.validateState ?? true;
    this.corsOrigin = config.corsOrigin ?? 'http://localhost:3100';
    this.serveDashboard = config.serveDashboard ?? true;

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
      setParam: (key: string, value: number, scope?: import('@agent-e/core').ParameterScope) => {
        this.adjustmentQueue.push({ key, value, scope });
      },
    };

    const agentECfg = config.agentE ?? {};
    const agentEConfig: AgentEConfig = {
      adapter,
      mode: agentECfg.mode ?? 'autonomous',
      gracePeriod: agentECfg.gracePeriod ?? 0,
      checkInterval: agentECfg.checkInterval ?? 1,
      ...(agentECfg.dominantRoles ? { dominantRoles: agentECfg.dominantRoles } : {}),
      ...(agentECfg.idealDistribution ? { idealDistribution: agentECfg.idealDistribution } : {}),
      ...(agentECfg.maxAdjustmentPercent !== undefined ? { maxAdjustmentPercent: agentECfg.maxAdjustmentPercent } : {}),
      ...(agentECfg.cooldownTicks !== undefined ? { cooldownTicks: agentECfg.cooldownTicks } : {}),
      ...(agentECfg.thresholds ? { thresholds: agentECfg.thresholds } : {}),
    };

    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...(agentECfg.thresholds ?? {}),
      ...(agentECfg.maxAdjustmentPercent !== undefined ? { maxAdjustmentPercent: agentECfg.maxAdjustmentPercent } : {}),
      ...(agentECfg.cooldownTicks !== undefined ? { cooldownTicks: agentECfg.cooldownTicks } : {}),
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
    this.wsHandle = createWebSocketHandler(this.server, this);

    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        const addr = this.getAddress();
        console.log(`[AgentE Server] Listening on http://${addr.host}:${addr.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.agentE.stop();
    if (this.wsHandle) this.wsHandle.cleanup();
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
   * 5. Drain adjustment queue, enrich with reasoning from decisions
   * 6. Return response
   */
  async processTick(
    state: EconomyState,
    events?: EconomicEvent[],
  ): Promise<{
    adjustments: EnrichedAdjustment[];
    alerts: Diagnosis[];
    health: number;
    tick: number;
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
    const rawAdj = [...this.adjustmentQueue];
    this.adjustmentQueue = [];

    // Cross-reference with decision log to attach reasoning
    const decisions = this.agentE.getDecisions({ since: state.tick, until: state.tick });

    const adjustments: EnrichedAdjustment[] = rawAdj.map(adj => {
      const decision = decisions.find(d =>
        d.plan.parameter === adj.key && d.result === 'applied',
      );
      return {
        parameter: adj.key,
        value: adj.value,
        ...(adj.scope ? { scope: adj.scope } : {}),
        reasoning: decision?.diagnosis.violation.suggestedAction.reasoning ?? '',
      };
    });

    return {
      adjustments,
      alerts: [...this.alerts],
      health: this.agentE.getHealth(),
      tick: state.tick,
      decisions,
    };
  }

  /**
   * Run Observer + Diagnoser on the given state without side effects (no execution).
   * Computes fresh metrics from the state rather than reading stored metrics.
   */
  diagnoseOnly(state: EconomyState): {
    diagnoses: ReturnType<AgentE['diagnoseNow']>;
    health: number;
  } {
    const observer = new Observer();
    const diagnoser = new Diagnoser(ALL_PRINCIPLES);
    const metrics = observer.compute(state, []);
    const diagnoses = diagnoser.diagnose(metrics, this.thresholds);

    // Mirrors AgentE.getHealth() — keep in sync if that logic changes
    let health = 100;
    if (metrics.avgSatisfaction < 65) health -= 15;
    if (metrics.avgSatisfaction < 50) health -= 10;
    if (metrics.giniCoefficient > 0.45) health -= 15;
    if (metrics.giniCoefficient > 0.60) health -= 10;
    if (Math.abs(metrics.netFlow) > 10) health -= 15;
    if (Math.abs(metrics.netFlow) > 20) health -= 10;
    if (metrics.churnRate > 0.05) health -= 15;
    health = Math.max(0, Math.min(100, health));

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

  broadcast(data: Record<string, unknown>): void {
    if (this.wsHandle) this.wsHandle.broadcast(data);
  }
}
