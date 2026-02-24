export { AgentEServer } from './AgentEServer.js';
export type { ServerConfig, EnrichedAdjustment } from './AgentEServer.js';

/**
 * Quick-start helper — creates and starts an AgentE server.
 *
 * @example
 * ```ts
 * import { startServer } from '@agent-e/server';
 * const server = await startServer({ port: 3100 });
 * // POST /tick, GET /health, etc.
 * ```
 */
export async function startServer(
  config?: import('./AgentEServer.js').ServerConfig,
): Promise<import('./AgentEServer.js').AgentEServer> {
  const { AgentEServer } = await import('./AgentEServer.js');
  const server = new AgentEServer(config);
  await server.start();
  return server;
}
