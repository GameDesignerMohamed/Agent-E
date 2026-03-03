// ─────────────────────────────────────────────────────────────────────────────
// LLM Provider — abstract interface for any LLM backend
// AgentE never talks to a model directly. The developer supplies a provider
// that wraps their chosen backend (Together, Ollama, OpenAI, whatever).
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMProviderConfig {
  /** Max tokens per request. Provider should respect this. Default: 256. */
  maxTokens?: number;
  /** Temperature (0–1). Lower = more deterministic. Default: 0.3. */
  temperature?: number;
  /** Timeout in ms. Default: 10_000. */
  timeoutMs?: number;
}

export interface LLMProvider {
  /**
   * Send a prompt and get a text completion back.
   * The provider handles all auth, retries, and model selection internally.
   * Must reject or return empty string on failure — never throw unhandled.
   */
  complete(prompt: string, config?: LLMProviderConfig): Promise<string>;
}

/** Config for which LLM features are enabled */
export interface LLMFeatureFlags {
  diagnosisNarration: boolean;
  planExplanation: boolean;
  anomalyInterpretation: boolean;
}

/** Full LLM config as provided in AgentEConfig */
export interface LLMConfig {
  provider: LLMProvider;
  features?: Partial<LLMFeatureFlags>;
  config?: LLMProviderConfig;
}

/** Resolve partial feature flags to full flags (all default to true) */
export function resolveFeatureFlags(partial?: Partial<LLMFeatureFlags>): LLMFeatureFlags {
  return {
    diagnosisNarration: partial?.diagnosisNarration ?? true,
    planExplanation: partial?.planExplanation ?? true,
    anomalyInterpretation: partial?.anomalyInterpretation ?? true,
  };
}
