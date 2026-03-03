// @agent-e/core — main entry point

export { AgentE } from './AgentE.js';
export { Observer } from './Observer.js';
export { Diagnoser } from './Diagnoser.js';
export { Simulator } from './Simulator.js';
export { Planner } from './Planner.js';
export { Executor } from './Executor.js';
export { DecisionLog } from './DecisionLog.js';
export { MetricStore } from './MetricStore.js';
export { PersonaTracker } from './PersonaTracker.js';
export type { PersonaConfig } from './PersonaTracker.js';
export { SatisfactionEstimator } from './SatisfactionEstimator.js';
export type { SatisfactionConfig } from './SatisfactionEstimator.js';
export { ParameterRegistry } from './ParameterRegistry.js';
export type { ParameterType, FlowImpact, ParameterScope, RegisteredParameter, RegistryValidationResult } from './ParameterRegistry.js';
export type { ExecutionResult } from './Executor.js';
export { findWorstSystem } from './utils.js';
export { validateEconomyState } from './StateValidator.js';
export type { ValidationError, ValidationWarning, ValidationResult } from './StateValidator.js';
export { DEFAULT_THRESHOLDS, PERSONA_HEALTHY_RANGES } from './defaults.js';
export { ALL_PRINCIPLES } from './principles/index.js';
export * from './principles/index.js';
export * from './types.js';

// V1.8: LLM Intelligence Layer
export { DiagnosisNarrator, PlanExplainer, AnomalyInterpreter, resolveFeatureFlags } from './llm/index.js';
export type {
  LLMProvider,
  LLMProviderConfig,
  LLMFeatureFlags,
  LLMConfig,
  NarratedDiagnosis,
  ExplainedPlan,
  MetricAnomaly,
  AnomalyReport,
} from './llm/index.js';
