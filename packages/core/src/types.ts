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
  | 'spawn'
  | 'churn';

export interface EconomicEvent {
  type: EconomicEventType;
  timestamp: number;          // tick or unix ms — adapter decides
  actor: string;              // agent/user/wallet ID
  role?: string;              // actor's role in the economy
  resource?: string;          // what resource is involved
  amount?: number;            // quantity
  price?: number;             // per-unit price
  from?: string;              // source (for transfers)
  to?: string;                // destination
  metadata?: Record<string, unknown>;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export type PinchPointStatus = 'optimal' | 'oversupplied' | 'scarce';

export interface EconomyMetrics {
  // ── Snapshot info ──
  tick: number;
  timestamp: number;

  // ── Currency health ──
  totalSupply: number;
  netFlow: number;               // faucets minus sinks per period
  velocity: number;              // transactions per period / total supply
  inflationRate: number;         // % change in price index per period

  // ── Population health ──
  populationByRole: Record<string, number>;
  roleShares: Record<string, number>;        // each role as fraction of total
  totalAgents: number;
  churnRate: number;                         // fraction lost per period
  churnByRole: Record<string, number>;
  personaDistribution: Record<string, number>;

  // ── Wealth distribution ──
  giniCoefficient: number;       // 0 = perfect equality, 1 = one agent has everything
  medianBalance: number;
  meanBalance: number;
  top10PctShare: number;         // fraction of wealth held by top 10%
  meanMedianDivergence: number;  // (mean - median) / median

  // ── Market health ──
  priceIndex: number;
  productionIndex: number;
  capacityUsage: number;
  prices: Record<string, number>;
  priceVolatility: Record<string, number>;
  supplyByResource: Record<string, number>;
  demandSignals: Record<string, number>;
  pinchPoints: Record<string, PinchPointStatus>;

  // ── Satisfaction / Engagement ──
  avgSatisfaction: number;
  blockedAgentCount: number;
  timeToValue: number;

  // ── Flow tracking ──
  faucetVolume: number;
  sinkVolume: number;
  tapSinkRatio: number;
  poolSizes: Record<string, number>;
  anchorRatioDrift: number;

  // ── Open economy (optional, NaN if not tracked) ──
  extractionRatio: number;
  newUserDependency: number;
  smokeTestRatio: number;
  currencyInsulation: number;

  // ── LiveOps (optional, empty arrays if not tracked) ──
  sharkToothPeaks: number[];
  sharkToothValleys: number[];
  eventCompletionRate: number;

  // ── Custom metrics registered by developer ──
  custom: Record<string, number>;
}

// Sensible defaults for an EconomyMetrics snapshot when data is unavailable
export function emptyMetrics(tick = 0): EconomyMetrics {
  return {
    tick,
    timestamp: Date.now(),
    totalSupply: 0,
    netFlow: 0,
    velocity: 0,
    inflationRate: 0,
    populationByRole: {},
    roleShares: {},
    totalAgents: 0,
    churnRate: 0,
    churnByRole: {},
    personaDistribution: {},
    giniCoefficient: 0,
    medianBalance: 0,
    meanBalance: 0,
    top10PctShare: 0,
    meanMedianDivergence: 0,
    priceIndex: 0,
    productionIndex: 0,
    capacityUsage: 0,
    prices: {},
    priceVolatility: {},
    supplyByResource: {},
    demandSignals: {},
    pinchPoints: {},
    avgSatisfaction: 100,
    blockedAgentCount: 0,
    timeToValue: 0,
    faucetVolume: 0,
    sinkVolume: 0,
    tapSinkRatio: 1,
    poolSizes: {},
    anchorRatioDrift: 0,
    extractionRatio: NaN,
    newUserDependency: NaN,
    smokeTestRatio: NaN,
    currencyInsulation: NaN,
    sharkToothPeaks: [],
    sharkToothValleys: [],
    eventCompletionRate: NaN,
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
  | 'player_experience'
  | 'statistical'
  | 'system_dynamics'
  | 'open_economy'
  | 'liveops';

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
  parameter: string;
  direction: 'increase' | 'decrease' | 'set';
  magnitude?: number;               // fractional (0.15 = 15%)
  absoluteValue?: number;
  reasoning: string;
}

export interface ActionPlan {
  id: string;
  diagnosis: Diagnosis;
  parameter: string;
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
  | 'rolled_back';

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
  currency: string;
  agentBalances: Record<string, number>;
  agentRoles: Record<string, string>;
  agentInventories: Record<string, Record<string, number>>;
  agentSatisfaction?: Record<string, number>;
  marketPrices: Record<string, number>;
  recentTransactions: EconomicEvent[];
  poolSizes?: Record<string, number>;
  customData?: Record<string, unknown>;
}

export interface EconomyAdapter {
  /** Return current full state snapshot */
  getState(): EconomyState | Promise<EconomyState>;
  /** Apply a parameter change to the host system */
  setParam(key: string, value: number): void | Promise<void>;
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

  // Player Experience (P45, P50)
  timeBudgetRatio: number;
  payPowerRatioMax: number;
  payPowerRatioTarget: number;

  // LiveOps (P51, P53)
  sharkToothPeakDecay: number;
  sharkToothValleyDecay: number;
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
  arenaWinRate: number;
  arenaHouseCut: number;

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
}

// ── AgentE Config ─────────────────────────────────────────────────────────────

export type AgentEMode = 'autonomous' | 'advisor';

export interface AgentEConfig {
  adapter: EconomyAdapter | 'game' | 'defi' | 'marketplace';
  mode?: AgentEMode;

  // Economy structure hints (helps grace period + fighter-exempt logic)
  dominantRoles?: string[];           // roles exempt from population caps (e.g. ['Fighter'])
  idealDistribution?: Record<string, number>;

  // Timing
  gracePeriod?: number;               // ticks before first intervention (default 50)
  checkInterval?: number;             // ticks between checks (default 5)

  // Tuning
  maxAdjustmentPercent?: number;
  cooldownTicks?: number;

  // Thresholds overrides (partial — merged with defaults)
  thresholds?: Partial<Thresholds>;

  // Callbacks
  onDecision?: (entry: DecisionEntry) => void;
  onAlert?: (diagnosis: Diagnosis) => void;
  onRollback?: (plan: ActionPlan, reason: string) => void;
}

// ── Persona Types ─────────────────────────────────────────────────────────────

export type PersonaType =
  | 'Gamer'
  | 'Trader'
  | 'Collector'
  | 'Speculator'
  | 'Earner'
  | 'Builder'
  | 'Social'
  | 'Whale'
  | 'Influencer';

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
