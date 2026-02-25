// P34, P47-P48: Open Economy Principles (DeFi / blockchain contexts)

import type { Principle, PrincipleResult } from '../types.js';

export const P34_ExtractionRatio: Principle = {
  id: 'P34',
  name: 'Extraction Ratio',
  category: 'open_economy',
  description:
    'If >65% of participants are net extractors (taking value out without putting it in), ' +
    'the economy needs external subsidy (new user influx) to survive. ' +
    'Above 65%, any slowdown in new users collapses the economy.',
  check(metrics, thresholds): PrincipleResult {
    const { extractionRatio } = metrics;
    if (Number.isNaN(extractionRatio)) return { violated: false }; // not tracked for this economy

    if (extractionRatio > thresholds.extractionRatioRed) {
      return {
        violated: true,
        severity: 8,
        evidence: { extractionRatio, threshold: thresholds.extractionRatioRed },
        suggestedAction: {
          parameterType: 'fee',
          scope: { tags: ['transaction'] },
          direction: 'increase',
          magnitude: 0.25,
          reasoning:
            `Extraction ratio ${(extractionRatio * 100).toFixed(0)}% (critical: ${(thresholds.extractionRatioRed * 100).toFixed(0)}%). ` +
            'Economy is extraction-heavy and subsidy-dependent. ' +
            'Raise fees to increase the cost of extraction.',
        },
        confidence: 0.85,
        estimatedLag: 10,
      };
    }

    if (extractionRatio > thresholds.extractionRatioYellow) {
      return {
        violated: true,
        severity: 5,
        evidence: { extractionRatio, threshold: thresholds.extractionRatioYellow },
        suggestedAction: {
          parameterType: 'fee',
          scope: { tags: ['transaction'] },
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Extraction ratio ${(extractionRatio * 100).toFixed(0)}% (warning: ${(thresholds.extractionRatioYellow * 100).toFixed(0)}%). ` +
            'Economy trending toward extraction-heavy. Apply early pressure.',
        },
        confidence: 0.75,
        estimatedLag: 15,
      };
    }

    return { violated: false };
  },
};

export const P47_SmokeTest: Principle = {
  id: 'P47',
  name: 'Smoke Test',
  category: 'open_economy',
  description:
    'intrinsic_utility_value / total_market_value < 0.3 = economy is >70% speculation. ' +
    'If utility value drops below 10%, a single bad week can collapse the entire market. ' +
    'Real utility (resources in the economy serve distinct utility functions) must anchor value.',
  check(metrics, thresholds): PrincipleResult {
    const { smokeTestRatio } = metrics;
    if (Number.isNaN(smokeTestRatio)) return { violated: false };

    if (smokeTestRatio < thresholds.smokeTestCritical) {
      return {
        violated: true,
        severity: 9,
        evidence: { smokeTestRatio, threshold: thresholds.smokeTestCritical },
        suggestedAction: {
          parameterType: 'reward',
          direction: 'increase',
          magnitude: 0.20,
          reasoning:
            `Utility/market ratio ${(smokeTestRatio * 100).toFixed(0)}% (critical). ` +
            'Economy is >90% speculative. Collapse risk is extreme. ' +
            'Increase utility rewards to anchor real value.',
        },
        confidence: 0.90,
        estimatedLag: 20,
      };
    }

    if (smokeTestRatio < thresholds.smokeTestWarning) {
      return {
        violated: true,
        severity: 6,
        evidence: { smokeTestRatio, threshold: thresholds.smokeTestWarning },
        suggestedAction: {
          parameterType: 'reward',
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Utility/market ratio ${(smokeTestRatio * 100).toFixed(0)}% (warning). ` +
            'Economy is >70% speculative. Boost utility rewards to restore intrinsic value anchor.',
        },
        confidence: 0.75,
        estimatedLag: 20,
      };
    }

    return { violated: false };
  },
};

export const P48_CurrencyInsulation: Principle = {
  id: 'P48',
  name: 'Currency Insulation',
  category: 'open_economy',
  description:
    'Gameplay economy correlation with external markets > 0.5 = insulation failure. ' +
    'When your native currency price correlates with external asset, external market crashes destroy ' +
    'internal economies. Good design insulates the two.',
  check(metrics, thresholds): PrincipleResult {
    const { currencyInsulation } = metrics;
    if (Number.isNaN(currencyInsulation)) return { violated: false };

    if (currencyInsulation > thresholds.currencyInsulationMax) {
      return {
        violated: true,
        severity: 6,
        evidence: { currencyInsulation, threshold: thresholds.currencyInsulationMax },
        suggestedAction: {
          parameterType: 'fee',
          scope: { tags: ['transaction'] },
          direction: 'increase',
          magnitude: 0.10,
          reasoning:
            `Currency correlation with external market: ${(currencyInsulation * 100).toFixed(0)}% ` +
            `(max: ${(thresholds.currencyInsulationMax * 100).toFixed(0)}%). ` +
            'Economy is exposed to external market shocks. ' +
            'Increase internal friction to reduce external correlation.',
        },
        confidence: 0.70,
        estimatedLag: 30,
      };
    }

    return { violated: false };
  },
};

export const OPEN_ECONOMY_PRINCIPLES: Principle[] = [
  P34_ExtractionRatio,
  P47_SmokeTest,
  P48_CurrencyInsulation,
];
