// ─────────────────────────────────────────────────────────────────────────────
// MeterClient — lightweight usage reporter for Pro metered billing.
//
// Design principles:
//   • Non-blocking: never throws, never blocks the tick loop
//   • Batched: accumulates events and flushes periodically
//   • Resilient: network failures re-buffer events for retry
//   • Offline-friendly: if billing API is unreachable, engine still runs
// ─────────────────────────────────────────────────────────────────────────────

export interface MeterConfig {
  apiKey: string;
  endpoint: string;          // e.g. 'https://api.agente.dev/v1'
  flushInterval?: number;    // ms between flushes (default: 60_000)
  flushThreshold?: number;   // flush after this many events (default: 10)
}

export type BillableEvent = 'action_applied' | 'plan_generated';

interface ValidateResponse {
  valid: boolean;
  customerId?: string;
  message?: string;
}

const DEFAULT_FLUSH_INTERVAL = 60_000;  // 1 minute
const DEFAULT_FLUSH_THRESHOLD = 10;

export class MeterClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly flushThreshold: number;

  private buffer: Record<BillableEvent, number> = {
    action_applied: 0,
    plan_generated: 0,
  };

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private _validated = false;
  private _active = true;
  private _offline = false;

  constructor(config: MeterConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint.replace(/\/+$/, '');  // strip trailing slash
    this.flushThreshold = config.flushThreshold ?? DEFAULT_FLUSH_THRESHOLD;

    // Start periodic flush
    const interval = config.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.flushTimer = setInterval(() => this.flush(), interval);
    // Unref so the timer doesn't prevent Node.js from exiting
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      (this.flushTimer as NodeJS.Timeout).unref();
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate the API key with the billing server.
   * Returns true if valid OR if the server is unreachable (optimistic offline mode).
   * Returns false only if the server explicitly rejects the key.
   */
  async validate(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ apiKey: this.apiKey }),
        signal: AbortSignal.timeout(5_000),  // 5s timeout — don't hang the startup
      });

      if (!res.ok) {
        this._active = false;
        this._validated = false;
        return false;
      }

      const data = (await res.json()) as ValidateResponse;
      this._validated = data.valid;
      this._active = data.valid;
      return data.valid;
    } catch {
      // Network error — billing API unreachable.
      // Optimistic: let the engine run, buffer usage, flush when connection restores.
      console.warn(
        '[AgentE Meter] Could not reach billing API — running in offline mode.',
        'Usage will be reported when connection is restored.',
      );
      this._validated = true;
      this._active = true;
      this._offline = true;
      return true;
    }
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  /** Record a billable event. Non-blocking, never throws. */
  record(event: BillableEvent): void {
    if (!this._active) return;
    this.buffer[event]++;

    const total = this.buffer.action_applied + this.buffer.plan_generated;
    if (total >= this.flushThreshold) {
      this.flush();
    }
  }

  // ── Flushing ───────────────────────────────────────────────────────────────

  /** Flush buffered events to the billing API. Fire-and-forget. */
  private flush(): void {
    const snapshot = { ...this.buffer };
    const total = snapshot.action_applied + snapshot.plan_generated;
    if (total === 0) return;

    // Reset buffer immediately (before async call — no double-counting)
    this.buffer = { action_applied: 0, plan_generated: 0 };

    fetch(`${this.endpoint}/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        events: snapshot,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      // Network failure — re-add to buffer so events aren't lost
      this.buffer.action_applied += snapshot.action_applied;
      this.buffer.plan_generated += snapshot.plan_generated;
    });
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  get isActive(): boolean { return this._active; }
  get isValidated(): boolean { return this._validated; }
  get isOffline(): boolean { return this._offline; }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  /** Stop the flush timer and send any remaining buffered events. */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}
