import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makePoller } from '../src/poller.js';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('runs immediately on start and then every interval', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = makePoller({ run, interval: 1000 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    p.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
    p.destroy();
  });

  it('pauses while hidden and runs right away when visible again', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = makePoller({ run, interval: 1000 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    p.destroy();
  });

  it('doubles the wait on network errors up to the cap, and resets on success', async () => {
    const results = [{ ok: false, kind: 'network' }, { ok: false, kind: 'rate' }, { ok: false, kind: 'network' }, { ok: true }, { ok: true }];
    const times = [];
    const run = vi.fn(() => {
      times.push(Date.now());
      return Promise.resolve(results.shift() || { ok: true });
    });
    const p = makePoller({ run, interval: 1000, maxBackoff: 3000 });
    const t0 = Date.now();
    p.start();
    await vi.advanceTimersByTimeAsync(20000);
    const gaps = times.slice(1, 6).map((t, i) => t - times[i]);
    expect(times[0] - t0).toBe(0);
    expect(gaps).toEqual([2000, 3000, 3000, 1000, 1000]);
    p.destroy();
  });

  it('slows to busyInterval while busy and stops on auth errors', async () => {
    const onAuthLost = vi.fn();
    const results = [{ ok: false, kind: 'busy' }, { ok: false, kind: 'auth' }];
    const run = vi.fn(() => Promise.resolve(results.shift()));
    const p = makePoller({ run, interval: 1000, busyInterval: 60000, onAuthLost });
    p.start();
    await vi.advanceTimersByTimeAsync(59999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(p.active).toBe(false);
    p.destroy();
  });

  it('reads a function interval before every wait and can reschedule', async () => {
    let ms = 15000;
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = makePoller({ run, interval: () => ms });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    ms = 5000;
    p.reschedule();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
    p.destroy();
  });

  it('never overlaps runs; a poke during a run triggers one more run after it', async () => {
    let release;
    const run = vi.fn(() => new Promise((r) => { release = r; }));
    const p = makePoller({ run, interval: 10000 });
    p.start();
    p.poke();
    p.poke();
    expect(run).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    release({ ok: true });
    p.destroy();
  });
});
