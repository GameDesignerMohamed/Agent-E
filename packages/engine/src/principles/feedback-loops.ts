// P20: Feedback Loops — Decay Prevents Accumulation (Community)

import type { Principle, PrincipleResult } from '../types.js';

export const P20_DecayPreventsAccumulation: Principle = {
  id: 'P20',
  name: 'Decay Prevents Accumulation',
  category: 'feedback',
  description:
    'Resources without decay create infinite hoarding. ' +
    'A gatherer who never sells has 500 raw materials rotting in their pocket ' +
    'while producers starve. 2-10% decay per period forces circulation.',
  check(metrics, _thresholds): PrincipleResult {
    const { supplyByResource, velocity, totalAgents } = metrics;

    // High supply + low velocity = hoarding, not abundance
    const totalResources = Object.values(supplyByResource).reduce((s, v) => s + v, 0);
    const resourcesPerAgent = totalResources / Math.max(1, totalAgents);

    if (resourcesPerAgent > 20 && velocity < 3) {
      return {
        violated: true,
        severity: 4,
        evidence: { totalResources, resourcesPerAgent, velocity },
        suggestedAction: {
          parameterType: 'yield',
          direction: 'decrease',
          magnitude: 0.10,
          reasoning:
            `${totalResources.toFixed(0)} resources with velocity ${velocity}/t. ` +
            'Likely hoarding. Reduce yield to increase scarcity and force circulation.',
        },
        confidence: 0.65,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const FEEDBACK_LOOP_PRINCIPLES: Principle[] = [P20_DecayPreventsAccumulation];
