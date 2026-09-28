import { describe, it, expect } from 'vitest';
import {
  emptyState,
  normalizeState,
  addFriend,
  removeFriend,
  updateFriendInfo,
  isFriend,
  markSeen,
  openDm,
  setDmOpen,
  closeDm,
  setFriendsOpen,
  collapseAll,
  friendsUnreadTotal,
  MAX_DMS,
} from '../src/state.js';

describe('state', () => {
  it('normalizes documents and rejects unknown versions', () => {
    expect(normalizeState({ v: 1 })).toEqual(emptyState());
    expect(normalizeState({ v: 1, dock: { dms: [{ id: 3 }, { id: 'x' }, null] } }).dock.dms).toEqual([{ id: 3 }]);
    expect(() => normalizeState({ v: 2 })).toThrow();
    expect(() => normalizeState(null)).toThrow();
  });

  it('adds, updates and removes friends', () => {
    const s = emptyState();
    expect(addFriend(s, { id: 5, username: 'Spike', avatar: 'a.png' }, 100)).toBe(true);
    expect(addFriend(s, { id: 5, username: 'Other' }, 200)).toBe(false);
    expect(s.friends[5]).toEqual({ id: 5, username: 'Spike', avatar: 'a.png', addedAt: 100 });
    expect(isFriend(s, 5)).toBe(true);
    expect(updateFriendInfo(s, 5, { username: 'Spike2' })).toBe(true);
    expect(updateFriendInfo(s, 5, { username: 'Spike2', avatar: '' })).toBe(false);
    removeFriend(s, 5);
    expect(isFriend(s, 5)).toBe(false);
  });

  it('marks threads seen', () => {
    const s = emptyState();
    s.threads[5] = { lastSeenReply: 10, lastNotifiedReply: 0, unread: 3 };
    markSeen(s, 5, 50);
    expect(s.threads[5]).toMatchObject({ unread: 0, lastSeenReply: 50 });
    markSeen(s, 5, 20);
    expect(s.threads[5].lastSeenReply).toBe(50);
  });

  it('opens DMs minimized or expanded, exclusively on phones', () => {
    const s = emptyState();
    s.dock.friendsOpen = true;
    openDm(s, 1, { now: 1 });
    expect(s.dock.dms).toEqual([{ id: 1, open: false, lastUsed: 1, username: null, avatar: null }]);
    openDm(s, 2, { expand: true, now: 2, username: 'Nyx' });
    expect(s.dock.friendsOpen).toBe(true);
    openDm(s, 1, { expand: true, exclusive: true, now: 3 });
    expect(s.dock.dms.map((d) => [d.id, d.open])).toEqual([[1, true], [2, false]]);
    expect(s.dock.friendsOpen).toBe(false);
    expect(s.dock.dms[1].username).toBe('Nyx');
  });

  it(`keeps at most ${MAX_DMS} DMs, evicting the oldest without unread first`, () => {
    const s = emptyState();
    for (let id = 1; id <= 4; id += 1) openDm(s, id, { now: id });
    s.threads[1] = { unread: 2 };
    openDm(s, 5, { now: 5 });
    expect(s.dock.dms.map((d) => d.id)).toEqual([1, 3, 4, 5]);
    for (const id of [3, 4, 5]) s.threads[id] = { unread: 1 };
    openDm(s, 6, { now: 6 });
    expect(s.dock.dms.map((d) => d.id)).toEqual([3, 4, 5, 6]);
  });

  it('toggles and closes dock entries', () => {
    const s = emptyState();
    openDm(s, 1, { now: 1 });
    openDm(s, 2, { now: 2, expand: true });
    setDmOpen(s, 1, true, { exclusive: true, now: 9 });
    expect(s.dock.dms.map((d) => d.open)).toEqual([true, false]);
    expect(s.dock.dms[0].lastUsed).toBe(9);
    setFriendsOpen(s, true, { exclusive: true });
    expect(s.dock.dms.every((d) => !d.open)).toBe(true);
    collapseAll(s);
    expect(s.dock.friendsOpen).toBe(false);
    closeDm(s, 1);
    expect(s.dock.dms.map((d) => d.id)).toEqual([2]);
  });

  it('sums unread mail from friends only', () => {
    const s = emptyState();
    addFriend(s, { id: 1, username: 'a' }, 0);
    addFriend(s, { id: 2, username: 'b' }, 0);
    s.threads = { 1: { unread: 2 }, 2: { unread: 0 }, 3: { unread: 5 } };
    expect(friendsUnreadTotal(s)).toBe(2);
  });
});
