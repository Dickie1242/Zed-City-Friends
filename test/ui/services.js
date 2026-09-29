// Real store + real conversations over a fake api, with simple stand-ins for everything else.
import { vi } from 'vitest';
import { createStore, createSettingsStore } from '../../src/store.js';
import { createConversations } from '../../src/conversation.js';
import { addFriend, removeFriend, openDm, setDmOpen, closeDm, setFriendsOpen, setFriendNote } from '../../src/state.js';
import { setPmTab } from '../../src/settings.js';
import { exportFriends, parseImport, mergeImport } from '../../src/backup.js';
import { fakeApi, memoryStorage } from '../helpers.js';

export const ME = 1;

export function makeServices({ api = fakeApi(), threads = [], presence = {}, searchResults = [], fetchImpl, storage = memoryStorage(), olderPages = [] } = {}) {
  const store = createStore({ playerId: ME, storage });
  const settings = createSettingsStore({ playerId: ME, storage });
  const conversations = createConversations({ api, myId: ME });
  const actions = {
    addFriend: vi.fn((p) => store.update((s) => addFriend(s, p, 0))),
    removeFriend: vi.fn((id) => store.update((s) => removeFriend(s, id))),
    setFriendNote: vi.fn((id, note) => store.update((s) => setFriendNote(s, id, note))),
    openDm: vi.fn((id, o = {}) => store.update((s) => openDm(s, id, { expand: true, now: 1, ...o }))),
    toggleDm: vi.fn((id) => {
      const e = store.get().dock.dms.find((d) => d.id === id);
      store.update((s) => setDmOpen(s, id, !e.open));
    }),
    minimizeDm: vi.fn((id) => store.update((s) => setDmOpen(s, id, false))),
    closeDm: vi.fn((id) => store.update((s) => closeDm(s, id))),
    togglePm: vi.fn(() => store.update((s) => setFriendsOpen(s, !s.dock.friendsOpen))),
    setPmTab: vi.fn((tab) => settings.update((s) => setPmTab(s, tab))),
    setActiveDm: vi.fn(),
    exportFriends: () => exportFriends(store.get(), ME),
    importFriends: (text) => {
      const r = parseImport(text, ME);
      if (!r.ok) return r;
      return { ok: true, ...store.update((s) => mergeImport(s, r.friends, 0)) };
    },
  };
  return {
    api,
    playerId: ME,
    myId: ME,
    myName: 'Me',
    store,
    settings,
    storage,
    actions,
    conversations,
    fetchImpl,
    presence: { get: (id) => presence[id] || null, subscribe: () => () => {} },
    inbox: {
      threads: () => threads,
      subscribe: () => () => {},
      lastReply: () => null,
      fetchPage: vi.fn(async (page) => ({ ok: true, threads: olderPages[page - 2] || [] })),
    },
    players: {
      search: vi.fn().mockResolvedValue({ ok: true, data: searchResults }),
      resolveExact: vi.fn(),
      get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    },
    router: { navigate: vi.fn(), path: '/' },
    toast: vi.fn(),
    isSmall: () => false,
  };
}
