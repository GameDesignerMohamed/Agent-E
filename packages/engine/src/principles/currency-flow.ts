// P12: Currency Flow — One Primary Faucet (Community)

import type { Principle, PrincipleResult } from '../types.js';

export const P12_OnePrimaryFaucet: Principle = {
  id: 'P12',
  name: 'One Primary Faucet',
  category: 'currency',
  description:
    'Multiple independent currency sources (gathering + production + activities) each ' +
    'creating currency causes uncontrolled inflation. One clear primary faucet ' +
    'makes the economy predictable and auditable.',
  check(metrics, thresholds): PrincipleResult {
    for (const curr of metrics.currencies) {
      const netFlow = metrics.netFlowByCurrency[curr] ?? 0;
      const faucetVolume = metrics.faucetVolumeByCurrency[curr] ?? 0;
      const sinkVolume = metrics.sinkVolumeByCurrency[curr] ?? 0;

      if (netFlow > thresholds.netFlowWarnThreshold) {
        return {
          violated: true,
          severity: 5,
          evidence: { currency: curr, netFlow, faucetVolume, sinkVolume },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'increase',
            scope: { currency: curr },
            magnitude: 0.15,
            reasoning:
              `[${curr}] Net flow +${netFlow.toFixed(1)}/tick. Inflationary. ` +
              'Increase production cost (primary sink) to balance faucet output.',
          },
          confidence: 0.80,
          estimatedLag: 8,
        };
      }

      if (netFlow < -thresholds.netFlowWarnThreshold) {
        return {
          violated: true,
          severity: 4,
          evidence: { currency: curr, netFlow, faucetVolume, sinkVolume },
          suggestedAction: {
            parameterType: 'cost',
            direction: 'decrease',
            scope: { currency: curr },
            magnitude: 0.15,
            reasoning:
              `[${curr}] Net flow ${netFlow.toFixed(1)}/tick. Deflationary. ` +
              'Decrease production cost to ease sink pressure.',
          },
          confidence: 0.80,
          estimatedLag: 8,
        };
      }
    }

    return { violated: false };
  },
};

export const CURRENCY_FLOW_PRINCIPLES: Principle[] = [P12_OnePrimaryFaucet];
