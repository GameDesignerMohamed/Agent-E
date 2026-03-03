import { SUPPLY_CHAIN_PRINCIPLES } from './supply-chain.js';
import { CURRENCY_FLOW_PRINCIPLES } from './currency-flow.js';
import { FEEDBACK_LOOP_PRINCIPLES } from './feedback-loops.js';
import { STATISTICAL_PRINCIPLES } from './statistical.js';
import { PARTICIPANT_EXPERIENCE_PRINCIPLES } from './participant-experience.js';
import type { Principle } from '../types.js';

export * from './supply-chain.js';
export * from './currency-flow.js';
export * from './feedback-loops.js';
export * from './statistical.js';
export * from './participant-experience.js';
export { COMMUNITY_PRINCIPLES } from './community.js';

/** All built-in principles — Community Edition (5 principles) */
export const ALL_PRINCIPLES: Principle[] = [
  ...SUPPLY_CHAIN_PRINCIPLES,            // P1
  ...CURRENCY_FLOW_PRINCIPLES,           // P12
  ...FEEDBACK_LOOP_PRINCIPLES,           // P20
  ...STATISTICAL_PRINCIPLES,             // P43
  ...PARTICIPANT_EXPERIENCE_PRINCIPLES,  // P33
];
