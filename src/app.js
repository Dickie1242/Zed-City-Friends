// Wires the modules together: store, pollers, dock UI and profile button.
import { createStore } from './store.js';
import { createRouter } from './router.js';
import { createPlayers } from './players.js';
import { createPresence } from './presence.js';
import { createConversations } from './conversation.js';
import { createInbox } from './inbox.js';
import { makePoller } from './poller.js';
import { exportFriends, parseImport, mergeImport } from './backup.js';
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
} from './state.js';
import { createDock } from './ui/dock.js';
import { createDockView } from './ui/dock-view.js';
import { createToaster } from './ui/toast.js';
import { createProfileButton } from './ui/profile-button.js';
import { statsPlayer } from './util.js';

export const CHATTING_MS = 5 * 60 * 1000;
export const INTERVALS = { threadsIdle: 15000, threadsChatting: 5000, activeDm: 2000, activeDmBusy: 10000, dmInfo: 60000, presence: 60000 };
export const PRESENCE_PER_SWEEP = 20;

export function createApp({ api, playerId, playerName, doc = document, win = window, storage = win.localStorage, now = () => Date.now() }) {
  const store = createStore({ playerId, storage, win, now });
  const router = createRouter({ win, doc });
  const toast = createToaster(doc);
  const players = createPlayers({ api, now });
  let stopped = false;
  let activeDmId = null;
  let chattingUntil = 0;

  const isChatting = () => now() < chattingUntil;
  const dmEntry = (id) => store.get().dock.dms.find((d) => d.id === id);
  const isExpanded = (id) => !!(dmEntry(id) && dmEntry(id).open);
  const expandedIds = () => store.get().dock.dms.filter((d) => d.open).map((d) => d.id);

  function syncFriendInfo(id, info) {
    const f = store.get().friends[id];
    if (!f || !info) return;
    const nameChanged = typeof info.username === 'string' && info.username && info.username !== f.username;
    const avatarChanged = typeof info.avatar === 'string' && info.avatar && info.avatar !== f.avatar;
    if (nameChanged || avatarChanged) store.update((s) => updateFriendInfo(s, id, info));
  }

  const presence = createPresence({ fetchProfile: (id) => api.getProfile(id), onProfile: syncFriendInfo, now });

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
    const seen = Math.max(c.latestTs(), inbox.lastReply(id) || 0);
    const t = store.get().threads[id];
    if (!t || t.unread > 0 || (t.lastSeenReply || 0) < seen) store.update((s) => markSeen(s, id, seen));
  }

  const conversations = createConversations({
    api,
    myId: playerId,
    onActivity: () => markChatting(),
    onInfo: (id, info) => {
      presence.set(id, info);
      syncFriendInfo(id, info);
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
  });

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
  const presencePoller = makePoller({
    run: () => {
      // Stalest first, capped, so a long friends list can't turn into one getProfile per friend per minute.
      const age = (id) => (presence.get(id) || { fetchedAt: 0 }).fetchedAt;
      const stale = Object.keys(store.get().friends).map(Number).filter((id) => presence.isStale(id));
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
    for (const [p, on] of [[activeDmPoller, anyOpen], [infoPoller, anyOpen], [presencePoller, s.dock.friendsOpen]]) {
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

  const dock = createDock({ doc, win, onGameChatOpened: () => store.update((s) => collapseAll(s)) });

  const actions = {
    addFriend(p) {
      store.update((s) => addFriend(s, p, now()));
      presence.refresh([p.id]);
    },
    removeFriend: (id) => store.update((s) => removeFriend(s, id)),
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
    toggleFriends() {
      const open = !store.get().dock.friendsOpen;
      const small = dock.isSmall();
      store.update((s) => setFriendsOpen(s, open, { exclusive: small }));
      if (open && small) dock.minimizeGameChats();
    },
    setActiveDm(id) {
      if (activeDmId === id) return;
      activeDmId = id;
      activeDmPoller.poke();
    },
    exportFriends: () => exportFriends(store.get(), playerId),
    importFriends(text) {
      const r = parseImport(text, playerId);
      if (!r.ok) return r;
      return { ok: true, ...store.update((s) => mergeImport(s, r.friends, now())) };
    },
  };

  const services = {
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
  const profileButton = createProfileButton({ doc, win, store, actions, players, toast });

  store.subscribe(() => {
    view.render();
    syncPollers();
    profileButton.refresh();
  });
  presence.subscribe(() => {
    view.friends.scheduleList();
    for (const d of store.get().dock.dms) {
      const w = view.dmWindow(d.id);
      if (w) w.update();
    }
  });
  inbox.subscribe(() => view.friends.scheduleList());
  router.onChange((path) => {
    profileButton.onRoute(path);
    resumeIfLoggedIn();
  });
  // Entering the phone layout (rotation, resize): keep only the most recently used of our windows open,
  // and minimize the game's open chat, so the one-open-window rule holds (spec §4.5).
  function enforcePhoneRule() {
    const s = store.get();
    const openDms = s.dock.dms.filter((d) => d.open).length;
    const openCount = openDms + (s.dock.friendsOpen ? 1 : 0);
    if (!openCount) return;
    if (openCount > 1) {
      const keepId = openDms ? pickActive() : null;
      store.update((st) => {
        for (const d of st.dock.dms) d.open = d.id === keepId;
        if (keepId !== null) st.dock.friendsOpen = false;
      });
    }
    dock.minimizeGameChats();
  }
  dock.onSmallChange((small) => {
    if (small) enforcePhoneRule();
    view.render();
  });

  dock.start();
  if (dock.isSmall()) enforcePhoneRule();
  view.render();
  profileButton.onRoute(router.path);
  threadsPoller.start();
  syncPollers();

  return {
    store,
    actions,
    view,
    conversations,
    stop: stopAll,
    destroy() {
      stopAll();
      for (const p of pollers) p.destroy();
      dock.destroy();
      profileButton.destroy();
      store.destroy();
    },
  };
}
