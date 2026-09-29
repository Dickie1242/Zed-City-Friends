// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { bundle, HEADER } from '../build.mjs';

describe('build', () => {
  it('produces one userscript with the metadata header, under the size budget', async () => {
    const result = await bundle({ write: false });
    expect(result.outputFiles).toHaveLength(1);
    const text = result.outputFiles[0].text;
    expect(text.startsWith(HEADER)).toBe(true);
    expect(text).toContain('// @match        https://www.zed.city/*');
    expect(text).toContain('// @grant        none');
    expect(text).not.toMatch(/\bimport\s*[{*]/);
    // ~85 KB readable today (Greasy Fork forbids minified code); the cap catches accidental bloat.
    expect(Buffer.byteLength(text)).toBeLessThan(120 * 1024);
  }, 30000);
});
