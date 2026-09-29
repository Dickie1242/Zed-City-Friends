import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPresence, lastActive, profileDetails } from '../src/presence.js';
import { statusText } from '../src/time.js';

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

  it('frees the slot on a network failure, without pausing other ids, and retries after staleMs', async () => {
    let t = 0;
    const fetchProfile = vi.fn((id) =>
      Promise.resolve(id === 1 ? { ok: false, kind: 'network', code: 0 } : { ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, concurrency: 1, now: () => t });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(p.get(1)).toBeNull();
    expect(p.isStale(1)).toBe(false); // waits its turn like a success, so it can't hog every sweep
    t = 60000;
    expect(p.isStale(1)).toBe(true);
    expect(p.get(2)).not.toBeNull();
  });

  it('sorts a friend whose fetch failed behind the others by when it was last tried', async () => {
    let t = 1000;
    const fetchProfile = vi.fn((id) => Promise.resolve(id === 1 ? { ok: false, kind: 'other' } : { ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, now: () => t });
    expect(p.lastTried(1)).toBe(0);
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    expect(p.lastTried(1)).toBe(1000);
    t = 5000;
    p.refresh([2]);
    await vi.advanceTimersByTimeAsync(300);
    expect(p.lastTried(2)).toBe(5000);
  });

  it('frees the slot and retries the id after staleMs when the fetch rejects', async () => {
    const fetchProfile = vi.fn((id) =>
      (id === 1 ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true, data: { online: true } })));
    let t = 0;
    const p = createPresence({ fetchProfile, concurrency: 1, now: () => t });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    t = 60000;
    expect(p.isStale(1)).toBe(true);
    expect(p.get(2)).not.toBeNull();
  });

  it('frees the slot and retries the id after staleMs when fetchProfile throws synchronously', async () => {
    const fetchProfile = vi.fn((id) => {
      if (id === 1) throw new Error('boom');
      return Promise.resolve({ ok: true, data: { online: true } });
    });
    let t = 0;
    const p = createPresence({ fetchProfile, concurrency: 1, now: () => t });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    t = 60000;
    expect(p.isStale(1)).toBe(true);
    expect(p.get(2)).not.toBeNull();
  });

  it('skips an id in the queue if set() already refreshed it before its turn', async () => {
    let t = 0;
    const slow = (v) => new Promise((resolve) => setTimeout(() => resolve(v), 1000));
    const fetchProfile = vi.fn(() => slow({ ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, concurrency: 1, now: () => t });
    p.refresh([3]);
    await vi.advanceTimersByTimeAsync(2000); // 3 now has profile details
    t += 60000; // ...and is stale again
    fetchProfile.mockClear();
    p.refresh([1, 2, 3]);
    // 3 is still waiting behind 1 and 2 when a getChatInfo-style set() arrives for it.
    p.set(3, { online: true, active: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(p.get(3)).toMatchObject({ online: true });
  });

  it('keeps level, faction and injured/traveling from getProfile, and set() leaves them alone', async () => {
    const data = { online: true, rank: 27, faction: { id: 9, name: 'Ashfall', role: 'Member' }, is_injured: 1, traveling: false };
    const p = createPresence({ fetchProfile: () => Promise.resolve({ ok: true, data }) });
    p.refresh([5]);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.get(5).profile).toEqual({ level: 27, faction: { id: 9, name: 'Ashfall' }, injured: true, traveling: false });
    p.set(5, { online: false, active: 30 });
    expect(p.get(5)).toMatchObject({ online: false, profile: { level: 27 } });
  });

  it('treats an entry without profile details as stale, however fresh', () => {
    const p = createPresence({ fetchProfile: vi.fn() });
    p.set(5, { online: true });
    expect(p.isStale(5)).toBe(true);
  });

  it('checks staleness against a caller-given age', async () => {
    let t = 0;
    const p = createPresence({ fetchProfile: () => Promise.resolve({ ok: true, data: { online: true } }), now: () => t });
    p.refresh([5]);
    await vi.advanceTimersByTimeAsync(0);
    t = 2 * 60000;
    expect(p.isStale(5)).toBe(true);
    expect(p.isStale(5, 5 * 60000)).toBe(false);
  });

  it('reads profile details defensively', () => {
    expect(profileDetails({})).toEqual({ level: null, faction: null, injured: false, traveling: false });
    expect(profileDetails({ level: '12', faction: { id: 'x' }, traveling: { to: 'Outpost' } })).toEqual({ level: 12, faction: null, injured: false, traveling: true });
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

  it('does not duplicate a fetch for an id that is still in flight', async () => {
    const fetchProfile = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: { online: true } }), 500)));
    const p = createPresence({ fetchProfile });
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(100);
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('refetches ids dropped by a pause once it expires', async () => {
    let t = 0;
    let limited = true;
    const fetchProfile = vi.fn(() =>
      Promise.resolve(limited ? { ok: false, kind: 'rate' } : { ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, now: () => t, concurrency: 1, pauseMs: 5000 });
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);
    // 2 and 3 were dropped from the queue by the pause; without also clearing `queued` for
    // them, they'd look permanently in-flight and refresh() would skip them forever.
    limited = false;
    t += 5000;
    p.refresh([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 1, 2, 3]);
  });
});

describe('lastActive', () => {
  const T = Date.UTC(2026, 8, 28, 14, 0, 0);

  it('reads the API value as seconds since last active, like the game does', () => {
    expect(lastActive(3600, T)).toBe(T - 3600000);
    expect(lastActive('120', T)).toBe(T - 120000);
    expect(lastActive(0, T)).toBe(T);
    expect(statusText({ online: false, active: lastActive(3 * 86400, T) }, T)).toBe('Active 3d ago');
  });

  it('still parses absolute times and ignores missing values', () => {
    expect(lastActive('2026-09-28 10:00:00', T)).toBe(Date.UTC(2026, 8, 28, 10));
    expect(lastActive(1790620900, T)).toBe(1790620900000);
    expect(lastActive(null, T)).toBeNull();
    expect(lastActive('', T)).toBeNull();
    expect(lastActive(-5, T)).toBeNull();
  });

  it('stores seconds-ago presence relative to when the answer arrived', () => {
    const p = createPresence({ fetchProfile: vi.fn(), now: () => T });
    p.set(7, { online: false, active: 720 });
    expect(p.get(7).active).toBe(T - 720000);
    expect(statusText(p.get(7), T)).toBe('Active 12m ago');
  });
});
