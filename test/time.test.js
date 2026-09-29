import { describe, it, expect } from 'vitest';
import { parseSentAt, formatMessageTime, formatDayLabel, timeAgo, statusText, utcDayKey } from '../src/time.js';

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
});
