import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeterClient } from '../src/MeterClient.js';

// ─────────────────────────────────────────────────────────────────────────────
// MeterClient unit tests
//
// Strategy: mock global `fetch` for all network calls.
// The constructor starts a setInterval — call destroy() in afterEach to clean up.
// ─────────────────────────────────────────────────────────────────────────────

function makeMeter(overrides: Partial<ConstructorParameters<typeof MeterClient>[0]> = {}) {
  return new MeterClient({
    apiKey: 'test-key',
    endpoint: 'https://api.example.com/v1',
    flushInterval: 60_000,   // long — don't trigger automatically during tests
    flushThreshold: 10,
    ...overrides,
  });
}

describe('MeterClient', () => {
  let meter: MeterClient;

  beforeEach(() => {
    // Default: fetch resolves with an empty 200 (prevents unhandled rejections in destroy())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({} as Response));
  });

  afterEach(() => {
    meter?.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('starts active, not validated, not offline', () => {
      meter = makeMeter();
      expect(meter.isActive).toBe(true);
      expect(meter.isValidated).toBe(false);
      expect(meter.isOffline).toBe(false);
    });

    it('strips trailing slash from endpoint', () => {
      // Verified via the validate() URL — we'll check the fetch call
      meter = makeMeter({ endpoint: 'https://api.example.com/v1///' });
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);

      return meter.validate().then(() => {
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.example.com/v1/validate');
      });
    });
  });

  // ── validate() ──────────────────────────────────────────────────────────

  describe('validate()', () => {
    it('returns true and sets isValidated + isActive when server responds valid', async () => {
      meter = makeMeter();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);

      const result = await meter.validate();
      expect(result).toBe(true);
      expect(meter.isValidated).toBe(true);
      expect(meter.isActive).toBe(true);
      expect(meter.isOffline).toBe(false);
    });

    it('returns false and deactivates when server returns valid:false', async () => {
      meter = makeMeter();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: false }),
      } as Response);

      const result = await meter.validate();
      expect(result).toBe(false);
      expect(meter.isValidated).toBe(false);
      expect(meter.isActive).toBe(false);
    });

    it('returns false and deactivates when server responds with non-ok status', async () => {
      meter = makeMeter();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response);

      const result = await meter.validate();
      expect(result).toBe(false);
      expect(meter.isActive).toBe(false);
    });

    it('returns true in offline mode when network throws (optimistic)', async () => {
      meter = makeMeter();
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await meter.validate();
      expect(result).toBe(true);
      expect(meter.isOffline).toBe(true);
      expect(meter.isActive).toBe(true);   // still active — engine keeps running
      expect(meter.isValidated).toBe(true); // optimistically validated
    });

    it('calls POST /validate with correct Authorization header', async () => {
      meter = makeMeter({ apiKey: 'my-api-key' });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);

      await meter.validate();

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-api-key');
    });
  });

  // ── record() ────────────────────────────────────────────────────────────

  describe('record()', () => {
    it('accumulates events in buffer without flushing below threshold', () => {
      meter = makeMeter({ flushThreshold: 10 });

      for (let i = 0; i < 5; i++) meter.record('action_applied');
      for (let i = 0; i < 3; i++) meter.record('plan_generated');

      // Total = 8 < 10, so no flush yet — fetch should not have been called
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('flushes automatically when total events reach flushThreshold', () => {
      meter = makeMeter({ flushThreshold: 3 });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      meter.record('action_applied');
      meter.record('plan_generated');
      meter.record('action_applied'); // total = 3 → flush

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/usage');
    });

    it('does not record when meter is inactive (deactivated after failed validation)', async () => {
      meter = makeMeter();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);
      await meter.validate();
      expect(meter.isActive).toBe(false);

      vi.mocked(fetch).mockClear();
      meter.record('action_applied');
      meter.record('action_applied'); // would trigger flush at threshold 2 if active

      // flush should not fire
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('sends correct event counts in flush body', () => {
      meter = makeMeter({ flushThreshold: 2 });
      vi.mocked(fetch).mockResolvedValue({} as Response);

      meter.record('action_applied');
      meter.record('plan_generated'); // threshold reached → flush

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        events: { action_applied: number; plan_generated: number };
      };
      expect(body.events.action_applied).toBe(1);
      expect(body.events.plan_generated).toBe(1);
    });
  });

  // ── flush / re-buffering on network failure ──────────────────────────────

  describe('re-buffering on flush failure', () => {
    it('re-adds events to buffer when flush POST fails (no event loss)', async () => {
      meter = makeMeter({ flushThreshold: 2 });

      // First flush will fail
      let rejectFlush: (reason: unknown) => void;
      const fetchPromise = new Promise<never>((_, reject) => {
        rejectFlush = reject;
      });
      vi.mocked(fetch).mockReturnValueOnce(fetchPromise);

      meter.record('action_applied');
      meter.record('plan_generated'); // triggers flush

      // Reject the in-flight request
      rejectFlush!(new Error('network down'));

      // Allow microtasks to settle
      await new Promise(r => setTimeout(r, 10));

      // Now the meter should flush again when destroy() is called,
      // re-sending the re-buffered events
      vi.mocked(fetch).mockResolvedValueOnce({} as Response);
      meter.destroy();

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
      const [, options] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        events: { action_applied: number; plan_generated: number };
      };
      // Events were re-buffered — counts should be preserved
      expect(body.events.action_applied).toBe(1);
      expect(body.events.plan_generated).toBe(1);
    });
  });

  // ── destroy() ───────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('flushes remaining buffer on destroy', () => {
      meter = makeMeter({ flushThreshold: 100 }); // high threshold — won't auto-flush
      vi.mocked(fetch).mockResolvedValue({} as Response);

      meter.record('action_applied');
      meter.record('action_applied');
      meter.destroy();

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/usage');
      const body = JSON.parse(options.body as string) as {
        events: { action_applied: number };
      };
      expect(body.events.action_applied).toBe(2);
    });

    it('does not flush on destroy when buffer is empty', () => {
      meter = makeMeter();
      vi.mocked(fetch).mockResolvedValue({} as Response);

      meter.destroy();
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('is safe to call destroy() twice', () => {
      meter = makeMeter();
      expect(() => {
        meter.destroy();
        meter.destroy(); // second call should be a no-op, not throw
      }).not.toThrow();
    });
  });
});
