// @agent-e/core v2.0.0 — Community Edition (MIT)
// Re-exports the full engine API + community-specific helpers.

export {
  // Core orchestrator
  AgentE,

  // Pipeline stages
  Observer,
  Diagnoser,
  Simulator,
  Planner,
  Executor,

  // Supporting classes
  DecisionLog,
  MetricStore,
  PersonaTracker,
  SatisfactionEstimator,
  ParameterRegistry,

  // Utilities
  findWorstSystem,
  validateEconomyState,
  DEFAULT_THRESHOLDS,
  PERSONA_HEALTHY_RANGES,

  // Principles
  ALL_PRINCIPLES,
  COMMUNITY_PRINCIPLES,

  // V1.8 LLM Intelligence Layer
  DiagnosisNarrator,
  PlanExplainer,
  AnomalyInterpreter,
  resolveFeatureFlags,
} from '@agent-e/engine';

// Re-export all types
export type {
  // Config & core types
  AgentEConfig,
  AgentEMode,
  EconomyAdapter,
  EconomyState,
  EconomyMetrics,
  EconomicEvent,
  EconomicEventType,
  Principle,
  PrincipleResult,
  Diagnosis,
  ActionPlan,
  DecisionEntry,
  Thresholds,

  // Registry types
  ParameterType,
  FlowImpact,
  ParameterScope,
  RegisteredParameter,
  RegistryValidationResult,

  // Execution
  ExecutionResult,

  // Validation
  ValidationError,
  ValidationWarning,
  ValidationResult,

  // Persona
  PersonaConfig,
  SatisfactionConfig,

  // Metric queries
  MetricQuery,
  MetricQueryResult,

  // LLM types
  LLMProvider,
  LLMProviderConfig,
  LLMFeatureFlags,
  LLMConfig,
  NarratedDiagnosis,
  ExplainedPlan,
  MetricAnomaly,
  AnomalyReport,
} from '@agent-e/engine';

import { AgentE, COMMUNITY_PRINCIPLES } from '@agent-e/engine';
import type { AgentEConfig } from '@agent-e/engine';

/**
 * Create an AgentE instance pre-configured with the 5 Community principles.
 *
 * Equivalent to `new AgentE({ ...config, principles: COMMUNITY_PRINCIPLES })`.
 */
export function createCommunityAgent(config: Omit<AgentEConfig, 'principles'>): AgentE {
  return new AgentE({ ...config, principles: COMMUNITY_PRINCIPLES });
}
