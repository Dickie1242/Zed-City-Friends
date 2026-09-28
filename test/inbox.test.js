import { describe, it, expect, vi } from 'vitest';
import { createInbox } from '../src/inbox.js';
import { createStore } from '../src/store.js';
import { addFriend, markSeen, openDm } from '../src/state.js';
import { fakeApi, memoryStorage, rawThread } from './helpers.js';

const ME = 1;

function setup(rowsSequence) {
  const rows = [...rowsSequence];
  const api = fakeApi({ getChats: vi.fn(() => Promise.resolve({ ok: true, data: rows.shift() || [] })) });
  const store = createStore({ playerId: ME, storage: memoryStorage() });
  const onActivity = vi.fn();
  const onThreadChanged = vi.fn();
  const inbox = createInbox({ api, store, myId: ME, now: () => 1000, onActivity, onThreadChanged });
  return { api, store, inbox, onActivity, onThreadChanged };
}

describe('inbox', () => {
  it('pops a minimized DM tab with a badge when a friend messages you', async () => {
    const { store, inbox } = setup([[rawThread(5, { username: 'Spike', newMail: 2 })]]);
    store.update((s) => addFriend(s, { id: 5, username: 'Spike' }, 0));
    await inbox.poll();
    const s = store.get();
    expect(s.threads[5].unread).toBe(2);
    expect(s.dock.dms).toEqual([{ id: 5, open: false, lastUsed: 1000, username: 'Spike', avatar: null }]);
  });

  it('does not pop non-friends, but tracks their unread count for Recent', async () => {
    const { store, inbox } = setup([[rawThread(6, { newMail: 1 })]]);
    await inbox.poll();
    expect(store.get().dock.dms).toEqual([]);
    expect(store.get().threads[6].unread).toBe(1);
    expect(inbox.threads().map((t) => t.userId)).toEqual([6]);
  });

  it('does not re-open a tab you closed until a newer message arrives', async () => {
    const { store, inbox } = setup([
      [rawThread(5, { newMail: 1, lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { newMail: 1, lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { newMail: 2, lastReply: '2026-09-28 10:05:00' })],
    ]);
    store.update((s) => addFriend(s, { id: 5, username: 'Spike' }, 0));
    await inbox.poll();
    store.update((s) => { s.dock.dms = []; });
    await inbox.poll();
    expect(store.get().dock.dms).toEqual([]);
    await inbox.poll();
    expect(store.get().dock.dms.map((d) => d.id)).toEqual([5]);
  });

  it('clears badges for threads read elsewhere and ignores threads already seen', async () => {
    const { store, inbox } = setup([
      [rawThread(5, { newMail: 0 }), rawThread(7, { newMail: 1, lastReply: '2026-09-28 10:00:00' })],
    ]);
    store.update((s) => {
      s.threads[5] = { lastSeenReply: 0, lastNotifiedReply: 0, unread: 3 };
      markSeen(s, 7, Date.UTC(2026, 8, 28, 10));
    });
    await inbox.poll();
    expect(store.get().threads[5].unread).toBe(0);
    expect(store.get().threads[7].unread).toBe(0);
  });

  it('reports changed threads after the first poll, and activity only for friends or open DMs', async () => {
    const { store, inbox, onActivity, onThreadChanged } = setup([
      [rawThread(5, { lastReply: '2026-09-28 10:00:00' }), rawThread(6, { lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { lastReply: '2026-09-28 10:00:00' }), rawThread(6, { lastReply: '2026-09-28 10:01:00' })],
      [rawThread(5, { lastReply: '2026-09-28 10:02:00' }), rawThread(6, { lastReply: '2026-09-28 10:01:00' })],
    ]);
    store.update((s) => addFriend(s, { id: 5, username: 'Spike' }, 0));
    await inbox.poll();
    expect(onThreadChanged).not.toHaveBeenCalled();
    await inbox.poll();
    expect(onThreadChanged).toHaveBeenCalledWith(6);
    expect(onActivity).not.toHaveBeenCalled();
    await inbox.poll();
    expect(onThreadChanged).toHaveBeenLastCalledWith(5);
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it('passes API failures through without touching state', async () => {
    const api = fakeApi({ getChats: vi.fn().mockResolvedValue({ ok: false, kind: 'network' }) });
    const store = createStore({ playerId: ME, storage: memoryStorage() });
    const inbox = createInbox({ api, store, myId: ME });
    expect(await inbox.poll()).toMatchObject({ ok: false, kind: 'network' });
    expect(inbox.lastReply(5)).toBeNull();
  });

  it('makes no store writes and no emit on an API failure', async () => {
    const api = fakeApi({ getChats: vi.fn().mockResolvedValue({ ok: false, kind: 'network' }) });
    const store = createStore({ playerId: ME, storage: memoryStorage() });
    const inbox = createInbox({ api, store, myId: ME });
    const updateSpy = vi.spyOn(store, 'update');
    let emits = 0;
    inbox.subscribe(() => emits++);
    await inbox.poll();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(emits).toBe(0);
  });

  it('keeps the newest pop-ups when more threads pop in one poll than the dock can hold', async () => {
    // 5 is the newest (highest lastReply), 9 the oldest; the dock should keep 5..8 and drop 9.
    const rows = [5, 6, 7, 8, 9].map((id, i) => rawThread(id, { newMail: 1, lastReply: `2026-09-28 12:0${9 - i}:00` }));
    const { store, inbox } = setup([rows]);
    store.update((s) => { for (const id of [5, 6, 7, 8, 9]) addFriend(s, { id, username: 'F' + id }, 0); });
    await inbox.poll();
    expect(store.get().dock.dms.map((d) => d.id).sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
  });

  it('makes no store writes on an unchanged second poll', async () => {
    const t = [rawThread(5, { newMail: 1, lastReply: '2026-09-28 10:00:00' }), rawThread(6, { newMail: 2 }), rawThread(7, { newMail: 0 })];
    const { store, inbox } = setup([t, t]);
    store.update((s) => addFriend(s, { id: 5, username: 'S' }, 0));
    const updateSpy = vi.spyOn(store, 'update');
    await inbox.poll();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    updateSpy.mockClear();
    await inbox.poll();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('emits once across three identical polls', async () => {
    const t = [rawThread(6, { newMail: 0 })];
    const { inbox } = setup([t, t, t]);
    let n = 0;
    inbox.subscribe(() => n++);
    await inbox.poll();
    await inbox.poll();
    await inbox.poll();
    expect(n).toBe(1);
  });

  it('emits again when a thread preview or lastReply changes', async () => {
    const { inbox } = setup([
      [rawThread(6, { newMail: 0, message: 'hi', lastReply: '2026-09-28 10:00:00' })],
      [rawThread(6, { newMail: 0, message: 'hi', lastReply: '2026-09-28 10:00:00' })],
      [rawThread(6, { newMail: 0, message: 'updated', lastReply: '2026-09-28 10:00:00' })],
    ]);
    let n = 0;
    inbox.subscribe(() => n++);
    await inbox.poll();
    await inbox.poll();
    expect(n).toBe(1);
    await inbox.poll();
    expect(n).toBe(2);
  });

  it('does not reject when onThreadChanged throws, and does not resignal the same change on the next identical poll', async () => {
    const { inbox, onThreadChanged } = setup([
      [rawThread(5, { lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { lastReply: '2026-09-28 10:01:00' })],
      [rawThread(5, { lastReply: '2026-09-28 10:01:00' })],
    ]);
    onThreadChanged.mockImplementationOnce(() => { throw new Error('boom'); });
    await inbox.poll(); // baseline poll, no signal yet
    const result = await inbox.poll(); // signals the change; the callback throws but is caught
    expect(result.ok).toBe(true);
    expect(onThreadChanged).toHaveBeenCalledTimes(1);
    await inbox.poll(); // same lastReply as the now-updated baseline: must not resignal
    expect(onThreadChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing dock name when a later poll lacks other_user.username', async () => {
    const { store, inbox } = setup([
      [rawThread(5, { username: '', newMail: 1, lastReply: '2026-09-28 10:00:00' })],
    ]);
    store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      openDm(s, 5, { now: 0, username: 'Spike' });
    });
    await inbox.poll();
    expect(store.get().dock.dms.find((d) => d.id === 5).username).toBe('Spike');
  });
});
