import { describe, it, expect } from 'vitest';
import { formatStamp, zoneName } from '../src/time.js';
import { parseSentAt, formatMessageTime, formatDayLabel, timeAgo, statusText, utcDayKey, dayKey, formatClock } from '../src/time.js';

const T = Date.UTC(2026, 8, 28, 14, 3, 11); // 2026-09-28 14:03:11 UTC

describe('time', () => {
  it('parses the formats the API may use as UTC', () => {
    expect(parseSentAt('2026-09-28 14:03:11')).toBe(T);
    expect(parseSentAt('2026-09-28T14:03:11')).toBe(T);
    expect(parseSentAt('2026-09-28T14:03:11Z')).toBe(T);
    expect(parseSentAt('2026-09-28T16:03:11+02:00')).toBe(T);
    expect(parseSentAt(T / 1000)).toBe(T);
    expect(parseSentAt(String(T / 1000))).toBe(T);
    expect(parseSentAt(T)).toBe(T);
    expect(parseSentAt('')).toBeNull();
    expect(parseSentAt('nonsense')).toBeNull();
    expect(parseSentAt(null)).toBeNull();
  });

  it('formats message times like the game inbox (UTC)', () => {
    const now = Date.UTC(2026, 8, 28, 20, 0, 0);
    expect(formatMessageTime(T, now)).toBe('14:03');
    expect(formatMessageTime(T - 86400000, now)).toBe('Yesterday at 14:03');
    expect(formatMessageTime(Date.UTC(2026, 8, 1, 9, 5), now)).toBe('01/09/2026 at 09:05');
  });

  it('says Yesterday in your own time right after a 23-hour daylight-saving day', () => {
    // New York springs forward on March 8, 2026: half past midnight on the 9th is 23 hours after the 8th began.
    const now = new Date(2026, 2, 9, 0, 30).getTime();
    expect(formatMessageTime(new Date(2026, 2, 8, 12, 0).getTime(), now, true)).toBe('Yesterday at 12:00');
  });

  it('stamps a moment with its day and zone, in game time or yours', () => {
    const ts = Date.UTC(2026, 8, 29, 18, 27);
    expect(formatStamp(ts)).toBe('Tue, Sep 29, 18:27 ZCT');
    expect(formatStamp(ts, true)).toBe('Tue, Sep 29, 14:27 EDT');
    expect(zoneName(Date.UTC(2026, 0, 15))).toBe('EST');
  });

  it('formats day dividers and day keys', () => {
    expect(formatDayLabel(T)).toBe('September 28, 2026');
    expect(utcDayKey(T)).toBe('2026-09-28');
  });

  it('describes last-active time', () => {
    const now = T + 12 * 60000;
    expect(timeAgo(T, now)).toBe('12m ago');
    expect(timeAgo(T, T + 30000)).toBe('just now');
    expect(timeAgo(T, T + 3 * 3600000)).toBe('3h ago');
    expect(timeAgo(T, T + 3 * 86400000)).toBe('3d ago');
    expect(statusText({ online: true }, now)).toBe('Online');
    expect(statusText({ online: false, active: T }, now)).toBe('Active 12m ago');
    expect(statusText({ online: false, active: null }, now)).toBe('Offline');
    expect(statusText(null, now)).toBe('');
  });
});

import { longAgo, longStatusText } from '../src/time.js';

describe('longAgo', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const S = 1000;
  const M = 60 * S;
  const H = 60 * M;
  const D = 24 * H;
  const ago = (ms) => longAgo(now - ms, now);

  it('uses the game player-list wording at every boundary', () => {
    expect(ago(59 * S)).toBe('just now');
    expect(ago(M)).toBe('1 min ago');
    expect(ago(59 * M)).toBe('59 min ago');
    expect(ago(H)).toBe('1 hr ago');
    expect(ago(23 * H)).toBe('23 hr ago');
    expect(ago(D)).toBe('1 day ago');
    expect(ago(2 * D)).toBe('2 days ago');
    expect(ago(29 * D)).toBe('29 days ago');
    expect(ago(30 * D)).toBe('1 month ago');
    expect(ago(60 * D)).toBe('2 months ago');
    expect(ago(364 * D)).toBe('12 months ago');
    expect(ago(365 * D)).toBe('1 year ago');
    expect(ago(730 * D)).toBe('2 years ago');
    expect(longAgo(now + M, now)).toBe('just now');
  });

  it('builds the page status line', () => {
    expect(longStatusText(null, now)).toBe('');
    expect(longStatusText({ online: true, active: now - H }, now)).toBe('Online');
    expect(longStatusText({ online: false, active: now - 18 * M }, now)).toBe('Active 18 min ago');
    expect(longStatusText({ online: false, active: null }, now)).toBe('Offline');
  });

  it('can show message times in local time instead of game time', () => {
    const ts = Date.UTC(2026, 8, 29, 23, 30);
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    expect(formatClock(ts, true)).toBe(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    expect(dayKey(ts, true)).toBe(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    expect(dayKey(ts)).toBe('2026-09-29');
    expect(formatMessageTime(ts, ts + 60000, true)).toBe(formatClock(ts, true));
    expect(formatDayLabel(ts, true)).toContain(String(d.getDate()));
  });
});
