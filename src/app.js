// Wires the modules together: stores, pollers, dock UI, profile buttons and pages.
import { createStore, createSettingsStore, createEnemiesStore } from './store.js';
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
  applyBackupSettings,
} from './settings.js';
import { textOf, clampText } from './chat-custom/chats.js';
import { createNotifier } from './notify.js';
import { createTabFocus } from './tab-focus.js';
import { createSound } from './sound.js';
import { markAllRead } from './mark-read.js';
import { createRouter } from './router.js';
import { createPlayers } from './players.js';
import { createPresence } from './presence.js';
import { createConversations } from './conversation.js';
import { createInbox } from './inbox.js';
import { makePoller } from './poller.js';
import { exportFriends, parseImport, mergeImport, mergeEnemiesImport } from './backup.js';
import { addEnemy, removeEnemy, setEnemyNote, updateEnemyInfo, isEnemy, enemyNames } from './enemies.js';
import {
  addFriend,
  removeFriend,
  updateFriendInfo,
  markSeen,
  openDm,
  setDmOpen,
  closeDm,
  setFriendsOpen,
  collapseAll,
  setFriendNote,
  setSettingsOpen,
  closeAllDms,
  chatsUnreadIds,
  chatsUnreadTotal,
} from './state.js';
import { createDock } from './ui/dock.js';
import { createDockView } from './ui/dock-view.js';
import { createToaster } from './ui/toast.js';
import { createProfileButton, ENEMY_BUTTON } from './ui/profile-button.js';
import { createEnemyMarks } from './ui/enemy-marks.js';
import { createMentionMarks } from './ui/mention-marks.js';
import { createKeeper } from './ui/keeper.js';
import { createTopbarButton } from './ui/topbar-button.js';
import { createFriendsPage } from './ui/friends-page.js';
import { createChatCustom } from './ui/chat-custom/index.js';
import { createTitleCount } from './ui/title-count.js';
import { createTimeHover } from './ui/time-hover.js';
import { createGameClock, TIME } from './ui/game-clock.js';
import { avatarUrl } from './ui/dom.js';
import { statsPlayer } from './util.js';

export const CHATTING_MS = 5 * 60 * 1000;
export const INTERVALS = { threadsIdle: 15000, threadsChatting: 5000, activeDm: 2000, activeDmBusy: 10000, dmInfo: 60000, presence: 60000, hiddenNotify: 60000 };
// At most this many desktop notifications from one check.
const MAX_NOTIFY = 3;
export const PRESENCE_PER_SWEEP = 20;
// The mention sound: only for a message sent in the last 2 minutes, and at most once every 5 seconds.
const MENTION_RECENT_MS = 2 * 60 * 1000;
const MENTION_GAP_MS = 5000;

export function createApp({ api, playerId, playerName, doc = document, win = window, storage = win.localStorage, now = () => Date.now(), sound = createSound({ win }), notifier: notifierOpt = null }) {
  const store = createStore({ playerId, storage, win, now });
  const settings = createSettingsStore({ playerId, storage, win, now });
  const enemies = createEnemiesStore({ playerId, storage, win, now });
  const router = createRouter({ win, doc });
  const toast = createToaster(doc);
  const players = createPlayers({ api, now });
  // Created here, not as a default parameter, so its click can reach `actions` below.
  const notifier = notifierOpt || createNotifier({ win, onOpen: (id) => openFromNotification(id) });
  let notifyAsk = 0; // the latest switch-on, so an older permission answer can't override a newer choice
  const notificationsOn = () => settings.get().notify && notifier.permission() === 'granted';
  const tabFocus = createTabFocus({ storage, key: `zcf:v1:${playerId}:focus`, doc, win, now });
  let stopped = false;
  let activeDmId = null;
  let chattingUntil = 0;

  const isChatting = () => now() < chattingUntil;
  const dmEntry = (id) => store.get().dock.dms.find((d) => d.id === id);
  const isExpanded = (id) => !!(dmEntry(id) && dmEntry(id).open);
  const expandedIds = () => store.get().dock.dms.filter((d) => d.open).map((d) => d.id);

  // Keeps saved names and avatars fresh from presence answers, for friends and enemies alike.
  function syncPlayerInfo(id, info) {
    if (!info) return;
    const stale = (p) => !!p && (
      (typeof info.username === 'string' && info.username && info.username !== p.username)
      || (typeof info.avatar === 'string' && info.avatar && info.avatar !== p.avatar));
    if (stale(store.get().friends[id])) store.update((s) => updateFriendInfo(s, id, info));
    if (stale(enemies.get().enemies[id])) enemies.update((d) => updateEnemyInfo(d, id, info));
  }

  const presence = createPresence({ fetchProfile: (id) => api.getProfile(id), onProfile: syncPlayerInfo, now });

  function markChatting() {
    const was = isChatting();
    chattingUntil = now() + CHATTING_MS;
    if (!was) threadsPoller.reschedule();
  }

  // Clears the unread badge once an expanded DM has loaded; skips the write when nothing changed.
  function markSeenIfNeeded(id) {
    // A hidden tab isn't being read: its count stays until you come back (onVisible).
    if (!isExpanded(id) || doc.visibilityState === 'hidden') return;
    const c = conversations.get(id);
    if (!c || !c.state.loaded) return;
    // The chat list's reply time is by our clock (it comes as seconds ago); message times are the server's.
    // Compare like with like: prefer the chat list's, and fall back to the newest message off page 1.
    const seen = inbox.lastReply(id) || c.latestTs();
    const t = store.get().threads[id];
    if (!t || t.unread > 0 || (t.lastSeenReply || 0) < seen) store.update((s) => markSeen(s, id, seen));
  }

  const conversations = createConversations({
    api,
    myId: playerId,
    onActivity: () => markChatting(),
    onInfo: (id, info) => {
      presence.set(id, info);
      syncPlayerInfo(id, info);
    },
    onChange: (id) => markSeenIfNeeded(id),
  });

  const inbox = createInbox({
    api,
    store,
    myId: playerId,
    now,
    onActivity: () => markChatting(),
    // Expanded DMs other than the active one only fetch when the thread list shows they changed.
    onThreadChanged: (id) => {
      if (id === activeDmId || !isExpanded(id)) return;
      const c = conversations.get(id);
      if (c) c.fetchNew();
    },
    isMuted: (id) => isMuted(settings.get(), id),
    // New mail from another player, at most once per poll: the sound chosen in Chat settings, and desktop
    // notifications when they're on and the game isn't in focus (0.6 spec §1.1).
    onNewMail: (arrived) => {
      if (tabFocus.elsewhere()) return; // another game tab has focus and hears this mail itself
      const s = settings.get();
      if (s.sound !== 'off') sound.play(s.sound, { volume: s.volume });
      notifyNewMail(arrived);
    },
  });

  function notifyNewMail(arrived) {
    const s = settings.get();
    if (!notificationsOn() || tabFocus.focused()) return;
    const friends = store.get().friends;
    const list = arrived
      .filter((t) => !s.notifyFriendsOnly || friends[t.userId])
      .sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0))
      .slice(0, MAX_NOTIFY);
    // Cut by characters, not UTF-16 units, so an emoji at the end isn't split in half.
    for (const t of list) notifier.show({ id: t.userId, title: t.username, body: Array.from(t.preview || '').slice(0, 120).join(''), icon: avatarUrl(t.avatar) });
  }

  // A notification's click: the DM with the name and picture from the chat list, like opening it there.
  function openFromNotification(id) {
    const t = inbox.threads().find((x) => x.userId === id);
    actions.openDm(id, { expand: true, username: t ? t.username : undefined, avatar: t ? t.avatar : undefined });
  }

  function pickActive() {
    if (activeDmId && isExpanded(activeDmId)) return activeDmId;
    const open = store.get().dock.dms.filter((d) => d.open).sort((a, b) => b.lastUsed - a.lastUsed);
    activeDmId = open.length ? open[0].id : null;
    return activeDmId;
  }

  const onAuthLost = () => stopAll();
  const threadsPoller = makePoller({
    run: () => {
      tabFocus.beat();
      return inbox.poll();
    },
    interval: () => (isChatting() ? INTERVALS.threadsChatting : INTERVALS.threadsIdle),
    // While the tab is hidden, a slow check keeps notifications coming; with them off it stops as before.
    hiddenInterval: () => (notificationsOn() ? INTERVALS.hiddenNotify : null),
    onAuthLost,
    doc,
  });
  const activeDmPoller = makePoller({
    run: async () => {
      const id = pickActive();
      if (!id) return { ok: true };
      const r = await conversations.acquire(id).fetchNew();
      markSeenIfNeeded(id);
      return r;
    },
    interval: INTERVALS.activeDm,
    busyInterval: INTERVALS.activeDmBusy,
    onAuthLost,
    doc,
  });
  const infoPoller = makePoller({
    run: async () => {
      for (const id of expandedIds()) await conversations.acquire(id).refreshInfo();
      return { ok: true };
    },
    interval: INTERVALS.dmInfo,
    doc,
  });
  // A list with presence is on screen: the Private Messages window, or the Friends / Enemies page.
  const listOpen = () => store.get().dock.friendsOpen || page.active;
  // Whose presence that list shows: friends in Private Messages or on the Friends page, enemies on the
  // Enemies page (spec §C.3).
  function presenceTargets() {
    const ids = new Set();
    const onPage = page.active ? page.kind : null;
    if (store.get().dock.friendsOpen || onPage === 'friends') for (const id of Object.keys(store.get().friends)) ids.add(Number(id));
    if (onPage === 'enemies') for (const id of Object.keys(enemies.get().enemies)) ids.add(Number(id));
    return [...ids];
  }
  const presencePoller = makePoller({
    run: () => {
      // Stalest first, capped, so a long list can't turn into one getProfile per player per minute.
      const age = (id) => presence.lastTried(id);
      const stale = presenceTargets().filter((id) => presence.isStale(id));
      presence.refresh(stale.sort((a, b) => age(a) - age(b)).slice(0, PRESENCE_PER_SWEEP));
      return { ok: true };
    },
    interval: INTERVALS.presence,
    doc,
  });
  const pollers = [threadsPoller, activeDmPoller, infoPoller, presencePoller];

  function syncPollers() {
    if (stopped) return;
    const s = store.get();
    const anyOpen = s.dock.dms.some((d) => d.open);
    // start() runs a sweep at once, so opening a friends list refreshes it straight away.
    for (const [p, on] of [[activeDmPoller, anyOpen], [infoPoller, anyOpen], [presencePoller, listOpen()]]) {
      if (on) p.start();
      else p.stop();
    }
  }

  function stopAll() {
    stopped = true;
    for (const p of pollers) p.stop();
  }

  // After the session ends (errorCode 1), try again on the next page change.
  async function resumeIfLoggedIn() {
    if (!stopped) return;
    const r = await api.getStats();
    const me = r.ok ? statsPlayer(r.data) : null;
    if (!me || me.id !== Number(playerId)) return;
    stopped = false;
    threadsPoller.start();
    syncPollers();
  }

  const keeper = createKeeper({ doc, win });
  const dock = createDock({ doc, win, keeper, onGameChatOpened: () => store.update((s) => collapseAll(s)) });

  const actions = {
    addFriend(p) {
      store.update((s) => addFriend(s, p, now()));
      presence.refresh([p.id]);
    },
    removeFriend: (id) => store.update((s) => removeFriend(s, id)),
    setFriendNote: (id, note) => store.update((s) => setFriendNote(s, id, note)),
    openDm(id, { expand = true, username, avatar } = {}) {
      const small = dock.isSmall();
      store.update((s) => openDm(s, id, { expand, exclusive: small && expand, now: now(), username, avatar }));
      if (expand) {
        activeDmId = id;
        activeDmPoller.poke();
        if (small) dock.minimizeGameChats();
      }
    },
    toggleDm(id) {
      const e = dmEntry(id);
      if (!e) return;
      if (e.open) actions.minimizeDm(id);
      else actions.openDm(id, { expand: true });
    },
    minimizeDm: (id) => store.update((s) => setDmOpen(s, id, false)),
    closeDm(id) {
      store.update((s) => closeDm(s, id));
      if (activeDmId === id) activeDmId = null;
    },
    togglePm() {
      const open = !store.get().dock.friendsOpen;
      const small = dock.isSmall();
      store.update((s) => setFriendsOpen(s, open, { exclusive: small }));
      if (open && small) dock.minimizeGameChats();
    },
    setPmTab: (tab) => settings.update((s) => setPmTab(s, tab)),
    toggleSettings() {
      const open = !store.get().dock.settingsOpen;
      const small = dock.isSmall();
      store.update((s) => setSettingsOpen(s, open, { exclusive: small }));
      if (open && small) dock.minimizeGameChats();
    },
    closeAllDms() {
      store.update((s) => closeAllDms(s));
      activeDmId = null;
    },
    toggleMute: (id) => settings.update((s) => setMuted(s, id, !isMuted(s, id))),
    setSound(name) {
      settings.update((s) => setSound(s, name));
      sound.unlock(); // a change event is a user gesture, so the browser lets audio start now
    },
    resetChat: (key) => settings.update((s) => resetChat(s, key)),
    resetAllChats: () => settings.update((s) => resetAllChats(s)),
    setSettingsTab: (tab) => settings.update((s) => setSettingsTab(s, tab)),
    setMentionSound(name) {
      settings.update((s) => setMentionSound(s, name));
      sound.unlock();
    },
    setVolume: (v) => settings.update((s) => setVolume(s, v)),
    setMentions: (on) => settings.update((s) => setFlag(s, 'mentions', on)),
    // Returns the cleaned list, for the text field to show.
    setMentionWords(text) {
      settings.update((s) => setMentionWords(s, text));
      return settings.get().mentionWords;
    },
    setClock12: (on) => settings.update((s) => setFlag(s, 'clock12', on)),
    setChatLocked: (key, locked) => settings.update((s) => updateChat(s, key, { locked: locked ? null : false })),
    stepChatText: (key, delta) => settings.update((s) => updateChat(s, key, { text: clampText(textOf(s.chats[key], s.textAll) + delta) })),
    returnChat: (key) => settings.update((s) => updateChat(s, key, { x: null, y: null })),
    resetChatSize: (key) => settings.update((s) => updateChat(s, key, { w: null, h: null })),
    stepTextAll: (delta) => settings.update((s) => setTextAll(s, s.textAll + delta)),
    restoreDefaults: () => settings.update((s) => restoreDefaults(s)),
    async setNotify(on) {
      const ask = ++notifyAsk;
      const off = (message, opts) => {
        settings.update((s) => setFlag(s, 'notify', false));
        if (message) toast(message, opts);
      };
      if (!on) return off();
      const answer = await notifier.request();
      if (ask !== notifyAsk) return; // switched off (or on again) while the browser was asking
      if (answer === 'default') return off('Notifications stay off until you allow them when your browser asks.');
      if (answer === 'unsupported') return off('This browser has no desktop notifications.', { error: true });
      if (answer !== 'granted') return off("Notifications are blocked for zed.city in your browser's site settings.", { error: true });
      if (!notifier.confirm()) return off("This browser won't show notifications from a web page.", { error: true });
      settings.update((s) => setFlag(s, 'notify', true));
    },
    setNotifyFriendsOnly: (on) => settings.update((s) => setFlag(s, 'notifyFriendsOnly', on)),
    setTitleCount: (on) => settings.update((s) => setFlag(s, 'titleCount', on)),
    setHoverLocal: (on) => settings.update((s) => setFlag(s, 'hoverLocal', on)),
    togglePin(id) {
      if (!settings.update((s) => togglePinned(s, id))) toast('You can pin up to 20 chats.');
    },
    markAllRead: (onProgress) => markAllRead({
      ids: chatsUnreadIds(store.get(), inbox.threads(), settings.get().muted),
      api,
      markSeen: (id) => store.update((s) => markSeen(s, id, inbox.lastReply(id))),
      onProgress,
      toast,
    }),
    setActiveDm(id) {
      if (activeDmId === id) return;
      activeDmId = id;
      activeDmPoller.poke();
    },
    addEnemy(p) {
      enemies.update((d) => addEnemy(d, p, now()));
      presence.refresh([p.id]);
    },
    removeEnemy: (id) => enemies.update((d) => removeEnemy(d, id)),
    setEnemyNote: (id, note) => enemies.update((d) => setEnemyNote(d, id, note)),
    exportBackup: () => exportFriends(store.get(), playerId, enemies.get(), settings.get()),
    importBackup(text) {
      const r = parseImport(text, playerId);
      if (!r.ok) return r;
      const f = store.update((s) => mergeImport(s, r.friends, now()));
      const e = r.enemies.length ? enemies.update((d) => mergeEnemiesImport(d, r.enemies, now())) : { added: 0, notes: 0 };
      let restored;
      if (r.settings) {
        try {
          settings.update((s) => applyBackupSettings(s, r.settings));
          restored = 'restored';
        } catch {
          restored = 'unreadable';
        }
      }
      return { ok: true, added: f.added, enemiesAdded: e.added, notes: f.notes + e.notes, settings: restored };
    },
  };

  const services = {
    api,
    settings,
    enemies,
    isEnemy: (id) => isEnemy(enemies.get(), id),
    isMuted: (id) => isMuted(settings.get(), id),
    notifier,
    sound,
    playerId,
    myId: playerId,
    myName: playerName,
    store,
    storage,
    actions,
    presence,
    players,
    inbox,
    conversations,
    router,
    toast,
    isSmall: dock.isSmall,
  };

  const view = createDockView({ root: dock.root, services });
  const custom = createChatCustom({
    doc,
    win,
    keeper,
    settings,
    isSmall: dock.isSmall,
    dm: {
      name(id) {
        const s = store.get();
        const d = s.dock.dms.find((x) => x.id === id);
        return (d && d.username) || (s.friends[id] && s.friends[id].username) || null;
      },
      isMuted: (id) => isMuted(settings.get(), id),
      toggleMute: (id) => actions.toggleMute(id),
    },
  });
  // Our windows come and go with the store; their chat controls follow at once rather than a frame later.
  const renderDock = () => {
    view.render();
    custom.refresh();
  };
  const profileButton = createProfileButton({ doc, win, store, actions, players, toast, myId: playerId });
  const enemyButton = createProfileButton({
    doc,
    win,
    spec: ENEMY_BUTTON,
    isOn: (id) => isEnemy(enemies.get(), id),
    add: (p) => actions.addEnemy(p),
    remove: (id) => actions.removeEnemy(id),
    players,
    toast,
    after: () => profileButton.wrap,
    myId: playerId,
  });
  // Every chat time in Zed City time: the game's own chats print the browser clock, so theirs get rewritten.
  const gameClock = createGameClock({ doc, storage, key: `zcf:v1:${playerId}:gameClock`, now, onChange: () => marks.refresh() });
  // A mention arriving while you watch: the mention sound, if it's on, for a message from the last 2
  // minutes, at most every 5 seconds, and not when another game tab has focus (it hears it itself).
  let lastMentionSound = 0;
  function onMention(row) {
    const s = settings.get();
    if (s.mentionSound === 'off' || tabFocus.elsewhere()) return;
    const el = row.querySelector(TIME);
    const ts = el ? gameClock.momentOf(el) : null;
    const t = now();
    if (ts === null || t - ts > MENTION_RECENT_MS || t - lastMentionSound < MENTION_GAP_MS) return;
    lastMentionSound = t;
    sound.play(s.mentionSound, { volume: s.volume });
  }
  const mentionMarks = createMentionMarks({
    doc,
    win,
    words: () => [playerName, ...settings.get().mentionWords].filter(Boolean),
    enabled: () => settings.get().mentions,
    myName: playerName || '',
    onMention,
  });
  const marks = createEnemyMarks({
    doc,
    win,
    keeper,
    names: () => enemyNames(enemies.get()),
    onRow: (row, info) => {
      gameClock.rewrite(row, 'game', { h12: settings.get().clock12 });
      mentionMarks.mark(row, info);
    },
  });
  const page = createFriendsPage(services, { doc, win, keeper });
  const titleCount = createTitleCount({ doc, win });
  const timeHover = createTimeHover({ doc, win, now, gameClock, showLocal: () => settings.get().hoverLocal, clock12: () => settings.get().clock12 });
  const syncTitle = () => {
    const s = settings.get();
    titleCount.set(chatsUnreadTotal(store.get(), inbox.threads(), s.muted), s.titleCount);
  };
  const topbar = createTopbarButton({ doc, keeper, router });

  store.subscribe(() => {
    renderDock();
    syncTitle();
    syncPollers();
    profileButton.refresh();
    page.scheduleRender();
  });
  presence.subscribe(() => {
    view.pm.scheduleList();
    for (const d of store.get().dock.dms) {
      const w = view.dmWindow(d.id);
      if (w) w.update();
    }
    page.scheduleRender();
  });
  inbox.subscribe(() => {
    view.pm.scheduleList();
    view.pm.syncBadge();
    syncTitle();
  });
  // The game chats' rows depend on the clock and the mention settings: redo them when those change.
  const rowsSig = () => {
    const s = settings.get();
    return JSON.stringify([s.clock12, s.mentions, s.mentionWords]);
  };
  let lastRowsSig = rowsSig();
  settings.subscribe(() => {
    renderDock();
    syncTitle();
    const sig = rowsSig();
    if (sig !== lastRowsSig) {
      lastRowsSig = sig;
      marks.refresh();
    }
  });
  enemies.subscribe(() => {
    renderDock();
    enemyButton.refresh();
    page.scheduleRender();
    marks.refresh();
  });
  // The presence poller keeps running from /friends to /enemies, so a switch of list needs its own sweep.
  let listKind = null;
  router.onChange((path) => {
    profileButton.onRoute(path);
    enemyButton.onRoute(path);
    page.onRoute(path);
    syncPollers();
    const kind = page.active ? page.kind : null;
    if (kind && kind !== listKind) presencePoller.poke();
    listKind = kind;
    resumeIfLoggedIn();
  });
  // Entering the phone layout (rotation, resize): keep only the most recently used of our windows open,
  // and minimize the game's open chat, so the one-open-window rule holds (spec §4.5).
  function enforcePhoneRule() {
    const s = store.get();
    const openDms = s.dock.dms.filter((d) => d.open).length;
    const openCount = openDms + (s.dock.friendsOpen ? 1 : 0) + (s.dock.settingsOpen ? 1 : 0);
    if (!openCount) return;
    if (openCount > 1) {
      const keepId = openDms ? pickActive() : null;
      store.update((st) => {
        for (const d of st.dock.dms) d.open = d.id === keepId;
        if (keepId !== null) {
          st.dock.friendsOpen = false;
          st.dock.settingsOpen = false;
        } else if (st.dock.friendsOpen) st.dock.settingsOpen = false;
      });
    }
    dock.minimizeGameChats();
  }
  dock.onSmallChange((small) => {
    if (small) enforcePhoneRule();
    renderDock();
  });

  dock.start();
  page.start();
  topbar.start();
  marks.start();
  custom.start();
  // Browsers only start audio after the player has interacted with the page (spec §B.4).
  const unlockSound = () => {
    const s = settings.get();
    if (s.sound !== 'off' || s.mentionSound !== 'off') sound.unlock();
  };
  doc.addEventListener('pointerdown', unlockSound, { capture: true, once: true });
  const onVisible = () => {
    if (doc.visibilityState !== 'hidden') for (const id of expandedIds()) markSeenIfNeeded(id);
  };
  doc.addEventListener('visibilitychange', onVisible);
  if (dock.isSmall()) enforcePhoneRule();
  renderDock();
  syncTitle();
  profileButton.onRoute(router.path);
  enemyButton.onRoute(router.path);
  page.onRoute(router.path);
  threadsPoller.start();
  syncPollers();

  return {
    store,
    settings,
    enemies,
    actions,
    view,
    conversations,
    stop: stopAll,
    destroy() {
      stopAll();
      for (const p of pollers) p.destroy();
      dock.destroy();
      profileButton.destroy();
      enemyButton.destroy();
      marks.destroy();
      mentionMarks.destroy();
      custom.destroy();
      titleCount.destroy();
      timeHover.destroy();
      tabFocus.destroy();
      view.destroy();
      doc.removeEventListener('pointerdown', unlockSound, true);
      doc.removeEventListener('visibilitychange', onVisible);
      page.destroy();
      topbar.destroy();
      keeper.destroy();
      router.destroy();
      store.destroy();
      settings.destroy();
      enemies.destroy();
    },
  };
}
