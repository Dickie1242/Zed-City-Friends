import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/version.js';
import { WHATS_NEW } from '../src/whats-new.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')); // vitest runs from the project root

describe('version and release notes', () => {
  it('reads the version from package.json at build time', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('lists releases newest first as plain text', () => {
    expect(WHATS_NEW[0].version).toBe('0.8.0');
    expect(WHATS_NEW.map((v) => v.version)).toEqual(['0.8.0', '0.7.x', '0.6.0', '0.5.x', '0.4.x', '0.3.x', '0.2.x', '0.1.x']);
    for (const v of WHATS_NEW) {
      expect(v.features.length).toBeGreaterThan(0);
      for (const f of v.features) {
        expect(typeof f.title).toBe('string');
        for (const p of f.points) expect(p).not.toMatch(/[<>]/);
      }
    }
  });
});
