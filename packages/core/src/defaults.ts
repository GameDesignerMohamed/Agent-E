import type { Thresholds } from './types.js';

export const DEFAULT_THRESHOLDS: Thresholds = {
  // Statistical (P42-P43)
  meanMedianDivergenceMax: 0.30,
  simulationMinIterations: 100,

  // Population (P46)
  personaMonocultureMax: 0.40,
  personaMinClusters: 3,

  // Open Economy (P34, P47-P48)
  extractionRatioYellow: 0.50,
  extractionRatioRed: 0.65,
  smokeTestWarning: 0.30,
  smokeTestCritical: 0.10,
  currencyInsulationMax: 0.50,

  // Player Experience (P45, P50)
  timeBudgetRatio: 0.80,
  payPowerRatioMax: 2.0,
  payPowerRatioTarget: 1.5,

  // LiveOps (P51, P53)
  sharkToothPeakDecay: 0.95,
  sharkToothValleyDecay: 0.90,
  eventCompletionMin: 0.40,
  eventCompletionMax: 0.80,

  // System Dynamics (P39, P44)
  lagMultiplierMin: 3,
  lagMultiplierMax: 5,
  complexityBudgetMax: 20,

  // Resource (P40)
  replacementRateMultiplier: 2.0,

  // Regulator (P26-P27)
  maxAdjustmentPercent: 0.15,
  cooldownTicks: 15,

  // Currency (P13)
  arenaWinRate: 0.65,
  arenaHouseCut: 0.10,

  // Population balance (P9)
  roleSwitchFrictionMax: 0.05,   // >5% of population switching in one period = herd

  // Pool limits (P15)
  poolCapPercent: 0.05,           // no pool > 5% of total currency
  poolDecayRate: 0.02,

  // Profitability (P5)
  stampedeProfitRatio: 3.0,       // one role's profit > 3× median → stampede risk

  // Satisfaction (P24)
  blockedAgentMaxFraction: 0.15,

  // Gini (P33)
  giniWarnThreshold: 0.45,
  giniRedThreshold: 0.60,

  // Churn (P9)
  churnWarnRate: 0.05,

  // Net flow (P12)
  netFlowWarnThreshold: 10,

  // V1.1 (P55-P60)
  arbitrageIndexWarning: 0.35,
  arbitrageIndexCritical: 0.55,
  contentDropCooldownTicks: 30,
  postDropArbitrageMax: 0.45,
  relativePriceConvergenceTarget: 0.85,
  priceDiscoveryWindowTicks: 20,
  giftTradeFilterRatio: 0.15,
  disposalTradeWeightDiscount: 0.5,
};

export const PERSONA_HEALTHY_RANGES: Record<string, { min: number; max: number }> = {
  Gamer:      { min: 0.20, max: 0.40 },
  Trader:     { min: 0.05, max: 0.15 },
  Collector:  { min: 0.05, max: 0.15 },
  Speculator: { min: 0.00, max: 0.10 },
  Earner:     { min: 0.00, max: 0.15 },
  Builder:    { min: 0.05, max: 0.15 },
  Social:     { min: 0.10, max: 0.20 },
  Whale:      { min: 0.00, max: 0.05 },
  Influencer: { min: 0.00, max: 0.05 },
};
