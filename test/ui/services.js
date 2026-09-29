// Real store + real conversations over a fake api, with simple stand-ins for everything else.
import { vi } from 'vitest';
import { createStore, createSettingsStore, createEnemiesStore } from '../../src/store.js';
import { createConversations } from '../../src/conversation.js';
import { addFriend, removeFriend, openDm, setDmOpen, closeDm, setFriendsOpen, setFriendNote, setSettingsOpen, closeAllDms } from '../../src/state.js';
import {
  setPmTab,
  setSound,
  setMuted,
  isMuted,
  resetChat,
  resetAllChats,
  togglePinned,
  setFlag,
  setSettingsTab,
  setMentionSound,
  setVolume,
  setMentionWords,
  setTextAll,
  updateChat,
  restoreDefaults,
} from '../../src/settings.js';
import { textOf, clampText } from '../../src/chat-custom/chats.js';
import { addEnemy, removeEnemy, setEnemyNote, isEnemy } from '../../src/enemies.js';
import { exportFriends, parseImport, mergeImport } from '../../src/backup.js';
import { fakeApi, memoryStorage } from '../helpers.js';

export const ME = 1;

export function makeServices({ api = fakeApi(), threads = [], presence = {}, searchResults = [], fetchImpl, storage = memoryStorage(), olderPages = [] } = {}) {
  const store = createStore({ playerId: ME, storage });
  const settings = createSettingsStore({ playerId: ME, storage });
  const enemies = createEnemiesStore({ playerId: ME, storage });
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
    toggleSettings: vi.fn(() => store.update((s) => setSettingsOpen(s, !s.dock.settingsOpen))),
    closeAllDms: vi.fn(() => store.update((s) => closeAllDms(s))),
    resetChat: vi.fn((key) => settings.update((s) => resetChat(s, key))),
    resetAllChats: vi.fn(() => settings.update((s) => resetAllChats(s))),
    setSound: vi.fn((name) => settings.update((s) => setSound(s, name))),
    toggleMute: vi.fn((id) => settings.update((s) => setMuted(s, id, !isMuted(s, id)))),
    markAllRead: vi.fn(async () => 0),
    togglePin: vi.fn((id) => settings.update((s) => togglePinned(s, id))),
    setNotify: vi.fn((on) => settings.update((s) => setFlag(s, 'notify', on))),
    setNotifyFriendsOnly: vi.fn((on) => settings.update((s) => setFlag(s, 'notifyFriendsOnly', on))),
    setTitleCount: vi.fn((on) => settings.update((s) => setFlag(s, 'titleCount', on))),
    setHoverLocal: vi.fn((on) => settings.update((s) => setFlag(s, 'hoverLocal', on))),
    setSettingsTab: vi.fn((tab) => settings.update((s) => setSettingsTab(s, tab))),
    setMentionSound: vi.fn((name) => settings.update((s) => setMentionSound(s, name))),
    setVolume: vi.fn((v) => settings.update((s) => setVolume(s, v))),
    setMentions: vi.fn((on) => settings.update((s) => setFlag(s, 'mentions', on))),
    setMentionWords: vi.fn((text) => {
      settings.update((s) => setMentionWords(s, text));
      return settings.get().mentionWords;
    }),
    setClock12: vi.fn((on) => settings.update((s) => setFlag(s, 'clock12', on))),
    setChatLocked: vi.fn((key, locked) => settings.update((s) => updateChat(s, key, { locked: locked ? null : false }))),
    stepChatText: vi.fn((key, delta) => settings.update((s) => updateChat(s, key, { text: clampText(textOf(s.chats[key], s.textAll) + delta) }))),
    returnChat: vi.fn((key) => settings.update((s) => updateChat(s, key, { x: null, y: null }))),
    resetChatSize: vi.fn((key) => settings.update((s) => updateChat(s, key, { w: null, h: null }))),
    stepTextAll: vi.fn((delta) => settings.update((s) => setTextAll(s, s.textAll + delta))),
    restoreDefaults: vi.fn(() => settings.update((s) => restoreDefaults(s))),
    addEnemy: vi.fn((p) => enemies.update((d) => addEnemy(d, p, 0))),
    removeEnemy: vi.fn((id) => enemies.update((d) => removeEnemy(d, id))),
    setEnemyNote: vi.fn((id, note) => enemies.update((d) => setEnemyNote(d, id, note))),
    exportBackup: () => exportFriends(store.get(), ME, null, settings.get()),
    importBackup: (text) => {
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
    enemies,
    isEnemy: (id) => isEnemy(enemies.get(), id),
    isMuted: (id) => isMuted(settings.get(), id),
    notifier: { supported: true, permission: vi.fn(() => 'default'), request: vi.fn(async () => 'granted'), show: vi.fn(), confirm: vi.fn(() => true) },
    sound: { play: vi.fn(() => true), unlock: vi.fn() },
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
