import type { Principle } from '../types.js';
import { P1_ProductionMatchesConsumption } from './supply-chain.js';
import { P12_OnePrimaryFaucet } from './currency-flow.js';
import { P20_DecayPreventsAccumulation } from './feedback-loops.js';
import { P33_FairNotEqual } from './participant-experience.js';
import { P43_SimulationMinimum } from './statistical.js';

/** Community-tier principles (5 of 60) — free forever under MIT. */
export const COMMUNITY_PRINCIPLES: Principle[] = [
  P1_ProductionMatchesConsumption,   // Supply chain: production ↔ consumption
  P12_OnePrimaryFaucet,              // Currency flow: net-flow monitoring
  P20_DecayPreventsAccumulation,     // Feedback loops: anti-hoarding
  P33_FairNotEqual,                  // Participant experience: Gini fairness
  P43_SimulationMinimum,             // Statistical: ≥100 simulation iterations
];
