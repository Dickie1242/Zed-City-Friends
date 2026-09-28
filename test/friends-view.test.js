import { describe, it, expect } from 'vitest';
import { buildFriendSections } from '../src/friends-view.js';

const friends = {
  1: { id: 1, username: 'spike' },
  2: { id: 2, username: 'Nyx' },
  3: { id: 3, username: 'Gravedigger' },
  4: { id: 4, username: 'RustyBucket' },
  5: { id: 5, username: 'Anon' },
};
const presenceMap = {
  1: { online: true },
  2: { online: true },
  3: { online: false, active: 100 },
  4: { online: false, active: 900 },
};
const presence = (id) => presenceMap[id] || null;
const threads = [
  { userId: 9, username: 'TradeGuy', lastReply: 10, isSystem: false },
  { userId: 8, username: 'Zombo', lastReply: 20, isSystem: false },
  { userId: 1, username: 'spike', lastReply: 30, isSystem: false },
  { userId: 7, username: 'System', lastReply: 40, isSystem: true },
];

describe('buildFriendSections', () => {
  it('sorts online A-Z, offline by last active, recent by newest non-friend thread', () => {
    const s = buildFriendSections({ friends, presence, threads, filter: '' });
    expect(s.online.map((r) => r.username)).toEqual(['Nyx', 'spike']);
    expect(s.offline.map((r) => r.username)).toEqual(['RustyBucket', 'Gravedigger', 'Anon']);
    expect(s.recent.map((t) => t.username)).toEqual(['Zombo', 'TradeGuy']);
    expect(s.onlineCount).toBe(2);
    expect(s.total).toBe(5);
  });

  it('filters every section case-insensitively but keeps the totals', () => {
    const s = buildFriendSections({ friends, presence, threads, filter: 'GR' });
    expect(s.online).toEqual([]);
    expect(s.offline.map((r) => r.username)).toEqual(['Gravedigger']);
    expect(s.recent).toEqual([]);
    expect(s.onlineCount).toBe(2);
    expect(s.total).toBe(5);
  });
});
