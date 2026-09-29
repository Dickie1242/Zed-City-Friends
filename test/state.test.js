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
  chatsUnreadTotal,
  setFriendNote,
  MAX_DMS,
  MAX_NOTE,
  setSettingsOpen,
  closeAllDms,
  chatsUnreadIds,
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

  it('sets, trims, caps and clears a friend note', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    expect(setFriendNote(s, 5, '  owes me 40 nails  ')).toBe(true);
    expect(s.friends[5].note).toBe('owes me 40 nails');
    expect(setFriendNote(s, 5, 'owes me 40 nails')).toBe(false);
    expect(setFriendNote(s, 5, 'x'.repeat(MAX_NOTE + 50))).toBe(true);
    expect(s.friends[5].note).toHaveLength(MAX_NOTE);
    expect(setFriendNote(s, 5, '   ')).toBe(true);
    expect('note' in s.friends[5]).toBe(false);
    expect(setFriendNote(s, 9, 'not a friend')).toBe(false);
    expect(s.friends[9]).toBeUndefined();
  });

  it('keeps notes through normalizeState, so older script versions never drop them', () => {
    const doc = normalizeState({ v: 1, friends: { 5: { id: 5, username: 'Spike', note: 'hi' } } });
    expect(doc.friends[5].note).toBe('hi');
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

  it('never evicts an expanded DM before minimized ones, even with unread badges', () => {
    const s = emptyState();
    openDm(s, 1, { expand: true, now: 1 });
    openDm(s, 2, { now: 2 });
    openDm(s, 3, { now: 3 });
    openDm(s, 4, { now: 4 });
    for (const id of [2, 3, 4]) s.threads[id] = { unread: 1 };
    openDm(s, 5, { now: 10 });
    expect(s.dock.dms.map((d) => d.id)).toEqual([1, 3, 4, 5]);
    expect(s.dock.dms.find((d) => d.id === 1).open).toBe(true);
  });

  it('falls back to the least recently used entry when every other one is open', () => {
    const s = emptyState();
    for (let id = 1; id <= 4; id += 1) openDm(s, id, { expand: true, now: id });
    openDm(s, 5, { expand: true, now: 5 });
    expect(s.dock.dms.map((d) => d.id)).toEqual([2, 3, 4, 5]);
    expect(s.dock.dms.length).toBe(MAX_DMS);
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

  it('sums unread messages in every chat the Private Messages window lists', () => {
    const s = emptyState();
    addFriend(s, { id: 1, username: 'a' }, 0);
    addFriend(s, { id: 2, username: 'b' }, 0);
    s.threads = { 1: { unread: 2 }, 2: { unread: 0 }, 3: { unread: 5 }, 4: { unread: 7 }, 8: { unread: 9 } };
    const inbox = [{ userId: 3, isSystem: false }, { userId: 4, isSystem: true }, { userId: 1, isSystem: false }];
    // Friends always count; others while their thread is on the first inbox page, invites included.
    expect(chatsUnreadTotal(s, inbox)).toBe(14);
    expect(chatsUnreadTotal(s, [])).toBe(2);
  });

  it('keeps the Chat settings window in the dock state and the one-open rules', () => {
    const s = emptyState();
    expect(s.dock.settingsOpen).toBe(false);
    expect(normalizeState({ v: 1, dock: { settingsOpen: 1 } }).dock.settingsOpen).toBe(true);
    openDm(s, 1, { expand: true });
    setFriendsOpen(s, true);
    setSettingsOpen(s, true, { exclusive: true });
    expect([s.dock.dms[0].open, s.dock.friendsOpen, s.dock.settingsOpen]).toEqual([false, false, true]);
    setFriendsOpen(s, true, { exclusive: true });
    expect([s.dock.friendsOpen, s.dock.settingsOpen]).toEqual([true, false]);
    setSettingsOpen(s, true);
    openDm(s, 1, { expand: true, exclusive: true });
    expect([s.dock.friendsOpen, s.dock.settingsOpen]).toEqual([false, false]);
    setSettingsOpen(s, true);
    collapseAll(s);
    expect(s.dock.settingsOpen).toBe(false);
    closeAllDms(s);
    expect(s.dock.dms).toEqual([]);
  });

  it('leaves muted chats out of the unread chats', () => {
    const s = emptyState();
    addFriend(s, { id: 1, username: 'a' }, 0);
    s.threads = { 1: { unread: 2 }, 3: { unread: 5 } };
    const inbox = [{ userId: 3, isSystem: false }];
    expect(chatsUnreadIds(s, inbox)).toEqual([1, 3]);
    expect(chatsUnreadIds(s, inbox, [3])).toEqual([1]);
    expect(chatsUnreadTotal(s, inbox, [3])).toBe(2);
  });
});
