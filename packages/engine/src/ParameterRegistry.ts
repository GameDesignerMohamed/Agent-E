// ParameterRegistry — type-based parameter resolution for universal economies
// Replaces hardcoded parameter strings with a registry that resolves by type + scope.

// ── Types ───────────────────────────────────────────────────────────────────

/** High-level parameter categories (what it IS, not what it's called) */
export type ParameterType =
  | 'cost'       // production cost, minting cost, operating cost
  | 'fee'        // transaction fee, entry fee, withdrawal fee
  | 'reward'     // reward rate, payout multiplier
  | 'yield'      // yield rate, harvest rate, emission rate
  | 'rate'       // generic rate (fallback)
  | 'cap'        // supply cap, pool cap
  | 'penalty'    // withdrawal penalty, decay rate
  | 'multiplier' // crowding multiplier, bonus multiplier
  | string;      // extensible — any custom type

/** How a parameter change affects net currency flow */
export type FlowImpact =
  | 'sink'             // increasing this parameter drains currency (costs, fees, penalties)
  | 'faucet'           // increasing this parameter injects currency (rewards, yields)
  | 'neutral'          // no direct flow effect (caps, multipliers)
  | 'mixed'            // depends on context
  | 'friction'         // slows flow without removing currency (cooldowns, lock periods)
  | 'redistribution';  // moves currency between participants without net change

/** Scope narrows which concrete parameter a type resolves to */
export interface ParameterScope {
  system?: string;        // e.g. 'marketplace', 'staking', 'production'
  currency?: string;      // e.g. 'gold', 'gems', 'ETH'
  tags?: string[];        // e.g. ['entry'], ['transaction'], ['withdrawal']
}

/** A registered parameter in the economy */
export interface RegisteredParameter {
  /** Concrete key used by the adapter (e.g. 'craftingCost', 'stakingYield') */
  key: string;
  /** What type of parameter this is */
  type: ParameterType;
  /** How changing this affects net flow */
  flowImpact: FlowImpact;
  /** Scope constraints — narrows resolution */
  scope?: Partial<ParameterScope>;
  /** Current value (updated after each apply) */
  currentValue?: number;
  /** Human-readable description */
  description?: string;
  /** Priority tiebreaker — higher wins when specificity scores are equal */
  priority?: number;
  /** Human-readable label for UIs and logs */
  label?: string;
}

/** Result of registry.validate() */
export interface RegistryValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

// ── Registry ────────────────────────────────────────────────────────────────

export class ParameterRegistry {
  private parameters = new Map<string, RegisteredParameter>();

  /** Register a parameter. Overwrites if key already exists. */
  register(param: RegisteredParameter): void {
    this.parameters.set(param.key, { ...param });
  }

  /** Register multiple parameters at once. */
  registerAll(params: RegisteredParameter[]): void {
    for (const p of params) this.register(p);
  }

  /**
   * Resolve a parameterType + scope to a concrete RegisteredParameter.
   * Returns the best match, or undefined if no match.
   *
   * Matching rules:
   * 1. Filter candidates by type
   * 2. Score each by scope specificity (system +10, currency +5, tags +3 each)
   * 3. Mismatched scope fields disqualify (score = -Infinity)
   * 4. Ties broken by `priority` (higher wins), then registration order
   * 5. All disqualified → undefined
   */
  resolve(type: ParameterType, scope?: Partial<ParameterScope>): RegisteredParameter | undefined {
    const candidates = this.findByType(type);
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    let bestScore = -Infinity;
    let bestPriority = -Infinity;
    let best: RegisteredParameter | undefined;

    for (const candidate of candidates) {
      const score = this.scopeSpecificity(candidate.scope, scope);
      const prio = candidate.priority ?? 0;

      if (score > bestScore || (score === bestScore && prio > bestPriority)) {
        bestScore = score;
        bestPriority = prio;
        best = candidate;
      }
    }

    // If the best score is still -Infinity, all candidates were disqualified
    if (bestScore === -Infinity) return undefined;

    return best;
  }

  /** Find all parameters of a given type. */
  findByType(type: ParameterType): RegisteredParameter[] {
    const results: RegisteredParameter[] = [];
    for (const param of this.parameters.values()) {
      if (param.type === type) results.push(param);
    }
    return results;
  }

  /** Find all parameters belonging to a given system. */
  findBySystem(system: string): RegisteredParameter[] {
    const results: RegisteredParameter[] = [];
    for (const param of this.parameters.values()) {
      if (param.scope?.system === system) results.push(param);
    }
    return results;
  }

  /** Get a parameter by its concrete key. */
  get(key: string): RegisteredParameter | undefined {
    return this.parameters.get(key);
  }

  /** Get the flow impact of a parameter by its concrete key. */
  getFlowImpact(key: string): FlowImpact | undefined {
    return this.parameters.get(key)?.flowImpact;
  }

  /** Update the current value of a registered parameter. */
  updateValue(key: string, value: number): void {
    const param = this.parameters.get(key);
    if (param) {
      param.currentValue = value;
    }
  }

  /** Get all registered parameters. */
  getAll(): RegisteredParameter[] {
    return [...this.parameters.values()];
  }

  /** Number of registered parameters. */
  get size(): number {
    return this.parameters.size;
  }

  /**
   * Validate the registry for common misconfigurations.
   * Returns warnings (non-fatal) and errors (likely broken).
   */
  validate(): RegistryValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for duplicate keys (impossible via Map, but verify types with same scope)
    const typeMap = new Map<string, RegisteredParameter[]>();
    for (const param of this.parameters.values()) {
      const list = typeMap.get(param.type) ?? [];
      list.push(param);
      typeMap.set(param.type, list);
    }

    // Warn: types with multiple entries but no scope differentiation
    for (const [type, params] of typeMap) {
      if (params.length > 1) {
        const unscopedCount = params.filter(p => !p.scope).length;
        if (unscopedCount > 1) {
          errors.push(
            `Type '${type}' has ${unscopedCount} unscoped parameters — resolve() cannot distinguish them`,
          );
        }
      }
    }

    // Warn: parameters without flowImpact
    for (const param of this.parameters.values()) {
      if (!param.flowImpact) {
        warnings.push(`Parameter '${param.key}' has no flowImpact — Simulator will use inference`);
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private scopeSpecificity(
    paramScope?: Partial<ParameterScope>,
    queryScope?: Partial<ParameterScope>,
  ): number {
    // No query scope → any param matches with base score
    if (!queryScope) return 0;
    // No param scope → generic match (lowest priority)
    if (!paramScope) return 0;

    let score = 0;

    // System match
    if (queryScope.system && paramScope.system) {
      if (queryScope.system === paramScope.system) score += 10;
      else return -Infinity; // system mismatch = disqualify
    }

    // Currency match
    if (queryScope.currency && paramScope.currency) {
      if (queryScope.currency === paramScope.currency) score += 5;
      else return -Infinity; // currency mismatch = disqualify
    }

    // Tag overlap
    if (queryScope.tags && queryScope.tags.length > 0 && paramScope.tags && paramScope.tags.length > 0) {
      const overlap = queryScope.tags.filter(t => paramScope.tags!.includes(t)).length;
      if (overlap > 0) {
        score += overlap * 3;
      } else {
        return -Infinity; // no tag overlap when both specify tags = disqualify
      }
    }

    return score;
  }
}
