import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Version alignment', () => {
  it('all packages must share the same version (lockstep)', () => {
    const packagesDir = resolve(__dirname, '../../');
    const packageNames = ['engine', 'community', 'pro', 'server', 'adapter-game'];

    const versions = packageNames.map((name) => {
      const pkg = JSON.parse(
        readFileSync(resolve(packagesDir, name, 'package.json'), 'utf-8'),
      );
      return { name: pkg.name, version: pkg.version };
    });

    const expected = versions[0].version;
    for (const { name, version } of versions) {
      expect(version, `${name} is ${version}, expected ${expected}`).toBe(expected);
    }
  });
});
