// AgentE — the main class
// Observer → Diagnose → Simulate → Plan → Execute

import type {
  AgentEConfig,
  AgentEMode,
  EconomyAdapter,
  EconomyState,
  EconomicEvent,
  EconomyMetrics,
  Principle,
  DecisionEntry,
  ActionPlan,
  Thresholds,
  MetricQuery,
  MetricQueryResult,
} from './types.js';
import { DEFAULT_THRESHOLDS, DEFAULT_TICK_CONFIG } from './defaults.js';
import { Observer } from './Observer.js';
import { Diagnoser } from './Diagnoser.js';
import { Simulator } from './Simulator.js';
import { Planner } from './Planner.js';
import { Executor } from './Executor.js';
import { DecisionLog } from './DecisionLog.js';
import { MetricStore } from './MetricStore.js';
import { PersonaTracker } from './PersonaTracker.js';
import { SatisfactionEstimator } from './SatisfactionEstimator.js';
import { ALL_PRINCIPLES } from './principles/index.js';
import { ParameterRegistry } from './ParameterRegistry.js';
import type { RegisteredParameter } from './ParameterRegistry.js';

type EventName = 'decision' | 'alert' | 'rollback' | 'beforeAction' | 'afterAction';

export class AgentE {
  // ── Config ──
  private readonly config: Required<
    Omit<AgentEConfig, 'adapter' | 'thresholds' | 'onDecision' | 'onAlert' | 'onRollback'>
  >;
  private readonly thresholds: Thresholds;
  private adapter!: EconomyAdapter;
  private mode: AgentEMode;

  // ── Pipeline ──
  private observer!: Observer;
  private diagnoser: Diagnoser;
  private simulator: Simulator;
  private planner = new Planner();
  private executor!: Executor;
  private registry = new ParameterRegistry();

  // ── State ──
  readonly log = new DecisionLog();
  readonly store!: MetricStore;
  private personaTracker = new PersonaTracker();
  private satisfactionEstimator = new SatisfactionEstimator();
  private params: Record<string, number> = {};
  private eventBuffer: EconomicEvent[] = [];
  private static readonly MAX_EVENT_BUFFER = 10_000;
  private static readonly MAX_EVENT_METADATA_KEYS = 50;
  private isRunning = false;
  private isPaused = false;
  private currentTick = 0;

  // ── Event handlers ──
  private handlers = new Map<EventName, Array<(...args: unknown[]) => unknown>>();

  constructor(config: AgentEConfig) {
    this.mode = config.mode ?? 'autonomous';

    this.config = {
      mode: this.mode,
      dominantRoles: config.dominantRoles ?? [],
      idealDistribution: config.idealDistribution ?? {},
      validateRegistry: config.validateRegistry ?? true,
      simulation: config.simulation ?? {},
      settlementWindowTicks: config.settlementWindowTicks ?? 200,
      tickConfig: config.tickConfig ?? { duration: 1, unit: 'tick' },
      gracePeriod: config.gracePeriod ?? 50,
      checkInterval: config.checkInterval ?? 5,
      maxAdjustmentPercent: config.maxAdjustmentPercent ?? 0.15,
      cooldownTicks: config.cooldownTicks ?? 15,
      parameters: config.parameters ?? [],
    };

    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...(config.thresholds ?? {}),
      maxAdjustmentPercent: config.maxAdjustmentPercent ?? DEFAULT_THRESHOLDS.maxAdjustmentPercent,
      cooldownTicks: config.cooldownTicks ?? DEFAULT_THRESHOLDS.cooldownTicks,
    };

    // Resolve TickConfig and pass to Observer and MetricStore
    const tickConfig = { ...DEFAULT_TICK_CONFIG, ...config.tickConfig };
    this.observer = new Observer(tickConfig);
    this.store = new MetricStore(tickConfig);

    this.diagnoser = new Diagnoser(ALL_PRINCIPLES);

    // Register parameters if provided
    if (config.parameters) {
      this.registry.registerAll(config.parameters);
    }

    // Validate registry on startup (default: true)
    if (config.validateRegistry !== false && this.registry.size > 0) {
      const validation = this.registry.validate();
      for (const w of validation.warnings) console.warn(`[AgentE] Registry warning: ${w}`);
      for (const e of validation.errors) console.error(`[AgentE] Registry error: ${e}`);
    }

    this.executor = new Executor(config.settlementWindowTicks);
    this.simulator = new Simulator(this.registry, config.simulation);

    // Wire up config callbacks
    if (config.onDecision) this.on('decision', config.onDecision as never);
    if (config.onAlert) this.on('alert', config.onAlert as never);
    if (config.onRollback) this.on('rollback', config.onRollback as never);

    // Lock dominant roles from population suppression by locking reward parameter adjustments
    // (structural protection — dominant roles' key param won't be suppressed)
    if (config.dominantRoles && config.dominantRoles.length > 0) {
      // Mark dominant roles as protected (used in Diagnoser context)
      // This is a lightweight approach — in production, principles query this list.
    }
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  connect(adapter: EconomyAdapter): this {
    this.adapter = adapter;

    // Wire up event stream if adapter supports it
    if (adapter.onEvent) {
      adapter.onEvent(event => this.ingest(event));
    }

    return this;
  }

  start(): this {
    if (!this.adapter) throw new Error('[AgentE] Call .connect(adapter) before .start()');
    this.isRunning = true;
    this.isPaused = false;
    return this;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
  }

  // ── Main cycle (call once per tick from your economy loop) ─────────────────

  async tick(state?: EconomyState): Promise<void> {
    if (!this.isRunning || this.isPaused) return;

    // Fetch state if not provided (polling mode)
    const currentState = state ?? (await Promise.resolve(this.adapter.getState()));
    this.currentTick = currentState.tick;

    // Drain event buffer (atomic swap — no window for lost events)
    const events = this.eventBuffer;
    this.eventBuffer = [];

    // Estimate satisfaction if developer didn't provide it
    this.satisfactionEstimator.update(currentState, events);
    if (!currentState.agentSatisfaction || Object.keys(currentState.agentSatisfaction).length === 0) {
      currentState.agentSatisfaction = this.satisfactionEstimator.getEstimates();
    }

    // PersonaTracker ingests events first (needed as fallback for Observer)
    this.personaTracker.update(currentState, events);
    const personaDist = this.personaTracker.getDistribution(currentState.tick);

    // Stage 1: Observe
    let metrics: EconomyMetrics;
    try {
      metrics = this.observer.compute(currentState, events, personaDist);
    } catch (err) {
      console.error(`[AgentE] Observer.compute() failed at tick ${currentState.tick}:`, err);
      return; // skip this tick, don't crash the loop
    }
    this.store.record(metrics);
    metrics.personaDistribution = personaDist;

    // Check rollbacks on active plans
    const { rolledBack, settled } = await this.executor.checkRollbacks(metrics, this.adapter);
    for (const plan of rolledBack) {
      this.planner.recordRolledBack(plan);
      this.emit('rollback', plan, 'rollback condition triggered');
    }
    for (const plan of settled) {
      this.planner.recordSettled(plan);
    }

    // Grace period — no interventions
    if (metrics.tick < this.config.gracePeriod) return;

    // Only run the full pipeline every checkInterval ticks
    if (metrics.tick % this.config.checkInterval !== 0) return;

    // Stage 2: Diagnose
    const diagnoses = this.diagnoser.diagnose(metrics, this.thresholds);

    // Alert on all violations (regardless of whether we act)
    for (const diagnosis of diagnoses) {
      this.emit('alert', diagnosis);
    }

    // Only act on the top-priority issue (prevents oscillation from multi-action)
    const topDiagnosis = diagnoses[0];
    if (!topDiagnosis) return;

    // Stage 3: Simulate
    const simulationResult = this.simulator.simulate(
      topDiagnosis.violation.suggestedAction,
      metrics,
      this.thresholds,
      100, // always >= minimum (P43)
      20,
    );

    // Stage 4: Plan
    const plan = this.planner.plan(
      topDiagnosis,
      metrics,
      simulationResult,
      this.params,
      this.thresholds,
      this.registry,
    );

    if (!plan) {
      // Log the skip
      let reason = 'skipped_cooldown';
      if (!simulationResult.netImprovement) reason = 'skipped_simulation_failed';
      this.log.recordSkip(topDiagnosis, reason as never, metrics, `Skipped: ${reason}`);
      return;
    }

    // Advisor mode: emit recommendation, don't apply
    if (this.mode === 'advisor') {
      const entry = this.log.record(topDiagnosis, plan, 'skipped_override', metrics);
      this.emit('decision', entry);
      return;
    }

    // beforeAction hook — veto if handler returns false
    const vetoed = this.emit('beforeAction', plan);
    if (vetoed === false) {
      this.log.recordSkip(topDiagnosis, 'skipped_override', metrics, 'vetoed by beforeAction hook');
      return;
    }

    // Stage 5: Execute
    await this.executor.apply(plan, this.adapter, this.params);
    this.params[plan.parameter] = plan.targetValue;
    this.registry.updateValue(plan.parameter, plan.targetValue);
    this.planner.recordApplied(plan, metrics.tick);

    const entry = this.log.record(topDiagnosis, plan, 'applied', metrics);
    this.emit('decision', entry);
    this.emit('afterAction', entry);
  }

  /** Apply a plan manually (for advisor mode) */
  async apply(plan: ActionPlan): Promise<void> {
    await this.executor.apply(plan, this.adapter, this.params);
    this.params[plan.parameter] = plan.targetValue;
    this.registry.updateValue(plan.parameter, plan.targetValue);
    this.planner.recordApplied(plan, this.currentTick);
  }

  // ── Developer API ───────────────────────────────────────────────────────────

  lock(param: string): void {
    this.planner.lock(param);
  }

  unlock(param: string): void {
    this.planner.unlock(param);
  }

  constrain(param: string, bounds: { min: number; max: number }): void {
    this.planner.constrain(param, bounds);
  }

  addPrinciple(principle: Principle): void {
    this.diagnoser.addPrinciple(principle);
  }

  setMode(mode: AgentEMode): void {
    this.mode = mode;
  }

  getMode(): AgentEMode {
    return this.mode;
  }

  removePrinciple(id: string): void {
    this.diagnoser.removePrinciple(id);
  }

  registerParameter(param: RegisteredParameter): void {
    this.registry.register(param);
  }

  getRegistry(): ParameterRegistry {
    return this.registry;
  }

  registerCustomMetric(name: string, fn: (state: EconomyState) => number): void {
    this.observer.registerCustomMetric(name, fn);
  }

  getDecisions(filter?: Parameters<DecisionLog['query']>[0]): DecisionEntry[] {
    return this.log.query(filter);
  }

  getPrinciples(): Principle[] {
    return this.diagnoser.getPrinciples();
  }

  getActivePlans(): ActionPlan[] {
    return this.executor.getActivePlans();
  }

  /** Access to the metric time-series store */
  readonly metrics = {
    query: (q: MetricQuery): MetricQueryResult => this.store.query(q),
    latest: (resolution?: 'fine' | 'medium' | 'coarse') => this.store.latest(resolution),
  };

  // ── Events ──────────────────────────────────────────────────────────────────

  private static readonly MAX_HANDLERS_PER_EVENT = 100;

  on(event: EventName, handler: (...args: unknown[]) => unknown): this {
    const list = this.handlers.get(event) ?? [];
    if (!list.includes(handler)) {
      if (list.length >= AgentE.MAX_HANDLERS_PER_EVENT) {
        throw new Error(`[AgentE] Max ${AgentE.MAX_HANDLERS_PER_EVENT} handlers per event reached for '${event}'`);
      }
      list.push(handler);
    }
    this.handlers.set(event, list);
    return this;
  }

  off(event: EventName, handler: (...args: unknown[]) => unknown): this {
    const list = this.handlers.get(event) ?? [];
    this.handlers.set(event, list.filter(h => h !== handler));
    return this;
  }

  private emit(event: EventName, ...args: unknown[]): unknown {
    const list = this.handlers.get(event) ?? [];
    let result: unknown;
    for (const handler of list) {
      try {
        result = handler(...args);
        if (result === false) return false; // veto
      } catch (err) {
        console.error(`[AgentE] Handler error on '${event}':`, err);
      }
    }
    return result;
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  diagnoseNow(): ReturnType<Diagnoser['diagnose']> {
    const metrics = this.store.latest();
    return this.diagnoser.diagnose(metrics, this.thresholds);
  }

  getHealth(): number {
    const m = this.store.latest();
    if (m.tick === 0) return 100;
    let health = 100;
    if (m.avgSatisfaction < 65) health -= 15;
    if (m.avgSatisfaction < 50) health -= 10;
    if (m.giniCoefficient > 0.45) health -= 15;
    if (m.giniCoefficient > 0.60) health -= 10;
    if (Math.abs(m.netFlow) > 10) health -= 15;
    if (Math.abs(m.netFlow) > 20) health -= 10;
    if (m.churnRate > 0.05) health -= 15;
    return Math.max(0, Math.min(100, health));
  }

  // ── Ingest events directly (event-driven mode) ───────────────────────────

  ingest(event: EconomicEvent): void {
    // Reject oversized metadata to prevent memory DoS
    if (event.metadata && Object.keys(event.metadata).length > AgentE.MAX_EVENT_METADATA_KEYS) {
      return;
    }
    if (this.eventBuffer.length >= AgentE.MAX_EVENT_BUFFER) {
      this.eventBuffer.shift(); // evict oldest
    }
    this.eventBuffer.push(event);
  }
}
