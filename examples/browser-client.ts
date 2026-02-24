/**
 * AgentE Browser/Node HTTP Client Example
 *
 * This example shows how to integrate AgentE with any application
 * that can make HTTP requests. Works in browsers and Node.js.
 *
 * Usage:
 *   1. Start the AgentE server: npx @agent-e/server
 *   2. Call sendTick() from your main loop every N ticks
 *   3. Apply the returned adjustments to your economy parameters
 */

const AGENTE_URL = 'http://localhost:3000';

// ─── Build your economy state snapshot ──────────────────────────────────────
// TODO: Replace this with your actual game state

function buildState() {
  return {
    tick: 0,                                  // TODO: your current tick
    roles: ['role_a', 'role_b'],              // TODO: all roles in your economy
    resources: ['resource_x', 'resource_y'],  // TODO: all resource types
    currencies: ['currency_a'],               // TODO: all currency types

    // Agent ID → { currency → balance }
    agentBalances: {
      // TODO: loop over your participants and populate
      'agent_1': { currency_a: 150 },
      'agent_2': { currency_a: 80 },
    },

    // Agent ID → role name
    agentRoles: {
      // TODO: populate from your economy
      'agent_1': 'role_a',
      'agent_2': 'role_b',
    },

    // Agent ID → { resource → quantity }
    agentInventories: {
      // TODO: populate from your economy
      'agent_1': { resource_x: 2, resource_y: 0 },
      'agent_2': { resource_y: 5, resource_x: 0 },
    },

    // Agent ID → satisfaction score (0-100) — OPTIONAL
    agentSatisfaction: {
      'agent_1': 75,
      'agent_2': 60,
    },

    // currency → { resource → price }
    marketPrices: {
      // TODO: populate from your marketplace
      currency_a: { resource_x: 15, resource_y: 50 },
    },

    // Recent economic events (can be empty)
    recentTransactions: [],

    // OPTIONAL: currency → { poolName → amount }
    // poolSizes: { currency_a: { main_pool: 500, reserve: 200 } },
  };
}

// ─── Send a tick to AgentE ──────────────────────────────────────────────────

interface TickResponse {
  adjustments: Array<{ key: string; value: number }>;
  alerts: Array<{ principle: string; name: string; severity: number }>;
  health: number;
  decisions: Array<{ id: string; parameter: string; result: string }>;
}

async function sendTick(): Promise<TickResponse> {
  const state = buildState();

  const response = await fetch(`${AGENTE_URL}/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('AgentE tick failed:', error);
    throw new Error(`AgentE returned ${response.status}`);
  }

  const data: TickResponse = await response.json();

  // Apply adjustments to your economy
  for (const adj of data.adjustments) {
    console.log(`[AgentE] Adjust ${adj.key} → ${adj.value}`);
    // TODO: Apply adj.key = adj.value in your game's economy params
  }

  // Log alerts
  for (const alert of data.alerts) {
    console.warn(`[AgentE] Alert: ${alert.name} (severity ${alert.severity})`);
  }

  console.log(`[AgentE] Economy health: ${data.health}/100`);
  return data;
}

// ─── Check health ───────────────────────────────────────────────────────────

async function checkHealth() {
  const response = await fetch(`${AGENTE_URL}/health`);
  const data = await response.json();
  console.log('AgentE Health:', data);
  return data;
}

// ─── Diagnose without side effects ──────────────────────────────────────────

async function diagnose() {
  const state = buildState();
  const response = await fetch(`${AGENTE_URL}/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  const data = await response.json();
  console.log('Diagnoses:', data.diagnoses);
  return data;
}

// ─── Example loop integration ─────────────────────────────────────────

// Call sendTick() every 5 game ticks from your update loop:
//
// let tickCounter = 0;
// function update() {
//   tickCounter++;
//   if (tickCounter % 5 === 0) {
//     sendTick().catch(console.error);
//   }
// }

export { sendTick, checkHealth, diagnose };
