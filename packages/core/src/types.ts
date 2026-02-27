// ─────────────────────────────────────────────────────────────────────────────
// AgentE Core Types
// Every other file imports from here. Keep this file pure (no logic).
// ─────────────────────────────────────────────────────────────────────────────

// ── Events ───────────────────────────────────────────────────────────────────

export type EconomicEventType =
  | 'trade'
  | 'mint'
  | 'burn'
  | 'transfer'
  | 'produce'
  | 'consume'
  | 'role_change'
  | 'enter'
  | 'churn';

export interface EconomicEvent {
  type: EconomicEventType;
  timestamp: number;          // tick or unix ms — adapter decides
  actor: string;              // agent/user/wallet ID
  role?: string;              // actor's role in the economy
  resource?: string;          // what resource is involved
  currency?: string;          // which currency this event affects (defaults to first in currencies[])
  amount?: number;            // quantity
  price?: number;             // per-unit price (in the event's currency)
  from?: string;              // source (for transfers)
  to?: string;                // destination
  system?: string;            // which subsystem generated this event
  sourceOrSink?: string;      // named source/sink for flow attribution
  metadata?: Record<string, unknown>;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export type PinchPointStatus = 'optimal' | 'oversupplied' | 'scarce';

export interface EconomyMetrics {
  // ── Snapshot info ──
  tick: number;
  timestamp: number;
  currencies: string[];                              // all tracked currencies this tick

  // ── Currency health (per-currency) ──
  totalSupplyByCurrency: Record<string, number>;     // currency → total supply
  netFlowByCurrency: Record<string, number>;         // currency → faucets minus sinks
  velocityByCurrency: Record<string, number>;        // currency → transactions / supply
  inflationRateByCurrency: Record<string, number>;   // currency → % change per period
  faucetVolumeByCurrency: Record<string, number>;    // currency → inflow volume
  sinkVolumeByCurrency: Record<string, number>;      // currency → outflow volume
  tapSinkRatioByCurrency: Record<string, number>;    // currency → faucet / sink ratio
  anchorRatioDriftByCurrency: Record<string, number>;// currency → anchor drift

  // ── Currency health (aggregate convenience — sum/avg of all currencies) ──
  totalSupply: number;
  netFlow: number;
  velocity: number;
  inflationRate: number;
  faucetVolume: number;
  sinkVolume: number;
  tapSinkRatio: number;
  anchorRatioDrift: number;

  // ── Wealth distribution (per-currency) ──
  giniCoefficientByCurrency: Record<string, number>;
  medianBalanceByCurrency: Record<string, number>;
  meanBalanceByCurrency: Record<string, number>;
  top10PctShareByCurrency: Record<string, number>;
  meanMedianDivergenceByCurrency: Record<string, number>;

  // ── Wealth distribution (aggregate convenience) ──
  giniCoefficient: number;
  medianBalance: number;
  meanBalance: number;
  top10PctShare: number;
  meanMedianDivergence: number;

  // ── Population health (unchanged — not currency-specific) ──
  populationByRole: Record<string, number>;
  roleShares: Record<string, number>;
  totalAgents: number;
  churnRate: number;
  churnByRole: Record<string, number>;
  personaDistribution: Record<string, number>;

  // ── Market health (per-currency prices) ──
  priceIndexByCurrency: Record<string, number>;      // currency → equal-weight price basket
  pricesByCurrency: Record<string, Record<string, number>>;  // currency → resource → price
  priceVolatilityByCurrency: Record<string, Record<string, number>>; // currency → resource → volatility

  // ── Market health (aggregate convenience) ──
  priceIndex: number;
  prices: Record<string, number>;                    // first currency's prices (backward compat)
  priceVolatility: Record<string, number>;           // first currency's volatility

  // ── Market health (unchanged — resource-keyed, not currency-specific) ──
  productionIndex: number;
  capacityUsage: number;
  supplyByResource: Record<string, number>;
  demandSignals: Record<string, number>;
  pinchPoints: Record<string, PinchPointStatus>;

  // ── Satisfaction / Engagement (unchanged) ──
  avgSatisfaction: number;
  blockedAgentCount: number;
  timeToValue: number;

  // ── Pools (per-currency) ──
  poolSizesByCurrency: Record<string, Record<string, number>>; // pool → currency → amount
  poolSizes: Record<string, number>;                 // aggregate: pool → sum of all currencies

  // ── Open economy (per-currency) ──
  extractionRatioByCurrency: Record<string, number>;
  newUserDependencyByCurrency: Record<string, number>;
  currencyInsulationByCurrency: Record<string, number>;

  // ── Open economy (aggregate convenience) ──
  extractionRatio: number;
  newUserDependency: number;
  smokeTestRatio: number;
  currencyInsulation: number;

  // ── Operations (unchanged) ──
  cyclicalPeaks: number[];
  cyclicalValleys: number[];
  eventCompletionRate: number;

  // ── V1.1 Metrics (per-currency where applicable) ──
  arbitrageIndexByCurrency: Record<string, number>;  // per-currency cross-resource arbitrage
  arbitrageIndex: number;                            // aggregate
  contentDropAge: number;                            // unchanged (not currency-specific)
  giftTradeRatioByCurrency: Record<string, number>;
  giftTradeRatio: number;
  disposalTradeRatioByCurrency: Record<string, number>;
  disposalTradeRatio: number;

  // ── Topology (from EconomyState) ──
  systems: string[];                              // registered systems
  sources: string[];                              // registered source names
  sinks: string[];                                // registered sink names

  // ── Multi-system metrics ──
  flowBySystem: Record<string, number>;           // system → net flow
  activityBySystem: Record<string, number>;       // system → event count
  participantsBySystem: Record<string, number>;    // system → unique actor count
  flowBySource: Record<string, number>;            // source → inflow volume
  flowBySink: Record<string, number>;              // sink → outflow volume
  sourceShare: Record<string, number>;             // source → fraction of total inflow
  sinkShare: Record<string, number>;               // sink → fraction of total outflow

  // ── Custom metrics registered by developer ──
  custom: Record<string, number>;
}

// Sensible defaults for an EconomyMetrics snapshot when data is unavailable
export function emptyMetrics(tick = 0): EconomyMetrics {
  return {
    tick,
    timestamp: Date.now(),
    currencies: [],

    // Per-currency
    totalSupplyByCurrency: {},
    netFlowByCurrency: {},
    velocityByCurrency: {},
    inflationRateByCurrency: {},
    faucetVolumeByCurrency: {},
    sinkVolumeByCurrency: {},
    tapSinkRatioByCurrency: {},
    anchorRatioDriftByCurrency: {},
    giniCoefficientByCurrency: {},
    medianBalanceByCurrency: {},
    meanBalanceByCurrency: {},
    top10PctShareByCurrency: {},
    meanMedianDivergenceByCurrency: {},
    priceIndexByCurrency: {},
    pricesByCurrency: {},
    priceVolatilityByCurrency: {},
    poolSizesByCurrency: {},
    extractionRatioByCurrency: {},
    newUserDependencyByCurrency: {},
    currencyInsulationByCurrency: {},
    arbitrageIndexByCurrency: {},
    giftTradeRatioByCurrency: {},
    disposalTradeRatioByCurrency: {},

    // Aggregates
    totalSupply: 0,
    netFlow: 0,
    velocity: 0,
    inflationRate: 0,
    faucetVolume: 0,
    sinkVolume: 0,
    tapSinkRatio: 1,
    anchorRatioDrift: 0,
    giniCoefficient: 0,
    medianBalance: 0,
    meanBalance: 0,
    top10PctShare: 0,
    meanMedianDivergence: 0,
    priceIndex: 0,
    prices: {},
    priceVolatility: {},
    poolSizes: {},
    extractionRatio: 0,
    newUserDependency: 0,
    smokeTestRatio: 0,
    currencyInsulation: 0,
    arbitrageIndex: 0,
    giftTradeRatio: 0,
    disposalTradeRatio: 0,

    // Unchanged
    populationByRole: {},
    roleShares: {},
    totalAgents: 0,
    churnRate: 0,
    churnByRole: {},
    personaDistribution: {},
    productionIndex: 0,
    capacityUsage: 0,
    supplyByResource: {},
    demandSignals: {},
    pinchPoints: {},
    avgSatisfaction: 100,
    blockedAgentCount: 0,
    timeToValue: 0,
    cyclicalPeaks: [],
    cyclicalValleys: [],
    eventCompletionRate: 0,
    contentDropAge: 0,
    systems: [],
    sources: [],
    sinks: [],
    flowBySystem: {},
    activityBySystem: {},
    participantsBySystem: {},
    flowBySource: {},
    flowBySink: {},
    sourceShare: {},
    sinkShare: {},
    custom: {},
  };
}

// ── Principles ────────────────────────────────────────────────────────────────

export type PrincipleCategory =
  | 'supply_chain'
  | 'incentive'
  | 'population'
  | 'currency'
  | 'bootstrap'
  | 'feedback'
  | 'regulator'
  | 'market_dynamics'
  | 'measurement'
  | 'wealth_distribution'
  | 'resource'
  | 'system_design'
  | 'participant_experience'
  | 'statistical'
  | 'system_dynamics'
  | 'open_economy'
  | 'operations';

export interface PrincipleViolation {
  violated: true;
  severity: number;                 // 1–10
  evidence: Record<string, unknown>;
  suggestedAction: SuggestedAction;
  confidence: number;               // 0–1
  estimatedLag?: number;            // ticks before effect visible
}

export interface PrincipleOk {
  violated: false;
}

export type PrincipleResult = PrincipleViolation | PrincipleOk;

export interface Principle {
  id: string;                       // 'P1', 'P2', ... 'P54', or custom
  name: string;
  category: PrincipleCategory;
  description: string;
  check: (metrics: EconomyMetrics, thresholds: Thresholds) => PrincipleResult;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export interface SuggestedAction {
  parameterType: import('./ParameterRegistry.js').ParameterType;
  direction: 'increase' | 'decrease' | 'set';
  magnitude?: number;               // fractional (0.15 = 15%)
  absoluteValue?: number;
  scope?: Partial<import('./ParameterRegistry.js').ParameterScope>;
  resolvedParameter?: string;       // filled by Planner after registry resolution
  reasoning: string;
}

export interface ActionPlan {
  id: string;
  diagnosis: Diagnosis;
  parameter: string;
  scope?: import('./ParameterRegistry.js').ParameterScope;
  currentValue: number;
  targetValue: number;
  maxChangePercent: number;
  cooldownTicks: number;
  rollbackCondition: RollbackCondition;
  simulationResult: SimulationResult;
  estimatedLag: number;
  appliedAt?: number;               // tick when applied
}

export interface RollbackCondition {
  metric: keyof EconomyMetrics | string;  // what to watch
  direction: 'above' | 'below';
  threshold: number;
  checkAfterTick: number;           // don't check until this tick
}

// ── Diagnosis ────────────────────────────────────────────────────────────────

export interface Diagnosis {
  principle: Principle;
  violation: PrincipleViolation;
  tick: number;
}

// ── Simulation ───────────────────────────────────────────────────────────────

export interface SimulationOutcome {
  p10: EconomyMetrics;
  p50: EconomyMetrics;
  p90: EconomyMetrics;
  mean: EconomyMetrics;
}

export interface SimulationResult {
  proposedAction: SuggestedAction;
  iterations: number;
  forwardTicks: number;
  outcomes: SimulationOutcome;
  netImprovement: boolean;
  noNewProblems: boolean;
  confidenceInterval: [number, number];
  estimatedEffectTick: number;
  overshootRisk: number;            // 0–1
}

// ── Decision Log ─────────────────────────────────────────────────────────────

export type DecisionResult =
  | 'applied'
  | 'skipped_cooldown'
  | 'skipped_simulation_failed'
  | 'skipped_locked'
  | 'skipped_override'
  | 'rolled_back'
  | 'rejected';

export interface DecisionEntry {
  id: string;
  tick: number;
  timestamp: number;
  diagnosis: Diagnosis;
  plan: ActionPlan;
  result: DecisionResult;
  reasoning: string;
  metricsSnapshot: EconomyMetrics;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export interface EconomyState {
  tick: number;
  roles: string[];
  resources: string[];
  currencies: string[];                                      // e.g. ['gold', 'gems', 'stakingToken']
  agentBalances: Record<string, Record<string, number>>;     // agentId → { currencyName → balance }
  agentRoles: Record<string, string>;
  agentInventories: Record<string, Record<string, number>>;
  agentSatisfaction?: Record<string, number>;
  marketPrices: Record<string, Record<string, number>>;      // currencyName → { resource → price }
  recentTransactions: EconomicEvent[];
  poolSizes?: Record<string, Record<string, number>>;        // poolName → { currencyName → amount }
  systems?: string[];                                        // e.g. ['marketplace', 'staking', 'production']
  sources?: string[];                                        // named faucet sources
  sinks?: string[];                                          // named sink channels
  customData?: Record<string, unknown>;
}

export interface EconomyAdapter {
  /** Return current full state snapshot */
  getState(): EconomyState | Promise<EconomyState>;
  /** Apply a parameter change to the host system */
  setParam(key: string, value: number, scope?: import('./ParameterRegistry.js').ParameterScope): void | Promise<void>;
  /** Optional: adapter pushes events as they happen */
  onEvent?: (handler: (event: EconomicEvent) => void) => void;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export interface Thresholds {
  // Statistical (P42-P43)
  meanMedianDivergenceMax: number;
  simulationMinIterations: number;

  // Population (P46)
  personaMonocultureMax: number;
  personaMinClusters: number;

  // Open Economy (P34, P47-P48)
  extractionRatioYellow: number;
  extractionRatioRed: number;
  smokeTestWarning: number;
  smokeTestCritical: number;
  currencyInsulationMax: number;

  // Participant Experience (P45, P50)
  timeBudgetRatio: number;
  payPowerRatioMax: number;
  payPowerRatioTarget: number;

  // Operations (P51, P53)
  cyclicalPeakDecay: number;
  cyclicalValleyDecay: number;
  eventCompletionMin: number;
  eventCompletionMax: number;

  // System Dynamics (P39, P44)
  lagMultiplierMin: number;
  lagMultiplierMax: number;
  complexityBudgetMax: number;

  // Resource (P40)
  replacementRateMultiplier: number;

  // Regulator (P26-P27)
  maxAdjustmentPercent: number;
  cooldownTicks: number;

  // Currency (P13)
  poolWinRate: number;              // generic: win rate for pools (competitive, liquidity, staking, etc.)
  poolOperatorShare: number;        // generic: operator's share of pool proceeds

  // Population balance (P9)
  roleSwitchFrictionMax: number;

  // Pool limits (P15)
  poolCapPercent: number;
  poolDecayRate: number;

  // Profitability (P5)
  stampedeProfitRatio: number;   // if one role's profit > X× others → stampede risk

  // Satisfaction (P24)
  blockedAgentMaxFraction: number;

  // Gini (P33)
  giniWarnThreshold: number;
  giniRedThreshold: number;

  // Churn (P9)
  churnWarnRate: number;

  // Net flow (P12)
  netFlowWarnThreshold: number;

  // V1.1 Thresholds (P55-P60)
  arbitrageIndexWarning: number;          // P55: yellow alert
  arbitrageIndexCritical: number;         // P55: red alert
  contentDropCooldownTicks: number;       // P56: ticks to wait after drop before measuring
  postDropArbitrageMax: number;           // P56: max acceptable arbitrage during cooldown
  relativePriceConvergenceTarget: number; // P57: fraction of relative prices within ±20% of equilibrium
  priceDiscoveryWindowTicks: number;      // P57: ticks to allow for distributed price discovery
  giftTradeFilterRatio: number;           // P59: max gift-trade fraction before filtering kicks in
  disposalTradeWeightDiscount: number;    // P60: multiplier applied to disposal-trade price signals (0–1)

  // Structural dominance (P8)
  dominantRoles: string[];                // roles that are dominant by design — exempt from crowding pressure
}

// ── Tick Configuration ───────────────────────────────────────────────────────

export interface TickConfig {
  /** How many real-world units one tick represents. Default: 1 */
  duration: number;
  /** The unit of time. Default: 'tick' (abstract). Examples: 'second', 'minute', 'block', 'frame' */
  unit: string;
  /** Medium-resolution metric window in ticks. Default: 10 */
  mediumWindow?: number;
  /** Coarse-resolution metric window in ticks. Default: 100 */
  coarseWindow?: number;
}

// ── AgentE Config ─────────────────────────────────────────────────────────────

// ── Simulation Config ─────────────────────────────────────────────────────────

export interface SimulationConfig {
  sinkMultiplier?: number;              // default 0.20
  faucetMultiplier?: number;            // default 0.15
  frictionMultiplier?: number;          // default 0.10
  frictionVelocityScale?: number;       // default 10
  redistributionMultiplier?: number;    // default 0.30
  neutralMultiplier?: number;           // default 0.05
  minIterations?: number;               // default 100
  maxProjectionTicks?: number;          // default 20
}

export type AgentEMode = 'autonomous' | 'advisor';

export interface AgentEConfig {
  adapter: EconomyAdapter;
  mode?: AgentEMode;

  /** V1.8: Optional LLM provider for natural-language intelligence. */
  llm?: import('./llm/LLMProvider.js').LLMConfig;

  // Economy structure hints
  dominantRoles?: string[];           // roles exempt from population caps
  idealDistribution?: Record<string, number>;

  // Parameter registry
  parameters?: import('./ParameterRegistry.js').RegisteredParameter[];
  /** Run registry.validate() on startup and log warnings/errors (default: true) */
  validateRegistry?: boolean;

  // Tick configuration
  tickConfig?: Partial<TickConfig>;

  // Timing
  gracePeriod?: number;               // ticks before first intervention (default 50)
  checkInterval?: number;             // ticks between checks (default 5)

  // Tuning
  maxAdjustmentPercent?: number;
  cooldownTicks?: number;

  // Simulation tuning
  simulation?: SimulationConfig;

  // Executor settlement window (ticks before plan auto-settles; default: 200)
  settlementWindowTicks?: number;

  // Thresholds overrides (partial — merged with defaults)
  thresholds?: Partial<Thresholds>;

  // Callbacks
  onDecision?: (entry: DecisionEntry) => void;
  onAlert?: (diagnosis: Diagnosis) => void;
  onRollback?: (plan: ActionPlan, reason: string) => void;
}

// ── Persona Types ─────────────────────────────────────────────────────────────

export type PersonaType =
  | 'Whale'
  | 'ActiveTrader'
  | 'Accumulator'
  | 'Spender'
  | 'NewEntrant'
  | 'AtRisk'
  | 'Dormant'
  | 'PowerUser'
  | 'Passive'
  | string;           // extensible — adapters can add domain-specific labels

export interface PersonaProfile {
  type: PersonaType;
  share: number;           // fraction of total
  healthyRangeMin: number;
  healthyRangeMax: number;
}

// ── Metric Query ──────────────────────────────────────────────────────────────

export type MetricResolution = 'fine' | 'medium' | 'coarse';

export interface MetricQuery {
  metric: keyof EconomyMetrics | string;
  from?: number;           // tick
  to?: number;             // tick
  resolution?: MetricResolution;
}

export interface MetricQueryResult {
  metric: string;
  resolution: MetricResolution;
  points: Array<{ tick: number; value: number }>;
}
