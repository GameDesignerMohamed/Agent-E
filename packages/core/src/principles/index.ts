import { SUPPLY_CHAIN_PRINCIPLES } from './supply-chain.js';
import { INCENTIVE_PRINCIPLES } from './incentives.js';
import { POPULATION_PRINCIPLES } from './population.js';
import { CURRENCY_FLOW_PRINCIPLES } from './currency-flow.js';
import { BOOTSTRAP_PRINCIPLES } from './bootstrap.js';
import { FEEDBACK_LOOP_PRINCIPLES } from './feedback-loops.js';
import { REGULATOR_PRINCIPLES } from './regulator.js';
import { MARKET_DYNAMICS_PRINCIPLES } from './market-dynamics.js';
import { MEASUREMENT_PRINCIPLES } from './measurement.js';
import { STATISTICAL_PRINCIPLES } from './statistical.js';
import { SYSTEM_DYNAMICS_PRINCIPLES } from './system-dynamics.js';
import { RESOURCE_MGMT_PRINCIPLES } from './resource-mgmt.js';
import { PARTICIPANT_EXPERIENCE_PRINCIPLES } from './participant-experience.js';
import { OPEN_ECONOMY_PRINCIPLES } from './open-economy.js';
import { OPERATIONS_PRINCIPLES } from './operations.js';
import type { Principle } from '../types.js';

export * from './supply-chain.js';
export * from './incentives.js';
export * from './population.js';
export * from './currency-flow.js';
export * from './bootstrap.js';
export * from './feedback-loops.js';
export * from './regulator.js';
export * from './market-dynamics.js';
export * from './measurement.js';
export * from './statistical.js';
export * from './system-dynamics.js';
export * from './resource-mgmt.js';
export * from './participant-experience.js';
export * from './open-economy.js';
export * from './operations.js';

/** All 60 built-in principles in priority order (supply chain → operations) */
export const ALL_PRINCIPLES: Principle[] = [
  ...SUPPLY_CHAIN_PRINCIPLES,            // P1-P4, P60
  ...INCENTIVE_PRINCIPLES,               // P5-P8
  ...POPULATION_PRINCIPLES,              // P9-P11, P46
  ...CURRENCY_FLOW_PRINCIPLES,           // P12-P16, P32, P58
  ...BOOTSTRAP_PRINCIPLES,               // P17-P19
  ...FEEDBACK_LOOP_PRINCIPLES,           // P20-P24
  ...REGULATOR_PRINCIPLES,               // P25-P28, P38
  ...MARKET_DYNAMICS_PRINCIPLES,         // P29-P30, P57
  ...MEASUREMENT_PRINCIPLES,             // P31, P41, P55, P59
  ...STATISTICAL_PRINCIPLES,             // P42-P43
  ...SYSTEM_DYNAMICS_PRINCIPLES,         // P39, P44
  ...RESOURCE_MGMT_PRINCIPLES,           // P35, P40, P49
  ...PARTICIPANT_EXPERIENCE_PRINCIPLES,  // P33, P36, P37, P45, P50
  ...OPEN_ECONOMY_PRINCIPLES,            // P34, P47-P48
  ...OPERATIONS_PRINCIPLES,              // P51-P54, P56
];
