// @agent-e/pro — Pro Edition (BUSL-1.1)
// Full 60-principle engine with metered billing.

// Re-export full engine API (types, classes, constants)
export * from '@agent-e/engine';

// ── Gated factory ────────────────────────────────────────────────────────────

import { AgentE, COMMUNITY_PRINCIPLES } from '@agent-e/engine';
import type { AgentEConfig } from '@agent-e/engine';

/**
 * Create a Pro AgentE instance.
 *
 * - With a valid `apiKey`: loads all 60 principles, usage is metered.
 * - Without `apiKey`: falls back to Community mode (5 principles) with a warning.
 *
 * @example
 * ```ts
 * import { createProAgent } from '@agent-e/pro';
 *
 * const engine = createProAgent({
 *   adapter: myAdapter,
 *   apiKey: process.env.AGENTE_API_KEY,
 * });
 * ```
 *
 * @see https://agente.dev/pro — get your API key
 */
export function createProAgent(
  config: Omit<AgentEConfig, 'principles'>,
): AgentE {
  if (!config.apiKey) {
    console.warn(
      '[AgentE Pro] No API key provided — running in Community mode (5 principles).\n'
      + 'Get your API key at https://agente.dev/pro',
    );
    return new AgentE({ ...config, principles: COMMUNITY_PRINCIPLES });
  }

  // API key present → full 60 principles + metering.
  // MeterClient is initialized inside the AgentE constructor (see engine/AgentE.ts).
  return new AgentE(config);
}
