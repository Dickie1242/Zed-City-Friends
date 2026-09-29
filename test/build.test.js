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
    expect(text).toContain('// @license      MIT');
    expect(text).not.toMatch(/\bimport\s*[{*]/);
    // ~272 KB readable in 0.5.0 (Greasy Fork forbids minified code): the ~50 KB emoji table, the
    // Friends/Enemies page, and since 0.5.0 Private Messages, Chat settings and per-chat customization.
    // The cap catches accidental bloat, not the readable source itself.
    expect(Buffer.byteLength(text)).toBeLessThan(320 * 1024);
    expect(text).toContain('Zed City Friends v');
    expect(text).not.toContain('__ZCF_VERSION__');
  }, 30000);
});
