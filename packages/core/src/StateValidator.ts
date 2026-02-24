// StateValidator — validates incoming EconomyState shape at runtime

export interface ValidationError {
  path: string;
  expected: string;
  received: string;
  message: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export function validateEconomyState(state: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (state === null || state === undefined || typeof state !== 'object') {
    errors.push({
      path: '',
      expected: 'object',
      received: state === null ? 'null' : typeof state,
      message: 'State must be a non-null object',
    });
    return { valid: false, errors, warnings };
  }

  const s = state as Record<string, unknown>;

  // ── tick ──
  if (!isNonNegativeInteger(s['tick'])) {
    errors.push({
      path: 'tick',
      expected: 'non-negative integer',
      received: describeValue(s['tick']),
      message: 'tick must be a non-negative integer',
    });
  }

  // ── roles ──
  if (!isNonEmptyStringArray(s['roles'])) {
    errors.push({
      path: 'roles',
      expected: 'non-empty string[]',
      received: describeValue(s['roles']),
      message: 'roles must be a non-empty array of strings',
    });
  }
  const roles = new Set(Array.isArray(s['roles']) ? (s['roles'] as unknown[]).filter(r => typeof r === 'string') as string[] : []);

  // ── resources ──
  if (!isStringArray(s['resources'])) {
    errors.push({
      path: 'resources',
      expected: 'string[]',
      received: describeValue(s['resources']),
      message: 'resources must be an array of strings (can be empty)',
    });
  }
  const resources = new Set(Array.isArray(s['resources']) ? (s['resources'] as unknown[]).filter(r => typeof r === 'string') as string[] : []);

  // ── currencies ──
  if (!isNonEmptyStringArray(s['currencies'])) {
    errors.push({
      path: 'currencies',
      expected: 'non-empty string[]',
      received: describeValue(s['currencies']),
      message: 'currencies must be a non-empty array of strings',
    });
  }
  const currencies = new Set(
    Array.isArray(s['currencies'])
      ? (s['currencies'] as unknown[]).filter(r => typeof r === 'string') as string[]
      : [],
  );

  // ── agentBalances ── Record<string, Record<string, number>>
  if (isRecord(s['agentBalances'])) {
    const balances = s['agentBalances'] as Record<string, unknown>;
    for (const [agentId, currencyMap] of Object.entries(balances)) {
      if (!isRecord(currencyMap)) {
        errors.push({
          path: `agentBalances.${agentId}`,
          expected: 'Record<string, number>',
          received: describeValue(currencyMap),
          message: `agentBalances.${agentId} must be a Record<string, number>`,
        });
        continue;
      }
      for (const [currency, value] of Object.entries(currencyMap as Record<string, unknown>)) {
        if (typeof value !== 'number' || value < 0) {
          errors.push({
            path: `agentBalances.${agentId}.${currency}`,
            expected: 'number >= 0',
            received: describeValue(value),
            message: `agentBalances.${agentId}.${currency} must be a non-negative number`,
          });
        }
        if (currencies.size > 0 && !currencies.has(currency)) {
          errors.push({
            path: `agentBalances.${agentId}.${currency}`,
            expected: `one of [${[...currencies].join(', ')}]`,
            received: currency,
            message: `agentBalances currency key "${currency}" is not in currencies`,
          });
        }
      }
    }
  } else {
    errors.push({
      path: 'agentBalances',
      expected: 'Record<string, Record<string, number>>',
      received: describeValue(s['agentBalances']),
      message: 'agentBalances must be a nested Record<string, Record<string, number>>',
    });
  }

  // ── agentRoles ── Record<string, string>
  if (isRecord(s['agentRoles'])) {
    const agentRoles = s['agentRoles'] as Record<string, unknown>;
    for (const [agentId, role] of Object.entries(agentRoles)) {
      if (typeof role !== 'string') {
        errors.push({
          path: `agentRoles.${agentId}`,
          expected: 'string',
          received: describeValue(role),
          message: `agentRoles.${agentId} must be a string`,
        });
      } else if (roles.size > 0 && !roles.has(role)) {
        errors.push({
          path: `agentRoles.${agentId}`,
          expected: `one of [${[...roles].join(', ')}]`,
          received: role,
          message: `agentRoles value "${role}" is not in roles`,
        });
      }
    }
  } else {
    errors.push({
      path: 'agentRoles',
      expected: 'Record<string, string>',
      received: describeValue(s['agentRoles']),
      message: 'agentRoles must be a Record<string, string>',
    });
  }

  // ── agentInventories ── Record<string, Record<string, number>>
  if (isRecord(s['agentInventories'])) {
    const inventories = s['agentInventories'] as Record<string, unknown>;
    for (const [agentId, inv] of Object.entries(inventories)) {
      if (!isRecord(inv)) {
        errors.push({
          path: `agentInventories.${agentId}`,
          expected: 'Record<string, number>',
          received: describeValue(inv),
          message: `agentInventories.${agentId} must be a Record<string, number>`,
        });
        continue;
      }
      for (const [resource, qty] of Object.entries(inv as Record<string, unknown>)) {
        if (typeof qty !== 'number' || qty < 0) {
          errors.push({
            path: `agentInventories.${agentId}.${resource}`,
            expected: 'number >= 0',
            received: describeValue(qty),
            message: `agentInventories.${agentId}.${resource} must be a non-negative number`,
          });
        }
      }
    }
  } else {
    errors.push({
      path: 'agentInventories',
      expected: 'Record<string, Record<string, number>>',
      received: describeValue(s['agentInventories']),
      message: 'agentInventories must be a Record<string, Record<string, number>>',
    });
  }

  // ── marketPrices ── Record<string, Record<string, number>>
  if (isRecord(s['marketPrices'])) {
    const marketPrices = s['marketPrices'] as Record<string, unknown>;
    for (const [currency, resourcePrices] of Object.entries(marketPrices)) {
      if (currencies.size > 0 && !currencies.has(currency)) {
        errors.push({
          path: `marketPrices.${currency}`,
          expected: `one of [${[...currencies].join(', ')}]`,
          received: currency,
          message: `marketPrices outer key "${currency}" is not in currencies`,
        });
      }
      if (!isRecord(resourcePrices)) {
        errors.push({
          path: `marketPrices.${currency}`,
          expected: 'Record<string, number>',
          received: describeValue(resourcePrices),
          message: `marketPrices.${currency} must be a Record<string, number>`,
        });
        continue;
      }
      for (const [resource, price] of Object.entries(resourcePrices as Record<string, unknown>)) {
        if (typeof price !== 'number' || price < 0) {
          errors.push({
            path: `marketPrices.${currency}.${resource}`,
            expected: 'number >= 0',
            received: describeValue(price),
            message: `marketPrices.${currency}.${resource} must be a non-negative number`,
          });
        }
      }
    }
  } else {
    errors.push({
      path: 'marketPrices',
      expected: 'Record<string, Record<string, number>>',
      received: describeValue(s['marketPrices']),
      message: 'marketPrices must be a nested Record<string, Record<string, number>>',
    });
  }

  // ── recentTransactions ── array
  if (!Array.isArray(s['recentTransactions'])) {
    errors.push({
      path: 'recentTransactions',
      expected: 'array',
      received: describeValue(s['recentTransactions']),
      message: 'recentTransactions must be an array',
    });
  }

  // ── Optional: agentSatisfaction ──
  if (s['agentSatisfaction'] !== undefined) {
    if (isRecord(s['agentSatisfaction'])) {
      const satisfaction = s['agentSatisfaction'] as Record<string, unknown>;
      for (const [agentId, value] of Object.entries(satisfaction)) {
        if (typeof value !== 'number' || value < 0 || value > 100) {
          errors.push({
            path: `agentSatisfaction.${agentId}`,
            expected: 'number 0-100',
            received: describeValue(value),
            message: `agentSatisfaction.${agentId} must be a number between 0 and 100`,
          });
        }
      }
    } else {
      errors.push({
        path: 'agentSatisfaction',
        expected: 'Record<string, number> | undefined',
        received: describeValue(s['agentSatisfaction']),
        message: 'agentSatisfaction must be a Record<string, number> if provided',
      });
    }
  }

  // ── Optional: poolSizes ── Record<string, Record<string, number>>
  if (s['poolSizes'] !== undefined) {
    if (isRecord(s['poolSizes'])) {
      const pools = s['poolSizes'] as Record<string, unknown>;
      for (const [currency, poolMap] of Object.entries(pools)) {
        if (!isRecord(poolMap)) {
          errors.push({
            path: `poolSizes.${currency}`,
            expected: 'Record<string, number>',
            received: describeValue(poolMap),
            message: `poolSizes.${currency} must be a Record<string, number>`,
          });
          continue;
        }
        for (const [poolName, size] of Object.entries(poolMap as Record<string, unknown>)) {
          if (typeof size !== 'number' || size < 0) {
            errors.push({
              path: `poolSizes.${currency}.${poolName}`,
              expected: 'number >= 0',
              received: describeValue(size),
              message: `poolSizes.${currency}.${poolName} must be a non-negative number`,
            });
          }
        }
      }
    } else {
      errors.push({
        path: 'poolSizes',
        expected: 'Record<string, Record<string, number>> | undefined',
        received: describeValue(s['poolSizes']),
        message: 'poolSizes must be a nested Record if provided',
      });
    }
  }

  // ── Warnings ──

  // Currency declared but no agent holds it
  if (currencies.size > 0 && isRecord(s['agentBalances'])) {
    const heldCurrencies = new Set<string>();
    const balances = s['agentBalances'] as Record<string, Record<string, unknown>>;
    for (const currencyMap of Object.values(balances)) {
      if (isRecord(currencyMap)) {
        for (const key of Object.keys(currencyMap as Record<string, unknown>)) {
          heldCurrencies.add(key);
        }
      }
    }
    for (const currency of currencies) {
      if (!heldCurrencies.has(currency)) {
        warnings.push({
          path: `currencies`,
          message: `Currency "${currency}" is declared but no agent holds it`,
        });
      }
    }
  }

  // Agent with balance but no role
  if (isRecord(s['agentBalances']) && isRecord(s['agentRoles'])) {
    const agentRoles = s['agentRoles'] as Record<string, unknown>;
    const agentBalances = s['agentBalances'] as Record<string, unknown>;
    for (const agentId of Object.keys(agentBalances)) {
      if (!(agentId in agentRoles)) {
        warnings.push({
          path: `agentBalances.${agentId}`,
          message: `Agent "${agentId}" has balances but no role assigned`,
        });
      }
    }
  }

  // Empty resources with non-empty inventories
  if (resources.size === 0 && isRecord(s['agentInventories'])) {
    const inventories = s['agentInventories'] as Record<string, unknown>;
    let hasItems = false;
    for (const inv of Object.values(inventories)) {
      if (isRecord(inv) && Object.keys(inv as Record<string, unknown>).length > 0) {
        hasItems = true;
        break;
      }
    }
    if (hasItems) {
      warnings.push({
        path: 'resources',
        message: 'resources is empty but agents have non-empty inventories',
      });
    }
  }

  // Events referencing unknown currencies
  if (Array.isArray(s['recentTransactions']) && currencies.size > 0) {
    for (const event of s['recentTransactions'] as unknown[]) {
      if (isRecord(event)) {
        const e = event as Record<string, unknown>;
        if (typeof e['metadata'] === 'object' && e['metadata'] !== null) {
          const meta = e['metadata'] as Record<string, unknown>;
          if (typeof meta['currency'] === 'string' && !currencies.has(meta['currency'])) {
            warnings.push({
              path: 'recentTransactions',
              message: `Event references unknown currency "${meta['currency']}"`,
            });
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((v: unknown) => typeof v === 'string');
}

function isNonEmptyStringArray(value: unknown): boolean {
  return isStringArray(value) && (value as unknown[]).length > 0;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}
