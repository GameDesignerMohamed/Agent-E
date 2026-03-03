// ─────────────────────────────────────────────────────────────────────────────
// AnomalyInterpreter — detects statistical anomalies the principle system
// doesn't cover, then asks the LLM to interpret them.
//
// Detection is deterministic (rolling mean + stddev). The LLM only gets called
// when genuinely unexplained anomalies are found.
// ─────────────────────────────────────────────────────────────────────────────

import type { Diagnosis, EconomyMetrics } from '../types.js';
import type { LLMProvider, LLMProviderConfig } from './LLMProvider.js';

export interface MetricAnomaly {
  metric: string;
  currentValue: number;
  expectedRange: [number, number];
  /** How many standard deviations from the rolling mean */
  deviation: number;
}

export interface AnomalyReport {
  tick: number;
  anomalies: MetricAnomaly[];
  /** LLM interpretation: "This looks like a bot farm cycling items..." */
  interpretation: string;
  severity: 'low' | 'medium' | 'high';
  generatedAt: number;
}

/** Scalar metrics we track for anomaly detection */
const TRACKED_METRICS: Array<keyof EconomyMetrics> = [
  'totalSupply', 'netFlow', 'velocity', 'inflationRate',
  'faucetVolume', 'sinkVolume', 'tapSinkRatio',
  'giniCoefficient', 'top10PctShare', 'meanMedianDivergence',
  'totalAgents', 'churnRate',
  'priceIndex', 'productionIndex', 'capacityUsage',
  'avgSatisfaction', 'blockedAgentCount',
  'extractionRatio', 'newUserDependency',
  'arbitrageIndex', 'giftTradeRatio', 'disposalTradeRatio',
];

/** Minimum deviation (in σ) to flag an anomaly */
const DEVIATION_THRESHOLD = 2.0;

/** Minimum ticks of history before we start detecting */
const MIN_HISTORY = 10;

/** Cooldown: minimum ticks between LLM calls */
const LLM_COOLDOWN_TICKS = 10;

export class AnomalyInterpreter {
  private provider: LLMProvider;
  private config: LLMProviderConfig;
  private history: EconomyMetrics[] = [];
  private windowSize: number;
  private lastLLMCallTick = -Infinity;

  constructor(
    provider: LLMProvider,
    config?: LLMProviderConfig,
    windowSize = 50,
  ) {
    this.provider = provider;
    this.config = {
      maxTokens: config?.maxTokens ?? 300,
      temperature: config?.temperature ?? 0.5,
      timeoutMs: config?.timeoutMs ?? 10_000,
    };
    this.windowSize = windowSize;
  }

  /**
   * Feed metrics every tick. Only calls the LLM when statistical anomalies
   * are detected that aren't already explained by active violations.
   * Returns null most ticks.
   */
  async check(
    metrics: EconomyMetrics,
    activeViolations: Diagnosis[],
  ): Promise<AnomalyReport | null> {
    // Update rolling window
    this.history.push(metrics);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    // Need enough history to compute meaningful stats
    if (this.history.length < MIN_HISTORY) return null;

    // Rate limit LLM calls
    if (metrics.tick - this.lastLLMCallTick < LLM_COOLDOWN_TICKS) return null;

    // Detect anomalies
    const anomalies = this.detectAnomalies(metrics);
    if (anomalies.length === 0) return null;

    // Filter out metrics already explained by active violations
    const unexplained = this.filterExplained(anomalies, activeViolations);
    if (unexplained.length === 0) return null;

    // Call LLM
    this.lastLLMCallTick = metrics.tick;
    const prompt = this.buildPrompt(unexplained, metrics, activeViolations);
    const raw = await this.provider.complete(prompt, this.config);

    const severity = this.classifySeverity(unexplained);

    return {
      tick: metrics.tick,
      anomalies: unexplained,
      interpretation: raw.trim(),
      severity,
      generatedAt: Date.now(),
    };
  }

  private detectAnomalies(current: EconomyMetrics): MetricAnomaly[] {
    const anomalies: MetricAnomaly[] = [];

    for (const key of TRACKED_METRICS) {
      const value = current[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      const { mean, stddev } = this.computeStats(key);
      if (stddev === 0) continue; // constant metric, skip

      const deviation = Math.abs(value - mean) / stddev;
      if (deviation >= DEVIATION_THRESHOLD) {
        anomalies.push({
          metric: key,
          currentValue: value,
          expectedRange: [mean - 2 * stddev, mean + 2 * stddev],
          deviation,
        });
      }
    }

    // Sort by deviation descending
    anomalies.sort((a, b) => b.deviation - a.deviation);
    return anomalies;
  }

  private computeStats(key: keyof EconomyMetrics): { mean: number; stddev: number } {
    let sum = 0;
    let count = 0;

    for (const m of this.history) {
      const v = m[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }

    if (count === 0) return { mean: 0, stddev: 0 };
    const mean = sum / count;

    let sqDiffSum = 0;
    for (const m of this.history) {
      const v = m[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        sqDiffSum += (v - mean) ** 2;
      }
    }
    const stddev = Math.sqrt(sqDiffSum / count);

    return { mean, stddev };
  }

  /**
   * Remove anomalies that are likely explained by an active violation.
   * Heuristic: if a violation's principle category matches the anomalous metric's
   * domain, it's probably already accounted for.
   */
  private filterExplained(
    anomalies: MetricAnomaly[],
    activeViolations: Diagnosis[],
  ): MetricAnomaly[] {
    if (activeViolations.length === 0) return anomalies;

    // Build a set of metric names that active violations are likely explaining
    const explainedMetrics = new Set<string>();
    for (const v of activeViolations) {
      const cat = v.principle.category;
      // Map principle categories to the metrics they typically explain
      const categoryMetricMap: Record<string, string[]> = {
        currency: ['totalSupply', 'netFlow', 'velocity', 'inflationRate', 'faucetVolume', 'sinkVolume', 'tapSinkRatio'],
        wealth_distribution: ['giniCoefficient', 'top10PctShare', 'meanMedianDivergence'],
        population: ['totalAgents', 'churnRate'],
        market_dynamics: ['priceIndex', 'productionIndex', 'capacityUsage', 'arbitrageIndex'],
        participant_experience: ['avgSatisfaction', 'blockedAgentCount'],
        open_economy: ['extractionRatio', 'newUserDependency'],
        resource: ['capacityUsage', 'productionIndex'],
        incentive: ['giftTradeRatio', 'disposalTradeRatio'],
      };
      const mapped = categoryMetricMap[cat] ?? [];
      for (const m of mapped) explainedMetrics.add(m);

      // Also check evidence keys — if evidence mentions a metric directly, it's explained
      if (v.violation.evidence) {
        for (const evidenceKey of Object.keys(v.violation.evidence)) {
          explainedMetrics.add(evidenceKey);
        }
      }
    }

    return anomalies.filter(a => !explainedMetrics.has(a.metric));
  }

  private classifySeverity(anomalies: MetricAnomaly[]): 'low' | 'medium' | 'high' {
    const maxDev = Math.max(...anomalies.map(a => a.deviation));
    if (maxDev >= 4.0 || anomalies.length >= 4) return 'high';
    if (maxDev >= 3.0 || anomalies.length >= 2) return 'medium';
    return 'low';
  }

  private buildPrompt(
    anomalies: MetricAnomaly[],
    metrics: EconomyMetrics,
    activeViolations: Diagnosis[],
  ): string {
    const anomalyList = anomalies.map(a =>
      `- ${a.metric}: ${a.currentValue.toFixed(3)} (expected ${a.expectedRange[0].toFixed(3)} to ${a.expectedRange[1].toFixed(3)}, ${a.deviation.toFixed(1)}σ deviation)`
    ).join('\n');

    const violationList = activeViolations.length > 0
      ? activeViolations.map(v => `- ${v.principle.name} (severity ${v.violation.severity}/10)`).join('\n')
      : '- None';

    return `You are an economy analyst for a game economy balancing engine called AgentE.

The following metric anomalies were detected that are NOT explained by any active principle violation. Based on the pattern, suggest what might be causing this.

## Unexplained anomalies
${anomalyList}

## Already-diagnosed issues (for context, these are accounted for)
${violationList}

## Current economy snapshot
- Tick: ${metrics.tick}
- Total supply: ${metrics.totalSupply.toFixed(0)}
- Net flow: ${metrics.netFlow.toFixed(2)}
- Velocity: ${metrics.velocity.toFixed(3)}
- Active agents: ${metrics.totalAgents}
- Churn rate: ${(metrics.churnRate * 100).toFixed(1)}%
- Avg satisfaction: ${metrics.avgSatisfaction.toFixed(1)}

Think about what agent behaviors, exploits, system issues, or external events could cause this specific combination of anomalies. Be specific — mention possible causes like bot farming, exploit abuse, mass selloffs, coordinated manipulation, or system bugs. 2-3 sentences max.`;
  }
}
