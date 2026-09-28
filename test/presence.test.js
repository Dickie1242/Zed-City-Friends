import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPresence } from '../src/presence.js';

describe('presence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fetches at most 2 at a time, 250ms apart', async () => {
    const started = [];
    const fetchProfile = vi.fn((id) => {
      started.push([id, Date.now()]);
      return Promise.resolve({ ok: true, data: { online: id % 2 === 0, active: '2026-09-28 10:00:00' } });
    });
    const p = createPresence({ fetchProfile });
    const t0 = Date.now();
    p.refresh([1, 2, 3, 4, 5]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(started.map(([id]) => id)).toEqual([1, 2, 3, 4, 5]);
    expect(started.map(([, t]) => t - t0)).toEqual([0, 0, 250, 250, 500]);
    expect(p.get(2)).toMatchObject({ online: true, active: Date.UTC(2026, 8, 28, 10) });
  });

  it('skips fresh entries and refetches stale ones', async () => {
    let t = 1000;
    const fetchProfile = vi.fn(() => Promise.resolve({ ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, now: () => t, staleMs: 60000 });
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    t += 60000;
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers and passes profiles to onProfile', async () => {
    const onProfile = vi.fn();
    const sub = vi.fn();
    const p = createPresence({ fetchProfile: () => Promise.resolve({ ok: true, data: { username: 'Spike', online: false } }), onProfile });
    p.subscribe(sub);
    p.refresh([7]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onProfile).toHaveBeenCalledWith(7, { username: 'Spike', online: false });
    expect(sub).toHaveBeenCalledWith(7);
    p.set(8, { online: true });
    expect(sub).toHaveBeenCalledWith(8);
  });

  it('records fetchedAt as the time refresh() queued the id, so the 60s cadence holds even with a slow response', async () => {
    let t = 0;
    const fetchProfile = vi.fn(() => {
      t += 5000; // the response arrives a while after the id was queued
      return Promise.resolve({ ok: true, data: { online: true } });
    });
    const p = createPresence({ fetchProfile, now: () => t, staleMs: 60000 });
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    t = 60000;
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('drains the queue and pauses refresh() when a response is rate limited', async () => {
    let t = 0;
    const fetchProfile = vi.fn((id) =>
      Promise.resolve(id === 1 ? { ok: false, kind: 'rate', code: 429 } : { ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, now: () => t, concurrency: 1, pauseMs: 5000 });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    t += 5000;
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('drains the queue and pauses refresh() when a response requires auth', async () => {
    let t = 0;
    const fetchProfile = vi.fn((id) =>
      Promise.resolve(id === 1 ? { ok: false, kind: 'auth', code: 1 } : { ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, now: () => t, concurrency: 1, pauseMs: 5000 });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    t += 5000;
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('frees the slot and leaves the id stale on a network failure, without pausing other ids', async () => {
    const fetchProfile = vi.fn((id) =>
      Promise.resolve(id === 1 ? { ok: false, kind: 'network', code: 0 } : { ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, concurrency: 1 });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(p.get(1)).toBeNull();
    expect(p.isStale(1)).toBe(true);
    expect(p.get(2)).not.toBeNull();
  });

  it('frees the slot and leaves the id stale when the fetch rejects', async () => {
    const fetchProfile = vi.fn((id) =>
      (id === 1 ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true, data: { online: true } })));
    const p = createPresence({ fetchProfile, concurrency: 1 });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(p.isStale(1)).toBe(true);
    expect(p.get(2)).not.toBeNull();
  });

  it('frees the slot and leaves the id stale when fetchProfile throws synchronously', async () => {
    const fetchProfile = vi.fn((id) => {
      if (id === 1) throw new Error('boom');
      return Promise.resolve({ ok: true, data: { online: true } });
    });
    const p = createPresence({ fetchProfile, concurrency: 1 });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(p.isStale(1)).toBe(true);
    expect(p.get(2)).not.toBeNull();
  });

  it('skips an id in the queue if set() already refreshed it before its turn', async () => {
    const slow = (v) => new Promise((resolve) => setTimeout(() => resolve(v), 1000));
    const fetchProfile = vi.fn(() => slow({ ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, concurrency: 1 });
    p.refresh([1, 2, 3]);
    // 3 is still waiting behind 1 and 2 when a getChatInfo-style set() arrives for it.
    p.set(3, { online: true, active: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(p.get(3)).toMatchObject({ online: true });
  });

  it('never has more than 2 requests in flight, even with slow responses', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchProfile = vi.fn(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => setTimeout(() => {
        inFlight -= 1;
        resolve({ ok: true, data: { online: true } });
      }, 700));
    });
    const p = createPresence({ fetchProfile });
    p.refresh([1, 2, 3, 4, 5, 6, 7, 8]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(fetchProfile).toHaveBeenCalledTimes(8);
  });
});
