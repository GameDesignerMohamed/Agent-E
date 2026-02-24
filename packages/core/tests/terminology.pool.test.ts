import { describe, it, expect } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../src/defaults.js';
import { ALL_PRINCIPLES } from '../src/principles/index.js';
import { emptyMetrics } from '../src/types.js';
import type { Thresholds } from '../src/types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Pool terminology (#17)', () => {
  it('poolOperatorShare exists on default thresholds', () => {
    expect(DEFAULT_THRESHOLDS.poolOperatorShare).toBe(0.10);
  });

  it('poolHouseCut does NOT exist on default thresholds', () => {
    expect('poolHouseCut' in DEFAULT_THRESHOLDS).toBe(false);
  });

  it('poolWinRate still exists', () => {
    expect(DEFAULT_THRESHOLDS.poolWinRate).toBe(0.65);
  });

  it('principle reasoning strings use "pool" not "competitive pool"', () => {
    const srcDir = path.join(__dirname, '..', 'src', 'principles');
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
      const matches = content.match(/competitive pool/gi) ?? [];
      expect(matches.length, `"competitive pool" found in ${file}`).toBe(0);
    }
  });

  it('defaults.ts uses poolOperatorShare key (not poolHouseCut)', () => {
    const defaultsPath = path.join(__dirname, '..', 'src', 'defaults.ts');
    const content = fs.readFileSync(defaultsPath, 'utf-8');

    expect(content).toContain('poolOperatorShare');
    expect(content).not.toContain('poolHouseCut');
  });

  it('types.ts uses poolOperatorShare (not poolHouseCut)', () => {
    const typesPath = path.join(__dirname, '..', 'src', 'types.ts');
    const content = fs.readFileSync(typesPath, 'utf-8');

    expect(content).toContain('poolOperatorShare');
    expect(content).not.toContain('poolHouseCut');
  });
});
