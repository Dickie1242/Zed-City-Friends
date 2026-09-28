import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warnOnce, resetWarnings, safe, debounce, asArray, toId } from '../src/util.js';

describe('util', () => {
  beforeEach(() => resetWarnings());

  it('warnOnce logs each key only once', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOnce('a', 1);
    warnOnce('a', 2);
    warnOnce('b');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]).toEqual(['[ZCF]', 'a', 1]);
  });

  it('safe swallows sync throws and async rejections', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(safe('x', () => { throw new Error('boom'); })()).toBeUndefined();
    safe('y', async () => { throw new Error('later'); })();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('debounce runs once after the quiet period and can be cancelled', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d(1);
    d(2);
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith(2);
    d(3);
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('asArray accepts arrays and index-keyed objects', () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray({ 0: 'a', 1: 'b' })).toEqual(['a', 'b']);
    expect(asArray(null)).toEqual([]);
  });

  it('toId only accepts positive integers', () => {
    expect(toId('42')).toBe(42);
    expect(toId(0)).toBeNull();
    expect(toId('abc')).toBeNull();
    expect(toId(1.5)).toBeNull();
  });
});
