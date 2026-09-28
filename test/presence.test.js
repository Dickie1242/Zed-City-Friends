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
});
