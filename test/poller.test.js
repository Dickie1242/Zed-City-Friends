import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makePoller } from '../src/poller.js';
import { resetWarnings } from '../src/util.js';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

// A run() whose promise stays pending until the test releases it, to control overlap timing.
function controlledRun() {
  const releases = [];
  const run = vi.fn(() => new Promise((resolve) => releases.push(resolve)));
  return { run, release: (v = { ok: true }) => releases.shift()(v) };
}

// Tracks every poller created in a test so afterEach can destroy it, even if the test fails
// partway through — an undestroyed poller keeps its visibilitychange listener on document and
// can go on running, producing misleading unhandled-rejection noise in later tests.
let pollers;
function newPoller(opts) {
  const p = makePoller(opts);
  pollers.push(p);
  return p;
}

describe('poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    resetWarnings();
    pollers = [];
  });
  afterEach(() => {
    for (const p of pollers) p.destroy();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('runs immediately on start and then every interval', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = newPoller({ run, interval: 1000 });
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
    const p = newPoller({ run, interval: 1000 });
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
    const p = newPoller({ run, interval: 1000, maxBackoff: 3000 });
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
    const p = newPoller({ run, interval: 1000, busyInterval: 60000, onAuthLost });
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
    const p = newPoller({ run, interval: () => ms });
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
    const p = newPoller({ run, interval: 10000 });
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

  it('clears a pending rerun on stop, so a later start does not cause a back-to-back run', async () => {
    const c = controlledRun();
    const p = newPoller({ run: c.run, interval: 10000 });
    p.start();
    p.poke(); // sets a pending rerun while the first run is in flight
    p.stop();
    c.release({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.run).toHaveBeenCalledTimes(1); // stopped: the pending rerun must not fire
    await vi.advanceTimersByTimeAsync(60000);
    p.start();
    expect(c.run).toHaveBeenCalledTimes(2); // start() runs once, right away
    c.release({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.run).toHaveBeenCalledTimes(2); // no stale rerun causing a 3rd, back-to-back run
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    p.destroy();
  });

  it('an auth result with a poke pending stops immediately, without an extra run', async () => {
    const c = controlledRun();
    const onAuthLost = vi.fn();
    const p = newPoller({ run: c.run, interval: 1000, onAuthLost });
    p.start();
    p.poke(); // pending rerun must not be allowed to sneak a request past auth loss
    c.release({ ok: false, kind: 'auth' });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.run).toHaveBeenCalledTimes(1);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(p.active).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(c.run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    p.destroy();
  });

  it('an auth result with a pending poke does not leave a stale rerun for a later start (onAuthLost does not stop)', async () => {
    const c = controlledRun();
    const onAuthLost = vi.fn(); // deliberately does not call stop()
    const p = newPoller({ run: c.run, interval: 1000, onAuthLost });
    p.start();
    p.poke(); // pending rerun while the first run is in flight
    c.release({ ok: false, kind: 'auth' });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.run).toHaveBeenCalledTimes(1);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(p.active).toBe(false);
    p.start(); // re-authenticated
    expect(c.run).toHaveBeenCalledTimes(2); // start() runs once, right away
    c.release({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.run).toHaveBeenCalledTimes(2); // no stale rerun causing a back-to-back 3rd run
    expect(vi.getTimerCount()).toBe(1);
    p.destroy();
  });

  it('counts a network failure toward backoff even when a pending poke reruns immediately', async () => {
    const c = controlledRun();
    const p = newPoller({ run: c.run, interval: 1000 });
    p.start();
    p.poke(); // pending rerun while the first run is in flight
    c.release({ ok: false, kind: 'network' });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.run).toHaveBeenCalledTimes(2); // the poke still reruns right away
    c.release({ ok: false, kind: 'network' });
    await vi.advanceTimersByTimeAsync(0);
    // The first failure must have counted toward backoff, so this wait is the doubled
    // interval (4000ms) rather than a fresh base*2 (2000ms).
    await vi.advanceTimersByTimeAsync(3999);
    expect(c.run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.run).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    p.destroy();
  });

  it('recovers when interval() throws after a run, logging a warning and scheduling a fallback wait', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let boom = false;
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = newPoller({
      run,
      interval: () => {
        if (boom) throw new Error('boom');
        return 1000;
      },
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    boom = true;
    await vi.advanceTimersByTimeAsync(1000); // this run's post-run interval() read throws
    expect(run).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    boom = false;
    // interval is a function (not a number), so the fallback wait is the fixed 60000ms.
    await vi.advanceTimersByTimeAsync(59999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);
    p.destroy();
  });

  it('re-reads the interval function before every wait: 15s, then 5s, then 15s', async () => {
    let ms = 15000;
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = newPoller({ run, interval: () => ms });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    ms = 5000; // takes effect on the next wait, not the one already scheduled at 15000
    await vi.advanceTimersByTimeAsync(15000);
    expect(run).toHaveBeenCalledTimes(2);
    ms = 15000; // takes effect on the wait after this one
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(14999);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(1);
    p.destroy();
  });
});
