// ─────────────────────────────────────────────────────────────────────────────
// DiagnosisNarrator — converts structured violations into plain English
// ─────────────────────────────────────────────────────────────────────────────

import type { Diagnosis, EconomyMetrics } from '../types.js';
import type { LLMProvider, LLMProviderConfig } from './LLMProvider.js';

export interface NarratedDiagnosis {
  diagnosis: Diagnosis;
  /** Human-readable explanation: "Gold inflation is spiking because..." */
  narration: string;
  /** Additional context: "This typically happens when faucets outpace sinks..." */
  suggestedContext: string;
  /** Confidence from the engine's violation (passed through) */
  confidence: number;
  /** When this narration was generated */
  generatedAt: number;
}

export class DiagnosisNarrator {
  private provider: LLMProvider;
  private config: LLMProviderConfig;

  constructor(provider: LLMProvider, config?: LLMProviderConfig) {
    this.provider = provider;
    this.config = {
      maxTokens: config?.maxTokens ?? 256,
      temperature: config?.temperature ?? 0.3,
      timeoutMs: config?.timeoutMs ?? 10_000,
    };
  }

  async narrate(
    diagnosis: Diagnosis,
    metrics: EconomyMetrics,
    recentHistory?: EconomyMetrics[],
  ): Promise<NarratedDiagnosis> {
    const prompt = this.buildPrompt(diagnosis, metrics, recentHistory);

    const raw = await this.provider.complete(prompt, this.config);
    const { narration, context } = this.parseResponse(raw);

    return {
      diagnosis,
      narration,
      suggestedContext: context,
      confidence: diagnosis.violation.confidence,
      generatedAt: Date.now(),
    };
  }

  private buildPrompt(
    diagnosis: Diagnosis,
    metrics: EconomyMetrics,
    recentHistory?: EconomyMetrics[],
  ): string {
    const p = diagnosis.principle;
    const v = diagnosis.violation;

    // Build trend summary from recent history
    let trendBlock = '';
    if (recentHistory && recentHistory.length >= 3) {
      const trends = this.computeTrends(recentHistory);
      if (trends.length > 0) {
        trendBlock = `\nRecent trends (last ${recentHistory.length} ticks):\n${trends.join('\n')}`;
      }
    }

    return `You are an economy analyst for a game economy balancing engine called AgentE.

The engine detected a principle violation. Explain it in plain language for a game designer who is not technical.

Principle: ${p.name}
Category: ${p.category}
Description: ${p.description}
Severity: ${v.severity}/10
Confidence: ${(v.confidence * 100).toFixed(0)}%
Evidence: ${JSON.stringify(v.evidence, null, 0)}

Current economy snapshot:
- Total supply: ${metrics.totalSupply.toFixed(0)}
- Net flow: ${metrics.netFlow.toFixed(2)}
- Velocity: ${metrics.velocity.toFixed(3)}
- Inflation rate: ${(metrics.inflationRate * 100).toFixed(1)}%
- Gini coefficient: ${metrics.giniCoefficient.toFixed(3)}
- Active agents: ${metrics.totalAgents}
- Churn rate: ${(metrics.churnRate * 100).toFixed(1)}%
- Avg satisfaction: ${metrics.avgSatisfaction.toFixed(1)}
- Tap/sink ratio: ${metrics.tapSinkRatio.toFixed(2)}
${trendBlock}

Respond in exactly this format:
NARRATION: [2-3 sentences explaining what is wrong and why, in plain language]
CONTEXT: [1-2 sentences of additional context about when this typically happens]

Be specific. Reference actual numbers from the data. Do not speculate beyond what the evidence shows.`;
  }

  private computeTrends(history: EconomyMetrics[]): string[] {
    const trends: string[] = [];
    const first = history[0]!;
    const last = history[history.length - 1]!;

    const check = (name: string, getter: (m: EconomyMetrics) => number, format: (n: number) => string) => {
      const start = getter(first);
      const end = getter(last);
      if (start === 0 && end === 0) return;
      const pctChange = start !== 0 ? ((end - start) / Math.abs(start)) * 100 : 0;
      if (Math.abs(pctChange) > 5) {
        const dir = pctChange > 0 ? '↑' : '↓';
        trends.push(`- ${name}: ${format(start)} → ${format(end)} (${dir}${Math.abs(pctChange).toFixed(0)}%)`);
      }
    };

    check('Total supply', m => m.totalSupply, n => n.toFixed(0));
    check('Net flow', m => m.netFlow, n => n.toFixed(2));
    check('Velocity', m => m.velocity, n => n.toFixed(3));
    check('Inflation', m => m.inflationRate, n => (n * 100).toFixed(1) + '%');
    check('Gini', m => m.giniCoefficient, n => n.toFixed(3));
    check('Satisfaction', m => m.avgSatisfaction, n => n.toFixed(1));
    check('Churn', m => m.churnRate, n => (n * 100).toFixed(1) + '%');

    return trends;
  }

  private parseResponse(raw: string): { narration: string; context: string } {
    const narrationMatch = raw.match(/NARRATION:\s*([\s\S]*?)(?=CONTEXT:|$)/i);
    const contextMatch = raw.match(/CONTEXT:\s*([\s\S]*?)$/i);

    return {
      narration: narrationMatch?.[1]?.trim() || raw.trim(),
      context: contextMatch?.[1]?.trim() || '',
    };
  }
}
