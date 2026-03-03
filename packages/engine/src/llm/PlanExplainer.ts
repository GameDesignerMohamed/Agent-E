// ─────────────────────────────────────────────────────────────────────────────
// PlanExplainer — converts action plans into readable explanations
// ─────────────────────────────────────────────────────────────────────────────

import type { ActionPlan, EconomyMetrics } from '../types.js';
import type { LLMProvider, LLMProviderConfig } from './LLMProvider.js';

export interface ExplainedPlan {
  plan: ActionPlan;
  /** Plain English: "Reducing rewards by 15% because..." */
  explanation: string;
  /** What should happen: "This should stabilize gold supply within ~20 ticks..." */
  expectedOutcome: string;
  /** What could go wrong: "If sink rate also drops, this could overcorrect..." */
  risks: string;
  /** When this explanation was generated */
  generatedAt: number;
}

export class PlanExplainer {
  private provider: LLMProvider;
  private config: LLMProviderConfig;

  constructor(provider: LLMProvider, config?: LLMProviderConfig) {
    this.provider = provider;
    this.config = {
      maxTokens: config?.maxTokens ?? 300,
      temperature: config?.temperature ?? 0.3,
      timeoutMs: config?.timeoutMs ?? 10_000,
    };
  }

  async explain(
    plan: ActionPlan,
    metrics: EconomyMetrics,
  ): Promise<ExplainedPlan> {
    const prompt = this.buildPrompt(plan, metrics);
    const raw = await this.provider.complete(prompt, this.config);
    const { explanation, expectedOutcome, risks } = this.parseResponse(raw);

    return {
      plan,
      explanation,
      expectedOutcome,
      risks,
      generatedAt: Date.now(),
    };
  }

  private buildPrompt(plan: ActionPlan, metrics: EconomyMetrics): string {
    const d = plan.diagnosis;
    const sim = plan.simulationResult;
    const changePercent = plan.currentValue !== 0
      ? (((plan.targetValue - plan.currentValue) / Math.abs(plan.currentValue)) * 100).toFixed(1)
      : 'N/A';
    const direction = plan.targetValue > plan.currentValue ? 'increase' : 'decrease';

    return `You are an economy analyst for a game economy balancing engine called AgentE.

The engine is about to adjust a parameter. Explain this change to a game designer.

## What triggered this
Principle violated: ${d.principle.name}
Severity: ${d.violation.severity}/10
Evidence: ${JSON.stringify(d.violation.evidence, null, 0)}

## What the engine will do
Parameter: ${plan.parameter}
Current value: ${plan.currentValue}
Target value: ${plan.targetValue}
Direction: ${direction} (${changePercent}%)
Cooldown: ${plan.cooldownTicks} ticks before this parameter can be changed again

## Simulation results
Net improvement predicted: ${sim.netImprovement ? 'yes' : 'no'}
No new problems created: ${sim.noNewProblems ? 'yes' : 'no'}
Confidence interval: [${sim.confidenceInterval[0].toFixed(2)}, ${sim.confidenceInterval[1].toFixed(2)}]
Overshoot risk: ${(sim.overshootRisk * 100).toFixed(0)}%
Estimated effect at tick: ${sim.estimatedEffectTick}

## Rollback safety net
Watching: ${plan.rollbackCondition.metric}
Will rollback if it goes ${plan.rollbackCondition.direction} ${plan.rollbackCondition.threshold}
Checking after tick: ${plan.rollbackCondition.checkAfterTick}

## Current economy
- Total supply: ${metrics.totalSupply.toFixed(0)}
- Net flow: ${metrics.netFlow.toFixed(2)}
- Avg satisfaction: ${metrics.avgSatisfaction.toFixed(1)}
- Gini: ${metrics.giniCoefficient.toFixed(3)}

Respond in exactly this format:
EXPLANATION: [2-3 sentences: what is being changed and why]
OUTCOME: [1-2 sentences: what the simulation predicts will happen]
RISKS: [1-2 sentences: what could go wrong, based on overshoot risk and confidence interval]

Be specific. Use actual numbers. Do not add caveats about AI limitations.`;
  }

  private parseResponse(raw: string): {
    explanation: string;
    expectedOutcome: string;
    risks: string;
  } {
    const explanationMatch = raw.match(/EXPLANATION:\s*([\s\S]*?)(?=OUTCOME:|$)/i);
    const outcomeMatch = raw.match(/OUTCOME:\s*([\s\S]*?)(?=RISKS:|$)/i);
    const risksMatch = raw.match(/RISKS:\s*([\s\S]*?)$/i);

    return {
      explanation: explanationMatch?.[1]?.trim() || raw.trim(),
      expectedOutcome: outcomeMatch?.[1]?.trim() || '',
      risks: risksMatch?.[1]?.trim() || '',
    };
  }
}
