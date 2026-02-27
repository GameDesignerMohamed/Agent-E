#!/usr/bin/env node

// CLI entry point for @agent-e/server
// Usage: npx @agent-e/server
//        npx agent-e-server
//        node dist/cli.js

import { AgentEServer } from './AgentEServer.js';

const port = parseInt(process.env['AGENTE_PORT'] ?? '3100', 10);
const host = process.env['AGENTE_HOST'] ?? '127.0.0.1';
const mode = process.env['AGENTE_MODE'] === 'advisor' ? 'advisor' as const : 'autonomous' as const;

const server = new AgentEServer({
  port,
  host,
  agentE: { mode },
});

server.start().catch((err) => {
  console.error('[AgentE Server] Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[AgentE Server] Shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
