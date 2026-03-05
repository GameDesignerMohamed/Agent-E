// @agent-e/pro v2.0.2 — Pro Edition (BUSL-1.1)
// Full 60-principle engine, re-exported from @agent-e/engine.
// Pro billing not yet wired up — createProAgent() runs in Community mode.

export * from '@agent-e/engine';

import { AgentE, COMMUNITY_PRINCIPLES } from '@agent-e/engine';
import type { AgentEConfig } from '@agent-e/engine';

/**
 * Create an AgentE instance with Pro principles.
 *
 * **Note:** Pro billing is not yet available. Until it is, this factory
 * runs with the 5 Community principles. Use `new AgentE(...)` directly
 * if you need all 60 principles under the BSL-1.1 license.
 */
export function createProAgent(config: Omit<AgentEConfig, 'principles'>): AgentE {
  console.warn(
    '[@agent-e/pro] Pro billing is not yet available. ' +
    'Running in Community mode (5 principles). ' +
    'Follow https://github.com/GameDesignerMohamed/Agent-E-Pro for updates.'
  );
  return new AgentE({ ...config, principles: COMMUNITY_PRINCIPLES });
}
