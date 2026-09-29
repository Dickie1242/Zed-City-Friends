// Wires the modules together: stores, pollers, dock UI, profile buttons and pages.
import { createStore, createSettingsStore, createEnemiesStore } from './store.js';
import { setPmTab, setSound, setMuted, isMuted, resetChat, resetAllChats, togglePinned, setFlag } from './settings.js';
import { createNotifier } from './notify.js';
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
import { createKeeper } from './ui/keeper.js';
import { createTopbarButton } from './ui/topbar-button.js';
import { createFriendsPage } from './ui/friends-page.js';
import { createChatCustom } from './ui/chat-custom/index.js';
import { createTitleCount } from './ui/title-count.js';
import { avatarUrl } from './ui/dom.js';
import { statsPlayer } from './util.js';

export const CHATTING_MS = 5 * 60 * 1000;
export const INTERVALS = { threadsIdle: 15000, threadsChatting: 5000, activeDm: 2000, activeDmBusy: 10000, dmInfo: 60000, presence: 60000, hiddenNotify: 60000 };
// At most this many desktop notifications from one check.
const MAX_NOTIFY = 3;
export const PRESENCE_PER_SWEEP = 20;

export function createApp({ api, playerId, playerName, doc = document, win = window, storage = win.localStorage, now = () => Date.now(), sound = createSound({ win }), notifier: notifierOpt = null }) {
  const store = createStore({ playerId, storage, win, now });
  const settings = createSettingsStore({ playerId, storage, win, now });
  const enemies = createEnemiesStore({ playerId, storage, win, now });
  const router = createRouter({ win, doc });
  const toast = createToaster(doc);
  const players = createPlayers({ api, now });
  // Created here, not as a default parameter, so its click can reach `actions` below.
  const notifier = notifierOpt || createNotifier({ win, onOpen: (id) => actions.openDm(id, { expand: true }) });
  const notificationsOn = () => settings.get().notify && notifier.permission() === 'granted';
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
    if (!isExpanded(id)) return;
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
      const name = settings.get().sound;
      if (name !== 'off') sound.play(name);
      notifyNewMail(arrived);
    },
  });

  function notifyNewMail(arrived) {
    const s = settings.get();
    if (!notificationsOn() || (typeof doc.hasFocus === 'function' && doc.hasFocus())) return;
    const friends = store.get().friends;
    const list = arrived
      .filter((t) => !s.notifyFriendsOnly || friends[t.userId])
      .sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0))
      .slice(0, MAX_NOTIFY);
    for (const t of list) notifier.show({ id: t.userId, title: t.username, body: (t.preview || '').slice(0, 120), icon: avatarUrl(t.avatar) });
  }

  function pickActive() {
    if (activeDmId && isExpanded(activeDmId)) return activeDmId;
    const open = store.get().dock.dms.filter((d) => d.open).sort((a, b) => b.lastUsed - a.lastUsed);
    activeDmId = open.length ? open[0].id : null;
    return activeDmId;
  }

  const onAuthLost = () => stopAll();
  const threadsPoller = makePoller({
    run: () => inbox.poll(),
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
    async setNotify(on) {
      if (on) {
        const answer = await notifier.request();
        if (answer !== 'granted') {
          settings.update((s) => setFlag(s, 'notify', false));
          toast(answer === 'unsupported' ? 'This browser has no desktop notifications.' : "Notifications are blocked for zed.city in your browser's site settings.", { error: true });
          return;
        }
      }
      settings.update((s) => setFlag(s, 'notify', on));
    },
    setNotifyFriendsOnly: (on) => settings.update((s) => setFlag(s, 'notifyFriendsOnly', on)),
    setTitleCount: (on) => settings.update((s) => setFlag(s, 'titleCount', on)),
    setLocalTime: (on) => settings.update((s) => setFlag(s, 'localTime', on)),
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
    exportFriends: () => exportFriends(store.get(), playerId, enemies.get()),
    importFriends(text) {
      const r = parseImport(text, playerId);
      if (!r.ok) return r;
      const f = store.update((s) => mergeImport(s, r.friends, now()));
      const e = r.enemies.length ? enemies.update((d) => mergeEnemiesImport(d, r.enemies, now())) : { added: 0, notes: 0 };
      return { ok: true, added: f.added, enemiesAdded: e.added, notes: f.notes + e.notes };
    },
  };

  const services = {
    api,
    settings,
    enemies,
    isEnemy: (id) => isEnemy(enemies.get(), id),
    isMuted: (id) => isMuted(settings.get(), id),
    isLocalTime: () => settings.get().localTime,
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
  const profileButton = createProfileButton({ doc, win, store, actions, players, toast });
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
  });
  const marks = createEnemyMarks({ doc, win, keeper, names: () => enemyNames(enemies.get()) });
  const page = createFriendsPage(services, { doc, win, keeper });
  const titleCount = createTitleCount({ doc, win });
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
  settings.subscribe(() => {
    renderDock();
    syncTitle();
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
    if (settings.get().sound !== 'off') sound.unlock();
  };
  doc.addEventListener('pointerdown', unlockSound, { capture: true, once: true });
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
      custom.destroy();
      titleCount.destroy();
      view.destroy();
      doc.removeEventListener('pointerdown', unlockSound, true);
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
