/**
 * AgentE WebSocket Client Example
 *
 * WebSocket transport for real-time, low-latency communication with AgentE.
 * Better than HTTP for economies that tick frequently (>10 ticks/second).
 *
 * Usage:
 *   1. Start the AgentE server: npx @agent-e/server
 *   2. Connect via WebSocket
 *   3. Send tick messages from your game loop
 *   4. Handle responses asynchronously
 */

const AGENTE_WS_URL = 'ws://localhost:3000';

// ─── WebSocket Client ───────────────────────────────────────────────────────

class AgentEClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Array<(data: Record<string, unknown>) => void>>();

  constructor(private url: string = AGENTE_WS_URL) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[AgentE] WebSocket connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          const type = data['type'] as string;

          // Dispatch to registered handlers
          const handlers = this.handlers.get(type) ?? [];
          for (const handler of handlers) {
            handler(data);
          }

          // Default logging
          if (handlers.length === 0) {
            console.log(`[AgentE] ${type}:`, data);
          }
        } catch (err) {
          console.error('[AgentE] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[AgentE] WebSocket closed, reconnecting in 3s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (err) => {
        console.error('[AgentE] WebSocket error:', err);
        reject(err);
      };
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  on(type: string, handler: (data: Record<string, unknown>) => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[AgentE] WebSocket not connected');
    }
  }

  // ─── Commands ───────────────────────────────────────────────────────────

  /** Send economy state for a tick — returns adjustments via tick_result event */
  sendTick(state: Record<string, unknown>, events?: unknown[]): void {
    this.send({ type: 'tick', state, events });
  }

  /** Request current health status */
  requestHealth(): void {
    this.send({ type: 'health' });
  }

  /** Send a single economic event */
  sendEvent(event: Record<string, unknown>): void {
    this.send({ type: 'event', event });
  }

  /** Request diagnosis without side effects */
  diagnose(state: Record<string, unknown>): void {
    this.send({ type: 'diagnose', state });
  }
}

// ─── Example usage ──────────────────────────────────────────────────────────

async function main() {
  const client = new AgentEClient();

  // Register handlers
  client.on('tick_result', (data) => {
    const adjustments = data['adjustments'] as Array<{ key: string; value: number }>;
    const health = data['health'] as number;

    console.log(`Economy health: ${health}/100`);
    for (const adj of adjustments) {
      console.log(`  Adjust ${adj.key} → ${adj.value}`);
      // TODO: Apply to your game's economy params
    }
  });

  client.on('validation_error', (data) => {
    console.error('State validation failed:', data['validation']);
  });

  client.on('validation_warning', (data) => {
    console.warn('State warning:', data['warning']);
  });

  client.on('health_result', (data) => {
    console.log('Health:', data);
  });

  client.on('error', (data) => {
    console.error('Server error:', data['error']);
  });

  // Connect
  await client.connect();

  // Send a tick (TODO: replace with your actual game state)
  client.sendTick({
    tick: 0,
    roles: ['role_a', 'role_b'],
    resources: ['resource_x', 'resource_y'],
    currencies: ['currency_a'],
    agentBalances: { agent_1: { currency_a: 150 } },
    agentRoles: { agent_1: 'role_a' },
    agentInventories: { agent_1: { resource_x: 2 } },
    marketPrices: { currency_a: { resource_x: 15, resource_y: 50 } },
    recentTransactions: [],
  });

  // Request health
  client.requestHealth();
}

export { AgentEClient };
// Uncomment to run: main().catch(console.error);
