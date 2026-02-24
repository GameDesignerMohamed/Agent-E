/**
 * universality.test.ts
 *
 * Ensures no game-specific terminology remains in core source files.
 * The core package must be domain-agnostic — these terms were replaced
 * during the v1.0.x migration to universal vocabulary.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect every `.ts` file under `dir`. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Banned patterns — domain-specific terms that must not appear in core
// ---------------------------------------------------------------------------

const BANNED_PATTERNS = [
  { pattern: /\bplayer\b/i, name: 'player' },
  { pattern: /\bspawn\b/i, name: 'spawn' },
  { pattern: /\barena\b/i, name: 'arena' },
  // 'whale' removed — now a legitimate behavioral archetype (PersonaType) used across finance/crypto/marketplaces
  { pattern: /'productionCost'/, name: "'productionCost'" },
  { pattern: /'transactionFee'/, name: "'transactionFee'" },
  { pattern: /'entryFee'/, name: "'entryFee'" },
  { pattern: /'rewardRate'/, name: "'rewardRate'" },
  { pattern: /'yieldRate'/, name: "'yieldRate'" },
  { pattern: /\bquest\b/i, name: 'quest' },
  { pattern: /\bNPC\b/, name: 'NPC' },
  { pattern: /\bcrafting\b/i, name: 'crafting' },
  // V1.5.1 additions (Appendix A)
  { pattern: /\bstaleness\b/i, name: 'staleness' },
  { pattern: /\bRespawn\b/, name: 'Respawn' },
  { pattern: /\bSharkTooth\b/, name: 'SharkTooth' },
  { pattern: /\bLiveOps\b/, name: 'LiveOps' },
  { pattern: /\bContentDrop\b/, name: 'ContentDrop' },
  { pattern: /_PinchPoint\b/, name: 'PinchPoint (in variable name)' },
  { pattern: /SpawnWeighting/, name: 'SpawnWeighting' },
  // V1.5.2 additions (pool terminology)
  { pattern: /poolHouseCut/, name: 'poolHouseCut' },
  { pattern: /competitive pool/i, name: 'competitive pool' },
  { pattern: /ProfitabilityIsCompetitive/, name: 'ProfitabilityIsCompetitive' },
];

/** Old principle categories that were replaced. */
const BANNED_CATEGORIES = [
  { pattern: /'player_experience'/, name: "'player_experience' (now 'participant_experience')" },
  { pattern: /'liveops'/, name: "'liveops' (now 'operations')" },
];

/** Old event type that was replaced. */
const BANNED_EVENT_TYPES = [
  { pattern: /'spawn'/, name: "'spawn' event type (now 'enter')" },
];

// ---------------------------------------------------------------------------
// Resolve the src directory relative to __dirname (tests/ -> ../src)
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(__dirname, '../src');

// ---------------------------------------------------------------------------
// Violation type
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  lineNumber: number;
  line: string;
  term: string;
}

/**
 * Scan every `.ts` file in `srcDir` for the given list of banned patterns.
 * Returns an array of violations with file, line number, content, and term.
 */
function findViolations(
  srcDir: string,
  patterns: { pattern: RegExp; name: string }[],
): Violation[] {
  const files = collectTsFiles(srcDir);
  const violations: Violation[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const { pattern, name } of patterns) {
        if (pattern.test(line)) {
          violations.push({
            file: path.relative(srcDir, filePath),
            lineNumber: i + 1,
            line: line.trim(),
            term: name,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Build a readable assertion message from a list of violations.
 */
function formatViolations(violations: Violation[]): string {
  const header = `Found ${violations.length} banned term(s) in core source files:\n`;
  const details = violations
    .map(
      (v) =>
        `  ${v.file}:${v.lineNumber}  term="${v.term}"\n    → ${v.line}`,
    )
    .join('\n');
  return header + details;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Core universality — no game-specific terminology', () => {
  it('should contain no banned domain-specific terms in src/', () => {
    const violations = findViolations(SRC_DIR, BANNED_PATTERNS);
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  it('should not use old principle categories (player_experience, liveops)', () => {
    const violations = findViolations(SRC_DIR, BANNED_CATEGORIES);
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  it("should not use old 'spawn' event type (replaced by 'enter')", () => {
    const violations = findViolations(SRC_DIR, BANNED_EVENT_TYPES);
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });
});
