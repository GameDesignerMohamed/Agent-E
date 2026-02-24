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
  | 'sink'       // increasing this parameter drains currency (costs, fees, penalties)
  | 'faucet'     // increasing this parameter injects currency (rewards, yields)
  | 'neutral'    // no direct flow effect (caps, multipliers)
  | 'mixed';     // depends on context

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
   * Matching rules (in priority order):
   * 1. Exact type match + all scope fields match
   * 2. Exact type match + partial scope match (tags overlap)
   * 3. Exact type match + no scope constraints
   * 4. undefined (no match)
   */
  resolve(type: ParameterType, scope?: Partial<ParameterScope>): RegisteredParameter | undefined {
    const candidates = this.findByType(type);
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    // Score each candidate by scope match quality
    let bestScore = -1;
    let best: RegisteredParameter | undefined;

    for (const candidate of candidates) {
      const score = this.scopeMatchScore(candidate.scope, scope);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

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

  // ── Private ─────────────────────────────────────────────────────────────

  private scopeMatchScore(
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
      else return -1; // system mismatch = disqualify
    }

    // Currency match
    if (queryScope.currency && paramScope.currency) {
      if (queryScope.currency === paramScope.currency) score += 5;
      else return -1; // currency mismatch = disqualify
    }

    // Tag overlap
    if (queryScope.tags && queryScope.tags.length > 0 && paramScope.tags && paramScope.tags.length > 0) {
      const overlap = queryScope.tags.filter(t => paramScope.tags!.includes(t)).length;
      if (overlap > 0) {
        score += overlap * 3;
      } else {
        return -1; // no tag overlap when both specify tags = disqualify
      }
    } else if (queryScope.tags && queryScope.tags.length > 0 && paramScope.tags && paramScope.tags.length > 0) {
      // Both have tags but no overlap
      return -1;
    }

    return score;
  }
}
