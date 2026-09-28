import { describe, it, expect, vi } from 'vitest';
import { createInbox } from '../src/inbox.js';
import { createStore } from '../src/store.js';
import { addFriend, markSeen } from '../src/state.js';
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
});
