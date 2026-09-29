import { describe, it, expect, vi } from 'vitest';
import { compareVersions, headerVersion, checkForUpdate } from '../src/update-check.js';
import { UPDATE_URL } from '../src/version.js';

const res = (text, ok = true) => Promise.resolve({ ok, text: () => Promise.resolve(text) });

describe('update check', () => {
  it('compares dotted versions as numbers', () => {
    expect(compareVersions('0.10.0', '0.9.3')).toBe(1);
    expect(compareVersions('0.7.0', '0.7.0')).toBe(0);
    expect(compareVersions('0.7', '0.7.1')).toBe(-1);
  });

  it("reads the userscript header's version", () => {
    expect(headerVersion('// ==UserScript==\n// @name  X\n// @version      0.7.1\n')).toBe('0.7.1');
    expect(headerVersion('nothing here')).toBeNull();
    expect(headerVersion('// @version abc')).toBeNull();
  });

  it('fetches the update URL once, without the cache, and says whether a newer version is out', async () => {
    const fetchImpl = vi.fn(() => res('// @version      0.7.1\n'));
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl })).toEqual({ status: 'newer', latest: '0.7.1' });
    expect(fetchImpl).toHaveBeenCalledWith(UPDATE_URL, { cache: 'no-store', credentials: 'omit' });
    expect(await checkForUpdate({ current: '0.7.1', fetchImpl })).toEqual({ status: 'current' });
    expect(await checkForUpdate({ current: '0.8.0', fetchImpl })).toEqual({ status: 'current' });
  });

  it('fails softly', async () => {
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl: () => res('', false) })).toEqual({ status: 'failed' });
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl: () => res('no header') })).toEqual({ status: 'failed' });
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl: () => Promise.reject(new Error('offline')) })).toEqual({ status: 'failed' });
  });
});
