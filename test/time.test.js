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
