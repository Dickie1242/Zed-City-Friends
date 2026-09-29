import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, INTERVALS, PRESENCE_PER_SWEEP } from '../src/app.js';
import { storageKey } from '../src/store.js';
import { DOCK_HTML, PAGE_404_HTML, wireGameHeaders } from './fixtures/game-dom.js';
import { fakeApi, memoryStorage, rawThread, rawMsg, flush } from './helpers.js';

const ME = 1;
const SPIKE = 5;

function withFriend() {
  return memoryStorage({ [storageKey(ME)]: JSON.stringify({ v: 1, friends: { [SPIKE]: { id: SPIKE, username: 'Spike' } } }) });
}

const friends = (...ids) => Object.fromEntries(ids.map((id) => [id, { id, username: `F${id}` }]));

function storageWith(doc) {
  return memoryStorage({ [storageKey(ME)]: JSON.stringify({ v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, dms: [] }, ...doc }) });
}

// The game's own chat starts minimized, so mounting small doesn't trip the dock's separate
// "a game chat was already open" reconciliation (which would collapse everything of ours too).
const MIN_DOCK = DOCK_HTML.replace('chat-container general-chat"', 'chat-container general-chat chat-minimized"');

// A minimal MediaQueryList stand-in that remembers 'change' listeners and fires them on set().
function fakeMql(matches) {
  const ls = new Set();
  return {
    matches,
    addEventListener: (t, f) => ls.add(f),
    removeEventListener: (t, f) => ls.delete(f),
    set(m) {
      this.matches = m;
      for (const f of [...ls]) f({ matches: m });
    },
  };
}

describe('app', () => {
  let app;
  beforeEach(() => {
    document.body.innerHTML = DOCK_HTML;
    wireGameHeaders();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  });
  afterEach(() => {
    if (app) app.destroy();
    app = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // Belt-and-suspenders: a test that sets this directly (not via vi.stubGlobal) must not leak
    // it into the next test if an assertion throws before its own cleanup line runs.
    delete window.matchMedia;
    window.history.replaceState({}, '', '/');
    document.documentElement.classList.remove('zcf-on-friends');
  });

  it('puts Private Messages into the game dock, left of the game chats', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    const dock = document.querySelector('.chat-containers');
    const first = dock.firstElementChild;
    expect(first.className).toBe('zcf-root');
    expect(first.querySelector('.zcf-pm.chat-container.chat-minimized')).not.toBeNull();
    expect(first.nextElementSibling.classList.contains('faction-chat')).toBe(true);
  });

  it('pops up a friend DM from the thread poll, then loads it and clears the badge when expanded', async () => {
    const api = fakeApi({
      getChats: vi.fn().mockResolvedValue({ ok: true, data: [rawThread(SPIKE, { username: 'Spike', newMail: 1, lastReply: '2026-09-28 14:02:00' })] }),
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, SPIKE, 'you still need those nails?', '2026-09-28 14:02:00')] }),
    });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    await flush();
    const tab = document.querySelector('.zcf-dm');
    expect(tab.classList.contains('chat-minimized')).toBe(true);
    expect(tab.querySelector('.unread-badge').textContent).toBe('1');
    expect(document.querySelector('.zcf-pm .unread-badge').textContent).toBe('1');
    expect(api.getChatMessages).not.toHaveBeenCalled();

    tab.querySelector('.chat-header').click();
    await flush();
    await flush();
    expect(api.getChatMessages).toHaveBeenCalledWith(SPIKE, 1, 10);
    expect(tab.querySelector('.zcf-log').textContent).toContain('you still need those nails?');
    expect(app.store.get().threads[SPIKE].unread).toBe(0);
  });

  it('polls threads every 15s when idle and every 5s after DM activity', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getChats).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
    expect(api.getChats).toHaveBeenCalledTimes(2);
    app.actions.openDm(SPIKE, { expand: true });
    await vi.advanceTimersByTimeAsync(0);
    await app.conversations.acquire(SPIKE).send('hi');
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsChatting);
    expect(api.getChats).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsChatting);
    expect(api.getChats).toHaveBeenCalledTimes(4);
  });

  it('polls only the active expanded DM every 2s', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    app.actions.openDm(SPIKE, { expand: true });
    await vi.advanceTimersByTimeAsync(0);
    const before = api.getNewMessages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVALS.activeDm * 3);
    expect(api.getNewMessages.mock.calls.length - before).toBe(3);
    app.actions.minimizeDm(SPIKE);
    await vi.advanceTimersByTimeAsync(INTERVALS.activeDm * 3);
    expect(api.getNewMessages.mock.calls.length - before).toBe(3);
  });

  it('stops polling when the session ends', async () => {
    vi.useFakeTimers();
    const api = fakeApi({ getChats: vi.fn().mockResolvedValue({ ok: false, kind: 'auth' }) });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: memoryStorage() });
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.getChats).toHaveBeenCalledTimes(1);
  });

  it('on phones, opening a DM minimizes the open game chat', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {} }));
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: withFriend() });
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(false);
    app.actions.openDm(SPIKE, { expand: true });
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(true);
    document.querySelector('.general-chat .chat-header').click();
    await flush();
    expect(app.store.get().dock.dms[0].open).toBe(false);
    delete window.matchMedia;
  });

  it('recovers active-DM polling ~10s after a fight ends, not the poller default of 60s', async () => {
    vi.useFakeTimers();
    let busy = true;
    const api = fakeApi({
      getChatMessages: vi.fn(async () => (busy ? { ok: false, kind: 'busy', busy: 'fight' } : { ok: true, data: [] })),
      getNewMessages: vi.fn(async () => (busy ? { ok: false, kind: 'busy', busy: 'fight' } : { ok: true, data: [] })),
    });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    app.actions.openDm(SPIKE, { expand: true });
    await vi.advanceTimersByTimeAsync(100);
    busy = false;
    const calls = () => api.getChatMessages.mock.calls.length + api.getNewMessages.mock.calls.length;
    const before = calls();
    await vi.advanceTimersByTimeAsync(8000);
    expect(calls()).toBe(before);
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls()).toBeGreaterThan(before);
  });

  it('rotating into the phone layout with 2 DMs and Friends open leaves exactly one window open', async () => {
    const mql = fakeMql(false);
    window.matchMedia = vi.fn(() => mql);
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: storageWith({ friends: friends(5, 6) }) });
    app.actions.openDm(5, { expand: true });
    app.actions.openDm(6, { expand: true });
    app.actions.togglePm();
    mql.set(true);
    await flush();
    const s = app.store.get();
    const openDms = s.dock.dms.filter((d) => d.open);
    expect(openDms.length + (s.dock.friendsOpen ? 1 : 0)).toBe(1);
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(true);
  });

  it('reloading in the phone layout with several windows already open leaves exactly one open', () => {
    // Minimized game chat: this test is about our own dock's mount-time reconciliation, not
    // the dock's separate "a game chat was already open" case (covered elsewhere).
    document.body.innerHTML = MIN_DOCK;
    wireGameHeaders();
    window.matchMedia = vi.fn(() => fakeMql(true));
    const storage = storageWith({
      friends: friends(5, 6),
      dock: {
        friendsOpen: true,
        dms: [
          { id: 5, open: true, lastUsed: 1, username: 'F5', avatar: null },
          { id: 6, open: true, lastUsed: 2, username: 'F6', avatar: null },
        ],
      },
    });
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage });
    const s = app.store.get();
    const openDms = s.dock.dms.filter((d) => d.open);
    expect(openDms.length + (s.dock.friendsOpen ? 1 : 0)).toBe(1);
  });

  it('presence refreshes at most PRESENCE_PER_SWEEP friends per sweep, stalest first', async () => {
    vi.useFakeTimers();
    let t = 1000000;
    const ids = Array.from({ length: 25 }, (_, i) => 200 + i);
    const api = fakeApi({ getProfile: vi.fn(async () => ({ ok: true, data: { online: false, active: null } })) });
    app = createApp({
      api,
      playerId: ME,
      playerName: 'Me',
      storage: storageWith({ friends: friends(...ids), dock: { friendsOpen: true, dms: [] } }),
      now: () => t,
    });
    // Sweep 1: nothing cached yet, so the cap alone limits it to PRESENCE_PER_SWEEP of the 25 friends.
    await vi.advanceTimersByTimeAsync(5000);
    const sweep1Ids = new Set(api.getProfile.mock.calls.map((c) => c[0]));
    expect(sweep1Ids.size).toBe(PRESENCE_PER_SWEEP);
    const untouched = ids.filter((id) => !sweep1Ids.has(id));
    expect(untouched.length).toBe(25 - PRESENCE_PER_SWEEP);

    // Sweep 2, one interval later: the untouched ids were never fetched, so they're staler than
    // the ones just refreshed a moment ago and must be refreshed first this time.
    t += INTERVALS.presence;
    const before = api.getProfile.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVALS.presence + 5000);
    const sweep2Ids = new Set(api.getProfile.mock.calls.slice(before).map((c) => c[0]));
    for (const id of untouched) expect(sweep2Ids.has(id)).toBe(true);
  });
  it('checks presence only while a friends list is open, and right away when one opens', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: storageWith({ friends: friends(5) }) });
    await vi.advanceTimersByTimeAsync(2 * INTERVALS.presence);
    expect(api.getProfile).not.toHaveBeenCalled();
    app.actions.togglePm();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProfile).toHaveBeenCalledTimes(1);
  });

  it('shows the Friends page on /friends and saves notes from it', async () => {
    document.body.insertAdjacentHTML('beforeend', PAGE_404_HTML);
    window.history.replaceState({}, '', '/friends');
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: withFriend() });
    const page = document.querySelector('.q-page-container main.zcf-page');
    expect(page).not.toBeNull();
    page.querySelector('.zcf-note').click();
    const input = page.querySelector('.zcf-note-input');
    input.value = 'owes me nails';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(app.store.get().friends[SPIKE].note).toBe('owes me nails');
    window.history.pushState({}, '', '/');
    document.querySelector('.q-page-container > .fixed-center').remove(); // the next route replaces the 404
    await flush();
    expect(document.querySelector('main.zcf-page')).toBeNull();
  });
  it('does not let friends whose profile fails to load starve the others', async () => {
    vi.useFakeTimers();
    let t = 1000000;
    const ids = Array.from({ length: 25 }, (_, i) => 500 + i); // 20 failing, then 5 that load
    const api = fakeApi({ getProfile: vi.fn(async (id) => (id < 520 ? { ok: false, kind: 'other' } : { ok: true, data: { online: true } })) });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: storageWith({ friends: friends(...ids), dock: { friendsOpen: true, dms: [] } }), now: () => t });
    await vi.advanceTimersByTimeAsync(10000);
    for (let i = 0; i < 2; i += 1) {
      t += INTERVALS.presence;
      await vi.advanceTimersByTimeAsync(INTERVALS.presence);
    }
    const checked = new Set(api.getProfile.mock.calls.map((c) => c[0]));
    for (const id of ids.slice(20)) expect(checked.has(id)).toBe(true);
  });

  it('shows the Enemies page on /enemies and checks presence for enemies there, not friends', async () => {
    vi.useFakeTimers();
    document.body.insertAdjacentHTML('beforeend', PAGE_404_HTML);
    window.history.replaceState({}, '', '/enemies');
    const storage = storageWith({ friends: friends(5) });
    storage.setItem(`zcf:v1:${ME}:enemies`, JSON.stringify({ v: 1, enemies: { 9: { id: 9, username: 'Grim' } } }));
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage });
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('main.zcf-page .zcf-chip-name').textContent).toBe('Grim');
    expect(api.getProfile.mock.calls.map((c) => c[0])).toEqual([9]);
  });

  it("puts skulls before enemies' names in the game's chat", () => {
    const storage = memoryStorage({ [`zcf:v1:${ME}:enemies`]: JSON.stringify({ v: 1, enemies: { 9: { id: 9, username: 'nyx' } } }) });
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage });
    const marked = [...document.querySelectorAll('.general-chat .msg-cont')].filter((r) => r.querySelector('.zcf-enemy-mark'));
    expect(marked.map((r) => r.querySelector('.sender-name').textContent)).toEqual(['Nyx']);
    app.actions.removeEnemy(9);
    expect(document.querySelectorAll('.general-chat .zcf-enemy-mark')).toHaveLength(0);
  });

  it('exports and imports enemies with friends', () => {
    const storage = storageWith({ friends: friends(5) });
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage });
    app.actions.addEnemy({ id: 9, username: 'Grim' });
    const text = app.actions.exportBackup();
    expect(JSON.parse(text).enemies).toEqual([{ id: 9, username: 'Grim' }]);
    app.actions.removeEnemy(9);
    expect(app.actions.importBackup(text)).toMatchObject({ ok: true, added: 0, enemiesAdded: 1, notes: 0 });
  });

  it('adds the Chat settings cog after Private Messages, and padlocks to the game chats', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    const root = document.querySelector('.zcf-root');
    expect([...root.children].map((c) => c.dataset.zcfChat)).toEqual(['pm', 'settings']);
    expect(document.querySelector('.general-chat .chat-header .zcf-cc-lock')).not.toBeNull();
    expect(document.getElementById('zcf-user-settings')).not.toBeNull();
    app.actions.toggleSettings();
    expect(root.querySelector('.zcf-settings').classList.contains('zcf-open')).toBe(true);
  });

  it('keeps one window open on phones with Chat settings in the mix', async () => {
    const mql = fakeMql(false);
    window.matchMedia = vi.fn(() => mql);
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: storageWith({ friends: friends(5) }) });
    app.actions.togglePm();
    app.actions.toggleSettings();
    mql.set(true);
    await flush();
    let d = app.store.get().dock;
    expect([d.friendsOpen, d.settingsOpen]).toEqual([true, false]);
    app.actions.toggleSettings();
    d = app.store.get().dock;
    expect([d.friendsOpen, d.settingsOpen]).toEqual([false, true]);
  });

  it('plays the new-message sound once per poll when it is on, and never for a muted chat', async () => {
    vi.useFakeTimers();
    const sound = { play: vi.fn(), unlock: vi.fn() };
    const rows = [
      [],
      [rawThread(6, { newMail: 1, lastReply: '2026-09-28 10:01:00' }), rawThread(7, { newMail: 1, lastReply: '2026-09-28 10:01:00' })],
      [rawThread(8, { newMail: 1, lastReply: '2026-09-28 10:02:00' })],
    ];
    const api = fakeApi({ getChats: vi.fn(async () => ({ ok: true, data: rows.shift() || [] })) });
    const storage = memoryStorage({ [`zcf:v1:${ME}:settings`]: JSON.stringify({ v: 1, sound: 'chirp', muted: [8] }) });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage, sound });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledWith('chirp', { volume: 100 });
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it('mutes a chat out of the green count and marks the rest read one at a time', async () => {
    const storage = storageWith({ friends: friends(5, 6), threads: { 5: { unread: 2 }, 6: { unread: 1 } } });
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage });
    app.actions.toggleMute(6);
    expect(app.settings.get().muted).toEqual([6]);
    expect(document.querySelector('.zcf-pm .unread-badge').textContent).toBe('2');
    await app.actions.markAllRead();
    expect(api.getChatMessages.mock.calls.map((c) => c[0])).toEqual([5]);
    expect(app.store.get().threads[5].unread).toBe(0);
  });

  it('checks enemies\' presence as soon as the page switches from Friends to Enemies', async () => {
    vi.useFakeTimers();
    document.body.insertAdjacentHTML('beforeend', PAGE_404_HTML);
    window.history.replaceState({}, '', '/friends');
    const storage = storageWith({ friends: friends(5) });
    storage.setItem(`zcf:v1:${ME}:enemies`, JSON.stringify({ v: 1, enemies: { 9: { id: 9, username: 'Grim' } } }));
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage });
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProfile.mock.calls.map((c) => c[0])).toEqual([5]);
    window.history.pushState({}, '', '/enemies');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProfile.mock.calls.map((c) => c[0])).toEqual([5, 9]);
  });

  describe('0.6 notifications, tab title and pins', () => {
    const fakeNotifier = (permission = 'granted') => ({
      supported: true,
      permission: vi.fn(() => permission),
      request: vi.fn(async () => permission),
      show: vi.fn(),
      confirm: vi.fn(() => true),
    });
    const settingsDoc = (extra) => ({ [`zcf:v1:${ME}:settings`]: JSON.stringify({ v: 1, ...extra }) });
    const setVisibility = (state) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    afterEach(() => setVisibility('visible'));

    it('notifies new messages while the game is out of focus, never for muted chats, friends only when chosen', async () => {
      vi.useFakeTimers();
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      const notifier = fakeNotifier();
      const rows = [
        [],
        [rawThread(6, { username: 'Nyx', newMail: 1, message: 'see you at the bunker', lastReply: 10 }), rawThread(8, { newMail: 1, lastReply: 5 })],
        [rawThread(7, { username: 'Zed', newMail: 1, lastReply: 3 }), rawThread(5, { username: 'Spike', newMail: 1, lastReply: 2 })],
      ];
      const api = fakeApi({ getChats: vi.fn(async () => ({ ok: true, data: rows.shift() || [] })) });
      const storage = storageWith({ friends: friends(5) });
      storage.setItem(`zcf:v1:${ME}:settings`, JSON.stringify({ v: 1, notify: true, muted: [8] }));
      app = createApp({ api, playerId: ME, playerName: 'Me', storage, notifier });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
      expect(notifier.show).toHaveBeenCalledTimes(1);
      expect(notifier.show.mock.calls[0][0]).toMatchObject({ id: 6, title: 'Nyx', body: 'see you at the bunker' });
      app.actions.setNotifyFriendsOnly(true);
      await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
      expect(notifier.show.mock.calls.map((c) => c[0].id)).toEqual([6, 5]);
    });

    it('stays quiet in a background tab while another game tab has focus', async () => {
      vi.useFakeTimers();
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      const notifier = fakeNotifier();
      const rows = [[], [rawThread(6, { newMail: 1, lastReply: 10 })], [rawThread(7, { newMail: 1, lastReply: 5 })]];
      const api = fakeApi({ getChats: vi.fn(async () => ({ ok: true, data: rows.shift() || [] })) });
      const storage = memoryStorage(settingsDoc({ notify: true, sound: 'chirp' }));
      const sound = { play: vi.fn(), unlock: vi.fn() };
      app = createApp({ api, playerId: ME, playerName: 'Me', storage, notifier, sound });
      await vi.advanceTimersByTimeAsync(0);
      storage.setItem(`zcf:v1:${ME}:focus`, JSON.stringify({ tab: 'other', at: Date.now() }));
      await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
      expect(notifier.show).not.toHaveBeenCalled();
      expect(sound.play).not.toHaveBeenCalled();
      storage.removeItem(`zcf:v1:${ME}:focus`); // that tab lost focus
      await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
      expect(notifier.show).toHaveBeenCalledTimes(1);
      expect(sound.play).toHaveBeenCalledTimes(1);
    });

    it('stays quiet while the game has focus', async () => {
      vi.useFakeTimers();
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const notifier = fakeNotifier();
      const rows = [[], [rawThread(6, { newMail: 1, lastReply: 10 })]];
      const api = fakeApi({ getChats: vi.fn(async () => ({ ok: true, data: rows.shift() || [] })) });
      app = createApp({ api, playerId: ME, playerName: 'Me', storage: memoryStorage(settingsDoc({ notify: true })), notifier });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
      expect(notifier.show).not.toHaveBeenCalled();
    });

    it('keeps checking once a minute while hidden, only with notifications on and allowed', async () => {
      vi.useFakeTimers();
      const api = fakeApi();
      app = createApp({ api, playerId: ME, playerName: 'Me', storage: memoryStorage(settingsDoc({ notify: true })), notifier: fakeNotifier() });
      await vi.advanceTimersByTimeAsync(0);
      setVisibility('hidden');
      const before = api.getChats.mock.calls.length;
      await vi.advanceTimersByTimeAsync(INTERVALS.hiddenNotify * 2);
      expect(api.getChats.mock.calls.length - before).toBe(2);
      app.destroy();
      setVisibility('visible');
      const api2 = fakeApi();
      app = createApp({ api: api2, playerId: ME, playerName: 'Me', storage: memoryStorage(), notifier: fakeNotifier() });
      await vi.advanceTimersByTimeAsync(0);
      setVisibility('hidden');
      const before2 = api2.getChats.mock.calls.length;
      await vi.advanceTimersByTimeAsync(INTERVALS.hiddenNotify * 2);
      expect(api2.getChats.mock.calls.length).toBe(before2);
    });

    it('turns notifications on only when the browser allows them', async () => {
      const notifier = fakeNotifier('denied');
      app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage(), notifier });
      await app.actions.setNotify(true);
      expect(app.settings.get().notify).toBe(false);
      expect(document.querySelector('.zcf-toast').textContent).toContain('blocked');
      app.destroy();
      const ok = fakeNotifier('granted');
      app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage(), notifier: ok });
      await app.actions.setNotify(true);
      expect(app.settings.get().notify).toBe(true);
    });

    it('shows the unread count in the tab title, and not when turned off', () => {
      document.title = 'Zed City';
      const storage = storageWith({ friends: friends(5), threads: { 5: { unread: 2 } } });
      app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage, notifier: fakeNotifier() });
      expect(document.title).toBe('(2) Zed City');
      app.actions.setTitleCount(false);
      expect(document.title).toBe('Zed City');
    });

    it('keeps notifications off when the prompt is dismissed, the browser refuses them, or you untick first', async () => {
      const dismissed = fakeNotifier('default');
      app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage(), notifier: dismissed });
      await app.actions.setNotify(true);
      expect(app.settings.get().notify).toBe(false);
      expect(document.querySelector('.zcf-toast').textContent).toContain('when your browser asks');
      app.destroy();
      const refused = fakeNotifier('granted');
      refused.confirm.mockReturnValue(false);
      app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage(), notifier: refused });
      await app.actions.setNotify(true);
      expect(app.settings.get().notify).toBe(false);
      app.destroy();
      let answer;
      const slow = fakeNotifier('granted');
      slow.request.mockImplementation(() => new Promise((r) => { answer = r; }));
      app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage(), notifier: slow });
      const asking = app.actions.setNotify(true);
      app.actions.setNotify(false);
      answer('granted');
      await asking;
      expect(app.settings.get().notify).toBe(false);
    });

    it('says so when the pin list is full', () => {
      const pinned = Array.from({ length: 20 }, (_, i) => 100 + i);
      app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage(settingsDoc({ pinned })), notifier: fakeNotifier() });
      app.actions.togglePin(5);
      expect(app.settings.get().pinned).toHaveLength(20);
      expect(document.querySelector('.zcf-toast').textContent).toBe('You can pin up to 20 chats.');
    });
  });

  it('restores settings from a backup, merging muted chats', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    app.actions.toggleMute(5);
    app.settings.update((s) => { s.sound = 'bell'; s.clock12 = true; });
    const text = app.actions.exportBackup();
    app.actions.restoreDefaults();
    expect(app.settings.get()).toMatchObject({ sound: 'off', clock12: false, muted: [5] });
    app.actions.toggleMute(5);
    app.actions.toggleMute(6);
    expect(app.actions.importBackup(text)).toMatchObject({ ok: true, settings: 'restored' });
    expect(app.settings.get()).toMatchObject({ sound: 'bell', clock12: true, muted: [5, 6] });
  });

  it('flags messages mentioning you in Global, and redoes them when the words change', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    const flagged = () => [...document.querySelectorAll('.general-chat .msg-cont')].filter((r) => r.querySelector('.zcf-mention-flag')).length;
    expect(flagged()).toBe(0);
    app.actions.setMentionWords('bunker');
    expect(flagged()).toBe(1);
    app.actions.setMentions(false);
    expect(flagged()).toBe(0);
  });

  it('steps text size for one chat and for every chat', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    app.actions.stepChatText('pm', 10);
    expect(app.settings.get().chats.pm).toEqual({ text: 110 });
    app.actions.stepTextAll(20);
    expect(app.settings.get()).toMatchObject({ textAll: 120, chats: {} });
    app.actions.setChatLocked('pm', false);
    expect(app.settings.get().chats.pm).toEqual({ locked: false });
    app.actions.setChatLocked('pm', true);
    expect(app.settings.get().chats.pm).toBeUndefined();
  });
});
