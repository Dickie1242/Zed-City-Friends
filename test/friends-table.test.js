import { describe, it, expect } from 'vitest';
import { buildFriendsTable, nextSort, countOnline, DEFAULT_SORT } from '../src/friends-table.js';

const NOW = 1800000000000;
const friends = {
  1: { id: 1, username: 'disamble', note: 'raid buddy' },
  2: { id: 2, username: 'Nyx', note: 'sells ammo' },
  3: { id: 3, username: 'Rustbucket', note: 'owes me nails' },
  4: { id: 4, username: 'Moth' },
  5: { id: 5, username: 'Hollow' },
};
const P = {
  1: { online: true, active: NOW, profile: { level: 27, faction: { id: 9, name: 'Ashfall' }, injured: false, traveling: false } },
  2: { online: true, active: NOW, profile: { level: 51, faction: { id: 8, name: 'Dust Rats' }, injured: false, traveling: true } },
  3: { online: false, active: NOW - 18 * 60000, profile: { level: 44, faction: null, injured: true, traveling: false } },
  4: { online: false, active: NOW - 2 * 86400000, profile: null },
};
const presence = (id) => P[id] || null;
const table = (opts = {}) => buildFriendsTable({ friends, presence, threads: { 3: { unread: 2 } }, ...opts });
const ids = (t) => t.rows.map((r) => r.id);

describe('friends table', () => {
  it('counts tabs over every friend and fills each row', () => {
    const t = table();
    expect(t.counts).toEqual({ all: 5, online: 2, offline: 3 });
    expect(t.rows.find((r) => r.id === 3)).toMatchObject({
      username: 'Rustbucket', note: 'owes me nails', unread: 2, presence: { online: false }, profile: { level: 44, injured: true },
    });
    expect(t.rows.find((r) => r.id === 5)).toMatchObject({ presence: null, profile: null, note: '', unread: 0 });
  });

  it('defaults to status order: online A-Z, then most recently active, unknown last', () => {
    expect(ids(table())).toEqual([1, 2, 3, 4, 5]);
    expect(ids(table({ sort: { key: 'status', dir: 'desc' } }))).toEqual([4, 3, 1, 2, 5]);
  });

  it('sorts by level, with unknown levels last both ways', () => {
    expect(ids(table({ sort: { key: 'level', dir: 'desc' } }))).toEqual([2, 3, 1, 5, 4]);
    expect(ids(table({ sort: { key: 'level', dir: 'asc' } }))).toEqual([1, 3, 2, 5, 4]);
  });

  it('sorts by faction A-Z, with no faction last', () => {
    expect(ids(table({ sort: { key: 'faction', dir: 'asc' } }))).toEqual([1, 2, 5, 4, 3]);
    expect(ids(table({ sort: { key: 'faction', dir: 'desc' } }))).toEqual([2, 1, 5, 4, 3]);
  });

  it('sorts by name, ignoring case', () => {
    expect(ids(table({ sort: { key: 'name', dir: 'asc' } }))).toEqual([1, 5, 4, 2, 3]);
    expect(ids(table({ sort: { key: 'name', dir: 'desc' } }))).toEqual([3, 2, 4, 5, 1]);
  });

  it('filters by tab and by a search over names and notes', () => {
    expect(ids(table({ tab: 'online' }))).toEqual([1, 2]);
    expect(ids(table({ tab: 'offline' }))).toEqual([3, 4, 5]);
    expect(ids(table({ query: 'AMMO' }))).toEqual([2]);
    expect(ids(table({ query: ' mo ' }))).toEqual([2, 4]);
    expect(table({ query: 'zzz' }).counts.all).toBe(5);
  });

  it('cycles sort direction per column, starting from each column\'s natural direction', () => {
    expect(nextSort(DEFAULT_SORT, 'level')).toEqual({ key: 'level', dir: 'desc' });
    expect(nextSort({ key: 'level', dir: 'desc' }, 'level')).toEqual({ key: 'level', dir: 'asc' });
    expect(nextSort({ key: 'level', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(nextSort(DEFAULT_SORT, 'status')).toEqual({ key: 'status', dir: 'desc' });
  });

  it('counts online friends for the top-bar badge', () => {
    expect(countOnline(friends, presence)).toBe(2);
    expect(countOnline({}, presence)).toBe(0);
  });
});
