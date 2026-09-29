// ==UserScript==
// @name         Zed City Friends
// @namespace    zed-city-friends
// @version      0.6.0
// @description  Private Messages, friends and enemies lists, and movable, resizable chats for Zed City's chat dock.
// @license      MIT
// @match        https://www.zed.city/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/Dickie1242/Zed-City-Friends
// @supportURL   https://github.com/Dickie1242/Zed-City-Friends/issues
// @downloadURL  https://raw.githubusercontent.com/Dickie1242/Zed-City-Friends/main/dist/zed-city-friends.user.js
// @updateURL    https://raw.githubusercontent.com/Dickie1242/Zed-City-Friends/main/dist/zed-city-friends.user.js
// ==/UserScript==

(() => {
  // src/api.js
  var API_BASE = "https://api.zed.city/";
  var MAIL_ACCESS_ERROR = "You cannot access messages with this user!";
  var BUSY_CODES = { 3: "fight", 5: "traveling", 6: "exploring", 7: "offline" };
  function classifyResponse(status, body) {
    if (body && typeof body === "object" && body.error !== void 0) {
      const code = body.errorCode;
      const message = String(body.error);
      if (code === 1) return { ok: false, kind: "auth", code, message };
      if (BUSY_CODES[code]) return { ok: false, kind: "busy", code, message, busy: BUSY_CODES[code] };
      if (message === MAIL_ACCESS_ERROR) return { ok: false, kind: "access", code, message };
      if (code === 403 || status === 403) return { ok: false, kind: "csrf", code: 403, message };
      if (status === 429) return { ok: false, kind: "rate", code: 429, message };
      if (status >= 500) return { ok: false, kind: "network", code: status, message };
      return { ok: false, kind: "other", code, message };
    }
    if (status === 429) return { ok: false, kind: "rate", code: 429, message: "Rate limited" };
    if (status === 403) return { ok: false, kind: "csrf", code: 403, message: "Forbidden" };
    if (status >= 500) return { ok: false, kind: "network", code: status, message: `Server error ${status}` };
    if (status >= 400) return { ok: false, kind: "other", code: status, message: `HTTP ${status}` };
    if (body === null || typeof body !== "object") return { ok: false, kind: "other", code: status, message: "Unexpected response" };
    return { ok: true, data: body };
  }
  function createApi({ fetchImpl = (...args) => fetch(...args), base = API_BASE, timeoutMs = 2e4 } = {}) {
    let csrfToken = null;
    async function send(method, path, { params, body } = {}) {
      let url = base + path;
      if (params) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v !== void 0 && v !== null) qs.set(k, String(v));
        }
        const s = qs.toString();
        if (s) url += `?${s}`;
      }
      const init = { method, credentials: "include", headers: { Accept: "application/json" } };
      if (method !== "GET") {
        init.headers["Content-Type"] = "application/json";
        if (csrfToken) init.headers["X-CSRF-Token"] = csrfToken;
        init.body = JSON.stringify(body || {});
      }
      let timer = null;
      let timedOut = false;
      if (method === "GET" && typeof AbortController === "function") {
        const controller = new AbortController();
        init.signal = controller.signal;
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
      }
      let res;
      try {
        res = await fetchImpl(url, init);
      } catch (e) {
        if (timer) clearTimeout(timer);
        if (timedOut) return { ok: false, kind: "network", code: 0, message: "Request timed out" };
        return { ok: false, kind: "network", code: 0, message: String(e && e.message || e) };
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (timedOut) return { ok: false, kind: "network", code: 0, message: "Request timed out" };
      return classifyResponse(res.status, data);
    }
    async function refreshCsrf() {
      csrfToken = null;
      const r = await send("GET", "csrfToken");
      if (r.ok && r.data && typeof r.data.token === "string") csrfToken = r.data.token;
      return csrfToken;
    }
    async function request(method, path, opts) {
      if (method !== "GET" && !csrfToken) await refreshCsrf();
      let r = await send(method, path, opts);
      if (!r.ok && r.kind === "csrf" && method !== "GET") {
        await refreshCsrf();
        r = await send(method, path, opts);
        if (!r.ok && r.kind === "csrf") r = { ...r, kind: "other" };
      }
      return r;
    }
    return {
      getStats: () => request("GET", "getStats"),
      getChats: (page = 1) => request("GET", "getChats", { params: { page } }),
      getChatInfo: (userId) => request("GET", "getChatInfo", { params: { user_id: userId } }),
      // `page` is the game's 1-based page number (it calls it "offset"); page 1 is the newest messages.
      getChatMessages: (userId, page = 1, limit = 10) => request("GET", "getChatMessages", { params: { user_id: userId, offset: page, limit } }),
      getNewMessages: (userId, lastMessageId) => request("GET", "getNewMessages", { params: { user_id: userId, last_message_id: lastMessageId } }),
      sendMail: (userId, message) => request("POST", "sendMail", { body: { message, user_id: userId } }),
      getProfile: (userId) => request("GET", "getProfile", { params: { user: userId } }),
      findPlayer: (q) => request("GET", "findPlayer", { params: { q } }),
      getFactionMembers: () => request("GET", "getFactionMembers"),
      blockList: (page = 1) => request("GET", "blockList", { params: { page } }),
      unblockUser: (userId) => request("POST", "unblockUser", { body: { user_id: userId } })
    };
  }

  // src/util.js
  var warned = /* @__PURE__ */ new Set();
  function warnOnce(key, ...details) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn("[ZCF]", key, ...details);
  }
  function safe(key, fn) {
    return function safeWrapped(...args) {
      try {
        const out = fn.apply(this, args);
        if (out && typeof out.then === "function") out.then(void 0, (e) => warnOnce(key, e));
        return out;
      } catch (e) {
        warnOnce(key, e);
        return void 0;
      }
    };
  }
  function debounce(fn, ms) {
    let timer = null;
    const debounced = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, ms);
    };
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return debounced;
  }
  function asArray(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return Object.values(data);
    return [];
  }
  function toId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function statsPlayer(data) {
    const u = data && typeof data === "object" && data.user && typeof data.user === "object" ? data.user : data;
    const id = toId(u && u.id);
    return id ? { id, username: typeof u.username === "string" ? u.username : "" } : null;
  }

  // src/state.js
  var MAX_DMS = 4;
  function emptyState() {
    return { v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, settingsOpen: false, dms: [] } };
  }
  var isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  function normalizeState(doc) {
    if (!isObj(doc) || doc.v !== 1) throw new Error("Unsupported state document");
    const dock = isObj(doc.dock) ? doc.dock : {};
    return {
      v: 1,
      friends: isObj(doc.friends) ? doc.friends : {},
      threads: isObj(doc.threads) ? doc.threads : {},
      dock: {
        friendsOpen: !!dock.friendsOpen,
        settingsOpen: !!dock.settingsOpen,
        dms: Array.isArray(dock.dms) ? dock.dms.filter((d) => isObj(d) && toId(d.id)) : []
      }
    };
  }
  function isFriend(state, id) {
    return !!state.friends[id];
  }
  var MAX_NOTE = 200;
  var normalizeNote = (note) => typeof note === "string" ? note.trim().slice(0, MAX_NOTE).trim() : "";
  function addPerson(map, { id, username, avatar: avatar2 }, now) {
    if (map[id]) return false;
    map[id] = { id, username: username || `#${id}`, avatar: avatar2 || null, addedAt: now };
    return true;
  }
  function removePerson(map, id) {
    delete map[id];
  }
  function updatePersonInfo(map, id, { username, avatar: avatar2 }) {
    const p = map[id];
    if (!p) return false;
    let changed = false;
    if (typeof username === "string" && username && username !== p.username) {
      p.username = username;
      changed = true;
    }
    if (typeof avatar2 === "string" && avatar2 && avatar2 !== p.avatar) {
      p.avatar = avatar2;
      changed = true;
    }
    return changed;
  }
  function setPersonNote(map, id, note) {
    const p = map[id];
    if (!p) return false;
    const text2 = normalizeNote(note);
    if ((p.note || "") === text2) return false;
    if (text2) p.note = text2;
    else delete p.note;
    return true;
  }
  var addFriend = (state, p, now) => addPerson(state.friends, p, now);
  var removeFriend = (state, id) => removePerson(state.friends, id);
  var updateFriendInfo = (state, id, info2) => updatePersonInfo(state.friends, id, info2);
  var setFriendNote = (state, id, note) => setPersonNote(state.friends, id, note);
  function threadEntry(state, id) {
    if (!state.threads[id]) state.threads[id] = { lastSeenReply: 0, lastNotifiedReply: 0, unread: 0 };
    return state.threads[id];
  }
  function markSeen(state, id, lastReply) {
    const t = threadEntry(state, id);
    t.unread = 0;
    if (lastReply && lastReply > (t.lastSeenReply || 0)) t.lastSeenReply = lastReply;
  }
  function collapseOthers(state, keep) {
    for (const d of state.dock.dms) if (d !== keep) d.open = false;
    state.dock.friendsOpen = false;
    state.dock.settingsOpen = false;
  }
  function openDm(state, id, opts = {}) {
    const { expand = false, exclusive = false, now = 0, max = MAX_DMS, username, avatar: avatar2 } = opts;
    let entry = state.dock.dms.find((d) => d.id === id);
    if (!entry) {
      entry = { id, open: false, lastUsed: now, username: username || null, avatar: avatar2 || null };
      state.dock.dms.push(entry);
    }
    if (username) entry.username = username;
    if (avatar2) entry.avatar = avatar2;
    entry.lastUsed = now;
    if (expand) {
      entry.open = true;
      if (exclusive) collapseOthers(state, entry);
    }
    evictDms(state, id, max);
  }
  function evictDms(state, keepId, max = MAX_DMS) {
    while (state.dock.dms.length > max) {
      const candidates = state.dock.dms.filter((d) => d.id !== keepId);
      if (!candidates.length) break;
      const hasUnread = (d) => !!(state.threads[d.id] && state.threads[d.id].unread > 0);
      const rank = (d) => (d.open ? 2 : 0) + (hasUnread(d) ? 1 : 0);
      const pool = candidates.slice().sort((a, b) => rank(a) - rank(b) || a.lastUsed - b.lastUsed);
      const victim = pool[0];
      state.dock.dms = state.dock.dms.filter((d) => d !== victim);
    }
  }
  function setDmOpen(state, id, open, { exclusive = false, now } = {}) {
    const entry = state.dock.dms.find((d) => d.id === id);
    if (!entry) return;
    entry.open = !!open;
    if (now) entry.lastUsed = now;
    if (open && exclusive) collapseOthers(state, entry);
  }
  function closeDm(state, id) {
    state.dock.dms = state.dock.dms.filter((d) => d.id !== id);
  }
  function setFriendsOpen(state, open, { exclusive = false } = {}) {
    state.dock.friendsOpen = !!open;
    if (open && exclusive) {
      for (const d of state.dock.dms) d.open = false;
      state.dock.settingsOpen = false;
    }
  }
  function setSettingsOpen(state, open, { exclusive = false } = {}) {
    state.dock.settingsOpen = !!open;
    if (open && exclusive) {
      for (const d of state.dock.dms) d.open = false;
      state.dock.friendsOpen = false;
    }
  }
  function collapseAll(state) {
    state.dock.friendsOpen = false;
    state.dock.settingsOpen = false;
    for (const d of state.dock.dms) d.open = false;
  }
  function closeAllDms(state) {
    state.dock.dms = [];
  }
  function chatsUnreadIds(state, inboxThreads, muted = []) {
    const ids = new Set(Object.keys(state.friends).map(Number));
    for (const t of inboxThreads) ids.add(t.userId);
    const skip = new Set(muted);
    return [...ids].filter((id) => !skip.has(id) && state.threads[id] && state.threads[id].unread > 0);
  }
  function chatsUnreadTotal(state, inboxThreads, muted = []) {
    return chatsUnreadIds(state, inboxThreads, muted).reduce((n, id) => n + state.threads[id].unread, 0);
  }

  // src/chat-custom/chats.js
  var GAME_CHATS = [
    { key: "game:general", cls: "general-chat", label: "Global" },
    { key: "game:faction", cls: "faction-chat", label: "Faction" },
    { key: "game:activity", cls: "activity-chat", label: "Activity" }
  ];
  var LIMITS = { minW: 270, maxW: 900, minH: 200, maxH: 2e3, minText: 80, maxText: 200, textStep: 10 };
  var DEFAULT_TEXT = 100;
  var KEY_RE = /^(?:game:(?:general|faction|activity)|pm|settings|dm:[1-9]\d{0,15})$/;
  var isChatKey = (key) => typeof key === "string" && KEY_RE.test(key);
  var dmKey = (id) => `dm:${id}`;
  var dmIdOf = (key) => typeof key === "string" && /^dm:\d+$/.test(key) ? Number(key.slice(3)) : null;
  var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
  var clampText = (v) => clamp(Math.round(v / LIMITS.textStep) * LIMITS.textStep, LIMITS.minText, LIMITS.maxText);
  function normalizeChatEntry(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    if (raw.locked === false) out.locked = false;
    const x = num(raw.x);
    const y = num(raw.y);
    if (x !== null && y !== null) {
      out.x = Math.max(0, Math.round(x));
      out.y = Math.max(0, Math.round(y));
    }
    const w = num(raw.w);
    if (w !== null) out.w = clamp(Math.round(w), LIMITS.minW, LIMITS.maxW);
    const h2 = num(raw.h);
    if (h2 !== null) out.h = clamp(Math.round(h2), LIMITS.minH, LIMITS.maxH);
    const t = num(raw.text);
    if (t !== null && clampText(t) !== DEFAULT_TEXT) out.text = clampText(t);
    return out;
  }
  function normalizeChats(chats) {
    const out = {};
    if (!chats || typeof chats !== "object" || Array.isArray(chats)) return out;
    for (const [key, raw] of Object.entries(chats)) {
      if (!isChatKey(key)) continue;
      const entry = normalizeChatEntry(raw);
      if (Object.keys(entry).length) out[key] = entry;
    }
    return out;
  }
  var textOf = (entry) => entry && entry.text || DEFAULT_TEXT;
  var isLocked = (entry) => !(entry && entry.locked === false);
  var isMoved = (entry) => !!(entry && typeof entry.x === "number" && typeof entry.y === "number");
  function chatLabel(key, dmName) {
    const game = GAME_CHATS.find((g) => g.key === key);
    if (game) return game.label;
    if (key === "pm") return "Private Messages";
    if (key === "settings") return "Chat settings";
    const id = dmIdOf(key);
    return id ? dmName || `#${id}` : String(key);
  }
  function describeChat(entry) {
    const size = entry && (entry.w || entry.h) ? `${entry.w || "auto"}×${entry.h || "auto"}` : "default size";
    return [isMoved(entry) ? "moved" : "docked", size, `text ${textOf(entry)}%`].join(" · ");
  }

  // src/settings.js
  var PM_TABS = ["chats", "friends", "faction", "blocked"];
  var SOUNDS = ["off", "chirp", "ping", "bell"];
  var MAX_MUTED = 500;
  var MAX_PINNED = 20;
  var FLAGS = ["notify", "notifyFriendsOnly", "titleCount"];
  function defaultSettings() {
    return {
      v: 1,
      pmTab: "chats",
      sound: "off",
      chats: {},
      muted: [],
      pinned: [],
      notify: false,
      notifyFriendsOnly: false,
      titleCount: true
    };
  }
  var isObj2 = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  function normalizeIdList(list, max) {
    const out = [];
    for (const v of Array.isArray(list) ? list : []) {
      if (out.length >= max) break;
      const id = toId(v);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  }
  var normalizeMuted = (list) => normalizeIdList(list, MAX_MUTED);
  function normalizeSettings(doc) {
    if (!isObj2(doc) || doc.v !== 1) throw new Error("Unsupported settings document");
    return {
      v: 1,
      pmTab: PM_TABS.includes(doc.pmTab) ? doc.pmTab : "chats",
      sound: SOUNDS.includes(doc.sound) ? doc.sound : "off",
      chats: normalizeChats(doc.chats),
      muted: normalizeMuted(doc.muted),
      pinned: normalizeIdList(doc.pinned, MAX_PINNED),
      notify: doc.notify === true,
      notifyFriendsOnly: doc.notifyFriendsOnly === true,
      titleCount: doc.titleCount !== false
    };
  }
  function setPmTab(s, tab) {
    if (PM_TABS.includes(tab)) s.pmTab = tab;
  }
  function setSound(s, sound) {
    if (SOUNDS.includes(sound)) s.sound = sound;
  }
  var isMuted = (s, id) => s.muted.includes(Number(id));
  function setMuted(s, id, on) {
    const n = toId(id);
    if (!n) return;
    const rest = s.muted.filter((x) => x !== n);
    s.muted = normalizeMuted(on ? [n, ...rest] : rest);
  }
  function togglePinned(s, id) {
    const n = toId(id);
    if (!n) return true;
    if (s.pinned.includes(n)) {
      s.pinned = s.pinned.filter((x) => x !== n);
      return true;
    }
    if (s.pinned.length >= MAX_PINNED) return false;
    s.pinned = [n, ...s.pinned];
    return true;
  }
  function setFlag(s, key, on) {
    if (FLAGS.includes(key)) s[key] = !!on;
  }
  function updateChat(s, key, patch) {
    if (!isChatKey(key)) return;
    const next = { ...s.chats[key] || {} };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === void 0) delete next[k];
      else next[k] = v;
    }
    const entry = normalizeChatEntry(next);
    if (Object.keys(entry).length) s.chats[key] = entry;
    else delete s.chats[key];
  }
  function resetChat(s, key) {
    delete s.chats[key];
  }
  function resetAllChats(s) {
    s.chats = {};
  }

  // src/enemies.js
  function emptyEnemies() {
    return { v: 1, enemies: {} };
  }
  var isObj3 = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  function normalizeEnemies(doc) {
    if (!isObj3(doc) || doc.v !== 1) throw new Error("Unsupported enemies document");
    const enemies = {};
    for (const e of Object.values(isObj3(doc.enemies) ? doc.enemies : {})) {
      const id = toId(e && e.id);
      if (!id) continue;
      const entry = {
        id,
        username: typeof e.username === "string" && e.username ? e.username : `#${id}`,
        avatar: typeof e.avatar === "string" && e.avatar ? e.avatar : null,
        addedAt: Number.isFinite(e.addedAt) ? e.addedAt : 0
      };
      const note = normalizeNote(e.note);
      if (note) entry.note = note;
      enemies[id] = entry;
    }
    return { v: 1, enemies };
  }
  var isEnemy = (doc, id) => !!doc.enemies[id];
  var addEnemy = (doc, p, now) => addPerson(doc.enemies, p, now);
  var removeEnemy = (doc, id) => removePerson(doc.enemies, id);
  var setEnemyNote = (doc, id, note) => setPersonNote(doc.enemies, id, note);
  var updateEnemyInfo = (doc, id, info2) => updatePersonInfo(doc.enemies, id, info2);
  var enemyNames = (doc) => new Set(Object.values(doc.enemies).map((e) => e.username.toLowerCase()));

  // src/store.js
  var storageKey = (playerId) => `zcf:v1:${playerId}`;
  var settingsKey = (playerId) => `zcf:v1:${playerId}:settings`;
  var enemiesKey = (playerId) => `zcf:v1:${playerId}:enemies`;
  var RECENT_EMOJI_KEY = "zed-ui.recent-emojis";
  var RECENT_EMOJI_MAX = 18;
  function defaultStorage(storage) {
    if (storage) return storage;
    try {
      return window.localStorage;
    } catch (e) {
      warnOnce("store-recent-emoji-storage", e);
      return null;
    }
  }
  function readGameRecentEmojis(storage) {
    const s = defaultStorage(storage);
    if (!s) return [];
    try {
      const raw = s.getItem(RECENT_EMOJI_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x) => typeof x === "string").slice(0, RECENT_EMOJI_MAX);
    } catch (e) {
      warnOnce("store-recent-emoji-read", e);
      return [];
    }
  }
  function rememberGameRecentEmoji(storage, name) {
    const s = defaultStorage(storage);
    if (!s) return;
    try {
      const current = readGameRecentEmojis(s);
      const next = [name, ...current.filter((n) => n !== name)].slice(0, RECENT_EMOJI_MAX);
      s.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
    } catch (e) {
      warnOnce("store-recent-emoji-write", e);
    }
  }
  function createStore({ playerId, storage = window.localStorage, win = window, now = () => Date.now() }) {
    const key = storageKey(playerId);
    const subs = /* @__PURE__ */ new Set();
    let saved = true;
    function read({ repair } = {}) {
      let text2 = null;
      try {
        text2 = storage.getItem(key);
      } catch (e) {
        warnOnce("store-read", e);
        return { doc: null, ok: false };
      }
      if (!text2) return { doc: emptyState(), ok: true };
      let parsed;
      try {
        parsed = JSON.parse(text2);
      } catch (e) {
        return corrupt(text2, e, repair);
      }
      if (parsed && typeof parsed === "object" && typeof parsed.v === "number" && parsed.v > 1) {
        warnOnce("store-newer", parsed.v);
        return { doc: null, ok: false };
      }
      try {
        return { doc: normalizeState(parsed), ok: true };
      } catch (e) {
        return corrupt(text2, e, repair);
      }
    }
    function corrupt(text2, e, repair) {
      warnOnce("store-corrupt", e);
      if (!repair) return { doc: null, ok: false };
      try {
        storage.setItem(`${key}:corrupt:${now()}`, text2);
        storage.removeItem(key);
      } catch {
        return { doc: null, ok: false };
      }
      return { doc: emptyState(), ok: true, repaired: true };
    }
    const initial = read({ repair: true });
    let state = initial.ok ? initial.doc : emptyState();
    function emit() {
      for (const fn of [...subs]) {
        try {
          fn(state);
        } catch (e) {
          warnOnce("store-subscriber", e);
        }
      }
    }
    function update(mutate) {
      const r = read({ repair: true });
      const draft = r.ok && saved && !r.repaired ? r.doc : JSON.parse(JSON.stringify(state));
      const result = mutate(draft);
      state = draft;
      if (r.ok) {
        try {
          storage.setItem(key, JSON.stringify(state));
          saved = true;
        } catch (e) {
          saved = false;
          warnOnce("store-write", e);
        }
      }
      emit();
      return result;
    }
    function onStorage(e) {
      if (e.key !== key && e.key !== null) return;
      const r = read({ repair: false });
      if (r.ok) {
        state = r.doc;
        saved = true;
        emit();
      }
    }
    win.addEventListener("storage", onStorage);
    return {
      key,
      // The returned state is read-only; change it only via update().
      get: () => state,
      update,
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      destroy() {
        win.removeEventListener("storage", onStorage);
        subs.clear();
      }
    };
  }
  function createDocStore({ key, empty, normalize, storage = window.localStorage, win = window, now = () => Date.now() }) {
    const subs = /* @__PURE__ */ new Set();
    let saved = true;
    function read({ repair } = {}) {
      let text2 = null;
      try {
        text2 = storage.getItem(key);
      } catch (e) {
        warnOnce(`docstore-read:${key}`, e);
        return { doc: null, ok: false };
      }
      if (!text2) return { doc: empty(), ok: true };
      try {
        const parsed = JSON.parse(text2);
        if (parsed && typeof parsed === "object" && typeof parsed.v === "number" && parsed.v > 1) {
          warnOnce(`docstore-newer:${key}`, parsed.v);
          return { doc: null, ok: false };
        }
        return { doc: normalize(parsed), ok: true };
      } catch (e) {
        warnOnce(`docstore-corrupt:${key}`, e);
        if (!repair) return { doc: null, ok: false };
        try {
          storage.setItem(`${key}:corrupt:${now()}`, text2);
          storage.removeItem(key);
        } catch {
          return { doc: null, ok: false };
        }
        return { doc: empty(), ok: true, repaired: true };
      }
    }
    const initial = read({ repair: true });
    let doc = initial.ok ? initial.doc : empty();
    function emit() {
      for (const fn of [...subs]) {
        try {
          fn(doc);
        } catch (e) {
          warnOnce(`docstore-subscriber:${key}`, e);
        }
      }
    }
    function update(mutate) {
      const r = read({ repair: true });
      const draft = r.ok && saved && !r.repaired ? r.doc : JSON.parse(JSON.stringify(doc));
      const result = mutate(draft);
      doc = normalize(draft);
      if (r.ok) {
        try {
          storage.setItem(key, JSON.stringify(doc));
          saved = true;
        } catch (e) {
          saved = false;
          warnOnce(`docstore-write:${key}`, e);
        }
      }
      emit();
      return result;
    }
    function onStorage(e) {
      if (e.key !== key && e.key !== null) return;
      const r = read({ repair: false });
      if (!r.ok) return;
      doc = r.doc;
      saved = true;
      emit();
    }
    win.addEventListener("storage", onStorage);
    return {
      key,
      get: () => doc,
      update,
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      destroy() {
        win.removeEventListener("storage", onStorage);
        subs.clear();
      }
    };
  }
  function createSettingsStore({ playerId, ...opts }) {
    return createDocStore({ key: settingsKey(playerId), empty: defaultSettings, normalize: normalizeSettings, ...opts });
  }
  function createEnemiesStore({ playerId, ...opts }) {
    return createDocStore({ key: enemiesKey(playerId), empty: emptyEnemies, normalize: normalizeEnemies, ...opts });
  }

  // src/notify.js
  function createNotifier({ win = window, onOpen = () => {
  } } = {}) {
    const N = win.Notification;
    const supported = typeof N === "function";
    return {
      supported,
      permission: () => supported ? N.permission : "unsupported",
      async request() {
        if (!supported) return "unsupported";
        if (N.permission !== "default") return N.permission;
        try {
          const answer = await N.requestPermission();
          return answer || N.permission;
        } catch {
          return N.permission;
        }
      },
      // One notification per player (the tag), so a newer message replaces the older one, and a second game
      // tab's copy replaces the first. Returns the notification, or null when it can't be shown.
      show({ id, title, body, icon: icon2 }) {
        if (!supported || N.permission !== "granted") return null;
        let n;
        try {
          n = new N(title, { body, icon: icon2, tag: `zcf-dm-${id}` });
        } catch {
          return null;
        }
        n.onclick = () => {
          try {
            win.focus();
          } catch {
          }
          if (id > 0) onOpen(id);
          n.close();
        };
        return n;
      },
      // Shown once when they're switched on. Some browsers (Chrome on Android) grant permission but refuse
      // page notifications, so this is also the check that they can appear at all.
      confirm() {
        return !!this.show({
          id: 0,
          title: "Zed City Friends",
          body: "Desktop notifications are on. New private messages show up here while the game isn't in focus."
        });
      }
    };
  }

  // src/tab-focus.js
  var FRESH_MS = 3e4;
  function createTabFocus({ storage, key, doc, win, now = () => Date.now(), id = Math.random().toString(36).slice(2) }) {
    const focused = () => typeof doc.hasFocus === "function" && doc.hasFocus();
    function read() {
      try {
        const v = JSON.parse(storage.getItem(key));
        return v && typeof v === "object" && typeof v.tab === "string" && typeof v.at === "number" ? v : null;
      } catch {
        return null;
      }
    }
    function beat() {
      if (!focused()) return;
      try {
        storage.setItem(key, JSON.stringify({ tab: id, at: now() }));
      } catch {
      }
    }
    function release() {
      const v = read();
      if (!v || v.tab !== id) return;
      try {
        storage.removeItem(key);
      } catch {
      }
    }
    win.addEventListener("focus", beat);
    win.addEventListener("blur", release);
    beat();
    return {
      beat,
      focused,
      // Another open game tab had focus within the last FRESH_MS.
      elsewhere() {
        if (focused()) return false;
        const v = read();
        return !!(v && v.tab !== id && now() - v.at < FRESH_MS);
      },
      destroy() {
        win.removeEventListener("focus", beat);
        win.removeEventListener("blur", release);
        release();
      }
    };
  }

  // src/sound.js
  var TONES = {
    chirp: [{ f: 1800, to: 2700, at: 0, dur: 0.07 }, { f: 2200, to: 3100, at: 0.09, dur: 0.07 }],
    ping: [{ f: 1320, at: 0, dur: 0.28 }],
    bell: [{ f: 880, at: 0, dur: 0.7 }, { f: 1760, at: 0, dur: 0.45, gain: 0.08 }]
  };
  function createSound({ win = window } = {}) {
    let ctx = null;
    function context() {
      if (!ctx) {
        const AC = win.AudioContext || win.webkitAudioContext;
        if (!AC) return null;
        try {
          ctx = new AC();
        } catch {
          return null;
        }
      }
      if (ctx.state === "suspended" && typeof ctx.resume === "function") ctx.resume().catch(() => {
      });
      return ctx;
    }
    function play(name, { fromUser = false } = {}) {
      const tones = TONES[name];
      if (!tones) return false;
      const ac = context();
      if (!ac) return false;
      if (ac.state === "running") {
        schedule(ac, tones);
        return true;
      }
      if (!fromUser || typeof ac.resume !== "function") return false;
      ac.resume().then(() => schedule(ac, tones), () => {
      });
      return true;
    }
    function schedule(ac, tones) {
      const t0 = ac.currentTime;
      for (const tone of tones) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const start = t0 + tone.at;
        const end = start + tone.dur;
        osc.type = "sine";
        osc.frequency.setValueAtTime(tone.f, start);
        if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
        gain.gain.setValueAtTime(1e-4, start);
        gain.gain.exponentialRampToValueAtTime(tone.gain || 0.18, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(1e-4, end);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(start);
        osc.stop(end + 0.02);
      }
    }
    return {
      play,
      unlock() {
        context();
      }
    };
  }

  // src/mark-read.js
  var MARK_ALL_MAX = 20;
  async function markAllRead({ ids, api, markSeen: markSeen2, onProgress = () => {
  }, toast, max = MARK_ALL_MAX }) {
    const todo = ids.slice(0, max);
    let marked = 0;
    onProgress(0, todo.length);
    for (let i = 0; i < todo.length; i += 1) {
      const r = await api.getChatMessages(todo[i], 1, 10);
      if (!r.ok && (r.kind === "auth" || r.kind === "busy")) {
        toast(r.kind === "auth" ? "Log in again to mark chats as read." : "Mail is unavailable right now. Try again later.", { error: true });
        return marked;
      }
      if (r.ok) {
        markSeen2(todo[i]);
        marked += 1;
      }
      onProgress(i + 1, todo.length);
    }
    toast(`Marked ${marked} chat${marked === 1 ? "" : "s"} as read`);
    return marked;
  }

  // src/router.js
  var PATCHED = /* @__PURE__ */ Symbol.for("zcf.historyPatched");
  function createRouter({ win = window, doc = document } = {}) {
    const subs = /* @__PURE__ */ new Set();
    let last = win.location.pathname;
    function check() {
      const path = win.location.pathname;
      if (path === last) return;
      last = path;
      for (const fn of [...subs]) safe("router-subscriber", fn)(path);
    }
    const history = win.history;
    if (!history[PATCHED]) {
      for (const method of ["pushState", "replaceState"]) {
        try {
          const original = history[method];
          history[method] = function patchedHistoryMethod(...args) {
            const result = original.apply(this, args);
            try {
              win.dispatchEvent(new Event("zcf:locationchange"));
            } catch (e) {
              warnOnce("router-dispatch", e);
            }
            return result;
          };
        } catch (e) {
          warnOnce("history-patch", e);
        }
      }
      try {
        history[PATCHED] = true;
      } catch (e) {
        warnOnce("history-patch", e);
      }
    }
    const onLocationChange = () => queueMicrotask(check);
    win.addEventListener("zcf:locationchange", onLocationChange);
    win.addEventListener("popstate", check);
    function navigate(path) {
      if (typeof path !== "string" || !/^\/(?![/\\])[^\t\n\r]*$/.test(path)) {
        warnOnce("navigate-bad-path", path);
        return;
      }
      try {
        const app = doc.querySelector("#q-app");
        const router = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$router;
        if (router && typeof router.push === "function") {
          const result = router.push(path);
          if (result && typeof result.then === "function") {
            result.then(void 0, (e) => {
              warnOnce("navigate", e);
              if (win.location.pathname !== path.split(/[?#]/)[0]) win.location.assign(path);
            });
          }
          return;
        }
      } catch {
      }
      win.location.assign(path);
    }
    return {
      get path() {
        return win.location.pathname;
      },
      onChange(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      navigate,
      destroy() {
        win.removeEventListener("zcf:locationchange", onLocationChange);
        win.removeEventListener("popstate", check);
        subs.clear();
      }
    };
  }

  // src/players.js
  function createPlayers({ api, ttlMs = 6e4, now = () => Date.now() }) {
    const profiles = /* @__PURE__ */ new Map();
    async function search(q) {
      const r = await api.findPlayer(q);
      if (!r.ok) return r;
      const data = asArray(r.data).map((p) => ({
        id: toId(p && p.id),
        username: p && typeof p.username === "string" ? p.username : "",
        avatar: p && typeof p.avatar === "string" ? p.avatar : null
      })).filter((p) => p.id && p.username);
      return { ok: true, data };
    }
    async function resolveExact(name) {
      const wanted = String(name || "").trim().toLowerCase();
      if (!wanted) return null;
      const r = await search(wanted);
      if (!r.ok) return null;
      return r.data.find((p) => p.username.toLowerCase() === wanted) || null;
    }
    async function get(id) {
      const hit = profiles.get(id);
      if (hit && now() - hit.at < ttlMs) return { ok: true, data: hit.data };
      const r = await api.getProfile(id);
      if (r.ok) profiles.set(id, { at: now(), data: r.data });
      return r;
    }
    return { search, resolveExact, get };
  }

  // src/time.js
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  var DAY_MS = 864e5;
  var pad = (n) => String(n).padStart(2, "0");
  function parseSentAt(value) {
    if (value === null || value === void 0 || value === "") return null;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return null;
      return value < 1e12 ? value * 1e3 : value;
    }
    let s = String(value).trim();
    if (/^\d+$/.test(s)) return parseSentAt(Number(s));
    if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += "Z";
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  function pastTime(value, now) {
    if (value === null || value === void 0 || value === "") return null;
    const n = Number(value);
    if (Number.isFinite(n)) {
      if (n < 0) return null;
      if (n < 1e9) return now - n * 1e3;
    }
    return parseSentAt(value);
  }
  function parts(ts, local) {
    const d = new Date(ts);
    return local ? [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()] : [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
  }
  function dayKey(ts, local = false) {
    const [y, m, d] = parts(ts, local);
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }
  function formatClock(ts, local = false) {
    const [, , , h2, mi] = parts(ts, local);
    return `${pad(h2)}:${pad(mi)}`;
  }
  function yesterdayKey(now, local) {
    if (!local) return dayKey(now - DAY_MS, false);
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return dayKey(d.getTime(), true);
  }
  function formatMessageTime(ts, now = Date.now(), local = false) {
    const clock = formatClock(ts, local);
    const day = dayKey(ts, local);
    if (day === dayKey(now, local)) return clock;
    if (day === yesterdayKey(now, local)) return `Yesterday at ${clock}`;
    const [y, m, d] = parts(ts, local);
    return `${pad(d)}/${pad(m + 1)}/${y} at ${clock}`;
  }
  function formatDayLabel(ts, local = false) {
    const [y, m, d] = parts(ts, local);
    return `${MONTHS[m]} ${d}, ${y}`;
  }
  function timeAgo(ts, now = Date.now()) {
    const s = Math.max(0, Math.floor((now - ts) / 1e3));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h2 = Math.floor(m / 60);
    if (h2 < 24) return `${h2}h ago`;
    return `${Math.floor(h2 / 24)}d ago`;
  }
  function statusText(info2, now = Date.now()) {
    if (!info2) return "";
    if (info2.online) return "Online";
    if (info2.active) return `Active ${timeAgo(info2.active, now)}`;
    return "Offline";
  }
  function longAgo(ts, now = Date.now()) {
    const s = Math.max(0, Math.floor((now - ts) / 1e3));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h2 = Math.floor(m / 60);
    if (h2 < 24) return `${h2} hr ago`;
    const d = Math.floor(h2 / 24);
    const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
    if (d < 30) return unit(d, "day");
    if (d < 365) return unit(Math.floor(d / 30), "month");
    return unit(Math.floor(d / 365), "year");
  }
  function longStatusText(info2, now = Date.now()) {
    if (!info2) return "";
    if (info2.online) return "Online";
    if (info2.active) return `Active ${longAgo(info2.active, now)}`;
    return "Offline";
  }

  // src/presence.js
  var lastActive = pastTime;
  function profileDetails(data) {
    const level = Number(data.rank ?? data.level);
    const f = data.faction && typeof data.faction === "object" ? data.faction : null;
    const factionId = f ? toId(f.id) : null;
    return {
      level: Number.isFinite(level) && level > 0 ? level : null,
      faction: factionId ? { id: factionId, name: typeof f.name === "string" ? f.name : "" } : null,
      injured: !!data.is_injured,
      traveling: !!data.traveling
    };
  }
  function createPresence({
    fetchProfile,
    onProfile,
    staleMs = 6e4,
    profileStaleMs = 3e5,
    concurrency = 2,
    gapMs = 250,
    pauseMs = 3e5,
    now = () => Date.now()
  }) {
    const cache = /* @__PURE__ */ new Map();
    const failedAt = /* @__PURE__ */ new Map();
    const queue = [];
    const queued = /* @__PURE__ */ new Set();
    const subs = /* @__PURE__ */ new Set();
    let inFlight = 0;
    let pausedUntil = 0;
    function emit(id) {
      for (const fn of [...subs]) {
        try {
          fn(id);
        } catch (e) {
          warnOnce("presence-subscriber", e);
        }
      }
    }
    function store(id, info2, at, profile) {
      if (!info2 || typeof info2 !== "object") return;
      const prev = cache.get(id);
      cache.set(id, {
        online: !!info2.online,
        active: lastActive(info2.active, now()),
        fetchedAt: at,
        profile: profile || prev && prev.profile || null,
        // When level, faction and the icons were last fetched. A getChatInfo set() refreshes the online
        // status only, so fetchedAt alone can't tell whether these have gone stale (spec §D.3 #4).
        profileAt: profile ? at : prev && prev.profileAt || 0
      });
      emit(id);
    }
    function set(id, info2) {
      store(id, info2, now());
    }
    function isStale(id, maxAgeMs = staleMs) {
      if (failedAt.has(id) && now() - failedAt.get(id) < maxAgeMs) return false;
      const c = cache.get(id);
      if (!c || !c.profile) return true;
      return now() - c.fetchedAt >= maxAgeMs || now() - c.profileAt >= Math.max(maxAgeMs, profileStaleMs);
    }
    function lastTried(id) {
      const c = cache.get(id);
      return Math.max(c ? c.profileAt : 0, failedAt.get(id) || 0);
    }
    function pause() {
      pausedUntil = now() + pauseMs;
      for (const { id } of queue.splice(0)) queued.delete(id);
    }
    function pump() {
      while (inFlight < concurrency && queue.length) {
        const { id, queuedAt } = queue.shift();
        if (!isStale(id)) {
          queued.delete(id);
          continue;
        }
        inFlight += 1;
        Promise.resolve().then(() => fetchProfile(id)).then((r) => {
          if (r && r.ok && r.data) {
            failedAt.delete(id);
            store(id, r.data, queuedAt, profileDetails(r.data));
            if (onProfile) onProfile(id, r.data);
            return;
          }
          if (r && !r.ok && (r.kind === "rate" || r.kind === "auth")) pause();
          else failedAt.set(id, queuedAt);
        }).catch((e) => {
          failedAt.set(id, queuedAt);
          warnOnce("presence-fetch", e);
        }).finally(() => {
          queued.delete(id);
          setTimeout(() => {
            inFlight -= 1;
            pump();
          }, gapMs);
        });
      }
    }
    function refresh(ids) {
      if (now() < pausedUntil) return;
      const queuedAt = now();
      for (const id of ids) {
        if (!queued.has(id) && isStale(id)) {
          queued.add(id);
          queue.push({ id, queuedAt });
        }
      }
      pump();
    }
    return {
      get: (id) => cache.get(id) || null,
      set,
      refresh,
      isStale,
      lastTried,
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      }
    };
  }

  // src/emoji-data.js
  var EMOJI_GROUPS = {
    "misc": `🇦	regional_indicator_a
🇧	regional_indicator_b
🇨	regional_indicator_c
🇩	regional_indicator_d
🇪	regional_indicator_e
🇫	regional_indicator_f
🇬	regional_indicator_g
🇭	regional_indicator_h
🇮	regional_indicator_i
🇯	regional_indicator_j
🇰	regional_indicator_k
🇱	regional_indicator_l
🇲	regional_indicator_m
🇳	regional_indicator_n
🇴	regional_indicator_o
🇵	regional_indicator_p
🇶	regional_indicator_q
🇷	regional_indicator_r
🇸	regional_indicator_s
🇹	regional_indicator_t
🇺	regional_indicator_u
🇻	regional_indicator_v
🇼	regional_indicator_w
🇽	regional_indicator_x
🇾	regional_indicator_y
🇿	regional_indicator_z
😀	grinning	grinning_face
😃	smiley	grinning_face_with_big_eyes
😄	smile	grinning_face_with_closed_eyes
😁	grin	beaming_face
😆	laughing	lol,satisfied,squinting_face
😅	sweat_smile	grinning_face_with_sweat
🤣	rofl
😂	joy	lmao,tears_of_joy
🙂	slightly_smiling_face
🙃	upside_down_face
🫠	melting_face	melt
😉	wink	winking_face
😊	blush	smiling_face_with_closed_eyes
😇	innocent	halo
🥰	smiling_face_with_three_hearts	smiling_face_with_3_hearts
😍	heart_eyes	smiling_face_with_heart_eyes
🤩	star_struck
😘	kissing_heart	blowing_a_kiss
😗	kissing	kissing_face
☺	relaxed	smiling_face
😚	kissing_closed_eyes	kissing_face_with_closed_eyes
😙	kissing_smiling_eyes	kissing_face_with_smiling_eyes
🥲	smiling_face_with_tear
😋	yum	savoring_food
😛	stuck_out_tongue	face_with_tongue
😜	stuck_out_tongue_winking_eye
🤪	zany_face	zany
😝	stuck_out_tongue_closed_eyes
🤑	money_mouth_face
🤗	hugs	hug,hugging,hugging_face
🤭	hand_over_mouth	face_with_hand_over_mouth
🫢	face_with_open_eyes_and_hand_over_mouth	face_with_open_eyes_hand_over_mouth,gasp
🫣	face_with_peeking_eye	peek
🤫	shushing_face	shush
🤔	thinking	thinking_face,wtf
🫡	saluting_face	salute
🤐	zipper_mouth_face	zipper_mouth
🤨	raised_eyebrow	face_with_raised_eyebrow
😐	neutral_face	neutral
😑	expressionless	expressionless_face
😶	no_mouth
🫥	dotted_line_face
😶‍🌫	face_in_clouds	in_clouds
😏	smirk	smirking,smirking_face
😒	unamused	unamused_face
🙄	roll_eyes	rolling_eyes
😬	grimacing	grimacing_face
😮‍💨	face_exhaling	exhale,exhaling
🤥	lying_face	lying
🫨	shaking_face	shaking
🙂‍↔	head_shaking_horizontally
🙂‍↕	head_shaking_vertically
😌	relieved	relieved_face
😔	pensive	pensive_face
😪	sleepy	sleepy_face
🤤	drooling_face	drooling
😴	sleeping	sleeping_face
🫩	face_with_eye_bags
😷	mask	medical_mask
🤒	face_with_thermometer
🤕	face_with_head_bandage
🤢	nauseated_face	nauseated
🤮	vomiting_face	face_vomiting,vomiting
🤧	sneezing_face	sneezing
🥵	hot_face	hot
🥶	cold_face	cold
🥴	woozy_face	woozy
😵	dizzy_face	knocked_out
😵‍💫	face_with_spiral_eyes	dizzy_eyes
🤯	exploding_head
🤠	cowboy_hat_face	cowboy,cowboy_face
🥳	partying_face	hooray,partying
🥸	disguised_face	disguised
😎	sunglasses	smiling_face_with_sunglasses,sunglasses_cool,too_cool
🤓	nerd_face	nerd
🧐	monocle_face	face_with_monocle
😕	confused	confused_face
🫤	face_with_diagonal_mouth
😟	worried	worried_face
🙁	slightly_frowning_face
☹	frowning_face	white_frowning_face
😮	open_mouth	face_with_open_mouth
😯	hushed	hushed_face
😲	astonished	astonished_face
😳	flushed	flushed_face
🫪	distorted_face
🥺	pleading_face	pleading
🥹	face_holding_back_tears	watery_eyes
😦	frowning	frowning_face
😧	anguished	anguished_face
😨	fearful	fearful_face
😰	cold_sweat	anxious,anxious_face
😥	disappointed_relieved	sad_relieved_face
😢	cry	crying_face
😭	sob	loudly_crying_face
😱	scream	screaming_in_fear
😖	confounded	confounded_face
😣	persevere	persevering_face
😞	disappointed	disappointed_face
😓	sweat	downcast_face
😩	weary	weary_face
😫	tired_face	tired
🥱	yawning_face	yawn,yawning
😤	triumph	nose_steam
😡	pout	pouting_face,rage
😠	angry	angry_face
🤬	cursing_face	censored,face_with_symbols_on_mouth
😈	smiling_imp
👿	imp	angry_imp
💀	skull
☠	skull_and_crossbones
💩	hankey	poop,shit
🤡	clown_face	clown
👹	japanese_ogre	ogre
👺	japanese_goblin	goblin
👻	ghost
👽	alien
👾	space_invader	alien_monster
🤖	robot	robot_face
😺	smiley_cat	grinning_cat
😸	smile_cat	grinning_cat_with_closed_eyes
😹	joy_cat	tears_of_joy_cat
😻	heart_eyes_cat	smiling_cat_with_heart_eyes
😼	smirk_cat	wry_smile_cat
😽	kissing_cat
🙀	scream_cat	weary_cat
😿	crying_cat_face	crying_cat
😾	pouting_cat
🙈	see_no_evil
🙉	hear_no_evil
🙊	speak_no_evil
💌	love_letter
💘	cupid	heart_with_arrow
💝	gift_heart	heart_with_ribbon
💖	sparkling_heart
💗	heartpulse	growing_heart
💓	heartbeat	beating_heart
💞	revolving_hearts
💕	two_hearts
💟	heart_decoration
❣	heavy_heart_exclamation	heart_exclamation
💔	broken_heart
❤‍🔥	heart_on_fire
❤‍🩹	mending_heart
❤	heart	red_heart
🩷	pink_heart
🧡	orange_heart
💛	yellow_heart
💚	green_heart
💙	blue_heart
🩵	light_blue_heart
💜	purple_heart
🤎	brown_heart
🖤	black_heart
🩶	grey_heart	gray_heart
🤍	white_heart
💋	kiss
💯	100
💢	anger
🫯	fight_cloud
💥	boom	collision
💫	dizzy
💦	sweat_drops
💨	dash	dashing_away
🕳	hole
💬	speech_balloon
👁‍🗨️	eye_speech_bubble	eye_in_speech_bubble
🗨	left_speech_bubble
🗯	right_anger_bubble
💭	thought_balloon
💤	zzz
🏻	tone1	tone_light
🏼	tone2	tone_medium_light
🏽	tone3	tone_medium
🏾	tone4	tone_medium_dark
🏿	tone5	tone_dark
🦰	red_hair
🦱	curly_hair
🦳	white_hair
🦲	no_hair`,
    "people & body": `👋	wave	waving_hand
🤚	raised_back_of_hand
🖐	raised_hand_with_fingers_splayed
✋	hand	high_five,raised_hand
🖖	vulcan_salute	vulcan
🫱	rightwards_hand
🫲	leftwards_hand
🫳	palm_down_hand	palm_down
🫴	palm_up_hand	palm_up
🫷	leftwards_pushing_hand
🫸	rightwards_pushing_hand
👌	ok_hand
🤌	pinched_fingers	pinch
🤏	pinching_hand
✌	v	victory
🤞	crossed_fingers	fingers_crossed
🫰	hand_with_index_finger_and_thumb_crossed
🤟	love_you_gesture
🤘	metal	sign_of_the_horns
🤙	call_me_hand
👈	point_left
👉	point_right
👆	point_up_2	point_up
🖕	fu	middle_finger
👇	point_down
☝	point_up	point_up_2
🫵	index_pointing_at_the_viewer	point_forward
👍	+1	thumbsup,yes
👎	-1	no,thumbsdown
✊	fist
👊	facepunch	punch
🤛	fist_left	left_facing_fist
🤜	fist_right	right_facing_fist
👏	clap	clapping_hands
🙌	raised_hands
🫶	heart_hands
👐	open_hands
🤲	palms_up_together
🤝	handshake
🙏	pray	folded_hands
✍	writing_hand
💅	nail_care	nail_polish
🤳	selfie
💪	muscle	right_bicep
🦾	mechanical_arm
🦿	mechanical_leg
🦵	leg
🦶	foot
👂	ear
🦻	ear_with_hearing_aid	hearing_aid
👃	nose
🧠	brain
🫀	anatomical_heart
🫁	lungs
🦷	tooth
🦴	bone
👀	eyes
👁	eye
👅	tongue
👄	lips	mouth
🫦	biting_lip
👶	baby
🧒	child
👦	boy
👧	girl
🧑	adult
👱	blond_haired_person	blond_haired
👨	man
🧔	bearded_person	person_bearded
🧔‍♂	man_beard	man_bearded
🧔‍♀	woman_beard	woman_bearded
👨‍🦰	red_haired_man	man_red_haired
👨‍🦱	curly_haired_man	man_curly_haired
👨‍🦳	white_haired_man	man_white_haired
👨‍🦲	bald_man	man_bald
👩	woman
👩‍🦰	red_haired_woman	woman_red_haired
🧑‍🦰	person_red_hair	red_haired
👩‍🦱	curly_haired_woman	woman_curly_haired
🧑‍🦱	person_curly_hair	curly_haired
👩‍🦳	white_haired_woman	woman_white_haired
🧑‍🦳	person_white_hair	white_haired
👩‍🦲	bald_woman	woman_bald
🧑‍🦲	person_bald	bald
👱‍♀	blond_haired_woman	woman_blond_haired
👱‍♂	blond_haired_man	man_blond_haired
🧓	older_adult
👴	older_man
👵	older_woman
🙍	frowning_person	person_frowning
🙍‍♂	frowning_man	man_frowning
🙍‍♀	frowning_woman	woman_frowning
🙎	pouting_face	person_pouting,pouting
🙎‍♂	pouting_man	man_pouting
🙎‍♀	pouting_woman	woman_pouting
🙅	no_good	person_gesturing_no
🙅‍♂	ng_man	man_gesturing_no
🙅‍♀	ng_woman	woman_gesturing_no
🙆	ok_person	all_good,person_gesturing_ok
🙆‍♂	ok_man	man_gesturing_ok
🙆‍♀	ok_woman	woman_gesturing_ok
💁	information_desk_person	person_tipping_hand
💁‍♂	sassy_man	man_tipping_hand
💁‍♀	sassy_woman	woman_tipping_hand
🙋	raising_hand	person_raising_hand
🙋‍♂	raising_hand_man	man_raising_hand
🙋‍♀	raising_hand_woman	woman_raising_hand
🧏	deaf_person
🧏‍♂	deaf_man
🧏‍♀	deaf_woman
🙇	bow	person_bowing
🙇‍♂	bowing_man	man_bowing
🙇‍♀	bowing_woman	woman_bowing
🤦	facepalm	person_facepalming
🤦‍♂	man_facepalming
🤦‍♀	woman_facepalming
🤷	shrug	person_shrugging
🤷‍♂	man_shrugging
🤷‍♀	woman_shrugging
🧑‍⚕	health_worker
👨‍⚕	man_health_worker
👩‍⚕	woman_health_worker
🧑‍🎓	student
👨‍🎓	man_student
👩‍🎓	woman_student
🧑‍🏫	teacher
👨‍🏫	man_teacher
👩‍🏫	woman_teacher
🧑‍⚖	judge
👨‍⚖	man_judge
👩‍⚖	woman_judge
🧑‍🌾	farmer
👨‍🌾	man_farmer
👩‍🌾	woman_farmer
🧑‍🍳	cook
👨‍🍳	man_cook
👩‍🍳	woman_cook
🧑‍🔧	mechanic
👨‍🔧	man_mechanic
👩‍🔧	woman_mechanic
🧑‍🏭	factory_worker
👨‍🏭	man_factory_worker
👩‍🏭	woman_factory_worker
🧑‍💼	office_worker
👨‍💼	man_office_worker
👩‍💼	woman_office_worker
🧑‍🔬	scientist
👨‍🔬	man_scientist
👩‍🔬	woman_scientist
🧑‍💻	technologist
👨‍💻	man_technologist
👩‍💻	woman_technologist
🧑‍🎤	singer
👨‍🎤	man_singer
👩‍🎤	woman_singer
🧑‍🎨	artist
👨‍🎨	man_artist
👩‍🎨	woman_artist
🧑‍✈	pilot
👨‍✈	man_pilot
👩‍✈	woman_pilot
🧑‍🚀	astronaut
👨‍🚀	man_astronaut
👩‍🚀	woman_astronaut
🧑‍🚒	firefighter
👨‍🚒	man_firefighter
👩‍🚒	woman_firefighter
👮	cop	police_officer
👮‍♂	policeman	man_police_officer
👮‍♀	policewoman	woman_police_officer
🕵	detective
🕵‍♂️	male_detective	man_detective
🕵‍♀️	female_detective	woman_detective
💂	guard
💂‍♂	guardsman	man_guard
💂‍♀	guardswoman	woman_guard
🥷	ninja
👷	construction_worker
👷‍♂	construction_worker_man	man_construction_worker
👷‍♀	construction_worker_woman	woman_construction_worker
🫅	person_with_crown	royalty
🤴	prince
👸	princess
👳	person_with_turban	person_wearing_turban
👳‍♂	man_with_turban	man_wearing_turban
👳‍♀	woman_with_turban	woman_wearing_turban
👲	man_with_gua_pi_mao	person_with_skullcap
🧕	woman_with_headscarf
🤵	person_in_tuxedo
🤵‍♂	man_in_tuxedo
🤵‍♀	woman_in_tuxedo
👰	person_with_veil
👰‍♂	man_with_veil
👰‍♀	bride_with_veil	woman_with_veil
🤰	pregnant_woman
🫃	pregnant_man
🫄	pregnant_person
🤱	breast_feeding
👩‍🍼	woman_feeding_baby
👨‍🍼	man_feeding_baby
🧑‍🍼	person_feeding_baby
👼	angel
🎅	santa
🤶	mrs_claus
🧑‍🎄	mx_claus
🦸	superhero
🦸‍♂	superhero_man	man_superhero
🦸‍♀	superhero_woman	woman_superhero
🦹	supervillain
🦹‍♂	supervillain_man	man_supervillain
🦹‍♀	supervillain_woman	woman_supervillain
🧙	mage
🧙‍♂	mage_man	man_mage
🧙‍♀	mage_woman	woman_mage
🧚	fairy
🧚‍♂	fairy_man	man_fairy
🧚‍♀	fairy_woman	woman_fairy
🧛	vampire
🧛‍♂	vampire_man	man_vampire
🧛‍♀	vampire_woman	woman_vampire
🧜	merperson
🧜‍♂	merman
🧜‍♀	mermaid
🧝	elf
🧝‍♂	elf_man	man_elf
🧝‍♀	elf_woman	woman_elf
🧞	genie
🧞‍♂	genie_man	man_genie
🧞‍♀	genie_woman	woman_genie
🧟	zombie
🧟‍♂	zombie_man	man_zombie
🧟‍♀	zombie_woman	woman_zombie
🧌	troll
🫈	hairy_creature
💆	massage	person_getting_massage
💆‍♂	massage_man	man_getting_massage
💆‍♀	massage_woman	woman_getting_massage
💇	haircut	person_getting_haircut
💇‍♂	haircut_man	man_getting_haircut
💇‍♀	haircut_woman	woman_getting_haircut
🚶	walking	person_walking
🚶‍♂	walking_man	man_walking
🚶‍♀	walking_woman	woman_walking
🚶‍➡	person_walking_right
🚶‍♀‍➡️	woman_walking_right
🚶‍♂‍➡️	man_walking_right
🧍	standing_person	person_standing,standing
🧍‍♂	standing_man	man_standing
🧍‍♀	standing_woman	woman_standing
🧎	kneeling_person	kneeling,person_kneeling
🧎‍♂	kneeling_man	man_kneeling
🧎‍♀	kneeling_woman	woman_kneeling
🧎‍➡	person_kneeling_right
🧎‍♀‍➡️	woman_kneeling_right
🧎‍♂‍➡️	man_kneeling_right
🧑‍🦯	person_with_probing_cane	person_with_white_cane
🧑‍🦯‍➡	person_with_white_cane_right
👨‍🦯	man_with_probing_cane	man_with_white_cane
👨‍🦯‍➡	man_with_white_cane_right
👩‍🦯	woman_with_probing_cane	woman_with_white_cane
👩‍🦯‍➡	woman_with_white_cane_right
🧑‍🦼	person_in_motorized_wheelchair
🧑‍🦼‍➡	person_in_motorized_wheelchair_right
👨‍🦼	man_in_motorized_wheelchair
👨‍🦼‍➡	man_in_motorized_wheelchair_right
👩‍🦼	woman_in_motorized_wheelchair
👩‍🦼‍➡	woman_in_motorized_wheelchair_right
🧑‍🦽	person_in_manual_wheelchair
🧑‍🦽‍➡	person_in_manual_wheelchair_right
👨‍🦽	man_in_manual_wheelchair
👨‍🦽‍➡	man_in_manual_wheelchair_right
👩‍🦽	woman_in_manual_wheelchair
👩‍🦽‍➡	woman_in_manual_wheelchair_right
🏃	runner	person_running,running
🏃‍♂	running_man	man_running
🏃‍♀	running_woman	woman_running
🏃‍➡	person_running_right
🏃‍♀‍➡️	woman_running_right
🏃‍♂‍➡️	man_running_right
🧑‍🩰	ballet_dancer
💃	dancer	woman_dancing
🕺	man_dancing
🕴	business_suit_levitating	levitate,levitating,person_in_suit_levitating
👯	dancers	people_with_bunny_ears_partying
👯‍♂	dancing_men	men_with_bunny_ears_partying
👯‍♀	dancing_women	women_with_bunny_ears_partying
🧖	sauna_person	person_in_steamy_room
🧖‍♂	sauna_man	man_in_steamy_room
🧖‍♀	sauna_woman	woman_in_steamy_room
🧗	climbing	person_climbing
🧗‍♂	climbing_man	man_climbing
🧗‍♀	climbing_woman	woman_climbing
🤺	person_fencing	fencer,fencing
🏇	horse_racing
⛷	skier	person_skiing,skiing
🏂	snowboarder	person_snowboarding,snowboarding
🏌	golfing	golfer,person_golfing
🏌‍♂️	golfing_man	man_golfing
🏌‍♀️	golfing_woman	woman_golfing
🏄	surfer	person_surfing,surfing
🏄‍♂	surfing_man	man_surfing
🏄‍♀	surfing_woman	woman_surfing
🚣	rowboat	person_rowing_boat
🚣‍♂	rowing_man	man_rowing_boat
🚣‍♀	rowing_woman	woman_rowing_boat
🏊	swimmer	person_swimming,swimming
🏊‍♂	swimming_man	man_swimming
🏊‍♀	swimming_woman	woman_swimming
⛹	bouncing_ball_person	person_bouncing_ball
⛹‍♂️	basketball_man	man_bouncing_ball
⛹‍♀️	basketball_woman	woman_bouncing_ball
🏋	weight_lifting	person_lifting_weights,weight_lifter
🏋‍♂️	weight_lifting_man	man_lifting_weights
🏋‍♀️	weight_lifting_woman	woman_lifting_weights
🚴	bicyclist	biking,person_biking
🚴‍♂	biking_man	man_biking
🚴‍♀	biking_woman	woman_biking
🚵	mountain_bicyclist	mountain_biking,person_mountain_biking
🚵‍♂	mountain_biking_man	man_mountain_biking
🚵‍♀	mountain_biking_woman	woman_mountain_biking
🤸	cartwheeling	person_cartwheel
🤸‍♂	man_cartwheeling
🤸‍♀	woman_cartwheeling
🤼	wrestling	people_wrestling,wrestlers
🤼‍♂	men_wrestling
🤼‍♀	women_wrestling
🤽	water_polo	person_playing_water_polo
🤽‍♂	man_playing_water_polo
🤽‍♀	woman_playing_water_polo
🤾	handball_person	handball,person_playing_handball
🤾‍♂	man_playing_handball
🤾‍♀	woman_playing_handball
🤹	juggling_person	juggler,juggling,person_juggling
🤹‍♂	man_juggling
🤹‍♀	woman_juggling
🧘	lotus_position	person_in_lotus_position
🧘‍♂	lotus_position_man	man_in_lotus_position
🧘‍♀	lotus_position_woman	woman_in_lotus_position
🛀	bath	person_taking_bath
🛌	sleeping_bed	person_in_bed,sleeping_accommodation
🧑‍🤝‍🧑	people_holding_hands
👭	two_women_holding_hands
👫	couple
👬	two_men_holding_hands
💏	couplekiss	couple_kiss
👩‍❤‍💋‍👨	couplekiss_man_woman	kiss_mw,kiss_wm
👨‍❤‍💋‍👨	couplekiss_man_man	kiss_mm
👩‍❤‍💋‍👩	couplekiss_woman_woman	kiss_ww
💑	couple_with_heart
👩‍❤‍👨	couple_with_heart_woman_man	couple_with_heart_mw,couple_with_heart_wm
👨‍❤‍👨	couple_with_heart_man_man	couple_with_heart_mm
👩‍❤‍👩	couple_with_heart_woman_woman	couple_with_heart_ww
👨‍👩‍👦	family_man_woman_boy	family_mwb
👨‍👩‍👧	family_man_woman_girl	family_mwg
👨‍👩‍👧‍👦	family_man_woman_girl_boy	family_mwgb
👨‍👩‍👦‍👦	family_man_woman_boy_boy	family_mwbb
👨‍👩‍👧‍👧	family_man_woman_girl_girl	family_mwgg
👨‍👨‍👦	family_man_man_boy	family_mmb
👨‍👨‍👧	family_man_man_girl	family_mmg
👨‍👨‍👧‍👦	family_man_man_girl_boy	family_mmgb
👨‍👨‍👦‍👦	family_man_man_boy_boy	family_mmbb
👨‍👨‍👧‍👧	family_man_man_girl_girl	family_mmgg
👩‍👩‍👦	family_woman_woman_boy	family_wwb
👩‍👩‍👧	family_woman_woman_girl	family_wwg
👩‍👩‍👧‍👦	family_woman_woman_girl_boy	family_wwgb
👩‍👩‍👦‍👦	family_woman_woman_boy_boy	family_wwbb
👩‍👩‍👧‍👧	family_woman_woman_girl_girl	family_wwgg
👨‍👦	family_man_boy	family_mb
👨‍👦‍👦	family_man_boy_boy	family_mbb
👨‍👧	family_man_girl	family_mg
👨‍👧‍👦	family_man_girl_boy	family_mgb
👨‍👧‍👧	family_man_girl_girl	family_mgg
👩‍👦	family_woman_boy	family_wb
👩‍👦‍👦	family_woman_boy_boy	family_wbb
👩‍👧	family_woman_girl	family_wg
👩‍👧‍👦	family_woman_girl_boy	family_wgb
👩‍👧‍👧	family_woman_girl_girl	family_wgg
🗣	speaking_head
👤	bust_in_silhouette
👥	busts_in_silhouette
🫂	people_hugging
👪	family
🧑‍🧑‍🧒	family_aac
🧑‍🧑‍🧒‍🧒	family_aacc
🧑‍🧒	family_aa	family_ac
🧑‍🧒‍🧒	family_acc
👣	footprints
🫆	fingerprint`,
    "animals & nature": `🐵	monkey_face
🐒	monkey
🦍	gorilla
🦧	orangutan
🐶	dog	dog_face
🐕	dog2	dog
🦮	guide_dog
🐕‍🦺	service_dog
🐩	poodle
🐺	wolf	wolf_face
🦊	fox_face	fox
🦝	raccoon
🐱	cat	cat_face
🐈	cat2	cat
🐈‍⬛	black_cat
🦁	lion	lion_face
🐯	tiger	tiger_face
🐅	tiger2	tiger
🐆	leopard
🐴	horse	horse_face
🫎	moose
🫏	donkey
🐎	racehorse	horse
🦄	unicorn	unicorn_face
🦓	zebra
🦌	deer
🦬	bison
🐮	cow	cow_face
🐂	ox
🐃	water_buffalo
🐄	cow2	cow
🐷	pig	pig_face
🐖	pig2	pig
🐗	boar
🐽	pig_nose
🐏	ram
🐑	sheep	ewe
🐐	goat
🐪	dromedary_camel
🐫	camel
🦙	llama
🦒	giraffe
🐘	elephant
🦣	mammoth
🦏	rhinoceros	rhino
🦛	hippopotamus	hippo
🐭	mouse	mouse_face
🐁	mouse2	mouse
🐀	rat
🐹	hamster	hamster_face
🐰	rabbit	rabbit_face
🐇	rabbit2	rabbit
🐿	chipmunk
🦫	beaver
🦔	hedgehog
🦇	bat
🐻	bear	bear_face
🐻‍❄	polar_bear	polar_bear_face
🐨	koala	koala_face
🐼	panda_face	panda
🦥	sloth
🦦	otter
🦨	skunk
🦘	kangaroo
🦡	badger
🐾	feet	paw_prints
🦃	turkey
🐔	chicken	chicken_face
🐓	rooster
🐣	hatching_chick
🐤	baby_chick
🐥	hatched_chick
🐦	bird	bird_face
🐧	penguin	penguin_face
🕊	dove
🦅	eagle
🦆	duck
🦢	swan
🦉	owl
🦤	dodo
🪶	feather
🦩	flamingo
🦚	peacock
🦜	parrot
🪽	wing
🐦‍⬛	black_bird
🪿	goose
🐦‍🔥	phoenix
🐸	frog	frog_face
🐊	crocodile
🐢	turtle
🦎	lizard
🐍	snake
🐲	dragon_face
🐉	dragon
🦕	sauropod
🦖	t-rex	trex
🐳	whale	spouting_whale
🐋	whale2	whale
🐬	dolphin
🫍	orca
🦭	seal
🐟	fish
🐠	tropical_fish
🐡	blowfish
🦈	shark
🐙	octopus
🐚	shell
🪸	coral
🪼	jellyfish
🦀	crab
🦞	lobster
🦐	shrimp
🦑	squid
🦪	oyster
🐌	snail
🦋	butterfly
🐛	bug
🐜	ant
🐝	bee
🪲	beetle
🐞	lady_beetle
🦗	cricket
🪳	cockroach
🕷	spider
🕸	spider_web
🦂	scorpion
🦟	mosquito
🪰	fly
🪱	worm
🦠	microbe
💐	bouquet
🌸	cherry_blossom
💮	white_flower
🪷	lotus
🏵	rosette
🌹	rose
🥀	wilted_flower
🌺	hibiscus
🌻	sunflower
🌼	blossom
🌷	tulip
🪻	hyacinth
🌱	seedling
🪴	potted_plant
🌲	evergreen_tree
🌳	deciduous_tree
🌴	palm_tree
🌵	cactus
🌾	ear_of_rice	sheaf_of_rice
🌿	herb
☘	shamrock
🍀	four_leaf_clover
🍁	maple_leaf
🍂	fallen_leaf
🍃	leaves
🪹	empty_nest	nest
🪺	nest_with_eggs
🍄	mushroom
🪾	leafless_tree`,
    "food & drink": `🍇	grapes
🍈	melon
🍉	watermelon
🍊	mandarin	orange,tangerine
🍋	lemon
🍋‍🟩	lime
🍌	banana
🍍	pineapple
🥭	mango
🍎	apple	red_apple
🍏	green_apple
🍐	pear
🍑	peach
🍒	cherries
🍓	strawberry
🫐	blueberries
🥝	kiwi_fruit	kiwi
🍅	tomato
🫒	olive
🥥	coconut
🥑	avocado
🍆	eggplant
🥔	potato
🥕	carrot
🌽	corn	ear_of_corn
🌶	hot_pepper
🫑	bell_pepper
🥒	cucumber
🥬	leafy_green
🥦	broccoli
🧄	garlic
🧅	onion
🥜	peanuts
🫘	beans
🌰	chestnut
🫚	ginger_root	ginger
🫛	pea_pod	pea
🍄‍🟫	brown_mushroom
🫜	root_vegetable
🍞	bread
🥐	croissant
🥖	baguette_bread
🫓	flatbread
🥨	pretzel
🥯	bagel
🥞	pancakes
🧇	waffle
🧀	cheese
🍖	meat_on_bone
🍗	poultry_leg
🥩	cut_of_meat
🥓	bacon
🍔	hamburger
🍟	fries	french_fries
🍕	pizza
🌭	hotdog
🥪	sandwich
🌮	taco
🌯	burrito
🫔	tamale
🥙	stuffed_flatbread
🧆	falafel
🥚	egg
🍳	fried_egg	cooking
🥘	shallow_pan_of_food
🍲	stew	pot_of_food
🫕	fondue
🥣	bowl_with_spoon
🥗	green_salad	salad
🍿	popcorn
🧈	butter
🧂	salt
🥫	canned_food
🍱	bento	bento_box
🍘	rice_cracker
🍙	rice_ball
🍚	rice	cooked_rice
🍛	curry	curry_rice
🍜	ramen	steaming_bowl
🍝	spaghetti
🍠	sweet_potato
🍢	oden
🍣	sushi
🍤	fried_shrimp
🍥	fish_cake
🥮	moon_cake
🍡	dango
🥟	dumpling
🥠	fortune_cookie
🥡	takeout_box
🍦	icecream	soft_serve
🍧	shaved_ice
🍨	ice_cream
🍩	doughnut
🍪	cookie
🎂	birthday	birthday_cake
🍰	cake	shortcake
🧁	cupcake
🥧	pie
🍫	chocolate_bar
🍬	candy
🍭	lollipop
🍮	custard
🍯	honey_pot
🍼	baby_bottle
🥛	milk_glass	glass_of_milk,milk
☕	coffee
🫖	teapot
🍵	tea
🍶	sake
🍾	champagne
🍷	wine_glass
🍸	cocktail
🍹	tropical_drink
🍺	beer
🍻	beers
🥂	clinking_glasses
🥃	tumbler_glass	whisky
🫗	pouring_liquid	pour
🥤	cup_with_straw
🧋	bubble_tea	boba_drink
🧃	beverage_box	juice_box
🧉	mate
🧊	ice_cube	ice
🥢	chopsticks
🍽	plate_with_cutlery	fork_knife_plate
🍴	fork_and_knife
🥄	spoon
🔪	hocho	knife
🫙	jar
🏺	amphora`,
    "travel & places": `🌍	earth_africa	earth_europe
🌎	earth_americas
🌏	earth_asia
🌐	globe_with_meridians
🗺	world_map
🗾	japan	japan_map
🧭	compass
🏔	mountain_snow
⛰	mountain
🛘	landslide
🌋	volcano
🗻	mount_fuji
🏕	camping
🏖	beach_umbrella	beach,beach_with_umbrella
🏜	desert
🏝	desert_island	island
🏞	national_park
🏟	stadium
🏛	classical_building
🏗	building_construction	construction_site
🧱	bricks
🪨	rock
🪵	wood
🛖	hut
🏘	houses	homes
🏚	derelict_house	house_abandoned
🏠	house
🏡	house_with_garden
🏢	office
🏣	post_office
🏤	european_post_office
🏥	hospital
🏦	bank
🏨	hotel
🏩	love_hotel
🏪	convenience_store
🏫	school
🏬	department_store
🏭	factory
🏯	japanese_castle
🏰	european_castle	castle
💒	wedding
🗼	tokyo_tower
🗽	statue_of_liberty
⛪	church
🕌	mosque
🛕	hindu_temple
🕍	synagogue
⛩	shinto_shrine
🕋	kaaba
⛲	fountain
⛺	tent
🌁	foggy
🌃	night_with_stars
🏙	cityscape
🌄	sunrise_over_mountains
🌅	sunrise
🌆	city_sunset	city_dusk
🌇	city_sunrise	city_sunset
🌉	bridge_at_night
♨	hotsprings
🎠	carousel_horse
🛝	playground_slide	slide
🎡	ferris_wheel
🎢	roller_coaster
💈	barber	barber_pole
🎪	circus_tent
🚂	steam_locomotive
🚃	railway_car
🚄	bullettrain_side
🚅	bullettrain_front
🚆	train2	train
🚇	metro
🚈	light_rail
🚉	station
🚊	tram
🚝	monorail
🚞	mountain_railway
🚋	train	tram_car
🚌	bus
🚍	oncoming_bus
🚎	trolleybus
🚐	minibus
🚑	ambulance
🚒	fire_engine
🚓	police_car
🚔	oncoming_police_car
🚕	taxi
🚖	oncoming_taxi
🚗	car	red_car
🚘	oncoming_automobile
🚙	blue_car	suv
🛻	pickup_truck
🚚	truck	delivery_truck
🚛	articulated_lorry
🚜	tractor
🏎	racing_car
🏍	motorcycle
🛵	motor_scooter
🦽	manual_wheelchair
🦼	motorized_wheelchair
🛺	auto_rickshaw
🚲	bike	bicycle
🛴	kick_scooter	scooter
🛹	skateboard
🛼	roller_skate
🚏	busstop
🛣	motorway
🛤	railway_track
🛢	oil_drum
⛽	fuelpump
🛞	wheel
🚨	rotating_light
🚥	traffic_light
🚦	vertical_traffic_light
🛑	stop_sign	octagonal_sign
🚧	construction
⚓	anchor
🛟	ring_buoy	lifebuoy
⛵	boat	sailboat
🛶	canoe
🚤	speedboat
🛳	passenger_ship	cruise_ship
⛴	ferry
🛥	motor_boat	motorboat
🚢	ship
✈	airplane
🛩	small_airplane
🛫	flight_departure	airplane_departure
🛬	flight_arrival	airplane_arriving
🪂	parachute
💺	seat
🚁	helicopter
🚟	suspension_railway
🚠	mountain_cableway
🚡	aerial_tramway
🛰	artificial_satellite	satellite
🚀	rocket
🛸	flying_saucer
🛎	bellhop_bell	bellhop
🧳	luggage
⌛	hourglass
⏳	hourglass_flowing_sand
⌚	watch
⏰	alarm_clock
⏱	stopwatch
⏲	timer_clock
🕰	mantelpiece_clock	clock
🕛	clock12
🕧	clock1230
🕐	clock1
🕜	clock130
🕑	clock2
🕝	clock230
🕒	clock3
🕞	clock330
🕓	clock4
🕟	clock430
🕔	clock5
🕠	clock530
🕕	clock6
🕡	clock630
🕖	clock7
🕢	clock730
🕗	clock8
🕣	clock830
🕘	clock9
🕤	clock930
🕙	clock10
🕥	clock1030
🕚	clock11
🕦	clock1130
🌑	new_moon
🌒	waxing_crescent_moon
🌓	first_quarter_moon
🌔	moon	waxing_gibbous_moon
🌕	full_moon
🌖	waning_gibbous_moon
🌗	last_quarter_moon
🌘	waning_crescent_moon
🌙	crescent_moon
🌚	new_moon_with_face
🌛	first_quarter_moon_with_face
🌜	last_quarter_moon_with_face
🌡	thermometer
☀	sunny	sun
🌝	full_moon_with_face
🌞	sun_with_face
🪐	ringed_planet	saturn
⭐	star
🌟	star2	glowing_star
🌠	stars	shooting_star
🌌	milky_way
☁	cloud
⛅	partly_sunny	sun_behind_cloud
⛈	cloud_with_lightning_and_rain	stormy,thunder_cloud_and_rain
🌤	sun_behind_small_cloud	sunny
🌥	sun_behind_large_cloud	cloudy
🌦	sun_behind_rain_cloud	sun_and_rain
🌧	cloud_with_rain	rainy
🌨	cloud_with_snow	snowy
🌩	cloud_with_lightning	lightning
🌪	tornado
🌫	fog
🌬	wind_face	wind_blowing_face
🌀	cyclone
🌈	rainbow
🌂	closed_umbrella
☂	open_umbrella	umbrella
☔	umbrella	umbrella_with_rain
⛱	parasol_on_ground	beach_umbrella,umbrella_on_ground
⚡	zap	high_voltage
❄	snowflake
☃	snowman_with_snow	snowman2
⛄	snowman
☄	comet
🔥	fire
💧	droplet
🌊	ocean	water_wave`,
    "activities": `🎃	jack_o_lantern
🎄	christmas_tree
🎆	fireworks
🎇	sparkler
🧨	firecracker
✨	sparkles
🎈	balloon
🎉	tada	party,party_popper
🎊	confetti_ball
🎋	tanabata_tree
🎍	bamboo
🎎	dolls
🎏	flags	carp_streamer
🎐	wind_chime
🎑	rice_scene	moon_ceremony
🧧	red_envelope
🎀	ribbon
🎁	gift
🎗	reminder_ribbon
🎟	tickets	admission_tickets
🎫	ticket
🎖	medal_military	military_medal
🏆	trophy
🏅	medal_sports	sports_medal
🥇	1st_place_medal	1st,first_place_medal
🥈	2nd_place_medal	2nd,second_place_medal
🥉	3rd_place_medal	3rd,third_place_medal
⚽	soccer
⚾	baseball
🥎	softball
🏀	basketball
🏐	volleyball
🏈	football
🏉	rugby_football
🎾	tennis
🥏	flying_disc
🎳	bowling
🏏	cricket_game
🏑	field_hockey
🏒	ice_hockey	hockey
🥍	lacrosse
🏓	ping_pong
🏸	badminton
🥊	boxing_glove
🥋	martial_arts_uniform
🥅	goal_net
⛳	golf
⛸	ice_skate
🎣	fishing_pole_and_fish	fishing_pole
🤿	diving_mask
🎽	running_shirt_with_sash	running_shirt
🎿	ski
🛷	sled
🥌	curling_stone
🎯	dart	bullseye,direct_hit
🪀	yo_yo
🪁	kite
🔫	gun	pistol
🎱	8ball	billiards
🔮	crystal_ball
🪄	magic_wand
🎮	video_game	controller
🕹	joystick
🎰	slot_machine
🎲	game_die
🧩	jigsaw	puzzle_piece
🧸	teddy_bear
🪅	pinata
🪩	mirror_ball	disco,disco_ball
🪆	nesting_dolls
♠	spades
♥	hearts
♦	diamonds
♣	clubs
♟	chess_pawn
🃏	black_joker
🀄	mahjong
🎴	flower_playing_cards
🎭	performing_arts
🖼	framed_picture	frame_with_picture
🎨	art	palette
🧵	thread
🪡	sewing_needle
🧶	yarn
🪢	knot`,
    "objects": `👓	eyeglasses	glasses
🕶	dark_sunglasses	sunglasses
🥽	goggles
🥼	lab_coat
🦺	safety_vest
👔	necktie
👕	shirt
👖	jeans
🧣	scarf
🧤	gloves
🧥	coat
🧦	socks
👗	dress
👘	kimono
🥻	sari
🩱	one_piece_swimsuit
🩲	swim_brief	briefs
🩳	shorts
👙	bikini
👚	womans_clothes
🪭	folding_hand_fan	folding_fan
👛	purse
👜	handbag
👝	pouch	clutch_bag
🛍	shopping	shopping_bags
🎒	school_satchel	backpack
🩴	thong_sandal
👞	mans_shoe
👟	athletic_shoe	sneaker
🥾	hiking_boot
🥿	flat_shoe	womans_flat_shoe
👠	high_heel
👡	sandal
🩰	ballet_shoes
👢	boot
🪮	hair_pick
👑	crown
👒	womans_hat
🎩	tophat	top_hat
🎓	mortar_board	graduation_cap
🧢	billed_cap
🪖	military_helmet
⛑	rescue_worker_helmet	helmet_with_cross
📿	prayer_beads
💄	lipstick
💍	ring
💎	gem
🔇	mute	no_sound
🔈	speaker	low_volume,quiet_sound
🔉	sound	medium_volumne
🔊	loud_sound	high_volume
📢	loudspeaker
📣	mega	megaphone
📯	postal_horn
🔔	bell
🔕	no_bell
🎼	musical_score
🎵	musical_note
🎶	notes	musical_notes
🎙	studio_microphone
🎚	level_slider
🎛	control_knobs
🎤	microphone
🎧	headphones
📻	radio
🎷	saxophone
🎺	trumpet
🪊	trombone
🪗	accordion
🎸	guitar
🎹	musical_keyboard
🎻	violin
🪕	banjo
🥁	drum
🪘	long_drum
🪇	maracas
🪈	flute
🪉	harp
📱	iphone	android,mobile_phone
📲	calling	mobile_phone_arrow
☎	phone	telephone
📞	telephone_receiver
📟	pager
📠	fax	fax_machine
🔋	battery
🪫	low_battery
🔌	electric_plug
💻	computer	laptop
🖥	desktop_computer	computer
🖨	printer
⌨	keyboard
🖱	computer_mouse
🖲	trackball
💽	minidisc	computer_disk
💾	floppy_disk
💿	cd	optical_disk
📀	dvd
🧮	abacus
🎥	movie_camera
🎞	film_strip	film_frames
📽	film_projector
🎬	clapper
📺	tv
📷	camera
📸	camera_flash	camera_with_flash
📹	video_camera
📼	vhs	videocassette
🔍	mag
🔎	mag_right
🕯	candle
💡	bulb	light_bulb
🔦	flashlight
🏮	izakaya_lantern	red_paper_lantern
🪔	diya_lamp
📔	notebook_with_decorative_cover
📕	closed_book
📖	book	open_book
📗	green_book
📘	blue_book
📙	orange_book
📚	books
📓	notebook
📒	ledger
📃	page_with_curl
📜	scroll
📄	page_facing_up
📰	newspaper
🗞	newspaper_roll	rolled_up_newspaper
📑	bookmark_tabs
🔖	bookmark
🏷	label
🪙	coin
💰	moneybag
🪎	treasure_chest
💴	yen
💵	dollar
💶	euro
💷	pound
💸	money_with_wings
💳	credit_card
🧾	receipt
💹	chart
✉	envelope
📧	e-mail	email
📨	incoming_envelope
📩	envelope_with_arrow
📤	outbox_tray
📥	inbox_tray
📦	package
📫	mailbox
📪	mailbox_closed
📬	mailbox_with_mail
📭	mailbox_with_no_mail
📮	postbox
🗳	ballot_box
✏	pencil2	pencil
✒	black_nib
🖋	fountain_pen
🖊	pen
🖌	paintbrush
🖍	crayon
📝	memo
💼	briefcase
📁	file_folder
📂	open_file_folder
🗂	card_index_dividers
📅	date
📆	calendar
🗒	spiral_notepad	notepad_spiral
🗓	spiral_calendar	calendar_spiral
📇	card_index
📈	chart_with_upwards_trend	chart_increasing
📉	chart_with_downwards_trend	chart_decreasing
📊	bar_chart
📋	clipboard
📌	pushpin
📍	round_pushpin
📎	paperclip
🖇	paperclips
📏	straight_ruler
📐	triangular_ruler
✂	scissors
🗃	card_file_box
🗄	file_cabinet
🗑	wastebasket	trashcan
🔒	lock	locked
🔓	unlock	unlocked
🔏	lock_with_ink_pen	locked_with_pen
🔐	closed_lock_with_key	locked_with_key
🔑	key
🗝	old_key
🔨	hammer
🪓	axe
⛏	pick
⚒	hammer_and_pick
🛠	hammer_and_wrench
🗡	dagger
⚔	crossed_swords
💣	bomb
🪃	boomerang
🏹	bow_and_arrow
🛡	shield
🪚	carpentry_saw
🔧	wrench
🪛	screwdriver
🔩	nut_and_bolt
⚙	gear
🗜	clamp	compression
⚖	balance_scale	scales
🦯	probing_cane	white_cane
🔗	link
⛓‍💥	broken_chain
⛓	chains
🪝	hook
🧰	toolbox
🧲	magnet
🪜	ladder
🪏	shovel
⚗	alembic
🧪	test_tube
🧫	petri_dish
🧬	dna	double_helix
🔬	microscope
🔭	telescope
📡	satellite	satellite_antenna
💉	syringe
🩸	drop_of_blood
💊	pill
🩹	adhesive_bandage	bandaid
🩼	crutch
🩺	stethoscope
🩻	x_ray	x-ray,xray
🚪	door
🛗	elevator
🪞	mirror
🪟	window
🛏	bed
🛋	couch_and_lamp
🪑	chair
🚽	toilet
🪠	plunger
🚿	shower
🛁	bathtub
🪤	mouse_trap
🪒	razor
🧴	lotion_bottle
🧷	safety_pin
🧹	broom
🧺	basket
🧻	roll_of_paper	toilet_paper
🪣	bucket
🧼	soap
🫧	bubbles
🪥	toothbrush
🧽	sponge
🧯	fire_extinguisher
🛒	shopping_cart
🚬	smoking	cigarette
⚰	coffin
🪦	headstone
⚱	funeral_urn
🧿	nazar_amulet
🪬	hamsa
🗿	moyai	moai
🪧	placard
🪪	identification_card	id_card`,
    "symbols": `🏧	atm
🚮	put_litter_in_its_place	litter_bin
🚰	potable_water
♿	wheelchair	handicapped
🚹	mens
🚺	womens
🚻	restroom	bathroom
🚼	baby_symbol
🚾	wc	water_closet
🛂	passport_control
🛃	customs
🛄	baggage_claim
🛅	left_luggage
⚠	warning
🚸	children_crossing
⛔	no_entry
🚫	no_entry_sign
🚳	no_bicycles
🚭	no_smoking
🚯	do_not_litter	no_littering
🚱	non-potable_water
🚷	no_pedestrians
📵	no_mobile_phones
🔞	underage	no_one_under_18
☢	radioactive
☣	biohazard
⬆	arrow_up
↗	arrow_upper_right
➡	arrow_right
↘	arrow_lower_right
⬇	arrow_down
↙	arrow_lower_left
⬅	arrow_left
↖	arrow_upper_left
↕	arrow_up_down
↔	left_right_arrow
↩	leftwards_arrow_with_hook	arrow_left_hook
↪	arrow_right_hook	rightwards_arrow_with_hook
⤴	arrow_heading_up
⤵	arrow_heading_down
🔃	arrows_clockwise	clockwise
🔄	arrows_counterclockwise	counterclockwise
🔙	back
🔚	end
🔛	on
🔜	soon
🔝	top
🛐	place_of_worship
⚛	atom_symbol	atom
🕉	om
✡	star_of_david
☸	wheel_of_dharma
☯	yin_yang
✝	latin_cross
☦	orthodox_cross
☪	star_and_crescent
☮	peace_symbol	peace
🕎	menorah
🔯	six_pointed_star
🪯	khanda
♈	aries
♉	taurus
♊	gemini
♋	cancer
♌	leo
♍	virgo
♎	libra
♏	scorpius
♐	sagittarius
♑	capricorn
♒	aquarius
♓	pisces
⛎	ophiuchus
🔀	twisted_rightwards_arrows	shuffle
🔁	repeat
🔂	repeat_one
▶	arrow_forward	play
⏩	fast_forward
⏭	next_track_button	next_track
⏯	play_or_pause_button	play_pause
◀	arrow_backward	reverse
⏪	rewind	fast_reverse
⏮	previous_track_button	previous_track
🔼	arrow_up_small	up
⏫	arrow_double_up	fast_up
🔽	arrow_down_small	down
⏬	arrow_double_down	fast_down
⏸	pause_button	pause
⏹	stop_button	stop
⏺	record_button	record
⏏	eject_button	eject
🎦	cinema
🔅	low_brightness	dim_button
🔆	high_brightness	bright_button
📶	signal_strength	antenna_bars
🛜	wireless
📳	vibration_mode
📴	mobile_phone_off
♀	female_sign	female
♂	male_sign	male
⚧	transgender_symbol
✖	heavy_multiplication_x	multiplication,multiply
➕	heavy_plus_sign	plus
➖	heavy_minus_sign	minus
➗	heavy_division_sign	divide,division
🟰	heavy_equals_sign
♾	infinity
‼	bangbang	double_exclamation
⁉	interrobang	exclamation_question
❓	question
❔	grey_question	white_question
❕	grey_exclamation	white_exclamation
❗	exclamation
〰	wavy_dash
💱	currency_exchange
💲	heavy_dollar_sign
⚕	medical_symbol	medical
♻	recycle	recycling_symbol
⚜	fleur_de_lis	fleur-de-lis
🔱	trident
📛	name_badge
🔰	beginner
⭕	o	hollow_red_circle,red_o
✅	white_check_mark	check_mark_button
☑	ballot_box_with_check
✔	heavy_check_mark	check_mark
❌	x	cross_mark
❎	negative_squared_cross_mark	cross_mark_button
➰	curly_loop
➿	loop	double_curly_loop
〽	part_alternation_mark
✳	eight_spoked_asterisk
✴	eight_pointed_black_star
❇	sparkle
©	copyright
®	registered
™	tm	trade_mark
🫟	splatter
#⃣	hash	number_sign
*⃣	asterisk
0⃣	zero
1⃣	one
2⃣	two
3⃣	three
4⃣	four
5⃣	five
6⃣	six
7⃣	seven
8⃣	eight
9⃣	nine
🔟	keycap_ten	ten
🔠	capital_abcd
🔡	abcd
🔢	1234
🔣	symbols
🔤	abc
🅰	a	a_blood
🆎	ab	ab_blood
🅱	b	b_blood
🆑	cl
🆒	cool
🆓	free
ℹ	information_source	info
🆔	id
Ⓜ	m
🆕	new
🆖	ng
🅾	o2	o,o_blood
🆗	ok
🅿	parking
🆘	sos
🆙	up	up2
🆚	vs
🈁	koko	ja_here
🈂	sa	ja_service_charge
🈷	u6708	ja_monthly_amount
🈶	u6709	ja_not_free_of_carge
🈯	u6307	ja_reserved
🉐	ideograph_advantage	ja_bargain
🈹	u5272	ja_discount
🈚	u7121	ja_free_of_charge
🈲	u7981	ja_prohibited
🉑	accept	ja_acceptable
🈸	u7533	ja_application
🈴	u5408	ja_passing_grade
🈳	u7a7a	ja_vacancy
㊗	congratulations	ja_congratulations
㊙	secret	ja_secret
🈺	u55b6	ja_open_for_business
🈵	u6e80	ja_no_vacancy
🔴	red_circle
🟠	orange_circle
🟡	yellow_circle
🟢	green_circle
🔵	large_blue_circle	blue_circle
🟣	purple_circle
🟤	brown_circle
⚫	black_circle
⚪	white_circle
🟥	red_square
🟧	orange_square
🟨	yellow_square
🟩	green_square
🟦	blue_square
🟪	purple_square
🟫	brown_square
⬛	black_large_square
⬜	white_large_square
◼	black_medium_square
◻	white_medium_square
◾	black_medium_small_square
◽	white_medium_small_square
▪	black_small_square
▫	white_small_square
🔶	large_orange_diamond
🔷	large_blue_diamond
🔸	small_orange_diamond
🔹	small_blue_diamond
🔺	small_red_triangle
🔻	small_red_triangle_down
💠	diamond_shape_with_a_dot_inside	diamond_with_a_dot
🔘	radio_button
🔳	white_square_button
🔲	black_square_button`,
    "flags": `🏁	checkered_flag
🚩	triangular_flag_on_post	triangular_flag
🎌	crossed_flags
🏴	black_flag
🏳	white_flag
🏳‍🌈	rainbow_flag
🏳‍⚧️	transgender_flag
🏴‍☠	pirate_flag	jolly_roger
🇦🇨	ascension_island	flag_ac
🇦🇩	andorra	flag_ad
🇦🇪	united_arab_emirates	flag_ae
🇦🇫	afghanistan	flag_af
🇦🇬	antigua_barbuda	flag_ag
🇦🇮	anguilla	flag_ai
🇦🇱	albania	flag_al
🇦🇲	armenia	flag_am
🇦🇴	angola	flag_ao
🇦🇶	antarctica	flag_aq
🇦🇷	argentina	flag_ar
🇦🇸	american_samoa	flag_as
🇦🇹	austria	flag_at
🇦🇺	australia	flag_au
🇦🇼	aruba	flag_aw
🇦🇽	aland_islands	flag_ax
🇦🇿	azerbaijan	flag_az
🇧🇦	bosnia_herzegovina	flag_ba
🇧🇧	barbados	flag_bb
🇧🇩	bangladesh	flag_bd
🇧🇪	belgium	flag_be
🇧🇫	burkina_faso	flag_bf
🇧🇬	bulgaria	flag_bg
🇧🇭	bahrain	flag_bh
🇧🇮	burundi	flag_bi
🇧🇯	benin	flag_bj
🇧🇱	st_barthelemy	flag_bl
🇧🇲	bermuda	flag_bm
🇧🇳	brunei	flag_bn
🇧🇴	bolivia	flag_bo
🇧🇶	caribbean_netherlands	flag_bq
🇧🇷	brazil	flag_br
🇧🇸	bahamas	flag_bs
🇧🇹	bhutan	flag_bt
🇧🇻	bouvet_island	flag_bv
🇧🇼	botswana	flag_bw
🇧🇾	belarus	flag_by
🇧🇿	belize	flag_bz
🇨🇦	canada	flag_ca
🇨🇨	cocos_islands	flag_cc
🇨🇩	congo_kinshasa	flag_cd
🇨🇫	central_african_republic	flag_cf
🇨🇬	congo_brazzaville	flag_cg
🇨🇭	switzerland	flag_ch
🇨🇮	cote_divoire	flag_ci
🇨🇰	cook_islands	flag_ck
🇨🇱	chile	flag_cl
🇨🇲	cameroon	flag_cm
🇨🇳	cn	china,flag_cn
🇨🇴	colombia	flag_co
🇨🇵	clipperton_island	flag_cp
🇨🇶	flag_cq	sark
🇨🇷	costa_rica	flag_cr
🇨🇺	cuba	flag_cu
🇨🇻	cape_verde	flag_cv
🇨🇼	curacao	flag_cw
🇨🇽	christmas_island	flag_cx
🇨🇾	cyprus	flag_cy
🇨🇿	czech_republic	czechia,flag_cz
🇩🇪	de	flag_de,germany
🇩🇬	diego_garcia	flag_dg
🇩🇯	djibouti	flag_dj
🇩🇰	denmark	flag_dk
🇩🇲	dominica	flag_dm
🇩🇴	dominican_republic	flag_do
🇩🇿	algeria	flag_dz
🇪🇦	ceuta_melilla	flag_ea
🇪🇨	ecuador	flag_ec
🇪🇪	estonia	flag_ee
🇪🇬	egypt	flag_eg
🇪🇭	western_sahara	flag_eh
🇪🇷	eritrea	flag_er
🇪🇸	es	flag_es,spain
🇪🇹	ethiopia	flag_et
🇪🇺	eu	european_union,flag_eu
🇫🇮	finland	flag_fi
🇫🇯	fiji	flag_fj
🇫🇰	falkland_islands	flag_fk
🇫🇲	micronesia	flag_fm
🇫🇴	faroe_islands	flag_fo
🇫🇷	fr	flag_fr,france
🇬🇦	gabon	flag_ga
🇬🇧	gb	flag_gb,uk,united_kingdom
🇬🇩	grenada	flag_gd
🇬🇪	georgia	flag_ge
🇬🇫	french_guiana	flag_gf
🇬🇬	guernsey	flag_gg
🇬🇭	ghana	flag_gh
🇬🇮	gibraltar	flag_gi
🇬🇱	greenland	flag_gl
🇬🇲	gambia	flag_gm
🇬🇳	guinea	flag_gn
🇬🇵	guadeloupe	flag_gp
🇬🇶	equatorial_guinea	flag_gq
🇬🇷	greece	flag_gr
🇬🇸	south_georgia_south_sandwich_islands	flag_gs
🇬🇹	guatemala	flag_gt
🇬🇺	guam	flag_gu
🇬🇼	guinea_bissau	flag_gw
🇬🇾	guyana	flag_gy
🇭🇰	hong_kong	flag_hk
🇭🇲	heard_mcdonald_islands	flag_hm
🇭🇳	honduras	flag_hn
🇭🇷	croatia	flag_hr
🇭🇹	haiti	flag_ht
🇭🇺	hungary	flag_hu
🇮🇨	canary_islands	flag_ic
🇮🇩	indonesia	flag_id
🇮🇪	ireland	flag_ie
🇮🇱	israel	flag_il
🇮🇲	isle_of_man	flag_im
🇮🇳	india	flag_in
🇮🇴	british_indian_ocean_territory	flag_io
🇮🇶	iraq	flag_iq
🇮🇷	iran	flag_ir
🇮🇸	iceland	flag_is
🇮🇹	it	flag_it,italy
🇯🇪	jersey	flag_je
🇯🇲	jamaica	flag_jm
🇯🇴	jordan	flag_jo
🇯🇵	jp	flag_jp,japan
🇰🇪	kenya	flag_ke
🇰🇬	kyrgyzstan	flag_kg
🇰🇭	cambodia	flag_kh
🇰🇮	kiribati	flag_ki
🇰🇲	comoros	flag_km
🇰🇳	st_kitts_nevis	flag_kn
🇰🇵	north_korea	flag_kp
🇰🇷	kr	flag_kr,south_korea
🇰🇼	kuwait	flag_kw
🇰🇾	cayman_islands	flag_ky
🇰🇿	kazakhstan	flag_kz
🇱🇦	laos	flag_la
🇱🇧	lebanon	flag_lb
🇱🇨	st_lucia	flag_lc
🇱🇮	liechtenstein	flag_li
🇱🇰	sri_lanka	flag_lk
🇱🇷	liberia	flag_lr
🇱🇸	lesotho	flag_ls
🇱🇹	lithuania	flag_lt
🇱🇺	luxembourg	flag_lu
🇱🇻	latvia	flag_lv
🇱🇾	libya	flag_ly
🇲🇦	morocco	flag_ma
🇲🇨	monaco	flag_mc
🇲🇩	moldova	flag_md
🇲🇪	montenegro	flag_me
🇲🇫	st_martin	flag_mf
🇲🇬	madagascar	flag_mg
🇲🇭	marshall_islands	flag_mh
🇲🇰	macedonia	flag_mk
🇲🇱	mali	flag_ml
🇲🇲	myanmar	burma,flag_mm
🇲🇳	mongolia	flag_mn
🇲🇴	macau	flag_mo,macao
🇲🇵	northern_mariana_islands	flag_mp
🇲🇶	martinique	flag_mq
🇲🇷	mauritania	flag_mr
🇲🇸	montserrat	flag_ms
🇲🇹	malta	flag_mt
🇲🇺	mauritius	flag_mu
🇲🇻	maldives	flag_mv
🇲🇼	malawi	flag_mw
🇲🇽	mexico	flag_mx
🇲🇾	malaysia	flag_my
🇲🇿	mozambique	flag_mz
🇳🇦	namibia	flag_na
🇳🇨	new_caledonia	flag_nc
🇳🇪	niger	flag_ne
🇳🇫	norfolk_island	flag_nf
🇳🇬	nigeria	flag_ng
🇳🇮	nicaragua	flag_ni
🇳🇱	netherlands	flag_nl
🇳🇴	norway	flag_no
🇳🇵	nepal	flag_np
🇳🇷	nauru	flag_nr
🇳🇺	niue	flag_nu
🇳🇿	new_zealand	flag_nz
🇴🇲	oman	flag_om
🇵🇦	panama	flag_pa
🇵🇪	peru	flag_pe
🇵🇫	french_polynesia	flag_pf
🇵🇬	papua_new_guinea	flag_pg
🇵🇭	philippines	flag_ph
🇵🇰	pakistan	flag_pk
🇵🇱	poland	flag_pl
🇵🇲	st_pierre_miquelon	flag_pm
🇵🇳	pitcairn_islands	flag_pn
🇵🇷	puerto_rico	flag_pr
🇵🇸	palestinian_territories	flag_ps
🇵🇹	portugal	flag_pt
🇵🇼	palau	flag_pw
🇵🇾	paraguay	flag_py
🇶🇦	qatar	flag_qa
🇷🇪	reunion	flag_re
🇷🇴	romania	flag_ro
🇷🇸	serbia	flag_rs
🇷🇺	ru	flag_ru,russia
🇷🇼	rwanda	flag_rw
🇸🇦	saudi_arabia	flag_sa
🇸🇧	solomon_islands	flag_sb
🇸🇨	seychelles	flag_sc
🇸🇩	sudan	flag_sd
🇸🇪	sweden	flag_se
🇸🇬	singapore	flag_sg
🇸🇭	st_helena	flag_sh
🇸🇮	slovenia	flag_si
🇸🇯	svalbard_jan_mayen	flag_sj
🇸🇰	slovakia	flag_sk
🇸🇱	sierra_leone	flag_sl
🇸🇲	san_marino	flag_sm
🇸🇳	senegal	flag_sn
🇸🇴	somalia	flag_so
🇸🇷	suriname	flag_sr
🇸🇸	south_sudan	flag_ss
🇸🇹	sao_tome_principe	flag_st
🇸🇻	el_salvador	flag_sv
🇸🇽	sint_maarten	flag_sx
🇸🇾	syria	flag_sy
🇸🇿	swaziland	eswatini,flag_sz
🇹🇦	tristan_da_cunha	flag_ta
🇹🇨	turks_caicos_islands	flag_tc
🇹🇩	chad	flag_td
🇹🇫	french_southern_territories	flag_tf
🇹🇬	togo	flag_tg
🇹🇭	thailand	flag_th
🇹🇯	tajikistan	flag_tj
🇹🇰	tokelau	flag_tk
🇹🇱	timor_leste	flag_tl
🇹🇲	turkmenistan	flag_tm
🇹🇳	tunisia	flag_tn
🇹🇴	tonga	flag_to
🇹🇷	tr	flag_tr,turkey_tr
🇹🇹	trinidad_tobago	flag_tt
🇹🇻	tuvalu	flag_tv
🇹🇼	taiwan	flag_tw
🇹🇿	tanzania	flag_tz
🇺🇦	ukraine	flag_ua
🇺🇬	uganda	flag_ug
🇺🇲	us_outlying_islands	flag_um
🇺🇳	united_nations	flag_un,un
🇺🇸	us	flag_us,united_states,usa
🇺🇾	uruguay	flag_uy
🇺🇿	uzbekistan	flag_uz
🇻🇦	vatican_city	flag_va
🇻🇨	st_vincent_grenadines	flag_vc
🇻🇪	venezuela	flag_ve
🇻🇬	british_virgin_islands	flag_vg
🇻🇮	us_virgin_islands	flag_vi
🇻🇳	vietnam	flag_vn
🇻🇺	vanuatu	flag_vu
🇼🇫	wallis_futuna	flag_wf
🇼🇸	samoa	flag_ws
🇽🇰	kosovo	flag_xk
🇾🇪	yemen	flag_ye
🇾🇹	mayotte	flag_yt
🇿🇦	south_africa	flag_za
🇿🇲	zambia	flag_zm
🇿🇼	zimbabwe	flag_zw
🏴󠁧󠁢󠁥󠁮󠁧󠁿	england	flag_gbeng
🏴󠁧󠁢󠁳󠁣󠁴󠁿	scotland	flag_gbsct
🏴󠁧󠁢󠁷󠁬󠁳󠁿	wales	flag_gbwls`
  };
  var ZED_EMOJIS = `zed_pack	zp	/items/zed_pack.webp
zed_city	zc	/items/zc.webp
tape		/items/craft_tape.webp
barley		/items/barley.webp
dirty_water		/items/dirty_water.webp
rock		/items/craft_rock.webp
barricade		/items/barricade.webp
barley_seeds		/items/barley_seeds.webp
water		/items/water.webp
cloth		/items/cloth.webp
zed_juice		/items/zed_juice.webp
nails		/items/craft_nails.webp
brick		/items/brick.webp
unrefined_plastic		/items/unrefined_plastic.webp
car_parts		/items/car_parts.webp
empty_fuel_container		/items/empty_fuel_container.webp
fuel_container		/items/fuel_container.webp
defense_kit		/items/defense_kit.webp
oil		/items/oil.webp
cement		/items/cement.webp
hide		/items/hide.webp
quartz		/items/quartz.webp
rebar		/items/rebar.webp
silicon		/items/silicon.webp
alloy_bar		/items/alloy_bar.webp
thread		/items/thread.webp
fuel		/items/fuel.webp
amber		/items/amber.webp
tin_plate		/items/tin_plate.webp
double_lining		/items/double_lining.webp
reinforced_lining		/items/reinforced_lining.webp
nimble_lining		/items/nimble_lining.webp
light_lining		/items/light_lining.webp
accuracy_kit		/items/accuracy_kit.webp
damage_kit		/items/damage_kit.webp
log		/items/craft_log.webp
scrapnote		/items/scrapnote.webp
bolts		/items/bolts.webp
ectoplasm		/items/ectoplasm.webp
cross_necklace		/items/cross_necklace.webp
demon_stone		/items/demon_stone.webp
building_hammer		/items/building_hammer.webp
bauble		/items/bauble.webp
dreidel		/items/dreidel.webp
seasonal_gift		/items/seasonal_gift.webp
snowball		/items/snowball.webp
solstice_lantern		/items/solstice_lantern.webp
wrapping_paper		/items/wrapping_paper.webp
reinforced_pane		/items/reinforced_pane.webp
regal_fabric		/items/regal_fabric.webp
survivors_journal_old		/items/survivors_journal_old.webp
survivors_journal_modern		/items/survivors_journal_modern.webp
survivors_journal_military		/items/survivors_journal_military.webp
survivors_journal_free		/items/survivors_journal_free.webp
survivors_prisoner		/items/survivors_prisoner.webp
survivors_hiking_magazine		/items/survivors_hiking_magazine.webp
survivors_science_magazine		/items/survivors_science_magazine.webp
survivors_business_magazine		/items/survivors_business_magazine.webp
wire		/items/craft_wire.webp
rope		/items/craft_rope.webp
scrap		/items/craft_scrap.webp
explosives		/items/explosives.webp
coal		/items/coal.webp
electrical_components		/items/electrical_components.webp
salvaged_tech		/items/salvaged_tech.webp
computer_board		/items/computer_board.webp
broken_radio		/items/broken_radio.webp
broken_remote		/items/broken_remote.webp
broken_screen		/items/broken_screen.webp
automation_arm		/items/automation_arm.webp
serum		/items/serum.webp
plastic		/items/plastic.webp
gears		/items/gears.webp
gun_powder		/items/gun_powder.webp
planks		/items/craft_planks.webp
reclaimed_components		/items/reclaimed_components.webp
bone_offering		/items/bone_offering.webp
iron_bar		/items/iron_bar.webp
crystal_water		/items/crystal_water.webp
sand		/items/sand.webp
advanced_tools		/items/advanced_tools.webp
steel		/items/steel.webp
tarp		/items/tarp.webp
iron_ore		/items/iron_ore.webp
flux		/items/flux.webp
tincture		/items/tincture.webp
mechanic_wrench		/items/mechanic_wrench.webp
simple_ammo		/items/simple_ammo.webp
shotgun_slug		/items/shotgun_slug.webp
rifle_ammo		/items/rifle_ammo.webp
pistol_ammo		/items/pistol_ammo.webp
ammo_arrows		/items/ammo_arrows.webp
bass		/items/bass.webp
perch		/items/perch.webp
carp		/items/carp.webp
barnaclefish		/items/barnaclefish.webp
angelfish		/items/angelfish.webp
rockfish		/items/rockfish.webp
sandfish		/items/sandfish.webp`;

  // src/emoji.js
  var CATEGORY_DEFS = [
    { key: "recent", label: "Recently used", icon: "fas fa-history" },
    { key: "zed city", label: "Zed City", img: "/icons/favicon.svg" },
    { key: "people & body", label: "Smileys & people", icon: "fas fa-smile-beam" },
    { key: "animals & nature", label: "Animals & nature", icon: "fas fa-leaf" },
    { key: "food & drink", label: "Food & drink", icon: "fas fa-hamburger" },
    { key: "activities", label: "Activities", icon: "fas fa-basketball-ball" },
    { key: "travel & places", label: "Travel & places", icon: "fas fa-car-side" },
    { key: "objects", label: "Objects", icon: "fas fa-lightbulb" },
    { key: "symbols", label: "Symbols", icon: "fas fa-heart" },
    { key: "flags", label: "Flags", icon: "fas fa-flag" },
    { key: "misc", label: "Misc", icon: "fas fa-puzzle-piece" }
  ];
  var STANDARD_MAP = null;
  var ZED_MAP = null;
  var GROUP_ITEMS = null;
  var FLAG_NAMES = null;
  var FLAG_RE = null;
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function parse() {
    if (STANDARD_MAP) return;
    STANDARD_MAP = /* @__PURE__ */ new Map();
    ZED_MAP = /* @__PURE__ */ new Map();
    GROUP_ITEMS = /* @__PURE__ */ new Map();
    FLAG_NAMES = /* @__PURE__ */ new Map();
    for (const [group, block] of Object.entries(EMOJI_GROUPS)) {
      const items = [];
      for (const line of block.split("\n")) {
        if (!line) continue;
        const [emoji, name, aliasCsv] = line.split("	");
        if (!emoji || !name) continue;
        const aliases = aliasCsv ? aliasCsv.split(",") : [];
        items.push({ emoji, name, aliases });
        STANDARD_MAP.set(name.toLowerCase(), { name, emoji });
        for (const alias of aliases) STANDARD_MAP.set(alias.toLowerCase(), { name, emoji });
        if (group === "flags" && !FLAG_NAMES.has(emoji)) FLAG_NAMES.set(emoji, name);
      }
      GROUP_ITEMS.set(group, items);
    }
    const zedItems = [];
    for (const line of ZED_EMOJIS.split("\n")) {
      if (!line) continue;
      const [name, aliasCsv, src] = line.split("	");
      if (!name || !src) continue;
      const aliases = aliasCsv ? aliasCsv.split(",") : [];
      zedItems.push({ name, src, aliases });
      ZED_MAP.set(name.toLowerCase(), { name, src });
      for (const alias of aliases) ZED_MAP.set(alias.toLowerCase(), { name, src });
    }
    GROUP_ITEMS.set("zed city", zedItems);
    if (FLAG_NAMES.size) {
      const alternatives = [...FLAG_NAMES.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
      FLAG_RE = new RegExp(alternatives.join("|"), "g");
    }
  }
  function emojiCategories() {
    parse();
    return CATEGORY_DEFS.map((c) => ({ ...c, items: c.key === "recent" ? [] : GROUP_ITEMS.get(c.key) || [] }));
  }
  function findEmoji(name) {
    parse();
    const key = String(name ?? "").trim().replace(/^:+|:+$/g, "").toLowerCase();
    if (!key) return null;
    return STANDARD_MAP.get(key) || ZED_MAP.get(key) || null;
  }
  function normalizeQuery(s) {
    return String(s ?? "").trim().replace(/^:+/, "").toLowerCase().replace(/[_-]/g, " ").trim();
  }
  function normalizeName(s) {
    return s.toLowerCase().replace(/[_-]/g, " ");
  }
  function searchEmoji(query, limit = 60) {
    parse();
    const q = normalizeQuery(query);
    if (!q) return [];
    const ranked = [];
    for (const items of GROUP_ITEMS.values()) {
      for (const item of items) {
        const name = normalizeName(item.name);
        let rank;
        if (name === q) rank = 0;
        else if (name.startsWith(q)) rank = 1;
        else if (item.aliases.some((a) => normalizeName(a).startsWith(q))) rank = 2;
        else if (name.includes(q) || item.aliases.some((a) => normalizeName(a).includes(q))) rank = 3;
        else continue;
        ranked.push({ rank, item });
      }
    }
    ranked.sort((a, b) => a.rank - b.rank);
    return ranked.slice(0, limit).map((r) => r.item);
  }
  function flagImageUrl(emoji) {
    const codePoints = [...String(emoji)].map((ch) => ch.codePointAt(0).toString(16)).join("-");
    const url = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${codePoints}.png`;
    return `https://cdn.zed.city/?url=${encodeURIComponent(url)}`;
  }
  function isFlag(emoji) {
    parse();
    return FLAG_NAMES.has(emoji);
  }
  var SHORTCODE_RE = /:([a-z0-9_+-]+):/gi;
  function substituteShortcodes(text2) {
    const parts2 = [];
    let buf = "";
    let last = 0;
    SHORTCODE_RE.lastIndex = 0;
    let m;
    while (m = SHORTCODE_RE.exec(text2)) {
      buf += text2.slice(last, m.index);
      const rec = findEmoji(m[1]);
      if (rec && rec.src) {
        if (buf) parts2.push({ type: "text", text: buf });
        buf = "";
        parts2.push({ type: "emoji", name: rec.name, src: rec.src });
      } else if (rec && rec.emoji) {
        buf += rec.emoji;
      } else {
        buf += m[0];
      }
      last = m.index + m[0].length;
    }
    buf += text2.slice(last);
    if (buf || parts2.length === 0) parts2.push({ type: "text", text: buf });
    return parts2;
  }
  function splitFlags(text2) {
    parse();
    if (!FLAG_RE) return [{ type: "text", text: text2 }];
    const parts2 = [];
    let last = 0;
    FLAG_RE.lastIndex = 0;
    let m;
    while (m = FLAG_RE.exec(text2)) {
      if (m.index > last) parts2.push({ type: "text", text: text2.slice(last, m.index) });
      const emoji = m[0];
      parts2.push({ type: "emoji", name: FLAG_NAMES.get(emoji), src: flagImageUrl(emoji), emoji });
      last = m.index + m[0].length;
    }
    if (last < text2.length || parts2.length === 0) parts2.push({ type: "text", text: text2.slice(last) });
    return parts2;
  }
  function emojiParts(text2) {
    const out = [];
    for (const part of substituteShortcodes(text2)) {
      if (part.type === "text") out.push(...splitFlags(part.text));
      else out.push(part);
    }
    return out;
  }

  // src/mail.js
  var GROUP_WINDOW_MS = 9e5;
  var flag = (v) => v === true || Number(v) > 0;
  function messageText(message) {
    if (typeof message === "string") return message;
    if (message && typeof message === "object") {
      if (message.cmd === "tradeInvite") return "Sent a trade invite";
      if (message.cmd === "activityInvite") return "Sent an activity invite";
      return "Sent a message that can only be viewed in the inbox";
    }
    if (message === null || message === void 0) return "";
    return String(message);
  }
  var IMAGE_RE = /!\[([^\]]*)\]\((https:\/\/cdn\.zed\.city\/[^\s()<>"'\\]*)\)/g;
  var MAX_ALT_LEN = 200;
  function messageParts(text2) {
    const s = typeof text2 === "string" ? text2 : String(text2 ?? "");
    const raw = [];
    let last = 0;
    IMAGE_RE.lastIndex = 0;
    let m;
    while (m = IMAGE_RE.exec(s)) {
      if (m.index > last) raw.push({ type: "text", text: s.slice(last, m.index) });
      raw.push({ type: "image", alt: m[1].slice(0, MAX_ALT_LEN), src: m[2] });
      last = m.index + m[0].length;
    }
    if (last < s.length || raw.length === 0) raw.push({ type: "text", text: s.slice(last) });
    const expanded = [];
    for (const p of raw) {
      if (p.type === "text") expanded.push(...emojiParts(p.text));
      else expanded.push(p);
    }
    const parts2 = [];
    for (const p of expanded) {
      if (p.type === "text" && p.text === "") continue;
      const top = parts2[parts2.length - 1];
      if (p.type === "text" && top && top.type === "text") top.text += p.text;
      else parts2.push(p.type === "text" ? { type: "text", text: p.text } : p);
    }
    return parts2.length ? parts2 : [{ type: "text", text: "" }];
  }
  function previewText(text2) {
    const s = messageParts(text2).map((p) => p.type === "image" ? `GIF${p.alt ? ": " + p.alt : ""}` : p.type === "emoji" ? p.emoji || `:${p.name}:` : p.text).join("");
    return s.replace(/\s+/g, " ").trim();
  }
  function normalizeMessage(raw) {
    const id = toId(raw && raw.id);
    if (!id) return null;
    return {
      id,
      senderId: toId(raw.sender_id),
      text: messageText(raw.message),
      ts: parseSentAt(raw.sent_at),
      isSystem: flag(raw.is_system)
    };
  }
  function normalizeMessages(data) {
    return asArray(data).map(normalizeMessage).filter(Boolean);
  }
  function normalizeThread(raw, now = Date.now()) {
    const userId = toId(raw && raw.other_user_id);
    if (!userId) return null;
    const other = raw.other_user && typeof raw.other_user === "object" ? raw.other_user : {};
    const unread = Number(raw.new_mail);
    return {
      userId,
      username: typeof other.username === "string" && other.username ? other.username : `#${userId}`,
      avatar: typeof other.avatar === "string" && other.avatar ? other.avatar : null,
      preview: previewText(messageText(raw.message)),
      senderId: toId(raw.sender_id),
      lastReply: pastTime(raw.last_reply, now),
      newMail: unread > 0 ? Math.floor(unread) : 0,
      isSystem: flag(raw.is_system)
    };
  }
  function normalizeThreads(data, now = Date.now()) {
    return asArray(data).map((raw) => normalizeThread(raw, now)).filter(Boolean);
  }
  function buildLog(messages, { local = false, newFrom = null } = {}) {
    const byId = /* @__PURE__ */ new Map();
    for (const m of messages) byId.set(m.id, m);
    const sorted = [...byId.values()].sort((a, b) => a.id - b.id);
    const items = [];
    let prev = null;
    for (const m of sorted) {
      const day = m.ts !== null ? dayKey(m.ts, local) : null;
      const prevDay = prev && prev.ts !== null ? dayKey(prev.ts, local) : null;
      if (day && day !== prevDay) items.push({ type: "divider", key: `d:${day}`, label: formatDayLabel(m.ts, local) });
      const grouped = !!prev && prev.senderId === m.senderId && day !== null && day === prevDay && Math.abs(m.ts - prev.ts) <= GROUP_WINDOW_MS;
      const isNew = m.id === newFrom;
      if (isNew) items.push({ type: "new", key: "new" });
      items.push({ type: "msg", key: `m:${m.id}`, msg: m, grouped: grouped && !isNew });
      prev = m;
    }
    return items;
  }
  function findNewMail(threads, seen, myId) {
    const out = [];
    for (const t of threads) {
      if (t.newMail <= 0 || t.senderId === myId) continue;
      const lastSeen = seen[t.userId] && seen[t.userId].lastSeenReply || 0;
      if (t.lastReply !== null && t.lastReply <= lastSeen) continue;
      out.push(t);
    }
    return out;
  }
  function reconcilePending(pending, messages) {
    const ids = new Set(messages.map((m) => m.id));
    return pending.filter((p) => !(p.realId && ids.has(p.realId)));
  }

  // src/conversation.js
  var PAGE_SIZE = 10;
  var MAX_MESSAGES = 200;
  function createConversation({
    api,
    userId,
    myId,
    now = () => Date.now(),
    onActivity = () => {
    },
    onInfo = () => {
    }
  }) {
    const messages = /* @__PURE__ */ new Map();
    const subs = /* @__PURE__ */ new Set();
    let pending = [];
    let localSeq = 0;
    const state = {
      loaded: false,
      loading: false,
      loadingOlder: false,
      hasMore: true,
      blocked: false,
      busy: null,
      info: null
    };
    function emit() {
      for (const fn of [...subs]) {
        try {
          fn();
        } catch (e) {
          warnOnce("conversation-subscriber", e);
        }
      }
    }
    function add(list2) {
      let added = 0;
      let fromThem = false;
      for (const m of list2) {
        if (messages.has(m.id)) continue;
        messages.set(m.id, m);
        added += 1;
        if (m.senderId !== myId) fromThem = true;
      }
      return { added, fromThem };
    }
    function fail(r) {
      if (r.kind === "access") state.blocked = true;
      else if (r.kind === "busy") state.busy = r.busy || "busy";
    }
    function list() {
      return [...messages.values()].sort((a, b) => a.id - b.id);
    }
    function lastId() {
      let max = 0;
      for (const id of messages.keys()) if (id > max) max = id;
      return max;
    }
    function latestTs() {
      let max = 0;
      for (const m of messages.values()) if (m.ts && m.ts > max) max = m.ts;
      return max;
    }
    async function loadInitial() {
      if (state.loading) return { ok: true };
      state.loading = true;
      emit();
      try {
        const r = await api.getChatMessages(userId, 1, PAGE_SIZE);
        if (!r.ok) {
          fail(r);
          return r;
        }
        state.busy = null;
        const rows = asArray(r.data).length;
        const msgs = normalizeMessages(r.data);
        add(msgs);
        pending = reconcilePending(pending, list());
        state.loaded = true;
        if (rows < PAGE_SIZE) state.hasMore = false;
        return r;
      } finally {
        state.loading = false;
        emit();
      }
    }
    async function loadOlder() {
      if (!state.loaded || state.loadingOlder || !state.hasMore) return { ok: true };
      state.loadingOlder = true;
      emit();
      let r = { ok: true };
      let page = Math.floor(messages.size / PAGE_SIZE) + 1;
      try {
        for (let tries = 0; tries < 3; tries += 1, page += 1) {
          r = await api.getChatMessages(userId, page, PAGE_SIZE);
          if (!r.ok) {
            fail(r);
            break;
          }
          state.busy = null;
          const rows = asArray(r.data).length;
          const msgs = normalizeMessages(r.data);
          if (msgs.length === 0) {
            state.hasMore = false;
            break;
          }
          const oldest = messages.size ? Math.min(...messages.keys()) : Infinity;
          const { added } = add(msgs.filter((m) => m.id < oldest));
          if (rows < PAGE_SIZE) state.hasMore = false;
          if (added > 0 || !state.hasMore) break;
        }
      } finally {
        state.loadingOlder = false;
        emit();
      }
      return r;
    }
    async function fetchNew() {
      if (state.blocked) return { ok: false, kind: "access" };
      if (!state.loaded) return loadInitial();
      const r = await api.getNewMessages(userId, lastId());
      if (!r.ok) {
        fail(r);
        emit();
        return r;
      }
      const wasBusy = state.busy;
      state.busy = null;
      const top = lastId();
      const { added, fromThem } = add(normalizeMessages(r.data).filter((m) => m.id > top));
      const before = pending.length;
      pending = reconcilePending(pending, list());
      if (added || pending.length !== before || wasBusy) emit();
      if (fromThem) onActivity();
      return r;
    }
    async function refreshInfo() {
      if (state.blocked) return { ok: false, kind: "access" };
      const r = await api.getChatInfo(userId);
      if (!r.ok) {
        fail(r);
        emit();
        return r;
      }
      let changed = false;
      const info2 = r.data && (r.data[userId] || r.data[String(userId)]);
      if (info2 && typeof info2 === "object") {
        state.info = {
          username: typeof info2.username === "string" ? info2.username : null,
          avatar: typeof info2.avatar === "string" ? info2.avatar : null,
          online: !!info2.online,
          active: info2.active
        };
        onInfo(state.info);
        changed = true;
      }
      if (changed) emit();
      return r;
    }
    function ensureLoaded() {
      if (state.loaded || state.loading) return;
      loadInitial();
      refreshInfo();
    }
    async function send(text2) {
      const body = String(text2 || "").trim();
      if (!body || state.blocked) return false;
      const p = { localId: ++localSeq, text: body, ts: now(), error: false, realId: null };
      pending.push(p);
      emit();
      onActivity();
      const r = await api.sendMail(userId, body);
      if (r.ok) {
        const id = toId(r.data && r.data.message_id);
        if (id) p.realId = id;
        else pending = pending.filter((x) => x !== p);
        pending = reconcilePending(pending, list());
        emit();
        fetchNew();
        return true;
      }
      p.error = true;
      fail(r);
      emit();
      return false;
    }
    function retry(localId) {
      const p = pending.find((x) => x.localId === localId);
      if (!p || state.blocked) return Promise.resolve(false);
      pending = pending.filter((x) => x !== p);
      return send(p.text);
    }
    function trim(max = MAX_MESSAGES) {
      if (state.loadingOlder || messages.size <= max) return false;
      const drop = list().slice(0, messages.size - max);
      for (const m of drop) messages.delete(m.id);
      state.hasMore = true;
      emit();
      return true;
    }
    return {
      userId,
      state,
      messages: list,
      pending: () => pending,
      lastId,
      latestTs,
      loadInitial,
      loadOlder,
      fetchNew,
      refreshInfo,
      ensureLoaded,
      send,
      retry,
      trim,
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      }
    };
  }
  function createConversations({ api, myId, onActivity = () => {
  }, onInfo = () => {
  }, onChange = () => {
  } }) {
    const map = /* @__PURE__ */ new Map();
    return {
      acquire(userId) {
        let c = map.get(userId);
        if (!c) {
          c = createConversation({
            api,
            userId,
            myId,
            onActivity: () => onActivity(userId),
            onInfo: (info2) => onInfo(userId, info2)
          });
          c.subscribe(() => onChange(userId));
          map.set(userId, c);
        }
        return c;
      },
      get: (userId) => map.get(userId) || null,
      release: (userId) => map.delete(userId)
    };
  }

  // src/inbox.js
  var SAME_REPLY_MS = 5e3;
  function recentSignature(list) {
    return JSON.stringify(list.map((t) => [t.userId, t.username, t.avatar, t.preview, t.lastReply, t.newMail, t.isSystem]));
  }
  function createInbox({ api, store, myId, now = () => Date.now(), onActivity = () => {
  }, onThreadChanged = () => {
  }, isMuted: isMuted2 = () => false, onNewMail = () => {
  } }) {
    let threads = [];
    let previous = null;
    let lastSignature = null;
    let status = "loading";
    const subs = /* @__PURE__ */ new Set();
    function emit() {
      for (const fn of [...subs]) {
        try {
          fn();
        } catch (e) {
          warnOnce("inbox-subscriber", e);
        }
      }
    }
    async function poll() {
      const r = await api.getChats(1);
      if (!r.ok) {
        if (status === "loading") {
          status = "error";
          emit();
        }
        return r;
      }
      status = "ok";
      threads = normalizeThreads(r.data, now());
      if (previous) {
        for (const t of threads) {
          const prev = previous.get(t.userId);
          if (prev != null && t.lastReply != null && Math.abs(t.lastReply - prev) <= SAME_REPLY_MS) t.lastReply = prev;
        }
      }
      const byId = new Map(threads.map((t) => [t.userId, t]));
      const state = store.get();
      const fresh = findNewMail(threads, state.threads, myId);
      const freshIds = new Set(fresh.map((t) => t.userId));
      const sortedFresh = [...fresh].sort((a, b) => (a.lastReply || 0) - (b.lastReply || 0));
      const changes = [];
      for (const t of sortedFresh) {
        const seen = state.threads[t.userId] || {};
        const pop = !!state.friends[t.userId] && !isMuted2(t.userId) && (t.lastReply || 0) > (seen.lastNotifiedReply || 0);
        if (seen.unread !== t.newMail || pop) changes.push({ t, pop });
      }
      const cleared = Object.keys(state.threads).map(Number).filter((id) => state.threads[id].unread > 0 && !freshIds.has(id) && byId.has(id));
      if (changes.length || cleared.length) {
        store.update((s) => {
          for (const { t, pop } of changes) {
            const entry = threadEntry(s, t.userId);
            entry.unread = t.newMail;
            if (pop) {
              entry.lastNotifiedReply = t.lastReply || 0;
              const username = t.username === `#${t.userId}` ? void 0 : t.username;
              openDm(s, t.userId, { now: now(), username, avatar: t.avatar });
            }
          }
          for (const id of cleared) threadEntry(s, id).unread = 0;
        });
      }
      const prevBaseline = previous;
      previous = new Map(threads.map((t) => [t.userId, t.lastReply]));
      if (prevBaseline) {
        const arrived = fresh.filter((t) => !isMuted2(t.userId) && prevBaseline.get(t.userId) !== t.lastReply);
        if (arrived.length) {
          try {
            onNewMail(arrived);
          } catch (e) {
            warnOnce("inbox-callback", e);
          }
        }
        let chatting = false;
        for (const t of threads) {
          if (prevBaseline.has(t.userId) && prevBaseline.get(t.userId) === t.lastReply) continue;
          try {
            onThreadChanged(t.userId);
          } catch (e) {
            warnOnce("inbox-callback", e);
          }
          if (state.friends[t.userId] || state.dock.dms.some((d) => d.id === t.userId)) chatting = true;
        }
        if (chatting) {
          try {
            onActivity();
          } catch (e) {
            warnOnce("inbox-callback", e);
          }
        }
      }
      const signature = recentSignature(threads);
      if (signature !== lastSignature) {
        lastSignature = signature;
        emit();
      }
      return r;
    }
    return {
      poll,
      threads: () => threads,
      status: () => status,
      lastReply(userId) {
        const t = threads.find((x) => x.userId === userId);
        return t ? t.lastReply : null;
      },
      // An older page of the thread list, for the Private Messages window's Chats tab. Nothing else
      // (badges, pop-ups, change signals) looks at these; page 1 stays the poll's job.
      async fetchPage(page) {
        const r = await api.getChats(page);
        if (!r.ok) return r;
        return { ok: true, threads: normalizeThreads(r.data, now()) };
      },
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      }
    };
  }

  // src/poller.js
  function makePoller({ run, interval, maxBackoff = 3e5, busyInterval = 6e4, onAuthLost, doc = document, hiddenInterval = null }) {
    let active = false;
    let timer = null;
    let running = false;
    let rerun = false;
    let backoff = 0;
    const base = () => typeof interval === "function" ? interval() : interval;
    const visible = () => doc.visibilityState !== "hidden";
    const hiddenMs = () => {
      const v = typeof hiddenInterval === "function" ? hiddenInterval() : hiddenInterval;
      return typeof v === "number" && v > 0 ? v : null;
    };
    const canRun = () => visible() || hiddenMs() !== null;
    function clear2() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    function schedule(ms) {
      clear2();
      if (!active) return;
      if (visible()) timer = setTimeout(tick, ms);
      else if (hiddenMs() !== null) timer = setTimeout(tick, Math.max(ms, hiddenMs()));
    }
    async function tick() {
      clear2();
      if (!active || !canRun()) return;
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      let result;
      try {
        result = await run();
      } catch (e) {
        warnOnce("poller-run", e);
        result = { ok: false, kind: "network" };
      }
      running = false;
      if (!active) return;
      try {
        let delay = base();
        if (result && result.ok === false) {
          if (result.kind === "auth") {
            active = false;
            rerun = false;
            if (onAuthLost) onAuthLost();
            return;
          }
          if (result.kind === "network" || result.kind === "rate") {
            backoff = Math.min(backoff ? backoff * 2 : base() * 2, maxBackoff);
            delay = backoff;
          } else {
            backoff = 0;
            if (result.kind === "busy") delay = Math.max(base(), busyInterval);
          }
        } else {
          backoff = 0;
        }
        if (rerun) {
          rerun = false;
          tick();
          return;
        }
        schedule(delay);
      } catch (e) {
        warnOnce("poller-tick", e);
        rerun = false;
        if (active) schedule(typeof interval === "number" ? interval : 6e4);
      }
    }
    function onVisibility() {
      if (!active) return;
      if (visible()) tick();
      else if (hiddenMs() !== null) schedule(Math.max(hiddenMs(), backoff));
      else clear2();
    }
    doc.addEventListener("visibilitychange", onVisibility);
    return {
      start() {
        if (active) return;
        active = true;
        tick();
      },
      stop() {
        active = false;
        rerun = false;
        clear2();
      },
      // Run now (or right after the current run finishes).
      poke() {
        if (active) tick();
      },
      // Restart the wait using the current interval, without running now.
      reschedule() {
        if (active && !running && !backoff) schedule(base());
      },
      get active() {
        return active;
      },
      destroy() {
        active = false;
        rerun = false;
        clear2();
        doc.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }

  // src/backup.js
  var pick = (p) => p.note ? { id: p.id, username: p.username, note: p.note } : { id: p.id, username: p.username };
  function exportFriends(state, playerId, enemiesDoc) {
    const doc = { v: 1, playerId, friends: Object.values(state.friends).map(pick) };
    const enemies = enemiesDoc ? Object.values(enemiesDoc.enemies).map(pick) : [];
    if (enemies.length) doc.enemies = enemies;
    return JSON.stringify(doc, null, 2);
  }
  function parsePeople(list) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const p of list) {
      const id = toId(p && p.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const username = (typeof p.username === "string" ? p.username.slice(0, 32) : "") || `#${id}`;
      const note = normalizeNote(p.note);
      out.push(note ? { id, username, note } : { id, username });
    }
    return out;
  }
  function parseImport(text2, playerId) {
    let doc;
    try {
      doc = JSON.parse(text2);
    } catch {
      return { ok: false, error: "That file is not valid JSON." };
    }
    if (!doc || typeof doc !== "object" || doc.v !== 1 || !Array.isArray(doc.friends)) {
      return { ok: false, error: "That file is not a Zed City Friends export." };
    }
    if (toId(doc.playerId) !== toId(playerId)) {
      return { ok: false, error: "That export belongs to a different player." };
    }
    return { ok: true, friends: parsePeople(doc.friends), enemies: parsePeople(Array.isArray(doc.enemies) ? doc.enemies : []) };
  }
  function mergeInto(map, people, now) {
    let added = 0;
    let notes = 0;
    for (const p of people) {
      if (addPerson(map, p, now)) added += 1;
      if (p.note && !map[p.id].note && setPersonNote(map, p.id, p.note)) notes += 1;
    }
    return { added, notes };
  }
  var mergeImport = (state, friends, now) => mergeInto(state.friends, friends, now);
  var mergeEnemiesImport = (doc, enemies, now) => mergeInto(doc.enemies, enemies, now);
  function importMessage({ added, enemiesAdded = 0, notes = 0 }) {
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const parts2 = [count(added, "new friend", "new friends")];
    if (enemiesAdded) parts2.push(count(enemiesAdded, "new enemy", "new enemies"));
    if (notes) parts2.push(count(notes, "note", "notes"));
    const last = parts2.pop();
    return `Imported ${parts2.length ? `${parts2.join(", ")} and ${last}` : last}.`;
  }

  // src/ui/dom.js
  var AVATAR_BASE = "https://daz02uqlb9gre.cloudfront.net/";
  var DEFAULT_AVATAR = `${AVATAR_BASE}default.png`;
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === void 0 || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k.startsWith("on")) continue;
        else if (v === true) el.setAttribute(k, "");
        else el.setAttribute(k, String(v));
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === void 0 || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }
  function icon(name) {
    return h("i", { class: `fas fa-${name}`, "aria-hidden": "true" });
  }
  function avatarUrl(path) {
    if (typeof path !== "string" || !path || path.includes("..") || !/^[\w\-./]+$/.test(path)) return DEFAULT_AVATAR;
    return AVATAR_BASE + path.replace(/^\/+/, "");
  }
  function avatar({ avatar: path, online, size = 26 }) {
    const img = h("img", { class: "zcf-av-img", src: avatarUrl(path), alt: "", width: size, height: size, loading: "lazy" });
    img.addEventListener("error", () => {
      if (img.getAttribute("src") !== DEFAULT_AVATAR) img.setAttribute("src", DEFAULT_AVATAR);
    });
    const wrap = h("span", { class: "zcf-av", style: { width: `${size}px`, height: `${size}px` } }, img);
    if (typeof online === "boolean") wrap.appendChild(h("span", { class: `zcf-dot ${online ? "zcf-on" : "zcf-off"}` }));
    return wrap;
  }
  function highlightMatch(text2, query) {
    const s = String(text2 ?? "");
    const q = String(query || "").trim();
    const ql = q.toLowerCase();
    let i = -1;
    if (q) {
      for (let j = 0; j <= s.length - q.length; j++) {
        if (s.slice(j, j + q.length).toLowerCase() === ql) {
          i = j;
          break;
        }
      }
    }
    if (i < 0) return [s];
    return [s.slice(0, i), h("mark", null, s.slice(i, i + q.length)), s.slice(i + q.length)].filter((x) => x !== "");
  }
  function badge() {
    return h("span", {
      class: "q-badge flex inline items-center no-wrap q-badge--single-line q-badge--floating q-badge--rounded bg-red-5 text-white unread-badge zcf-badge",
      hidden: true
    });
  }
  function setBadge(el, count, visible) {
    el.textContent = String(count);
    el.hidden = !(visible && count > 0);
  }
  function downloadText(filename, text2, doc = document) {
    const blob = new Blob([text2], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename, style: { display: "none" } });
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function wireMenuKeys(menu, { onEscape }) {
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...menu.querySelectorAll("button")].filter((b) => !b.hidden && !b.disabled);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(menu.ownerDocument.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1;
      items[next].focus();
    }, true);
  }

  // src/ui/keeper.js
  function createKeeper({ doc = document, win = window } = {}) {
    const mounts = /* @__PURE__ */ new Set();
    let observer = null;
    let frame = 0;
    function runDetached() {
      for (const m of [...mounts]) if (!m.attached()) safe(`keeper-${m.name}`, m.ensure)();
    }
    function onMutations() {
      if (frame) return;
      for (const m of mounts) {
        if (m.attached()) continue;
        frame = win.requestAnimationFrame(() => {
          frame = 0;
          runDetached();
        });
        return;
      }
    }
    return {
      // mount: { name, attached: () => boolean, ensure: () => void }. Returns a function that removes it.
      add(mount) {
        mounts.add(mount);
        if (!observer) {
          observer = new win.MutationObserver(safe("keeper-observer", onMutations));
          observer.observe(doc.body, { childList: true, subtree: true });
        }
        return () => mounts.delete(mount);
      },
      destroy() {
        if (observer) observer.disconnect();
        observer = null;
        if (frame) win.cancelAnimationFrame(frame);
        frame = 0;
        mounts.clear();
      }
    };
  }

  // src/ui/dock.js
  var SMALL_QUERY = "(max-width: 599.98px)";
  function hasClassToken(value, cls) {
    return (value || "").split(/\s+/).includes(cls);
  }
  function createDock({ doc = document, win = window, keeper = null, onGameChatOpened = () => {
  } } = {}) {
    const root = h("div", { class: "zcf-root" });
    let dockEl = null;
    const ownKeeper = keeper ? null : createKeeper({ doc, win });
    const keep = keeper || ownKeeper;
    let unkeep = null;
    const mql = typeof win.matchMedia === "function" ? win.matchMedia(SMALL_QUERY) : null;
    const smallChangeUnsubs = /* @__PURE__ */ new Set();
    const isSmall = () => mql ? mql.matches : win.innerWidth < 600;
    function onSmallChange(fn) {
      if (!mql || typeof mql.addEventListener !== "function") return () => {
      };
      const listener = safe("dock-small-change", (e) => fn(e.matches));
      mql.addEventListener("change", listener);
      const unsubscribe = () => {
        if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", listener);
        smallChangeUnsubs.delete(unsubscribe);
      };
      smallChangeUnsubs.add(unsubscribe);
      return unsubscribe;
    }
    const classObserver = new win.MutationObserver(
      safe("dock-class-observer", (mutations) => {
        if (!isSmall()) return;
        for (const m of mutations) {
          const t = m.target;
          if (!t.classList || !t.classList.contains("chat-container") || root.contains(t)) continue;
          const wasMinimized = hasClassToken(m.oldValue, "chat-minimized");
          if (wasMinimized && !t.classList.contains("chat-minimized")) {
            onGameChatOpened();
            return;
          }
        }
      })
    );
    function reconcileOpenGameChat() {
      if (!dockEl || !isSmall()) return;
      if (dockEl.querySelector(":scope > .chat-container:not(.chat-minimized)")) safe("dock-reconcile", onGameChatOpened)();
    }
    function ensure() {
      if (root.isConnected) return true;
      const found = doc.querySelector(".chat-containers");
      if (found !== dockEl) {
        classObserver.disconnect();
        dockEl = found;
        if (dockEl) {
          classObserver.observe(dockEl, { attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true });
        }
      }
      if (!dockEl) return false;
      dockEl.insertBefore(root, dockEl.firstChild);
      reconcileOpenGameChat();
      return true;
    }
    let clickedThisTurn = /* @__PURE__ */ new WeakSet();
    function minimizeGameChats() {
      if (!dockEl) return;
      for (const c of dockEl.querySelectorAll(":scope > .chat-container:not(.chat-minimized)")) {
        if (clickedThisTurn.has(c)) continue;
        clickedThisTurn.add(c);
        const header = c.querySelector(":scope > .chat-header");
        if (header) header.click();
      }
      queueMicrotask(() => {
        clickedThisTurn = /* @__PURE__ */ new WeakSet();
      });
    }
    return {
      root,
      isSmall,
      onSmallChange,
      ensure,
      minimizeGameChats,
      start() {
        ensure();
        if (!unkeep) unkeep = keep.add({ name: "dock", attached: () => root.isConnected, ensure });
      },
      destroy() {
        if (unkeep) unkeep();
        unkeep = null;
        if (ownKeeper) ownKeeper.destroy();
        classObserver.disconnect();
        dockEl = null;
        for (const unsubscribe of [...smallChangeUnsubs]) unsubscribe();
        root.remove();
      }
    };
  }

  // src/ui/player-search.js
  var MAX_RESULTS = 8;
  var SEARCH_MS = 300;
  function createPlayerSearch({ players, onState }) {
    let seq = 0;
    const run = debounce(async (mine, q) => {
      let r;
      try {
        r = await players.search(q);
      } catch {
        r = { ok: false };
      }
      if (mine !== seq) return;
      if (!r.ok) onState({ kind: "error", text: "Search failed. Try again." });
      else onState({ kind: "results", results: r.data.slice(0, MAX_RESULTS) });
    }, SEARCH_MS);
    return {
      set(value) {
        const q = String(value || "").trim();
        seq += 1;
        const mine = seq;
        if (q.length >= 2 || /^\d+$/.test(q)) {
          onState({ kind: "searching" });
          run(mine, q);
        } else {
          run.cancel();
          onState({ kind: q ? "short" : "idle" });
        }
      },
      cancel() {
        run.cancel();
        seq += 1;
      }
    };
  }

  // src/ui/marks.js
  var enemyMark = () => h("i", { class: "fas fa-skull zcf-enemy-mark", role: "img", title: "Enemy", "aria-label": "Enemy" });
  var mutedMark = () => h("i", { class: "fas fa-bell-slash zcf-muted-mark", role: "img", title: "Muted", "aria-label": "Muted" });

  // src/pm-view.js
  var byName = (a, b) => a.username.localeCompare(b.username, void 0, { sensitivity: "base" });
  var str = (v) => typeof v === "string" && v ? v : null;
  var truthy = (v) => v === true || Number(v) > 0;
  function buildChatRows({ page1 = [], older = [], threads = {}, pinned = [], stub = null }) {
    const best = /* @__PURE__ */ new Map();
    for (const t of [...page1, ...older.flat()]) {
      if (!t) continue;
      const prev = best.get(t.userId);
      if (!prev || (t.lastReply || 0) > (prev.lastReply || 0)) best.set(t.userId, t);
    }
    for (const id of pinned) {
      if (best.has(id)) continue;
      const known = stub && stub(id) || {};
      best.set(id, { userId: id, username: known.username || `#${id}`, avatar: known.avatar || null, preview: "", senderId: null, lastReply: null, newMail: 0, isSystem: false, stub: true });
    }
    const pins = new Set(pinned);
    return [...best.values()].map((t) => ({ ...t, unread: threads[t.userId] && threads[t.userId].unread || 0, pinned: pins.has(t.userId) })).sort((a, b) => b.pinned - a.pinned || (b.lastReply || 0) - (a.lastReply || 0) || a.userId - b.userId);
  }
  function previewLine(t, myId) {
    if (!t.preview) return "";
    return `${t.senderId === myId ? "You" : t.username}: ${t.preview}`;
  }
  function buildFactionRows(data, { myId, now = Date.now() } = {}) {
    const rows = [];
    for (const m of asArray(data && data.members)) {
      const id = toId(m && m.id);
      if (!id || id === myId) continue;
      const level = Number(m.level);
      rows.push({
        id,
        username: str(m.username) || `#${id}`,
        avatar: str(m.avatar),
        online: truthy(m.online),
        active: lastActive(m.active, now),
        level: Number.isFinite(level) && level > 0 ? level : null
      });
    }
    return rows.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.online) return byName(a, b);
      return (b.active || 0) - (a.active || 0) || byName(a, b);
    });
  }
  function buildBlockedRows(pages) {
    const seen = /* @__PURE__ */ new Map();
    for (const u of pages.flat()) {
      const id = toId(u && u.id);
      if (!id || seen.has(id)) continue;
      seen.set(id, { id, username: str(u.username) || `#${id}`, avatar: str(u.avatar) });
    }
    return [...seen.values()].sort(byName);
  }

  // src/friends-table.js
  var DEFAULT_SORT = { key: "status", dir: "asc" };
  var FIRST_DIR = { name: "asc", level: "desc", status: "asc", faction: "asc" };
  var text = (a, b) => a.localeCompare(b, void 0, { sensitivity: "base" });
  var byName2 = (a, b) => text(a.username, b.username);
  var statusRank = (p) => p.online ? 0 : p.active ? 1 : 2;
  var SORTS = {
    name: { has: () => true, cmp: byName2 },
    level: { has: (r) => !!(r.profile && r.profile.level), cmp: (a, b) => a.profile.level - b.profile.level },
    faction: { has: (r) => !!(r.profile && r.profile.faction), cmp: (a, b) => text(a.profile.faction.name, b.profile.faction.name) },
    status: {
      has: (r) => !!r.presence,
      // Online first (A-Z via the tie-break), then offline by most recently active, then offline with no time.
      cmp: (a, b) => {
        const d = statusRank(a.presence) - statusRank(b.presence);
        if (d || statusRank(a.presence) !== 1) return d;
        return b.presence.active - a.presence.active;
      }
    }
  };
  function sortRows(rows, sort = DEFAULT_SORT) {
    const { has, cmp } = SORTS[sort.key] || SORTS.status;
    const sign = sort.dir === "desc" ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const ha = has(a);
      const hb = has(b);
      if (ha !== hb) return ha ? -1 : 1;
      return (ha ? sign * cmp(a, b) : 0) || byName2(a, b);
    });
  }
  function nextSort(sort, key) {
    if (sort.key === key) return { key, dir: sort.dir === "asc" ? "desc" : "asc" };
    return { key, dir: FIRST_DIR[key] || "asc" };
  }
  function buildFriendsTable({ list, friends, presence, threads = {}, tab = "all", query = "", sort = DEFAULT_SORT, pinned = [] }) {
    const q = String(query || "").trim().toLowerCase();
    const all = Object.values(list || friends || {}).map((f) => {
      const p = presence(f.id);
      return {
        id: f.id,
        username: f.username,
        avatar: f.avatar || null,
        note: f.note || "",
        presence: p ? { online: !!p.online, active: p.active || null } : null,
        profile: p && p.profile || null,
        unread: threads[f.id] && threads[f.id].unread || 0
      };
    });
    const isOnline = (r) => !!(r.presence && r.presence.online);
    const online = all.filter(isOnline).length;
    const counts = { all: all.length, online, offline: all.length - online };
    const keep = new Set(pinned);
    const inTab = all.filter((r) => tab === "all" || tab === "online" === isOnline(r) || keep.has(r.id));
    const matches = (r) => !q || r.username.toLowerCase().includes(q) || r.note.toLowerCase().includes(q);
    return { rows: sortRows(inTab.filter(matches), sort), counts };
  }

  // src/ui/pm-window.js
  var MAX_IMPORT_BYTES = 1024 * 1024;
  var FACTION_MS = 6e4;
  var LOAD_MORE_PX = 80;
  var TABS = [["chats", "Chats"], ["friends", "Friends"], ["faction", "Faction"], ["blocked", "Blocked"]];
  var SEARCH_TEXT = { short: "Keep typing…", searching: "Searching…" };
  var PIN_QUIET_MS = 400;
  function createPmWindow(services, { doc = document } = {}) {
    const { store, settings, actions, presence, inbox, players, router, toast, playerId, myId, api } = services;
    const isEnemy2 = services.isEnemy || (() => false);
    const isMuted2 = services.isMuted || (() => false);
    let wasOpen = false;
    let frame = 0;
    let lastSig = null;
    let lastView = null;
    let holdRender = false;
    let renderWanted = false;
    let found = { kind: "idle" };
    const older = [];
    let olderState = "more";
    const seenOnPage1 = /* @__PURE__ */ new Map();
    function rememberPage1() {
      for (const t of inbox.threads()) seenOnPage1.set(t.userId, t);
    }
    let faction = { status: "idle", data: null };
    let pinQuietUntil = 0;
    let blocked = { status: "idle", pages: [], total: 0, loading: false, done: false };
    let blockedShowing = false;
    let reloadBlocked = false;
    let unblockId = null;
    let unblockBusy = false;
    const tab = () => settings.get().pmTab;
    const searching = () => found.kind !== "idle";
    const isOpen = () => !!store.get().dock.friendsOpen;
    const titleText = h("span", null, "Private Messages");
    const unreadBadge = badge();
    unreadBadge.classList.replace("bg-red-5", "bg-positive");
    const title = h("div", { class: "chat-title" }, h("i", { class: "fas fa-envelope chat-icon", "aria-hidden": "true" }), titleText, unreadBadge);
    const menuBtn = h("button", { class: "zcf-hbtn", type: "button", title: "More", "aria-label": "More", "aria-haspopup": "menu", "aria-expanded": "false" }, icon("ellipsis-h"));
    const toggle = h("div", { class: "chat-toggle", "aria-hidden": "true" }, icon("chevron-down"));
    const header = h("div", { class: "chat-header", onclick: () => actions.togglePm() }, title, menuBtn, toggle);
    const tabBtns = /* @__PURE__ */ new Map();
    const tabBar = h("div", { class: "zcf-pm-tabs", role: "tablist" });
    for (const [key, label] of TABS) {
      const b = h("button", { class: "zcf-pm-tab", type: "button", role: "tab", "aria-selected": "false", onclick: () => selectTab(key) }, label);
      tabBtns.set(key, b);
      tabBar.appendChild(b);
    }
    const searchInput = h("input", {
      class: "zcf-input",
      type: "text",
      placeholder: "Search by player name to start a new chat",
      "aria-label": "Search by player name to start a new chat"
    });
    const list = h("div", { class: "zcf-list zcf-pm-list" });
    const main = h(
      "div",
      { class: "zcf-pm-main zcf-zoom" },
      tabBar,
      h("div", { class: "zcf-toolbar" }, h("label", { class: "zcf-search zcf-pm-search" }, icon("search"), searchInput)),
      list
    );
    const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    const menu = h(
      "div",
      { class: "zcf-menu", role: "menu", hidden: true },
      h("div", { class: "zcf-menu-title" }, "Friends list"),
      h("button", { type: "button", role: "menuitem", onclick: onExport }, "Export friends"),
      h("button", {
        type: "button",
        role: "menuitem",
        onclick: () => {
          closeMenu();
          fileInput.click();
        }
      }, "Import friends")
    );
    const body = h("div", { class: "chat-content zcf-body" }, main, menu, fileInput);
    const el = h("div", { class: "chat-container zcf zcf-pm", dataset: { zcfChat: "pm" } }, header, body);
    function closeMenu({ focusButton = false } = {}) {
      menu.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
      if (focusButton) menuBtn.focus();
    }
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!menu.hidden) {
        closeMenu();
        return;
      }
      menu.hidden = false;
      menuBtn.setAttribute("aria-expanded", "true");
      menu.querySelector("button").focus();
    });
    wireMenuKeys(menu, { onEscape: () => closeMenu({ focusButton: true }) });
    fileInput.addEventListener("change", safe("friends-import", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (file.size > MAX_IMPORT_BYTES) {
        toast("That file is too large to be a friends export.", { error: true });
        return;
      }
      let text2;
      try {
        text2 = await file.text();
      } catch {
        toast("Couldn't read that file.", { error: true });
        return;
      }
      const res = actions.importFriends(text2);
      toast(res.ok ? importMessage(res) : res.error, { error: !res.ok });
    }));
    function onExport() {
      closeMenu();
      const n = Object.keys(store.get().friends).length;
      downloadText(`zed-city-friends-${playerId}.json`, actions.exportFriends(), doc);
      toast(`Exported ${n} friend${n === 1 ? "" : "s"}.`);
    }
    function onDocMousedown(e) {
      if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
    }
    doc.addEventListener("mousedown", onDocMousedown);
    el.addEventListener("pointerdown", () => {
      holdRender = true;
    }, true);
    function onPointerRelease() {
      if (!holdRender) return;
      setTimeout(() => {
        holdRender = false;
        if (!renderWanted) return;
        renderWanted = false;
        safe("pm-render", renderList)();
      }, 0);
    }
    doc.addEventListener("pointerup", onPointerRelease, true);
    doc.addEventListener("pointercancel", onPointerRelease, true);
    const search = createPlayerSearch({
      players,
      onState(st) {
        found = st;
        renderList();
      }
    });
    searchInput.addEventListener("input", () => search.set(searchInput.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !searchInput.value) return;
      e.preventDefault();
      e.stopPropagation();
      clearSearch();
    });
    function clearSearch() {
      searchInput.value = "";
      search.set("");
    }
    function selectTab(key) {
      if (tab() !== key) actions.setPmTab(key);
      if (searching()) clearSearch();
    }
    list.addEventListener("scroll", () => {
      if (searching() || list.scrollHeight - list.scrollTop - list.clientHeight >= LOAD_MORE_PX) return;
      if (tab() === "chats") loadOlder();
      else if (tab() === "blocked" && blocked.status === "ok" && !blocked.done) loadBlocked({ more: true });
    });
    async function loadOlder() {
      if (olderState !== "more" && olderState !== "error") return;
      olderState = "loading";
      renderList();
      const r = await inbox.fetchPage(older.length + 2);
      if (r.ok && !r.threads.length) olderState = "done";
      else if (r.ok) {
        older.push(r.threads);
        olderState = "more";
      } else olderState = r.kind === "auth" ? "done" : "error";
      renderList();
    }
    async function loadFaction() {
      if (!faction.data) faction = { status: "loading", data: null };
      renderList();
      const r = await api.getFactionMembers();
      if (r.ok) faction = r.data && r.data.faction ? { status: "ok", data: r.data } : { status: "none", data: null };
      else if (r.kind === "other" || r.kind === "access") faction = { status: "none", data: null };
      else faction = faction.data ? faction : { status: "error", data: null };
      renderList();
      return r;
    }
    const factionPoller = makePoller({ run: loadFaction, interval: FACTION_MS, doc });
    async function loadBlocked({ more = false } = {}) {
      if (blocked.loading) {
        if (!more) reloadBlocked = true;
        return;
      }
      const page = more ? blocked.pages.length + 1 : 1;
      blocked = { ...blocked, loading: true, status: more || blocked.status === "ok" ? blocked.status : "loading" };
      renderList();
      const r = await api.blockList(page);
      if (r.ok) {
        const rows = asArray(r.data && r.data.list);
        const pages = more ? [...blocked.pages, rows] : [rows];
        const total = Number(r.data && r.data.total) || 0;
        blocked = { status: "ok", pages, total, loading: false, done: !rows.length || pages.flat().length >= total };
      } else {
        blocked = { ...blocked, loading: false, status: blocked.status === "ok" ? "ok" : "error" };
      }
      renderList();
      if (reloadBlocked) {
        reloadBlocked = false;
        loadBlocked();
      }
    }
    async function unblock(u) {
      unblockBusy = true;
      renderList();
      const r = await api.unblockUser(u.id);
      unblockBusy = false;
      unblockId = null;
      if (r.ok && !(r.data && r.data.success === false)) {
        toast(`${u.username} unblocked`);
        loadBlocked();
      } else {
        toast(`Failed to unblock ${u.username}`, { error: true });
        renderList();
      }
    }
    const item = (sig, build) => ({ sig, build });
    const note = (text2) => item(["note", text2], () => h("div", { class: "zcf-empty" }, text2));
    const knownName = (id, name) => name === `#${id}` ? void 0 : name;
    function knownPlayer(id) {
      const s = store.get();
      const dm = s.dock.dms.find((d) => d.id === id);
      const enemy = services.enemies ? services.enemies.get().enemies[id] : null;
      return s.friends[id] || (dm && dm.username ? dm : null) || enemy || null;
    }
    function pinButton(t) {
      return h("button", {
        class: `zcf-pm-pin${t.pinned ? " zcf-pinned" : ""}`,
        type: "button",
        title: t.pinned ? "Unpin" : "Pin to the top",
        "aria-label": t.pinned ? `Unpin ${t.username}` : `Pin ${t.username} to the top`,
        "aria-pressed": String(!!t.pinned),
        "data-zcf-focus": `pin:${t.userId}`,
        onclick: (e) => {
          e.stopPropagation();
          if (Date.now() < pinQuietUntil) return;
          pinQuietUntil = Date.now() + PIN_QUIET_MS;
          actions.togglePin(t.userId);
        }
      }, icon("thumbtack"));
    }
    const openChat = (id, username, av) => actions.openDm(id, { expand: true, username: knownName(id, username), avatar: av });
    function rowEl(focusKey2, onOpen, children) {
      return h("div", {
        class: "zcf-row",
        tabindex: 0,
        "data-zcf-focus": focusKey2,
        onclick: onOpen,
        onkeydown: (e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
            e.preventDefault();
            onOpen();
          }
        }
      }, children);
    }
    const nameEl = (id, username, after) => h("div", { class: "zcf-name" }, isEnemy2(id) ? enemyMark() : null, username, after || null);
    const pill = (n, dim) => n > 0 ? h("span", { class: `zcf-pill zcf-pill-green${dim ? " zcf-pill-dim" : ""}` }, String(n)) : null;
    const onDot = (p) => p ? !!p.online : void 0;
    function chatItems(s, now) {
      rememberPage1();
      const rows = buildChatRows({ page1: inbox.threads(), older: [...older, [...seenOnPage1.values()]], threads: s.threads, pinned: settings.get().pinned, stub: knownPlayer });
      const items = rows.map((t) => {
        const p = presence.get(t.userId);
        const muted = isMuted2(t.userId);
        const when = t.lastReply ? longAgo(t.lastReply, now) : "";
        const line = previewLine(t, myId);
        return item(["chat", t.userId, t.username, t.avatar, line, when, t.unread, onDot(p), isEnemy2(t.userId), muted, !!t.pinned], () => rowEl(`row:${t.userId}`, () => Date.now() >= pinQuietUntil && openChat(t.userId, t.username, t.avatar), [
          avatar({ avatar: t.avatar, online: onDot(p), size: 30 }),
          h(
            "div",
            { class: "zcf-row-main" },
            h("div", { class: "zcf-pm-line" }, nameEl(t.userId, t.username, muted ? mutedMark() : null), pill(t.unread, muted), h("span", { class: "zcf-pm-time" }, when), pinButton(t)),
            h("div", { class: `zcf-status zcf-pm-preview${t.unread > 0 ? " zcf-unread" : ""}` }, line || " ")
          )
        ]));
      });
      if (!rows.length) {
        const status = inbox.status ? inbox.status() : "ok";
        return [note(status === "loading" ? "Loading…" : status === "error" ? "Couldn't load your chats. Trying again…" : "No conversations yet.")];
      }
      if (olderState !== "done") {
        const label = olderState === "loading" ? "Loading…" : olderState === "error" ? "Couldn't load. Retry" : "Load older chats";
        items.push(item(["older", olderState], () => h("button", {
          class: "zcf-pm-more",
          type: "button",
          "data-zcf-focus": "older",
          disabled: olderState === "loading",
          onclick: () => loadOlder()
        }, label)));
      }
      return items;
    }
    function friendItems(s, now) {
      const rows = buildFriendsTable({ friends: s.friends, presence: presence.get, threads: s.threads }).rows;
      const items = rows.map((r) => {
        const online = !!(r.presence && r.presence.online);
        const status = longStatusText(r.presence, now);
        return item(["friend", r.id, r.username, r.avatar, !!r.presence, online, status, r.unread, isEnemy2(r.id)], () => rowEl(`row:${r.id}`, () => openChat(r.id, r.username, r.avatar), [
          avatar({ avatar: r.avatar, online: r.presence ? online : void 0, size: 30 }),
          h(
            "div",
            { class: "zcf-row-main" },
            h("div", { class: "zcf-pm-line" }, nameEl(r.id, r.username), pill(r.unread, false)),
            h("div", { class: `zcf-status${online ? " zcf-status-on" : ""}` }, status || " ")
          )
        ]));
      });
      if (!rows.length) items.push(note("No friends yet. Add them on a profile or on the Friends page."));
      items.push(item(["manage"], () => h("button", { class: "zcf-pm-foot", type: "button", "data-zcf-focus": "manage", onclick: () => router.navigate("/friends") }, "Manage friends →")));
      return items;
    }
    function retryItem(onRetry) {
      return item(["retry"], () => h(
        "div",
        { class: "zcf-empty" },
        "Couldn't load. ",
        h("button", { class: "zcf-link zcf-pm-retry", type: "button", "data-zcf-focus": "retry", onclick: onRetry }, "Retry")
      ));
    }
    function factionItems(now) {
      if (faction.status === "idle" || faction.status === "loading") return [note("Loading…")];
      if (faction.status === "none") return [note("You're not in a faction.")];
      if (faction.status === "error") return [retryItem(() => {
        factionPoller.poke();
        factionPoller.start();
      })];
      const rows = buildFactionRows(faction.data, { myId, now });
      if (!rows.length) return [note("No other members.")];
      return rows.map((m) => {
        const status = longStatusText({ online: m.online, active: m.active }, now);
        return item(["member", m.id, m.username, m.avatar, m.online, status, m.level, isEnemy2(m.id)], () => rowEl(`row:${m.id}`, () => openChat(m.id, m.username, m.avatar), [
          avatar({ avatar: m.avatar, online: m.online, size: 30 }),
          h(
            "div",
            { class: "zcf-row-main" },
            h("div", { class: "zcf-pm-line" }, nameEl(m.id, m.username), h("span", { class: "zcf-pm-time" }, m.level ? `Lv ${m.level}` : "")),
            h("div", { class: `zcf-status${m.online ? " zcf-status-on" : ""}` }, status || " ")
          )
        ]));
      });
    }
    function blockedItems() {
      if (blocked.status === "idle" || blocked.status === "loading") return [note("Loading…")];
      if (blocked.status === "error") return [retryItem(() => loadBlocked())];
      const rows = buildBlockedRows(blocked.pages);
      if (!rows.length) return [note("No blocked players.")];
      const items = rows.map((u) => {
        if (unblockId === u.id) {
          return item(["confirm", u.id, u.username, unblockBusy], () => h(
            "div",
            { class: "zcf-row zcf-pm-confirm" },
            h("div", { class: "zcf-row-main" }, `Unblock ${u.username}?`),
            h("button", { class: "zcf-add", type: "button", "data-zcf-focus": `unblock-yes:${u.id}`, disabled: unblockBusy, onclick: () => unblock(u) }, "Unblock"),
            h("button", {
              class: "zcf-mini",
              type: "button",
              "data-zcf-focus": `unblock-no:${u.id}`,
              onclick: () => {
                unblockId = null;
                renderList();
                focusKey(`unblock:${u.id}`);
              }
            }, "Cancel")
          ));
        }
        return item(["blocked", u.id, u.username, u.avatar], () => h(
          "div",
          { class: "zcf-row zcf-pm-blocked" },
          avatar({ avatar: u.avatar, size: 30 }),
          h("div", { class: "zcf-row-main" }, h("div", { class: "zcf-name" }, u.username)),
          h("button", {
            class: "zcf-mini",
            type: "button",
            "data-zcf-focus": `unblock:${u.id}`,
            onclick: () => {
              unblockId = u.id;
              renderList();
              focusKey(`unblock-no:${u.id}`);
            }
          }, "Unblock")
        ));
      });
      if (blocked.loading) items.push(note("Loading…"));
      return items;
    }
    function searchItems(s) {
      if (found.kind !== "results") return [note(found.kind === "error" ? found.text : SEARCH_TEXT[found.kind])];
      if (!found.results.length) return [note("No players found.")];
      return found.results.map((p) => {
        const friend = isFriend(s, p.id);
        return item(["result", p.id, p.username, p.avatar, friend, isEnemy2(p.id)], () => rowEl(`result:${p.id}`, () => {
          openChat(p.id, p.username, p.avatar);
          clearSearch();
        }, [
          avatar({ avatar: p.avatar, size: 30 }),
          h("div", { class: "zcf-row-main" }, nameEl(p.id, p.username), h("div", { class: "zcf-status" }, `#${p.id}`)),
          friend ? h("span", { class: "zcf-done" }, "✓ Friend") : h("button", {
            class: "zcf-add zcf-add-outline",
            type: "button",
            "data-zcf-focus": `add:${p.id}`,
            onclick: (e) => {
              e.stopPropagation();
              if (e.detail > 1) return;
              actions.addFriend(p);
              toast(`${p.username} added to friends`);
            }
          }, "+ Friend")
        ]));
      });
    }
    function focusKey(k) {
      const target = el.querySelector(`[data-zcf-focus="${k}"]`);
      if (target) target.focus();
      return !!target;
    }
    function renderList() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      const s = store.get();
      const now = Date.now();
      const t = tab();
      for (const [k, b] of tabBtns) {
        b.classList.toggle("zcf-pm-tab-on", k === t);
        b.setAttribute("aria-selected", String(k === t));
      }
      let items;
      if (searching()) items = searchItems(s);
      else if (t === "friends") items = friendItems(s, now);
      else if (t === "faction") items = factionItems(now);
      else if (t === "blocked") items = blockedItems();
      else items = chatItems(s, now);
      const view = searching() ? "search" : t;
      const sig = JSON.stringify([view, items.map((i) => i.sig)]);
      if (sig === lastSig) return;
      lastSig = sig;
      const activeKey = list.contains(doc.activeElement) ? doc.activeElement.dataset.zcfFocus : void 0;
      const activeRow = activeKey ? [...list.querySelectorAll(".zcf-row")].findIndex((r) => r.contains(doc.activeElement)) : -1;
      const scrollTop = view === lastView ? list.scrollTop : 0;
      lastView = view;
      clear(list);
      for (const i of items) list.appendChild(i.build());
      list.scrollTop = scrollTop;
      if (activeKey && !focusKey(activeKey) && activeRow >= 0) {
        const rows = list.querySelectorAll(".zcf-row");
        const next = rows[Math.min(activeRow, rows.length - 1)];
        if (next) next.focus();
      }
    }
    function syncLoaders() {
      const open = isOpen();
      const t = tab();
      if (open && t === "faction") factionPoller.start();
      else factionPoller.stop();
      const showBlocked = open && t === "blocked";
      if (showBlocked && !blockedShowing) loadBlocked();
      blockedShowing = showBlocked;
    }
    function syncBadge() {
      rememberPage1();
      const s = store.get();
      setBadge(unreadBadge, chatsUnreadTotal(s, inbox.threads(), settings.get().muted), !s.dock.friendsOpen);
    }
    function update() {
      const open = isOpen();
      el.classList.toggle("chat-minimized", !open);
      el.classList.toggle("zcf-open", open);
      body.hidden = !open;
      titleText.hidden = !open;
      menuBtn.hidden = !open;
      toggle.hidden = !open;
      syncBadge();
      if (open) {
        if (holdRender) renderWanted = true;
        else renderList();
      } else {
        closeMenu();
        unblockId = null;
        if (wasOpen) clearSearch();
      }
      wasOpen = open;
      syncLoaders();
    }
    function scheduleList() {
      if (frame || !isOpen()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (holdRender) {
          renderWanted = true;
          return;
        }
        safe("pm-render", renderList)();
      });
    }
    function destroy() {
      doc.removeEventListener("mousedown", onDocMousedown);
      doc.removeEventListener("pointerup", onPointerRelease, true);
      doc.removeEventListener("pointercancel", onPointerRelease, true);
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      factionPoller.destroy();
      search.cancel();
      closeMenu();
    }
    return { el, update, scheduleList, syncBadge, destroy };
  }

  // src/ui/gif-picker.js
  var KLIPY_KEY = "XnaONUEjqFvkZSqJx0ouuO17Og1kVP1VCiNXYMeQixllGKwC5xzjdshlvoMwGfYa";
  var CLIENT_KEY = "zed-ui";
  var SEARCH_DEBOUNCE_MS = 250;
  var CATEGORIES = [
    { label: "Trending", term: "" },
    { label: "Reactions", term: "reaction meme" },
    { label: "Happy", term: "happy excited" },
    { label: "Love", term: "love heart kiss" },
    { label: "Sad", term: "sad crying" },
    { label: "Angry", term: "angry mad" },
    { label: "Animals", term: "cute animals" },
    { label: "Gaming", term: "gaming reaction" },
    { label: "Memes", term: "meme funny" }
  ];
  function proxied(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname !== "klipy.com" && !u.hostname.endsWith(".klipy.com")) return null;
    return `https://cdn.zed.city/?url=${encodeURIComponent(u.href)}`;
  }
  function normalizeResult(r) {
    const formats = r && typeof r === "object" ? r.media_formats : null;
    if (!formats || typeof formats !== "object") return null;
    const previewRaw = formats.tinygif || formats.nanogif || formats.gif;
    const fullRaw = formats.gif || formats.mediumgif || formats.tinygif;
    if (!previewRaw || !previewRaw.url || !fullRaw || !fullRaw.url) return null;
    const preview = proxied(previewRaw.url);
    const full = proxied(fullRaw.url);
    if (!preview || !full) return null;
    const title = typeof r.content_description === "string" && r.content_description || typeof r.title === "string" && r.title || "";
    return { preview, full, title };
  }
  function createGifPicker({ doc = document, fetchImpl = (...a) => fetch(...a), onPick } = {}) {
    let seq = 0;
    let controller = null;
    let opened = false;
    let lastTerm = "";
    const status = h("div", { class: "zcf-gif-status" });
    const grid = h("div", { class: "zcf-gif-grid" });
    const searchInput = h("input", { class: "zcf-gif-search", type: "text", placeholder: "Search GIFs…", "aria-label": "Search GIFs" });
    const chipsRow = h("div", { class: "zcf-gif-chips" });
    const el = h("div", { class: "zcf-gifpanel", hidden: true }, searchInput, chipsRow, status, grid);
    function clearGrid() {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
    }
    function runQuery(term) {
      lastTerm = term;
      const mySeq = ++seq;
      if (controller) controller.abort();
      controller = new AbortController();
      status.textContent = "Loading…";
      clearGrid();
      const params = new URLSearchParams();
      params.set("key", KLIPY_KEY);
      params.set("client_key", CLIENT_KEY);
      params.set("limit", "24");
      params.set("media_filter", "gif,tinygif");
      params.set("contentfilter", "medium");
      if (term) params.set("q", term);
      const endpoint = term ? "search" : "featured";
      const url = `https://api.klipy.com/v2/${endpoint}?${params.toString()}`;
      let request;
      try {
        request = fetchImpl(url, { credentials: "omit", signal: controller.signal });
      } catch (e) {
        request = Promise.reject(e);
      }
      Promise.resolve(request).then((res) => res.json()).then((data) => {
        if (mySeq !== seq) return;
        const rows = data && Array.isArray(data.results) ? data.results : [];
        const results = rows.map(normalizeResult).filter(Boolean);
        if (!results.length) {
          status.textContent = "No GIFs found.";
          return;
        }
        status.textContent = "";
        for (const r of results) {
          const label = r.title || "GIF";
          const img = h("img", {
            class: "zcf-gif-thumb",
            src: r.preview,
            alt: label,
            title: label,
            loading: "lazy",
            referrerpolicy: "no-referrer"
          });
          img.addEventListener("click", safe("gif-picker-pick", () => {
            onPick({ title: r.title, url: r.full });
            close();
          }));
          grid.appendChild(img);
        }
      }).catch((e) => {
        if (mySeq !== seq) return;
        if (e && e.name === "AbortError") return;
        status.textContent = "Unable to load GIFs right now.";
      });
    }
    const debouncedSearch = debounce(() => {
      for (const btn of chipButtons) btn.classList.remove("zcf-active");
      runQuery(searchInput.value.trim());
    }, SEARCH_DEBOUNCE_MS);
    const chipButtons = CATEGORIES.map((cat, i) => {
      const btn = h("button", { class: `zcf-mini zcf-gif-chip${i === 0 ? " zcf-active" : ""}`, type: "button" }, cat.label);
      btn.addEventListener("click", safe("gif-picker-chip", () => {
        debouncedSearch.cancel();
        for (const b of chipButtons) b.classList.remove("zcf-active");
        btn.classList.add("zcf-active");
        searchInput.value = "";
        runQuery(cat.term);
      }));
      chipsRow.appendChild(btn);
      return btn;
    });
    searchInput.addEventListener("input", safe("gif-picker-search", () => debouncedSearch()));
    const onDocKeydown = safe("gif-picker-keydown", (e) => {
      if (opened && e.key === "Escape") close();
    });
    doc.addEventListener("keydown", onDocKeydown);
    function open() {
      if (opened) return;
      opened = true;
      el.hidden = false;
      runQuery(lastTerm);
    }
    function close() {
      if (!opened) return;
      opened = false;
      el.hidden = true;
      debouncedSearch.cancel();
      if (controller) controller.abort();
    }
    function toggle() {
      if (opened) close();
      else open();
    }
    function destroy() {
      close();
      doc.removeEventListener("keydown", onDocKeydown);
    }
    return { el, open, close, toggle, destroy };
  }

  // src/ui/emoji-picker.js
  function createEmojiPicker({ doc = document, storage, onPick } = {}) {
    const categories = emojiCategories();
    let opened = false;
    let activeKey = "people & body";
    const searchInput = h("input", { class: "zcf-em-search", type: "text", placeholder: "Search emoji…", "aria-label": "Search emoji" });
    const tabsRow = h("div", { class: "zcf-em-tabs" });
    const grid = h("div", { class: "zcf-em-grid" });
    const el = h("div", { class: "zcf-empanel", hidden: true }, searchInput, tabsRow, grid);
    function recentItems() {
      return readGameRecentEmojis(storage).map((name) => findEmoji(name)).filter(Boolean);
    }
    function defaultCategory() {
      return recentItems().length ? "recent" : "people & body";
    }
    function handlePick(item) {
      const picked = item.src ? { name: item.name, src: item.src } : isFlag(item.emoji) ? { name: item.name, emoji: item.emoji, src: flagImageUrl(item.emoji) } : { name: item.name, emoji: item.emoji };
      rememberGameRecentEmoji(storage, item.name);
      onPick(picked);
      close();
    }
    function itemButton(item) {
      const flag2 = typeof item.emoji === "string" && isFlag(item.emoji);
      const btn = h(
        "button",
        { class: "zcf-em-btn", type: "button", title: `:${item.name}:` },
        item.src || flag2 ? h("img", { class: "zcf-em-img", src: item.src || flagImageUrl(item.emoji), alt: "", draggable: "false", loading: "lazy" }) : item.emoji
      );
      btn.addEventListener("click", safe("emoji-picker-pick", () => handlePick(item)));
      return btn;
    }
    function renderGrid() {
      clear(grid);
      const query = searchInput.value.trim();
      const items = query ? searchEmoji(query) : activeKey === "recent" ? recentItems() : (categories.find((c) => c.key === activeKey) || {}).items || [];
      if (!items.length) {
        grid.appendChild(h("div", { class: "zcf-em-empty" }, query ? "No emoji found." : activeKey === "recent" ? "No recent emoji yet." : "No emoji here."));
        return;
      }
      for (const item of items) grid.appendChild(itemButton(item));
    }
    function updateTabs() {
      const searching = !!searchInput.value.trim();
      for (const [key, btn] of tabButtons) btn.classList.toggle("zcf-active", !searching && key === activeKey);
    }
    function selectCategory(key) {
      activeKey = key;
      searchInput.value = "";
      updateTabs();
      renderGrid();
    }
    const tabButtons = /* @__PURE__ */ new Map();
    for (const cat of categories) {
      const iconEl = cat.img ? h("img", { class: "zcf-em-tab-icon", src: cat.img, alt: "" }) : h("i", { class: cat.icon, "aria-hidden": "true" });
      const btn = h("button", { class: "zcf-mini zcf-em-tab", type: "button", title: cat.label, "aria-label": cat.label }, iconEl);
      btn.addEventListener("click", safe("emoji-picker-tab", () => selectCategory(cat.key)));
      tabsRow.appendChild(btn);
      tabButtons.set(cat.key, btn);
    }
    searchInput.addEventListener("input", safe("emoji-picker-search", () => {
      updateTabs();
      renderGrid();
    }));
    const onDocKeydown = safe("emoji-picker-keydown", (e) => {
      if (opened && e.key === "Escape") close();
    });
    doc.addEventListener("keydown", onDocKeydown);
    function open() {
      if (opened) return;
      opened = true;
      el.hidden = false;
      searchInput.value = "";
      activeKey = defaultCategory();
      updateTabs();
      renderGrid();
    }
    function close() {
      if (!opened) return;
      opened = false;
      el.hidden = true;
    }
    function toggle() {
      if (opened) close();
      else open();
    }
    function destroy() {
      close();
      doc.removeEventListener("keydown", onDocKeydown);
    }
    return {
      el,
      open,
      close,
      toggle,
      get isOpen() {
        return opened;
      },
      destroy
    };
  }

  // src/ui/dm-window.js
  var BUSY_TEXT = {
    fight: "Mail is unavailable while you are in a fight.",
    traveling: "Mail is unavailable while you are traveling.",
    exploring: "Mail is unavailable while you are exploring.",
    offline: "Mail is unavailable while the game is offline."
  };
  function createDmWindow(services, userId) {
    const { store, actions, conversations, presence, router, myId, myName, fetchImpl, storage } = services;
    const isEnemy2 = services.isEnemy || (() => false);
    const isMuted2 = services.isMuted || (() => false);
    const conv = conversations.acquire(userId);
    let renderedKeys = [];
    let atBottom = true;
    let unreadAtOpen = 0;
    let newFrom = null;
    let showNewLine = false;
    let wasOpen = false;
    const avatarSlot = h("span", { class: "zcf-dm-avatar" });
    const nameEl = h("span", { class: "zcf-dm-name" });
    const statusEl = h("span", { class: "zcf-dm-status" });
    const unreadBadge = badge();
    const headMark = enemyMark();
    headMark.hidden = true;
    const title = h("div", { class: "chat-title" }, avatarSlot, headMark, nameEl, statusEl, unreadBadge);
    const inboxBtn = h("button", { class: "zcf-hbtn", type: "button", title: "Open in inbox", "aria-label": "Open in inbox" }, icon("external-link-alt"));
    const minBtn = h("button", { class: "zcf-hbtn", type: "button", title: "Minimize", "aria-label": "Minimize" }, icon("minus"));
    const closeBtn = h("button", { class: "zcf-hbtn zcf-close", type: "button", title: "Close", "aria-label": "Close" }, icon("times"));
    const bellIcon = h("i", { class: "fas fa-bell", "aria-hidden": "true" });
    const bellBtn = h("button", { class: "zcf-hbtn zcf-bell", type: "button" }, bellIcon);
    const header = h("div", { class: "chat-header", onclick: () => actions.toggleDm(userId) }, title, bellBtn, inboxBtn, minBtn, closeBtn);
    const notice = h("div", { class: "zcf-notice", hidden: true });
    const loader = h("div", { class: "zcf-loader", hidden: true }, "Loading…");
    const log = h("div", { class: "zcf-log" });
    const pendingEl = h("div", { class: "zcf-pending" });
    const scroller = h("div", { class: "zcf-scroll zcf-zoom" }, loader, log, pendingEl);
    const newChip = h("button", { class: "zcf-newchip", type: "button", hidden: true }, "New messages ↓");
    const input = h("textarea", { class: "zcf-input zcf-compose", rows: 1, placeholder: "Message…", "aria-label": "Message" });
    const emojiBtn = h("button", { class: "zcf-emojibtn", type: "button", title: "Insert an emoji", "aria-label": "Insert an emoji", "aria-expanded": "false" }, h("i", { class: "far fa-smile", "aria-hidden": "true" }));
    const gifBtn = h("button", { class: "zcf-gifbtn", type: "button", title: "Send a GIF", "aria-label": "Send a GIF", "aria-expanded": "false" }, "GIF");
    const sendBtn = h("button", { class: "zcf-send", type: "button" }, "Send");
    const gifPicker = createGifPicker({
      doc: document,
      fetchImpl,
      onPick: ({ title: title2, url }) => {
        gifBtn.setAttribute("aria-expanded", "false");
        if (conv.state.blocked) return;
        atBottom = true;
        conv.send(`![${title2 || "GIF"}](${url})`);
      }
    });
    const emojiPicker = createEmojiPicker({
      doc: document,
      storage,
      onPick: (picked) => {
        emojiBtn.setAttribute("aria-expanded", "false");
        insertAtCaret(picked.src ? `:${picked.name}:` : picked.emoji);
      }
    });
    const composer = h("div", { class: "zcf-composer zcf-zoom" }, input, emojiBtn, gifBtn, sendBtn);
    const body = h("div", { class: "chat-content zcf-body zcf-dm-body" }, notice, scroller, newChip, emojiPicker.el, gifPicker.el, composer);
    const el = h("div", { class: "chat-container zcf zcf-dm", dataset: { zcfDm: String(userId), zcfChat: `dm:${userId}` } }, header, body);
    const syncGifBtn = () => gifBtn.setAttribute("aria-expanded", String(!gifPicker.el.hidden));
    const gifObserver = new MutationObserver(syncGifBtn);
    gifObserver.observe(gifPicker.el, { attributes: true, attributeFilter: ["hidden"] });
    const syncEmojiBtn = () => emojiBtn.setAttribute("aria-expanded", String(!emojiPicker.el.hidden));
    const emojiObserver = new MutationObserver(syncEmojiBtn);
    emojiObserver.observe(emojiPicker.el, { attributes: true, attributeFilter: ["hidden"] });
    function insertAtCaret(text2) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + text2 + input.value.slice(end);
      const pos = start + text2.length;
      input.focus();
      input.selectionStart = input.selectionEnd = pos;
    }
    const stop = (fn) => (e) => {
      e.stopPropagation();
      fn(e);
    };
    nameEl.addEventListener("click", (e) => {
      const entry = store.get().dock.dms.find((d) => d.id === userId);
      if (entry && !entry.open) return;
      e.stopPropagation();
      router.navigate(`/profile/${userId}`);
    });
    bellBtn.addEventListener("click", stop(() => actions.toggleMute(userId)));
    inboxBtn.addEventListener("click", stop(() => router.navigate(`/mail/${userId}`)));
    minBtn.addEventListener("click", stop(() => actions.minimizeDm(userId)));
    closeBtn.addEventListener("click", stop(() => actions.closeDm(userId)));
    newChip.addEventListener("click", () => scrollToBottom());
    sendBtn.addEventListener("click", () => submit());
    gifBtn.addEventListener("click", () => {
      emojiPicker.close();
      syncEmojiBtn();
      gifPicker.toggle();
      syncGifBtn();
    });
    emojiBtn.addEventListener("click", () => {
      gifPicker.close();
      syncGifBtn();
      emojiPicker.toggle();
      syncEmojiBtn();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    input.addEventListener("focus", () => actions.setActiveDm(userId));
    body.addEventListener("mousedown", () => actions.setActiveDm(userId));
    scroller.addEventListener("scroll", () => {
      atBottom = isAtBottom();
      if (atBottom) newChip.hidden = true;
      if (scroller.scrollTop < 40 && conv.state.hasMore && !conv.state.loadingOlder) conv.loadOlder();
    });
    const unsubscribe = conv.subscribe(() => renderConversation());
    function isAtBottom() {
      return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
    }
    function scrollToBottom() {
      scroller.scrollTop = scroller.scrollHeight;
      atBottom = true;
      newChip.hidden = true;
    }
    function submit() {
      if (!input.value.trim() || conv.state.blocked) return;
      const text2 = input.value;
      input.value = "";
      atBottom = true;
      newFrom = null;
      conv.send(text2);
    }
    function displayName() {
      const s = store.get();
      const entry = s.dock.dms.find((d) => d.id === userId);
      return conv.state.info && conv.state.info.username || s.friends[userId] && s.friends[userId].username || entry && entry.username || `#${userId}`;
    }
    function avatarPath() {
      const s = store.get();
      const entry = s.dock.dms.find((d) => d.id === userId);
      return conv.state.info && conv.state.info.avatar || s.friends[userId] && s.friends[userId].avatar || entry && entry.avatar || null;
    }
    function renderGif(part) {
      const img = h("img", { class: "zcf-gif", src: part.src, alt: part.alt, title: part.alt, loading: "lazy", referrerpolicy: "no-referrer" });
      img.addEventListener("load", () => {
        if (atBottom) scrollToBottom();
      });
      img.addEventListener("error", () => img.replaceWith(document.createTextNode(part.alt)));
      return img;
    }
    function renderEmoji(part) {
      const alt = `:${part.name}:`;
      const img = h("img", { class: "zcf-emoji", src: part.src, alt, title: alt, draggable: "false", loading: "lazy" });
      img.addEventListener("error", () => img.replaceWith(document.createTextNode(alt)));
      return img;
    }
    function renderText(text2) {
      return messageParts(text2).map((part) => {
        if (part.type === "image") return renderGif(part);
        if (part.type === "emoji") return renderEmoji(part);
        return document.createTextNode(part.text);
      });
    }
    function renderItem(item) {
      if (item.type === "divider") return h("div", { class: "zcf-divider" }, item.label);
      if (item.type === "new") return h("div", { class: "zcf-new-line" }, "New");
      const m = item.msg;
      const cls = `zcf-msg${item.grouped ? " zcf-grouped" : ""}${m.isSystem ? " zcf-system" : ""}`;
      const time = m.ts ? formatMessageTime(m.ts, Date.now()) : "";
      if (item.grouped) return h("div", { class: cls, "data-zcf-ts": m.ts || null }, h("div", { class: "zcf-text" }, ...renderText(m.text)));
      const mine = m.senderId === myId;
      const sender = mine ? h("span", { class: "zcf-sender" }, myName) : h("span", { class: "zcf-sender zcf-them", onclick: () => router.navigate(`/profile/${userId}`) }, enemyMark(), displayName());
      return h("div", { class: cls }, sender, h("span", { class: "zcf-time", "data-zcf-ts": m.ts || null }, time), h("div", { class: "zcf-text" }, ...renderText(m.text)));
    }
    function renderPending() {
      clear(pendingEl);
      for (const p of conv.pending()) {
        pendingEl.appendChild(h(
          "div",
          { class: `zcf-msg zcf-pending-msg${p.error ? " zcf-failed" : ""}` },
          h("div", { class: "zcf-text" }, ...renderText(p.text)),
          p.error ? h("div", { class: "zcf-error" }, "Failed to send · ", h("button", { class: "zcf-link", type: "button", onclick: () => conv.retry(p.localId) }, "Retry")) : null
        ));
      }
    }
    function renderNotice() {
      const text2 = conv.state.blocked ? "You can't message this player." : conv.state.busy ? BUSY_TEXT[conv.state.busy] || "Mail is unavailable right now." : "";
      notice.textContent = text2;
      notice.hidden = !text2;
      input.disabled = conv.state.blocked;
      sendBtn.disabled = conv.state.blocked || !!conv.state.busy;
      gifBtn.disabled = conv.state.blocked || !!conv.state.busy;
      emojiBtn.disabled = conv.state.blocked || !!conv.state.busy;
    }
    function renderConversation() {
      renderNotice();
      loader.hidden = !(conv.state.loading || conv.state.loadingOlder);
      placeNewLine();
      const items = buildLog(conv.messages(), { newFrom });
      const keys = items.map((i) => i.key);
      const isAppend = renderedKeys.length > 0 && keys.length >= renderedKeys.length && renderedKeys.every((k, i) => keys[i] === k);
      const prepended = !isAppend && renderedKeys.length > 0 && keys[keys.length - 1] === renderedKeys[renderedKeys.length - 1];
      const grew = keys.length > renderedKeys.length;
      const prevHeight = scroller.scrollHeight;
      const prevTop = scroller.scrollTop;
      if (isAppend) {
        for (const item of items.slice(renderedKeys.length)) log.appendChild(renderItem(item));
      } else if (keys.join() !== renderedKeys.join()) {
        clear(log);
        for (const item of items) log.appendChild(renderItem(item));
      }
      renderedKeys = keys;
      renderPending();
      if (atBottom) {
        scrollToBottom();
        if (showNewLine) revealNewLine();
        if (conv.trim()) return;
      } else if (prepended) {
        scroller.scrollTop = prevTop + (scroller.scrollHeight - prevHeight);
      } else if (grew) {
        newChip.hidden = false;
      }
    }
    function placeNewLine() {
      if (!unreadAtOpen || !conv.state.loaded) return;
      const theirs = conv.messages().filter((m) => m.senderId !== myId).sort((a, b) => a.id - b.id);
      const first = theirs[Math.max(0, theirs.length - unreadAtOpen)];
      unreadAtOpen = 0;
      newFrom = first ? first.id : null;
      showNewLine = !!first;
    }
    function revealNewLine() {
      showNewLine = false;
      const line = log.querySelector(".zcf-new-line");
      if (!line) return;
      const off = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      if (off >= 0) return;
      scroller.scrollTop += off - 8;
      atBottom = isAtBottom();
    }
    function update() {
      const s = store.get();
      const entry = s.dock.dms.find((d) => d.id === userId);
      if (!entry) return;
      const open = !!entry.open;
      el.classList.toggle("chat-minimized", !open);
      el.classList.toggle("zcf-open", open);
      body.hidden = !open;
      statusEl.hidden = !open;
      inboxBtn.hidden = !open;
      minBtn.hidden = !open;
      bellBtn.hidden = !open;
      const p = presence.get(userId);
      clear(avatarSlot).appendChild(avatar({ avatar: avatarPath(), online: p ? p.online : void 0, size: open ? 18 : 24 }));
      nameEl.textContent = displayName();
      nameEl.title = displayName();
      const enemy = isEnemy2(userId);
      headMark.hidden = !enemy;
      el.classList.toggle("zcf-enemy", enemy);
      const muted = isMuted2(userId);
      bellIcon.className = `fas ${muted ? "fa-bell-slash" : "fa-bell"}`;
      bellBtn.title = `${muted ? "Unmute" : "Mute"} ${displayName()}`;
      bellBtn.setAttribute("aria-label", bellBtn.title);
      bellBtn.setAttribute("aria-pressed", String(muted));
      statusEl.textContent = statusText(p);
      statusEl.classList.toggle("zcf-status-on", !!(p && p.online));
      el.title = open ? "" : displayName();
      const unread = s.threads[userId] && s.threads[userId].unread || 0;
      setBadge(unreadBadge, unread, !open);
      if (open && !wasOpen) {
        unreadAtOpen = unread;
        newFrom = null;
        conv.ensureLoaded();
        atBottom = true;
        renderConversation();
      }
      if (!open) {
        unreadAtOpen = 0;
        newFrom = null;
        gifPicker.close();
        syncGifBtn();
        emojiPicker.close();
        syncEmojiBtn();
      }
      wasOpen = open;
    }
    return {
      el,
      update,
      destroy() {
        unsubscribe();
        conversations.release(userId);
        gifObserver.disconnect();
        gifPicker.destroy();
        emojiObserver.disconnect();
        emojiPicker.destroy();
      }
    };
  }

  // src/ui/chat-custom/registry.js
  var info = (key, el) => ({
    key,
    el,
    header: el.querySelector(":scope > .chat-header"),
    minimized: el.classList.contains("chat-minimized")
  });
  function findChats(doc = document) {
    const dock = doc.querySelector(".chat-containers");
    if (!dock) return [];
    const out = [];
    for (const g of GAME_CHATS) {
      const el = dock.querySelector(`:scope > .chat-container.${g.cls}`);
      if (el) out.push(info(g.key, el));
    }
    for (const el of dock.querySelectorAll(".chat-container[data-zcf-chat]")) out.push(info(el.dataset.zcfChat, el));
    return out;
  }

  // src/whats-new.js
  var WHATS_NEW = [
    {
      version: "0.6.0",
      date: "2026-09-29",
      features: [
        {
          title: "Never miss a message",
          points: [
            "Optional desktop notifications for new private messages (Chat settings), with a Friends only switch. With the game open in two tabs, only one of them speaks up.",
            "The browser tab's title shows your unread count, like (2) Zed City. You can turn it off in Chat settings."
          ]
        },
        { title: "Pinned chats", points: ["Pin conversations to the top of the Chats tab with the pin on each row."] },
        { title: "Phones", points: ["An open chat gets the full width, with every bubble on a row underneath."] },
        {
          title: "Chats",
          points: [
            "Hover (or tap) any chat time, in DMs and in the game's own chats, to see it in the other clock: your time or game time.",
            'Opening a DM with unread messages puts a "New" line above the first one.',
            "Moved chats that overlap: the one you click comes to the front."
          ]
        },
        { title: "Fixes", points: ["Smaller fixes for unblocking, the Faction tab, sounds, tablets and keyboard focus."] }
      ]
    },
    {
      version: "0.5.x",
      date: "2026-09-29",
      features: [
        {
          title: "Private Messages",
          points: [
            "The dock window is now Private Messages, with Chats, Friends, Faction and Blocked tabs.",
            "Search any player by name to start a chat. Older chats load as you scroll."
          ]
        },
        {
          title: "Enemies",
          points: [
            "An Enemies list beside Friends, with private notes, and Add Enemy on profiles.",
            "A red skull marks enemies in chats, including the game's Global, Faction and Activity."
          ]
        },
        {
          title: "Customize any chat",
          points: [
            "Unlock a chat with its padlock to drag it anywhere, resize it from its edges, then lock it there.",
            "Each chat keeps its own size, message size and spot. Right-click a padlock for its menu."
          ]
        },
        {
          title: "Chat settings and sounds",
          points: [
            "The cog in the corner: mark all as read, close all private chats, and reset any chat.",
            "An optional sound for new private messages."
          ]
        },
        {
          title: "Mute a conversation",
          points: ["The bell in a DM header stops its pop-ups, sound and green count."]
        }
      ]
    },
    {
      version: "0.4.x",
      date: "2026-09-29",
      features: [
        { title: "Friends page", points: ["A full Friends page from the top-bar icon, with level, status and faction.", "Private notes on friends."] },
        { title: "Quieter dock", points: ["A plain top-bar icon, and a green unread count on the minimized window."] }
      ]
    },
    {
      version: "0.3.x",
      date: "2026-09-28",
      features: [
        { title: "Emoji picker", points: ["Pick emoji in DMs, Zed City ones included."] },
        { title: "Fixes", points: ["DM windows are no longer cut off at the bottom."] }
      ]
    },
    {
      version: "0.2.x",
      date: "2026-09-28",
      features: [
        { title: "GIFs", points: ["Send and see GIFs in DMs."] },
        { title: "Install link", points: ["One install link, with automatic updates."] }
      ]
    },
    {
      version: "0.1.x",
      date: "2026-09-28",
      features: [
        { title: "Friends and DMs", points: ["A friends list, DM windows in the chat dock, and Add Friend on profiles."] }
      ]
    }
  ];

  // src/version.js
  var VERSION = true ? "0.6.0" : "dev";
  var DEV_PROFILE_ID = 27581;

  // src/ui/settings-window.js
  var SOUND_LABELS = { off: "Off", chirp: "Chirp", ping: "Ping", bell: "Bell" };
  var ORDER = (key) => key.startsWith("game:") ? 0 : key === "pm" ? 1 : key === "settings" ? 2 : 3;
  function createSettingsWindow(services, { doc = document } = {}) {
    const { store, settings, actions, sound, router } = services;
    let marking = null;
    let showNews = false;
    let showOlder = false;
    let lastSig = null;
    const titleText = h("span", null, "Chat settings");
    const title = h("div", { class: "chat-title" }, h("i", { class: "fas fa-cog chat-icon", "aria-hidden": "true" }), titleText);
    const toggle = h("div", { class: "chat-toggle", "aria-hidden": "true" }, icon("chevron-down"));
    const header = h("div", { class: "chat-header", onclick: () => actions.toggleSettings() }, title, toggle);
    const content = h("div", { class: "zcf-set zcf-zoom" });
    const body = h("div", { class: "chat-content zcf-body" }, content);
    const el = h("div", { class: "chat-container zcf zcf-settings", dataset: { zcfChat: "settings" } }, header, body);
    const select = h(
      "select",
      { class: "zcf-set-select", "aria-label": "New private message sound", "data-zcf-focus": "sound" },
      SOUNDS.map((k) => h("option", { value: k }, SOUND_LABELS[k]))
    );
    const play = h("button", { class: "zcf-mini zcf-set-play", type: "button", title: "Play it", "aria-label": "Play the sound", "data-zcf-focus": "play" }, "▶");
    select.addEventListener("change", () => actions.setSound(select.value));
    play.addEventListener("click", () => sound.play(select.value, { fromUser: true }));
    const checkbox = (label, focusKey, onChange) => {
      const input = h("input", { type: "checkbox", class: "zcf-set-check", "data-zcf-focus": focusKey });
      input.addEventListener("change", () => onChange(input.checked));
      return { input, row: h("label", { class: "zcf-set-toggle" }, input, h("span", null, label)) };
    };
    const notifyBox = checkbox("Desktop notifications", "notify", (on) => actions.setNotify(on));
    const friendsOnlyBox = checkbox("Friends only", "notify-friends", (on) => actions.setNotifyFriendsOnly(on));
    const titleBox = checkbox("Unread count in the browser tab", "title-count", (on) => actions.setTitleCount(on));
    const note = h("div", { class: "zcf-set-note" });
    function permissionNote() {
      const n = services.notifier;
      if (!n || !n.supported) return "Not supported in this browser.";
      return n.permission() === "denied" ? "Notifications are blocked for zed.city in your browser's site settings." : "";
    }
    function dmName(id) {
      const s = store.get();
      const d = s.dock.dms.find((x) => x.id === id);
      return d && d.username || s.friends[id] && s.friends[id].username || null;
    }
    function chatRows() {
      const saved = settings.get().chats;
      const keys = /* @__PURE__ */ new Set(["pm", "settings"]);
      for (const c of findChats(doc)) keys.add(c.key);
      for (const d of store.get().dock.dms) keys.add(dmKey(d.id));
      for (const k of Object.keys(saved)) keys.add(k);
      return [...keys].sort((a, b) => ORDER(a) - ORDER(b) || a.localeCompare(b)).map((key) => {
        const id = dmIdOf(key);
        return { key, name: chatLabel(key, id ? dmName(id) : null), entry: saved[key] };
      });
    }
    const section = (label, ...children) => h("div", { class: "zcf-set-sec" }, h("div", { class: "zcf-set-h" }, label), children);
    const disclosure = (label, open, focusKey, onToggle) => h("button", {
      class: "zcf-news-toggle",
      type: "button",
      "aria-expanded": String(open),
      "data-zcf-focus": focusKey,
      onclick: onToggle
    }, label, " ", open ? "▾" : "▸");
    const versionBlock = (v) => h(
      "div",
      { class: "zcf-news-ver" },
      h("div", { class: "zcf-news-vh" }, `v${v.version}`, h("span", { class: "zcf-news-date" }, v.date)),
      v.features.map((f) => h("div", { class: "zcf-news-f" }, h("div", { class: "zcf-news-ft" }, f.title), h("ul", null, f.points.map((p) => h("li", null, p)))))
    );
    function whatsNew() {
      const [latest, ...older] = WHATS_NEW;
      return h(
        "div",
        { class: "zcf-news" },
        disclosure(`What's new in v${latest.version}`, showNews, "news", () => {
          showNews = !showNews;
          render();
        }),
        showNews ? versionBlock(latest) : null,
        showNews && older.length ? disclosure("Earlier versions", showOlder, "older", () => {
          showOlder = !showOlder;
          render();
        }) : null,
        showNews && showOlder ? older.map(versionBlock) : null
      );
    }
    function devLink() {
      if (!DEV_PROFILE_ID) return null;
      const href = `/profile/${DEV_PROFILE_ID}`;
      return h("a", {
        class: "zcf-set-dev",
        href,
        "data-zcf-focus": "dev",
        onclick: (e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          router.navigate(href);
        }
      }, h("i", { class: "fas fa-user-plus", "aria-hidden": "true" }), " Become friends or enemies with the dev!");
    }
    async function markAll() {
      if (marking) return;
      marking = { done: 0, total: 0 };
      render();
      try {
        await actions.markAllRead((done, total) => {
          marking = { done, total };
          render();
        });
      } finally {
        marking = null;
        render();
      }
    }
    function build(rows) {
      const s = settings.get();
      return [
        section("Utilities", h(
          "div",
          { class: "zcf-set-btns" },
          h(
            "button",
            { class: "zcf-page-btn", type: "button", "data-zcf-focus": "mark", disabled: !!marking, onclick: markAll },
            marking ? `Marking… ${marking.done}/${marking.total}` : "Mark all as read"
          ),
          h("button", { class: "zcf-page-btn", type: "button", "data-zcf-focus": "closeall", onclick: () => actions.closeAllDms() }, "Close all private chats")
        )),
        section(
          "Your chats",
          rows.map((r) => h(
            "div",
            { class: "zcf-set-chat" },
            h("i", {
              class: `fas ${isLocked(r.entry) ? "fa-lock" : "fa-lock-open"} zcf-set-lock`,
              role: "img",
              title: isLocked(r.entry) ? "Locked" : "Unlocked",
              "aria-label": isLocked(r.entry) ? "Locked" : "Unlocked"
            }),
            h("div", { class: "zcf-row-main" }, h("div", { class: "zcf-name" }, r.name), h("div", { class: "zcf-status" }, describeChat(r.entry))),
            h("button", { class: "zcf-mini", type: "button", "data-zcf-focus": `reset:${r.key}`, disabled: !r.entry, onclick: () => actions.resetChat(r.key) }, "Reset")
          )),
          h("button", { class: "zcf-page-btn zcf-set-all", type: "button", "data-zcf-focus": "resetall", disabled: !Object.keys(s.chats).length, onclick: () => actions.resetAllChats() }, "Reset all chats")
        ),
        section("Notifications", notifyBox.row, h("div", { class: "zcf-set-sub" }, friendsOnlyBox.row), note, titleBox.row),
        section("Sounds", h("label", { class: "zcf-set-sound" }, h("span", null, "New private message"), select, play)),
        section("About", h("div", { class: "zcf-set-about" }, `Zed City Friends v${VERSION}`), whatsNew(), devLink())
      ];
    }
    function render() {
      if (!store.get().dock.settingsOpen) return;
      const s = settings.get();
      select.value = s.sound;
      play.disabled = s.sound === "off";
      const blocked = permissionNote();
      notifyBox.input.checked = s.notify;
      notifyBox.input.disabled = !(services.notifier && services.notifier.supported);
      friendsOnlyBox.input.checked = s.notifyFriendsOnly;
      friendsOnlyBox.input.disabled = !s.notify;
      titleBox.input.checked = s.titleCount;
      note.textContent = blocked;
      note.hidden = !blocked;
      const rows = chatRows();
      const sig = JSON.stringify([rows, marking, showNews, showOlder, Object.keys(s.chats).length]);
      if (sig === lastSig) return;
      lastSig = sig;
      const focusKey = content.contains(doc.activeElement) && doc.activeElement.dataset ? doc.activeElement.dataset.zcfFocus : void 0;
      const scrollTop = body.scrollTop;
      clear(content);
      for (const node of build(rows)) content.appendChild(node);
      body.scrollTop = scrollTop;
      if (focusKey) {
        const target = content.querySelector(`[data-zcf-focus="${focusKey}"]`);
        if (target) target.focus();
      }
    }
    function update() {
      const open = !!store.get().dock.settingsOpen;
      el.classList.toggle("chat-minimized", !open);
      el.classList.toggle("zcf-open", open);
      body.hidden = !open;
      titleText.hidden = !open;
      toggle.hidden = !open;
      el.title = open ? "" : "Chat settings";
      if (open) render();
      else lastSig = null;
    }
    return {
      el,
      update,
      destroy() {
        clear(content);
      }
    };
  }

  // src/ui/dock-view.js
  var SMALL_MAX_DMS = 2;
  function visibleDms(dms, small) {
    if (!small || dms.length <= SMALL_MAX_DMS) return dms;
    const keep = new Set(dms.filter((d) => d.open).map((d) => d.id));
    for (const d of dms.slice().sort((a, b) => b.lastUsed - a.lastUsed)) {
      if (keep.size >= SMALL_MAX_DMS) break;
      keep.add(d.id);
    }
    return dms.filter((d) => keep.has(d.id));
  }
  function createDockView({ root, services }) {
    const pm = createPmWindow(services);
    const settingsWin = createSettingsWindow(services);
    const dms = /* @__PURE__ */ new Map();
    function render() {
      const s = services.store.get();
      const entries = visibleDms(s.dock.dms, services.isSmall());
      const wanted = new Set(entries.map((e) => e.id));
      for (const [id, w] of dms) {
        if (!wanted.has(id)) {
          w.destroy();
          w.el.remove();
          dms.delete(id);
        }
      }
      for (const e of entries) if (!dms.has(e.id)) dms.set(e.id, createDmWindow(services, e.id));
      const desired = [...entries.map((e) => dms.get(e.id).el), pm.el, settingsWin.el];
      desired.forEach((node, i) => {
        if (root.children[i] !== node) root.insertBefore(node, root.children[i] || null);
      });
      for (const w of dms.values()) w.update();
      pm.update();
      settingsWin.update();
    }
    return {
      render,
      pm,
      settings: settingsWin,
      dmWindow: (id) => dms.get(id) || null,
      // Stops every window's timers and document listeners (the Faction poller among them).
      destroy() {
        for (const w of dms.values()) w.destroy();
        dms.clear();
        pm.destroy();
        settingsWin.destroy();
      }
    };
  }

  // src/ui/toast.js
  function createToaster(doc = document) {
    let host = null;
    return function toast(text2, { error = false, ms = 3500 } = {}) {
      if (!host || !host.isConnected) {
        host = h("div", { class: "zcf-toasts", role: "status", "aria-live": "polite" });
        doc.body.appendChild(host);
      }
      const el = h("div", { class: `zcf-toast${error ? " zcf-toast-error" : ""}` }, text2);
      host.appendChild(el);
      setTimeout(() => el.remove(), ms);
    };
  }

  // src/ui/profile-button.js
  var PROFILE_PATH = /^\/profile\/(\d+)\/?$/;
  var CONFIRM_MS = 4e3;
  var FRIEND_BUTTON = {
    key: "friend",
    label: "Add Friend",
    onLabel: "Friends",
    icon: "fa-user-plus",
    onIcon: "fa-user-check",
    onClass: "zcf-is-friend",
    addTitle: "Add to your friends list",
    removeTitle: "Click to remove from friends",
    added: (name) => `${name} added to friends`
  };
  var ENEMY_BUTTON = {
    key: "enemy",
    label: "Add Enemy",
    onLabel: "Enemy",
    icon: "fa-skull",
    onIcon: "fa-skull",
    onClass: "zcf-is-enemy",
    addTitle: "Add to your enemies list",
    removeTitle: "Click to remove from enemies",
    added: (name) => `${name} added to enemies`
  };
  function createProfileButton({
    doc = document,
    win = window,
    spec = FRIEND_BUTTON,
    store,
    actions,
    isOn = (id) => isFriend(store.get(), id),
    add = (p) => actions.addFriend(p),
    remove = (id) => actions.removeFriend(id),
    players,
    toast,
    after = null,
    myId = null
    // your own profile never gets a button
  }) {
    let profileId = null;
    let wrap = null;
    let button = null;
    let label = null;
    let iconEl = null;
    let confirming = false;
    let confirmTimer = null;
    let observer = null;
    let frame = 0;
    let warnTimer = null;
    function findButton(iconClass, labelRe) {
      for (const btn of doc.querySelectorAll(".q-btn.q-btn--outline")) {
        if (btn.closest(".zcf-profile-btn")) continue;
        if (btn.querySelector(`.${iconClass}`) && labelRe.test(btn.textContent.trim())) return btn;
      }
      return null;
    }
    function setIcon(name) {
      if (!iconEl) return;
      for (const c of [...iconEl.classList]) if (/^fa-/.test(c)) iconEl.classList.remove(c);
      iconEl.classList.add(name);
    }
    function refresh() {
      if (!button || !button.isConnected || profileId === null) return;
      const on = isOn(profileId);
      setIcon(on ? spec.onIcon : spec.icon);
      label.textContent = on ? confirming ? "Remove?" : spec.onLabel : spec.label;
      button.classList.toggle(spec.onClass, on);
      button.classList.toggle("text-grey-4", !on);
      button.title = on ? spec.removeTitle : spec.addTitle;
    }
    async function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const id = profileId;
      if (id === null) return;
      if (isOn(id)) {
        if (confirming) {
          confirming = false;
          clearTimeout(confirmTimer);
          remove(id);
        } else {
          confirming = true;
          confirmTimer = setTimeout(() => {
            confirming = false;
            refresh();
          }, CONFIRM_MS);
        }
        refresh();
        return;
      }
      const r = await players.get(id);
      const data = r.ok && r.data ? r.data : {};
      const username = typeof data.username === "string" && data.username ? data.username : `#${id}`;
      add({ id, username, avatar: typeof data.avatar === "string" ? data.avatar : null });
      toast(spec.added(username));
    }
    function tryInsert() {
      if (profileId === null || profileId === myId) return true;
      if (wrap && wrap.isConnected) return true;
      if (findButton("fa-cog", /^settings$/i)) return false;
      const mail = findButton("fa-envelope", /^mail$/i);
      const trade = findButton("fa-exchange", /^trade$/i);
      const block = findButton("fa-ban", /^(un)?block$/i);
      const template = mail || block;
      if (!template || !template.parentElement) return false;
      const prev = after ? after() : null;
      if (after && !(prev && prev.isConnected)) return false;
      wrap = template.parentElement.cloneNode(true);
      wrap.classList.add("zcf-profile-btn", `zcf-profile-btn-${spec.key}`);
      button = wrap.querySelector(".q-btn");
      button.removeAttribute("href");
      button.removeAttribute("to");
      for (const c of [...button.classList]) if (/^text-/.test(c)) button.classList.remove(c);
      button.classList.add("text-grey-4");
      iconEl = button.querySelector("i");
      label = button.querySelector(".block") || button.querySelector(".q-btn__content span:last-child");
      if (!label) {
        label = doc.createElement("span");
        label.className = "block";
        button.querySelector(".q-btn__content").appendChild(label);
      }
      button.addEventListener("click", safe(`profile-button-click-${spec.key}`, onClick));
      if (prev) prev.after(wrap);
      else if (mail && trade) trade.parentElement.after(wrap);
      else if (mail) mail.parentElement.before(wrap);
      else block.parentElement.after(wrap);
      confirming = false;
      refresh();
      return true;
    }
    function stopWatching() {
      if (observer) observer.disconnect();
      observer = null;
      clearTimeout(warnTimer);
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
    }
    function onRoute(path) {
      stopWatching();
      if (wrap) wrap.remove();
      wrap = null;
      button = null;
      const m = PROFILE_PATH.exec(path);
      profileId = m ? Number(m[1]) : null;
      if (profileId === null || profileId === myId) return;
      tryInsert();
      observer = new win.MutationObserver(() => {
        if (frame || wrap && wrap.isConnected) return;
        frame = win.requestAnimationFrame(() => {
          frame = 0;
          safe("profile-button-insert", tryInsert)();
        });
      });
      observer.observe(doc.body, { childList: true, subtree: true });
      warnTimer = setTimeout(() => {
        if (!wrap && !findButton("fa-cog", /^settings$/i)) warnOnce(`profile-buttons-not-found-${spec.key}`, path);
      }, 1e4);
    }
    function destroy() {
      stopWatching();
      clearTimeout(confirmTimer);
      if (wrap) wrap.remove();
      wrap = null;
      button = null;
      profileId = null;
    }
    return {
      onRoute,
      refresh,
      tryInsert,
      destroy,
      get wrap() {
        return wrap;
      }
    };
  }

  // src/ui/enemy-marks.js
  var ROW = ".msg-cont";
  var MAX_PENDING = 500;
  function createEnemyMarks({ doc = document, win = window, keeper = null, names }) {
    let dockEl = null;
    let observer = null;
    let frame = 0;
    let pending = [];
    let rescanWanted = false;
    let handled = /* @__PURE__ */ new WeakSet();
    let unkeep = null;
    const isGameRow = (row) => !row.closest(".zcf-root");
    function markRow(row, set) {
      const sender = row.querySelector(".sender-name");
      if (!sender || !sender.parentNode) return;
      const prev = sender.previousElementSibling;
      const has = !!(prev && prev.classList.contains("zcf-enemy-mark"));
      const want = set.has(sender.textContent.trim().toLowerCase());
      if (want && !has) sender.parentNode.insertBefore(enemyMark(), sender);
      else if (!want && has) prev.remove();
    }
    function rowsIn(node) {
      if (node.nodeType !== 1) return [];
      if (node.matches(ROW)) return [node];
      return [...node.querySelectorAll(ROW)];
    }
    function flushPending() {
      frame = 0;
      if (rescanWanted) {
        rescanWanted = false;
        pending = [];
        refresh();
        return;
      }
      const set = names();
      const nodes = pending;
      pending = [];
      for (const node of nodes) {
        if (!node.isConnected) continue;
        for (const row of rowsIn(node)) {
          if (handled.has(row) || !isGameRow(row)) continue;
          handled.add(row);
          markRow(row, set);
        }
      }
    }
    function onMutations(records) {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && !n.classList.contains("zcf-enemy-mark")) pending.push(n);
        }
      }
      if (pending.length > MAX_PENDING) {
        pending = [];
        rescanWanted = true;
      }
      if ((pending.length || rescanWanted) && !frame) frame = win.requestAnimationFrame(safe("enemy-marks", flushPending));
    }
    function refresh() {
      if (!dockEl) return;
      const set = names();
      for (const row of dockEl.querySelectorAll(ROW)) {
        if (!isGameRow(row)) continue;
        handled.add(row);
        markRow(row, set);
      }
    }
    function ensure() {
      const found = doc.querySelector(".chat-containers");
      if (found === dockEl) return;
      if (observer) observer.disconnect();
      observer = null;
      dockEl = found;
      handled = /* @__PURE__ */ new WeakSet();
      if (!dockEl) return;
      observer = new win.MutationObserver(safe("enemy-marks-observer", onMutations));
      observer.observe(dockEl, { childList: true, subtree: true });
      refresh();
    }
    return {
      start() {
        ensure();
        if (keeper && !unkeep) unkeep = keeper.add({ name: "enemy-marks", attached: () => !!(dockEl && dockEl.isConnected), ensure });
      },
      refresh,
      destroy() {
        if (unkeep) unkeep();
        unkeep = null;
        if (observer) observer.disconnect();
        observer = null;
        if (frame) win.cancelAnimationFrame(frame);
        frame = 0;
        dockEl = null;
      }
    };
  }

  // src/ui/add-friend-popover.js
  var MESSAGES = { idle: "", short: "Keep typing…", searching: "Searching…" };
  function createAddFriendPopover({ players, isAdded, onAdd, onClose, title = "Add friend", doneText = "✓ Friend" }) {
    let results = [];
    let done = doneText;
    const input = h("input", { class: "zcf-input", type: "text", placeholder: "Name or player ID", "aria-label": "Find a player" });
    const list = h("div", { class: "zcf-results" });
    const titleEl = h("div", { class: "zcf-pop-title" }, title);
    const el = h("div", { class: "zcf-pop", hidden: true }, titleEl, input, list);
    function message(text2) {
      clear(list);
      if (text2) list.appendChild(h("div", { class: "zcf-empty" }, text2));
    }
    function row(p) {
      const action = isAdded(p.id) ? h("span", { class: "zcf-done" }, done) : h("button", {
        class: "zcf-add",
        type: "button",
        onclick: (e) => {
          e.stopPropagation();
          onAdd(p);
          render();
          input.focus();
        }
      }, "Add");
      return h(
        "div",
        { class: "zcf-result" },
        avatar({ avatar: p.avatar, size: 22 }),
        h("div", { class: "zcf-row-main" }, h("div", { class: "zcf-name" }, p.username), h("div", { class: "zcf-status" }, `#${p.id}`)),
        action
      );
    }
    function render() {
      if (!results.length) {
        message("No players found.");
        return;
      }
      clear(list);
      for (const p of results) list.appendChild(row(p));
    }
    const search = createPlayerSearch({
      players,
      onState(st) {
        if (st.kind === "results") {
          results = st.results;
          render();
          return;
        }
        results = [];
        message(st.kind === "error" ? st.text : MESSAGES[st.kind]);
      }
    });
    input.addEventListener("input", () => search.set(input.value));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }, true);
    function open() {
      el.hidden = false;
      input.value = "";
      results = [];
      message("");
      input.focus();
    }
    function close() {
      el.hidden = true;
      search.cancel();
      if (onClose) onClose();
    }
    return {
      el,
      input,
      open,
      close,
      get isOpen() {
        return !el.hidden;
      },
      // Re-draw "Add" / "✓ Friend" after the list changes elsewhere.
      refresh() {
        if (!el.hidden && results.length) render();
      },
      setLabels({ title: t, doneText: d }) {
        titleEl.textContent = t;
        done = d;
        if (!el.hidden && results.length) render();
      }
    };
  }

  // src/ui/friends-page.js
  var FRIENDS_PATH = "/friends";
  var ENEMIES_PATH = "/enemies";
  var PAGE_CLASS = "zcf-on-friends";
  var HIDE_404_CSS = `html.${PAGE_CLASS} .q-page-container > .fixed-center{display:none!important}`;
  var WARN_MS = 1e4;
  var LEAVE_MS = 1e3;
  function pageKind(path) {
    if (path === FRIENDS_PATH || path === `${FRIENDS_PATH}/`) return "friends";
    if (path === ENEMIES_PATH || path === `${ENEMIES_PATH}/`) return "enemies";
    return null;
  }
  var isFriendsPath = (path) => pageKind(path) !== null;
  var LISTS = {
    friends: { path: FRIENDS_PATH, many: "friends", title: "Friends", add: "Add friend", done: "✓ Friend", profile: "Add Friend" },
    enemies: { path: ENEMIES_PATH, many: "enemies", title: "Enemies", add: "Add enemy", done: "✓ Enemy", profile: "Add Enemy" }
  };
  function hideGame404Early(doc = document, win = window) {
    if (!doc.getElementById("zcf-early-styles")) {
      const style = doc.createElement("style");
      style.id = "zcf-early-styles";
      style.textContent = HIDE_404_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    const on = isFriendsPath(win.location.pathname);
    doc.documentElement.classList.toggle(PAGE_CLASS, on);
    return on;
  }
  var TABS2 = [["all", "All"], ["online", "Online"], ["offline", "Offline"]];
  var COLUMNS = [
    { col: "name", label: "Name", sort: "name" },
    { col: "level", label: "Level", sort: "level" },
    { col: "status", label: "Status", sort: "status" },
    { col: "faction", label: "Faction", sort: "faction" },
    { col: "note", label: "Note" },
    { col: "act", label: "" }
  ];
  var plainClick = (e) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
  function createFriendsPage(services, { doc = document, win = window, keeper = null } = {}) {
    const { store, actions, presence, players, router, toast } = services;
    const enemies = services.enemies || { get: () => ({ enemies: {} }) };
    const isEnemy2 = services.isEnemy || (() => false);
    let active = false;
    let kind = "friends";
    let tab = "all";
    let query = "";
    let sort = DEFAULT_SORT;
    let editId = null;
    let editInput = null;
    let confirmId = null;
    let menuId = null;
    let rendering = false;
    let frame = 0;
    let holdRender = false;
    let renderWanted = false;
    let popSig = "";
    let headSig = null;
    let currentIds = [];
    let unkeep = null;
    let warnTimer = null;
    let leaveObserver = null;
    let leaveTimer = null;
    const rowEls = /* @__PURE__ */ new Map();
    const L = () => LISTS[kind];
    const listOf = () => kind === "enemies" ? enemies.get().enemies : store.get().friends;
    const listActions = () => kind === "enemies" ? { add: actions.addEnemy, remove: actions.removeEnemy, setNote: actions.setEnemyNote } : { add: actions.addFriend, remove: actions.removeFriend, setNote: actions.setFriendNote };
    const link = (href, className, children, extra = {}) => h("a", {
      class: className,
      href,
      onclick: (e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        router.navigate(href);
      },
      ...extra
    }, children);
    const subtitle = h("div", { class: "zcf-page-sub" });
    const addLong = h("span", { class: "zcf-page-add-long" }, LISTS.friends.add);
    const addBtn = h(
      "button",
      { class: "zcf-page-add", type: "button", "aria-expanded": "false" },
      icon("plus"),
      addLong,
      h("span", { class: "zcf-page-add-short" }, "Add")
    );
    const pop = createAddFriendPopover({
      players,
      isAdded: (id) => !!listOf()[id],
      onAdd: (p) => {
        listActions().add(p);
        toast(`${p.username} added to ${L().many}`);
      },
      onClose: () => syncAddBtn()
    });
    const headings = new Map(Object.entries(LISTS).map(([k, l]) => [k, link(l.path, "text-h4 text-uppercase text-no-bg zcf-page-h", l.title)]));
    const title = h(
      "div",
      { class: "zcf-page-title" },
      h("div", { class: "zcf-page-side" }, link("/city", "zcf-page-back", [icon("chevron-left"), "City"])),
      h("div", { class: "zcf-page-mid" }, h("div", { class: "zcf-page-htabs" }, [...headings.values()]), subtitle),
      h("div", { class: "zcf-page-side zcf-page-side-r" }, h("div", { class: "zcf-page-addwrap" }, addBtn, pop.el))
    );
    const tabEls = /* @__PURE__ */ new Map();
    for (const [key, label] of TABS2) {
      const count = h("b");
      const b = h("button", {
        class: "zcf-page-tab",
        type: "button",
        "aria-pressed": "false",
        onclick: () => {
          tab = key;
          render();
        }
      }, label, count);
      tabEls.set(key, { b, count });
    }
    const search = h("input", { class: "zcf-page-input", type: "text", placeholder: "Search names and notes…", "aria-label": "Search friends" });
    const bar = h(
      "div",
      { class: "zcf-page-bar" },
      h("div", { class: "zcf-page-tabs" }, [...tabEls.values()].map((t) => t.b)),
      h("label", { class: "zcf-page-search" }, icon("search"), search)
    );
    const headRow = h("tr");
    const tbody = h("tbody");
    const table = h("table", { class: "zcf-page-table" }, h("thead", null, headRow), tbody);
    const empty = h("div", { class: "zcf-page-empty", hidden: true });
    const el = h("main", { class: "q-page q-layout-padding zcf zcf-page" }, title, bar, h("div", { class: "zcf-page-panel" }, table, empty));
    function syncKind() {
      for (const [k, a] of headings) {
        a.classList.toggle("zcf-page-h-on", k === kind);
        if (k === kind) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
      addLong.textContent = L().add;
      search.setAttribute("aria-label", `Search ${L().many}`);
      pop.setLabels({ title: L().add, doneText: L().done });
    }
    syncKind();
    el.addEventListener("pointerdown", () => {
      holdRender = true;
    }, true);
    function onPointerRelease() {
      if (!holdRender) return;
      win.setTimeout(() => {
        holdRender = false;
        if (!renderWanted) return;
        renderWanted = false;
        safe("friends-page-render", render)();
      }, 0);
    }
    search.addEventListener("input", () => {
      query = search.value;
      render();
    });
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pop.isOpen) pop.close();
      else pop.open();
      syncAddBtn();
    });
    function syncAddBtn() {
      addBtn.setAttribute("aria-expanded", String(pop.isOpen));
      addBtn.classList.toggle("zcf-page-add-on", pop.isOpen);
    }
    function onDocMousedown(e) {
      if (pop.isOpen && !pop.el.contains(e.target) && !addBtn.contains(e.target)) pop.close();
      if (menuId !== null && !(e.target.closest && e.target.closest(".zcf-page-menu, .zcf-act-more"))) {
        menuId = null;
        render();
      }
    }
    function focusKey(...keys) {
      for (const key of keys) {
        const target = el.querySelector(`[data-zcf-focus="${key}"]`);
        if (!target) continue;
        target.focus();
        if (doc.activeElement === target) return;
      }
    }
    function startEdit(id) {
      if (editId === id) return;
      commitEdit();
      const f = listOf()[id];
      if (!f) return;
      menuId = null;
      confirmId = null;
      editId = id;
      editInput = h("input", { class: "zcf-note-input", type: "text", maxlength: MAX_NOTE, value: f.note || "", "aria-label": `Note for ${f.username}` });
      editInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit({ refocus: true });
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelEdit();
        }
      });
      editInput.addEventListener("blur", () => {
        if (!rendering) commitEdit({ later: true });
      });
      render();
      editInput.focus();
      const end = editInput.value.length;
      editInput.setSelectionRange(end, end);
    }
    function commitEdit({ refocus = false, later = false } = {}) {
      if (editId === null) return;
      const id = editId;
      const text2 = editInput.value;
      editId = null;
      editInput = null;
      const f = listOf()[id];
      if (f && (f.note || "") !== normalizeNote(text2)) listActions().setNote(id, text2);
      if (later) {
        scheduleRender();
        return;
      }
      render();
      if (refocus) focusKey(`edit:${id}`, `more:${id}`);
    }
    function cancelEdit() {
      if (editId === null) return;
      const id = editId;
      editId = null;
      editInput = null;
      render();
      focusKey(`edit:${id}`, `more:${id}`);
    }
    function askRemove(id) {
      commitEdit();
      menuId = null;
      confirmId = id;
      render();
      focusKey(`cancel:${id}`);
    }
    function cancelRemove(id) {
      confirmId = null;
      render();
      focusKey(`remove:${id}`, `more:${id}`);
    }
    function doRemove(id) {
      const i = currentIds.indexOf(id);
      const next = currentIds[i + 1] ?? currentIds[i - 1];
      confirmId = null;
      listActions().remove(id);
      render();
      if (next !== void 0) focusKey(`name:${next}`);
    }
    function toggleMenu(id) {
      menuId = menuId === id ? null : id;
      render();
      if (menuId === id) focusKey(`menu:${id}:0`);
    }
    function closeMenu(id) {
      menuId = null;
      render();
      focusKey(`more:${id}`);
    }
    function renderHead() {
      const sig = `${sort.key}:${sort.dir}`;
      if (sig === headSig) return;
      headSig = sig;
      clear(headRow);
      for (const c of COLUMNS) {
        if (!c.sort) {
          headRow.appendChild(h("th", { class: `zcf-col-${c.col}` }, c.label));
          continue;
        }
        const on = sort.key === c.sort;
        headRow.appendChild(h(
          "th",
          { class: `zcf-col-${c.col}`, "aria-sort": on ? sort.dir === "asc" ? "ascending" : "descending" : "none" },
          h("button", {
            class: `zcf-page-sort${on ? " zcf-page-sort-on" : ""}`,
            type: "button",
            "data-zcf-focus": `sort:${c.sort}`,
            onclick: () => {
              sort = nextSort(sort, c.sort);
              render();
              focusKey(`sort:${c.sort}`);
            }
          }, c.label, on ? h("span", { class: "zcf-page-arrow", "aria-hidden": "true" }, sort.dir === "asc" ? "▲" : "▼") : null)
        ));
      }
    }
    function rowSig(r, now) {
      if (confirmId === r.id) return JSON.stringify(["confirm", r.id, r.username, kind]);
      if (editId === r.id) return JSON.stringify(["edit", r.id]);
      return JSON.stringify([r.id, r.username, r.avatar, r.note, r.unread, !!r.presence, longStatusText(r.presence, now), r.profile, menuId === r.id, query.trim(), isEnemy2(r.id)]);
    }
    function confirmRow(r) {
      return h(
        "tr",
        { class: "zcf-page-row zcf-page-confirm", dataset: { id: String(r.id) } },
        h(
          "td",
          { colspan: String(COLUMNS.length) },
          h(
            "div",
            {
              class: "zcf-confirm",
              onkeydown: (e) => {
                if (e.key !== "Escape") return;
                e.stopPropagation();
                cancelRemove(r.id);
              }
            },
            h("span", { class: "zcf-confirm-text" }, `Remove ${r.username} from your ${L().many}?`),
            h("button", { class: "zcf-page-btn zcf-page-danger", type: "button", "data-zcf-focus": `confirm:${r.id}`, onclick: () => doRemove(r.id) }, "Remove"),
            h("button", { class: "zcf-page-btn", type: "button", "data-zcf-focus": `cancel:${r.id}`, onclick: () => cancelRemove(r.id) }, "Cancel")
          )
        )
      );
    }
    function rowMenu(r) {
      const item = (i, label, onclick) => h("button", { type: "button", role: "menuitem", "data-zcf-focus": `menu:${r.id}:${i}`, onclick }, label);
      const menu = h(
        "div",
        { class: "zcf-page-menu", role: "menu" },
        item(0, "Profile", () => {
          menuId = null;
          router.navigate(`/profile/${r.id}`);
        }),
        item(1, "Edit note", () => startEdit(r.id)),
        item(2, "Remove", () => askRemove(r.id))
      );
      wireMenuKeys(menu, { onEscape: () => closeMenu(r.id) });
      return menu;
    }
    function buildRow(r, now) {
      if (confirmId === r.id) return confirmRow(r);
      const online = !!(r.presence && r.presence.online);
      const p = r.profile;
      const level = p && p.level ? String(p.level) : "—";
      const meta = [`Lv ${level}`, p && p.faction ? p.faction.name : null].filter(Boolean).join(" · ");
      const chip = link(`/profile/${r.id}`, "zcf-chip", [
        avatar({ avatar: r.avatar, online: r.presence ? online : void 0, size: 24 }),
        h("span", { class: "zcf-chip-name" }, highlightMatch(r.username, query))
      ], { "data-zcf-focus": `name:${r.id}`, title: r.username });
      const nameCell = h(
        "td",
        { class: "zcf-col-name" },
        // The skull and the chip share one flex row, so the skull sits centred against the chip.
        isEnemy2(r.id) ? h("div", { class: "zcf-name-row" }, enemyMark(), chip) : chip,
        h("div", { class: "zcf-c-sub" }, meta),
        r.note ? h("div", { class: "zcf-c-sub zcf-c-subnote" }, r.note) : null
      );
      const statusCell = h(
        "td",
        { class: "zcf-col-status" },
        h("span", { class: r.presence ? online ? "zcf-st-on" : "zcf-st-off" : "zcf-st-unknown" }, r.presence ? longStatusText(r.presence, now) : "…"),
        p && p.injured ? h("i", { class: "fas fa-skull-crossbones zcf-st-icon", role: "img", title: "Injured", "aria-label": "Injured" }) : null,
        p && p.traveling ? h("i", { class: "fas fa-directions zcf-st-icon", role: "img", title: "Travelling", "aria-label": "Travelling" }) : null
      );
      const factionCell = h(
        "td",
        { class: "zcf-col-faction" },
        p && p.faction ? link(`/faction/${p.faction.id}`, "zcf-fac", [h("i", { class: "fas fa-campground", "aria-hidden": "true" }), p.faction.name || `#${p.faction.id}`]) : h("span", { class: "zcf-dim" }, "—")
      );
      const noteCell = editId === r.id ? h("td", { class: "zcf-col-note" }, editInput, h("div", { class: "zcf-note-hint" }, "Enter to save · Esc to cancel · only you can see notes")) : h(
        "td",
        { class: "zcf-col-note" },
        h("button", {
          class: `zcf-note${r.note ? "" : " zcf-note-empty"}`,
          type: "button",
          title: r.note || "Add a note",
          "data-zcf-focus": `note:${r.id}`,
          onclick: () => startEdit(r.id)
        }, r.note ? highlightMatch(r.note, query) : "Add a note")
      );
      const acts = h(
        "div",
        { class: "zcf-acts" },
        h("button", {
          class: "zcf-act zcf-act-msg",
          type: "button",
          title: "Message",
          "aria-label": `Message ${r.username}`,
          "data-zcf-focus": `msg:${r.id}`,
          onclick: () => actions.openDm(r.id, { expand: true, username: r.username, avatar: r.avatar })
        }, h("i", { class: "fas fa-comment-alt", "aria-hidden": "true" }), r.unread > 0 ? h("span", { class: "zcf-pill" }, String(r.unread)) : null),
        h("button", { class: "zcf-act zcf-act-wide", type: "button", title: "Edit note", "aria-label": `Edit note for ${r.username}`, "data-zcf-focus": `edit:${r.id}`, onclick: () => startEdit(r.id) }, icon("pen")),
        h("button", { class: "zcf-act zcf-act-wide", type: "button", title: "Remove", "aria-label": `Remove ${r.username}`, "data-zcf-focus": `remove:${r.id}`, onclick: () => askRemove(r.id) }, icon("times")),
        h("button", {
          class: "zcf-act zcf-act-more",
          type: "button",
          title: "More",
          "aria-haspopup": "menu",
          "aria-expanded": String(menuId === r.id),
          "data-zcf-focus": `more:${r.id}`,
          onclick: () => toggleMenu(r.id)
        }, icon("ellipsis-h")),
        menuId === r.id ? rowMenu(r) : null
      );
      return h(
        "tr",
        { class: `zcf-page-row${editId === r.id ? " zcf-editing" : ""}`, dataset: { id: String(r.id) } },
        nameCell,
        h("td", { class: "zcf-col-level" }, level),
        statusCell,
        factionCell,
        noteCell,
        h("td", { class: "zcf-col-act" }, acts)
      );
    }
    function render() {
      if (frame) {
        win.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (!active) return;
      const s = store.get();
      const now = Date.now();
      const pinned = [editId, confirmId, menuId].filter((id) => id !== null);
      const { rows, counts } = buildFriendsTable({ list: listOf(), presence: presence.get, threads: s.threads, tab, query, sort, pinned });
      const ids = rows.map((r) => r.id);
      if (editId !== null && !ids.includes(editId)) {
        commitEdit();
        return;
      }
      if (confirmId !== null && !ids.includes(confirmId)) confirmId = null;
      if (menuId !== null && !ids.includes(menuId)) menuId = null;
      currentIds = ids;
      subtitle.textContent = `${counts.online} of ${counts.all} online`;
      for (const [key, { b, count }] of tabEls) {
        count.textContent = String(counts[key]);
        b.setAttribute("aria-pressed", String(key === tab));
        b.classList.toggle("zcf-page-tab-on", key === tab);
      }
      renderHead();
      const focused = doc.activeElement;
      const focusBefore = focused && focused !== editInput && el.contains(focused) ? focused.dataset.zcfFocus : void 0;
      const editSel = editInput && focused === editInput ? [editInput.selectionStart, editInput.selectionEnd] : null;
      rendering = true;
      try {
        const seen = /* @__PURE__ */ new Set();
        rows.forEach((r, i) => {
          const sig2 = rowSig(r, now);
          let entry = rowEls.get(r.id);
          if (!entry || entry.sig !== sig2) {
            const fresh = buildRow(r, now);
            if (entry) entry.el.replaceWith(fresh);
            entry = { sig: sig2, el: fresh };
            rowEls.set(r.id, entry);
          }
          seen.add(r.id);
          if (tbody.children[i] !== entry.el) tbody.insertBefore(entry.el, tbody.children[i] || null);
        });
        for (const [id, entry] of rowEls) {
          if (seen.has(id)) continue;
          entry.el.remove();
          rowEls.delete(id);
        }
      } finally {
        rendering = false;
      }
      table.hidden = rows.length === 0;
      empty.hidden = rows.length > 0;
      if (!rows.length) {
        clear(empty);
        const q = query.trim();
        if (!counts.all) append(empty, [`No ${L().many} yet. Use `, h("b", null, L().add), " above, or ", h("b", null, L().profile), " on a player's profile."]);
        else if (q) empty.textContent = `No ${L().many} match "${q}".`;
        else empty.textContent = tab === "online" ? `No ${L().many} online right now.` : `No offline ${L().many}.`;
      }
      const sig = `${kind}:${Object.keys(listOf()).join(",")}`;
      if (pop.isOpen && sig !== popSig) pop.refresh();
      popSig = sig;
      if (editSel && editInput && doc.activeElement !== editInput) {
        editInput.focus();
        editInput.setSelectionRange(editSel[0], editSel[1]);
      } else if (focusBefore && !el.contains(doc.activeElement)) {
        focusKey(focusBefore);
      }
    }
    function scheduleRender() {
      if (frame || !active) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        if (holdRender) {
          renderWanted = true;
          return;
        }
        safe("friends-page-render", render)();
      });
    }
    function switchKind(next) {
      if (next === kind) return;
      commitEdit();
      kind = next;
      query = "";
      search.value = "";
      confirmId = null;
      menuId = null;
      pop.close();
      for (const entry of rowEls.values()) entry.el.remove();
      rowEls.clear();
      popSig = "";
      syncKind();
      render();
    }
    function ensure() {
      if (!active || el.isConnected) return;
      const slot = doc.querySelector(".q-page-container");
      if (!slot) return;
      doc.documentElement.classList.add(PAGE_CLASS);
      slot.appendChild(el);
    }
    const game404 = () => doc.querySelector(".q-page-container > .fixed-center");
    const leaving = () => !!(leaveObserver || leaveTimer);
    function finishLeave() {
      if (leaveObserver) leaveObserver.disconnect();
      leaveObserver = null;
      clearTimeout(leaveTimer);
      leaveTimer = null;
      if (active) return;
      doc.documentElement.classList.remove(PAGE_CLASS);
      el.remove();
    }
    function leaveWhenReplaced() {
      if (!game404()) {
        finishLeave();
        return;
      }
      leaveObserver = new win.MutationObserver(() => {
        if (!game404()) finishLeave();
      });
      leaveObserver.observe(doc.body, { childList: true, subtree: true });
      leaveTimer = setTimeout(finishLeave, LEAVE_MS);
    }
    function show() {
      active = true;
      finishLeave();
      doc.documentElement.classList.add(PAGE_CLASS);
      doc.addEventListener("mousedown", onDocMousedown);
      doc.addEventListener("pointerup", onPointerRelease, true);
      doc.addEventListener("pointercancel", onPointerRelease, true);
      ensure();
      render();
      clearTimeout(warnTimer);
      warnTimer = setTimeout(() => {
        if (!active || el.isConnected) return;
        warnOnce("friends-page-no-slot");
        doc.documentElement.classList.remove(PAGE_CLASS);
      }, WARN_MS);
    }
    function hide() {
      commitEdit();
      active = false;
      confirmId = null;
      menuId = null;
      pop.close();
      clearTimeout(warnTimer);
      if (frame) {
        win.cancelAnimationFrame(frame);
        frame = 0;
      }
      doc.removeEventListener("mousedown", onDocMousedown);
      doc.removeEventListener("pointerup", onPointerRelease, true);
      doc.removeEventListener("pointercancel", onPointerRelease, true);
      holdRender = false;
      renderWanted = false;
      leaveWhenReplaced();
    }
    function onRoute(path) {
      const want = pageKind(path);
      if (want) switchKind(want);
      if (want && !active) show();
      else if (!want && active) hide();
      else if (!want && !leaving()) doc.documentElement.classList.remove(PAGE_CLASS);
    }
    return {
      el,
      start() {
        if (!unkeep && keeper) unkeep = keeper.add({ name: "friends-page", attached: () => !active || el.isConnected, ensure });
      },
      onRoute,
      render,
      scheduleRender,
      get active() {
        return active;
      },
      get kind() {
        return kind;
      },
      destroy() {
        if (active) hide();
        if (leaving()) finishLeave();
        if (unkeep) unkeep();
        unkeep = null;
      }
    };
  }

  // src/ui/topbar-button.js
  var MAIL_SELECTOR = 'header a.q-btn[href="/mail"]';
  var WARN_MS2 = 1e4;
  function createTopbarButton({ doc = document, keeper = null, router }) {
    let wrap = null;
    let button = null;
    let unkeep = null;
    let warnTimer = null;
    function onClick(e) {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      router.navigate(FRIENDS_PATH);
    }
    function build(mail) {
      button = mail.cloneNode(true);
      for (const b of button.querySelectorAll(".q-badge")) b.remove();
      button.setAttribute("href", FRIENDS_PATH);
      const i = button.querySelector("i");
      if (i) {
        for (const c of [...i.classList]) if (/^fa-/.test(c)) i.classList.remove(c);
        i.classList.add("fa-user-friends");
      }
      button.classList.remove("text-grey-4");
      button.classList.add("text-grey-7");
      button.setAttribute("title", "Friends");
      button.setAttribute("aria-label", "Friends");
      button.addEventListener("click", safe("topbar-click", onClick));
      wrap = h("div", { class: "zcf-topbar" }, button);
    }
    function ensure() {
      if (wrap && wrap.isConnected) return;
      const mail = doc.querySelector(MAIL_SELECTOR);
      const mailWrap = mail && mail.parentElement;
      if (!mailWrap || !mailWrap.parentElement) return;
      if (!wrap) build(mail);
      mailWrap.before(wrap);
    }
    return {
      start() {
        ensure();
        if (!unkeep && keeper) unkeep = keeper.add({ name: "topbar", attached: () => !!(wrap && wrap.isConnected), ensure });
        clearTimeout(warnTimer);
        warnTimer = setTimeout(() => {
          if (!wrap || !wrap.isConnected) warnOnce("topbar-mail-button-not-found");
        }, WARN_MS2);
      },
      destroy() {
        clearTimeout(warnTimer);
        if (unkeep) unkeep();
        unkeep = null;
        if (wrap) wrap.remove();
      }
    };
  }

  // src/ui/chat-custom/padlock.js
  var HEADER_CONTROLS_MIN_WIDTH = 400;
  var TITLE_LOCKED = "Locked — click to unlock, right-click for options";
  var TITLE_UNLOCKED = "Unlocked — drag to move, click to lock";
  function createChatControls(key, act) {
    const stop = (fn) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    };
    const value = h("span", { class: "zcf-cc-value" });
    const reset = h("button", { class: "zcf-cc-btn", type: "button", title: "Reset this chat's size", onclick: stop(() => act.resetSize(key)) }, "Reset");
    const inline = h(
      "span",
      { class: "zcf-cc-inline" },
      h("button", { class: "zcf-cc-step", type: "button", "aria-label": "Smaller messages", onclick: stop(() => act.stepText(key, -LIMITS.textStep)) }, "−"),
      value,
      h("button", { class: "zcf-cc-step", type: "button", "aria-label": "Larger messages", onclick: stop(() => act.stepText(key, LIMITS.textStep)) }, "+"),
      reset
    );
    const back = h(
      "button",
      { class: "zcf-cc-icon zcf-cc-return", type: "button", title: "Return to the row", "aria-label": "Return to the row", onclick: stop(() => act.returnToRow(key)) },
      h("i", { class: "fas fa-undo-alt", "aria-hidden": "true" })
    );
    const glyph = h("i", { class: "fas fa-lock", "aria-hidden": "true" });
    const lock = h("button", { class: "zcf-cc-icon zcf-cc-lock", type: "button", onclick: stop(() => act.toggleLock(key)) }, glyph);
    lock.addEventListener("contextmenu", stop(() => act.openMenu(key, lock)));
    const el = h("span", { class: "zcf-cc", dataset: { zcfCc: key } }, inline, back, lock);
    function sync(entry, width) {
      const locked = isLocked(entry);
      lock.title = locked ? TITLE_LOCKED : TITLE_UNLOCKED;
      lock.setAttribute("aria-label", lock.title);
      lock.setAttribute("aria-pressed", String(locked));
      lock.classList.toggle("zcf-cc-unlocked", !locked);
      glyph.className = `fas ${locked ? "fa-lock" : "fa-lock-open"}`;
      back.hidden = !isMoved(entry);
      value.textContent = `${textOf(entry)}%`;
      inline.hidden = !(width >= HEADER_CONTROLS_MIN_WIDTH);
      reset.disabled = !(entry && (entry.w || entry.h));
    }
    return { el, sync };
  }

  // src/ui/chat-custom/menu.js
  var GAP = 4;
  function createChatMenu({ doc = document, win = window } = {}) {
    const el = h("div", { class: "zcf-cmenu", role: "menu", hidden: true });
    let anchor = null;
    let key = null;
    let armed = false;
    const onDocDown = (e) => {
      if (el.contains(e.target) || anchor && anchor.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      const back = anchor;
      close();
      if (back && back.isConnected) back.focus();
    };
    function position() {
      const r = anchor.getBoundingClientRect();
      const m = el.getBoundingClientRect();
      const left = Math.max(GAP, Math.min(r.left, win.innerWidth - m.width - GAP));
      const below = r.bottom + GAP;
      const top = below + m.height > win.innerHeight ? r.top - GAP - m.height : below;
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(Math.max(GAP, top))}px`;
    }
    function render(model) {
      const buttons = [...el.querySelectorAll("button")];
      const focused = buttons.indexOf(doc.activeElement);
      clear(el);
      el.appendChild(h("div", { class: "zcf-cmenu-title" }, model.title));
      for (const row of model.rows) el.appendChild(h("div", { class: "zcf-cmenu-row" }, h("span", { class: "zcf-cmenu-label" }, row.label), row.controls));
      const again = [...el.querySelectorAll("button")];
      if (focused < 0 || !again.length) return;
      const at = Math.min(focused, again.length - 1);
      const order = again.map((b, i) => [Math.abs(i - at), b]).sort((a, b) => a[0] - b[0]);
      const target = order.find(([, b]) => !b.disabled);
      if (target) target[1].focus();
    }
    function open(anchorEl, chatKey, model) {
      anchor = anchorEl;
      key = chatKey;
      if (!el.isConnected) doc.body.appendChild(el);
      el.hidden = false;
      render(model);
      position();
      if (!armed) {
        doc.addEventListener("pointerdown", onDocDown, true);
        doc.addEventListener("keydown", onKey, true);
        armed = true;
      }
      const first = el.querySelector("button:not(:disabled)");
      if (first) first.focus();
    }
    function close() {
      if (!armed) return;
      armed = false;
      doc.removeEventListener("pointerdown", onDocDown, true);
      doc.removeEventListener("keydown", onKey, true);
      el.hidden = true;
      anchor = null;
      key = null;
    }
    return {
      el,
      open,
      close,
      // Re-draws the open menu after its chat's settings changed.
      update(chatKey, model) {
        if (!armed || chatKey !== key) return;
        render(model);
        if (anchor && anchor.isConnected) position();
      },
      isOpen: () => armed,
      get key() {
        return key;
      },
      destroy() {
        close();
        el.remove();
      }
    };
  }

  // src/chat-custom/geometry.js
  var DRAG_THRESHOLD = 6;
  var VIEWPORT_MARGIN = 60;
  var pastThreshold = (dx, dy) => Math.hypot(dx, dy) > DRAG_THRESHOLD;
  function clampAxis(value, size, limit) {
    const max = limit - size;
    if (!(max > 0) || !Number.isFinite(value)) return 0;
    return Math.min(max, Math.max(0, value));
  }
  function clampPosition({ x, y, w, h: h2, vw, vh }) {
    return { x: Math.round(clampAxis(x, w, vw)), y: Math.round(clampAxis(y, h2, vh)) };
  }
  var gripsFor = ({ locked, moved }) => locked ? [] : moved ? ["n", "nw", "s", "se"] : ["n", "nw"];
  function resizeLimits({ dir, start, moved, vw, vh }) {
    let maxW = LIMITS.maxW;
    let maxH = vh - VIEWPORT_MARGIN;
    if (dir.includes("w")) maxW = Math.min(maxW, start.left + start.width);
    if (dir.includes("e")) maxW = Math.min(maxW, vw - start.left);
    if (dir.includes("n")) maxH = Math.min(maxH, start.top + start.height);
    if (moved && dir.includes("s")) maxH = Math.min(maxH, vh - start.top);
    return { minW: LIMITS.minW, maxW: Math.max(LIMITS.minW, maxW), minH: LIMITS.minH, maxH: Math.max(LIMITS.minH, maxH) };
  }
  function resizeRect({ dir, start, dx, dy, limits, moved }) {
    const clamp2 = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
    const out = {};
    if (dir.includes("e")) out.w = clamp2(start.width + dx, limits.minW, limits.maxW);
    if (dir.includes("w")) out.w = clamp2(start.width - dx, limits.minW, limits.maxW);
    if (dir.includes("s")) out.h = clamp2(start.height + dy, limits.minH, limits.maxH);
    if (dir.includes("n")) out.h = clamp2(start.height - dy, limits.minH, limits.maxH);
    if (moved) {
      out.x = Math.round(start.left + (dir.includes("w") ? Math.round(start.width) - out.w : 0));
      out.y = Math.round(start.top + (dir.includes("n") ? Math.round(start.height) - out.h : 0));
    }
    return out;
  }

  // src/ui/chat-custom/drag.js
  function createDrag({ doc = document, win = window, enabled, hit, onMove, onCommit, onCancel }) {
    let s = null;
    let swallow = false;
    function onDown(e) {
      swallow = false;
      if (s || e.button !== 0 || !enabled()) return;
      const target = hit(e.target);
      if (!target) return;
      const r = target.el.getBoundingClientRect();
      s = { key: target.key, id: e.pointerId, sx: e.clientX, sy: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, dragging: false, pos: null };
      doc.addEventListener("pointermove", onMoveEv, true);
      doc.addEventListener("pointerup", onUp, true);
      doc.addEventListener("pointercancel", onCancelEv, true);
    }
    function onMoveEv(e) {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.sx;
      const dy = e.clientY - s.sy;
      if (!s.dragging) {
        if (!pastThreshold(dx, dy)) return;
        s.dragging = true;
        doc.documentElement.classList.add("zcf-dragging");
      }
      if (e.cancelable) e.preventDefault();
      s.pos = clampPosition({ x: s.left + dx, y: s.top + dy, w: s.w, h: s.h, vw: win.innerWidth, vh: win.innerHeight });
      onMove(s.key, s.pos);
    }
    function end(commit) {
      const done = s;
      s = null;
      doc.removeEventListener("pointermove", onMoveEv, true);
      doc.removeEventListener("pointerup", onUp, true);
      doc.removeEventListener("pointercancel", onCancelEv, true);
      if (!done.dragging) return;
      doc.documentElement.classList.remove("zcf-dragging");
      swallow = true;
      if (commit) onCommit(done.key, done.pos);
      else onCancel(done.key);
    }
    const onUp = (e) => {
      if (s && e.pointerId === s.id) end(true);
    };
    const onCancelEv = (e) => {
      if (s && e.pointerId === s.id) end(false);
    };
    function onClick(e) {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    }
    doc.addEventListener("pointerdown", onDown, true);
    doc.addEventListener("click", onClick, true);
    return {
      isDragging: () => !!(s && s.dragging),
      destroy() {
        if (s) end(false);
        doc.removeEventListener("pointerdown", onDown, true);
        doc.removeEventListener("click", onClick, true);
      }
    };
  }

  // src/ui/chat-custom/resize.js
  function syncGrips(el, dirs, onPress) {
    const current = [...el.children].filter((c) => c.classList.contains("zcf-grip"));
    const have = current.map((g) => g.dataset.zcfGrip);
    if (have.length === dirs.length && have.every((d, i) => d === dirs[i])) return;
    for (const g of current) g.remove();
    for (const dir of dirs) {
      const grip = h("div", { class: `zcf-grip zcf-grip-${dir}`, dataset: { zcfGrip: dir }, "aria-hidden": "true" });
      grip.addEventListener("pointerdown", (e) => onPress(dir, e));
      el.appendChild(grip);
    }
  }
  function createResize({ doc = document, win = window, onMove, onCommit, onCancel }) {
    let s = null;
    function start(key, el, dir, moved, e) {
      if (s || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      s = { key, dir, moved, id: e.pointerId, sx: e.clientX, sy: e.clientY, rect, limits: resizeLimits({ dir, start: rect, moved, vw: win.innerWidth, vh: win.innerHeight }), live: null };
      doc.addEventListener("pointermove", move, true);
      doc.addEventListener("pointerup", up, true);
      doc.addEventListener("pointercancel", cancel, true);
      doc.documentElement.classList.add("zcf-resizing");
    }
    function move(e) {
      if (!s || e.pointerId !== s.id) return;
      if (e.cancelable) e.preventDefault();
      s.live = resizeRect({ dir: s.dir, start: s.rect, dx: e.clientX - s.sx, dy: e.clientY - s.sy, limits: s.limits, moved: s.moved });
      onMove(s.key, s.live);
    }
    function end(commit) {
      const done = s;
      s = null;
      doc.removeEventListener("pointermove", move, true);
      doc.removeEventListener("pointerup", up, true);
      doc.removeEventListener("pointercancel", cancel, true);
      doc.documentElement.classList.remove("zcf-resizing");
      if (commit && done.live) onCommit(done.key, done.live);
      else onCancel(done.key);
    }
    const up = (e) => {
      if (s && e.pointerId === s.id) end(true);
    };
    const cancel = (e) => {
      if (s && e.pointerId === s.id) end(false);
    };
    return {
      start,
      isActive: () => !!s,
      destroy() {
        if (s) end(false);
      }
    };
  }

  // src/chat-custom/user-style.js
  var STYLE_ID = "zcf-user-settings";
  var FALLBACK = { w: 350, h: 450 };
  function chatSelector(key) {
    const game = GAME_CHATS.find((g) => g.key === key);
    if (game) return `body .chat-containers > .chat-container.${game.cls}`;
    return `body .chat-containers .zcf[data-zcf-chat="${key}"]`;
  }
  var zoomTargets = (key) => key.startsWith("game:") ? [".chat-content"] : [".zcf-zoom"];
  function buildUserCss({ chats = {}, live = null, small = false, vw = 1280, vh = 800, sizes = {}, front = [] }) {
    const rules = [];
    const keys = new Set(Object.keys(chats));
    if (live) keys.add(live.key);
    for (const key of keys) {
      const isLive = !!(live && live.key === key);
      const entry = isLive ? { ...chats[key], ...live.entry } : chats[key];
      if (!entry) continue;
      const sel = chatSelector(key);
      const text2 = textOf(entry);
      if (text2 !== 100) rules.push(`${zoomTargets(key).map((t) => `${sel} ${t}`).join(",")}{zoom:${text2 / 100}}`);
      if (small) continue;
      const sized = [];
      if (entry.w) sized.push(`width:${Math.min(entry.w, Math.max(LIMITS.minW, vw))}px`, "min-width:0", "max-width:none");
      if (entry.h) sized.push(`height:${Math.min(entry.h, Math.max(LIMITS.minH, vh - VIEWPORT_MARGIN))}px`, "max-height:none");
      const box = [];
      if (isMoved(entry)) {
        const size = sizes[key] || { w: entry.w || FALLBACK.w, h: entry.h || FALLBACK.h };
        const p = clampPosition({ x: entry.x, y: entry.y, w: size.w, h: size.h, vw, vh });
        box.push("position:fixed", `left:${p.x}px`, `top:${p.y}px`, "right:auto", "bottom:auto", "margin:0");
      } else if (!isLocked(entry)) {
        box.push("position:relative");
      }
      if (sized.length || isMoved(entry) || isLive) box.push("transition:none");
      if (box.length) rules.push(`${sel}{${box.join(";")}}`);
      if (sized.length) rules.push(`${sel}:not(.chat-minimized){${sized.join(";")};flex:none}`);
      if (!isLocked(entry)) rules.push(`${sel} > .chat-header{cursor:grab;touch-action:none}`);
    }
    if (!small) front.forEach((key, i) => rules.push(`${chatSelector(key)}{z-index:${i + 1}}`));
    return rules.join("\n");
  }

  // src/ui/chat-custom/index.js
  var MAX_FRONT = 12;
  function createChatCustom({ doc = document, win = window, keeper = null, settings, isSmall, dm = null }) {
    const styleEl = doc.createElement("style");
    styleEl.id = STYLE_ID;
    const records = /* @__PURE__ */ new Map();
    let chats = [];
    let dockEl = null;
    let dockCount = -1;
    let rootEl = null;
    let rootCount = -1;
    let live = null;
    let front = [];
    let unkeep = null;
    let unsubscribe = null;
    let frame = 0;
    const saved = (key) => settings.get().chats[key];
    const entryOf = (key) => live && live.key === key ? { ...saved(key), ...live.entry } : saved(key);
    const save = (key, patch) => settings.update((s) => updateChat(s, key, patch));
    const menu = createChatMenu({ doc, win });
    const act = {
      toggleLock: (key) => save(key, { locked: isLocked(saved(key)) ? false : null }),
      stepText: (key, delta) => save(key, { text: clampText(textOf(saved(key)) + delta) }),
      resetSize: (key) => save(key, { w: null, h: null }),
      returnToRow: (key) => save(key, { x: null, y: null }),
      openMenu: (key, anchor) => menu.open(anchor, key, menuModel(key))
    };
    function menuModel(key) {
      const entry = saved(key);
      const id = dmIdOf(key);
      const btn = (label, onclick, extra = {}) => h("button", { class: "zcf-cc-btn", type: "button", onclick, ...extra }, label);
      const text2 = textOf(entry);
      const rows = [
        {
          label: "Message size",
          controls: [
            btn("−", () => act.stepText(key, -LIMITS.textStep), { "aria-label": "Smaller messages", disabled: text2 <= LIMITS.minText }),
            h("span", { class: "zcf-cc-value" }, `${text2}%`),
            btn("+", () => act.stepText(key, LIMITS.textStep), { "aria-label": "Larger messages", disabled: text2 >= LIMITS.maxText })
          ]
        },
        { label: "Chat size", controls: [btn("Reset", () => act.resetSize(key), { disabled: !(entry && (entry.w || entry.h)) })] }
      ];
      if (isMoved(entry)) rows.push({ label: "Position", controls: [btn("Return to row", () => act.returnToRow(key))] });
      if (id && dm) rows.push({ label: "Notifications", controls: [btn(dm.isMuted(id) ? "Unmute" : "Mute", () => dm.toggleMute(id))] });
      return { title: chatLabel(key, id && dm ? dm.name(id) : null), rows };
    }
    function measure(c) {
      const entry = entryOf(c.key);
      if (!isMoved(entry)) return null;
      const r = c.el.getBoundingClientRect();
      const open = !c.el.classList.contains("chat-minimized");
      const w = open && entry.w || r.width;
      const hgt = open && entry.h || r.height;
      return w && hgt ? { w, h: hgt } : null;
    }
    function applyStyle() {
      const sizes = {};
      for (const c of chats) {
        const m = measure(c);
        if (m) sizes[c.key] = m;
      }
      const css = buildUserCss({ chats: settings.get().chats, live, small: isSmall(), vw: win.innerWidth, vh: win.innerHeight, sizes, front });
      if (styleEl.textContent !== css) styleEl.textContent = css;
      if (!styleEl.isConnected) (doc.head || doc.documentElement).appendChild(styleEl);
    }
    function drop(rec) {
      rec.controls.el.remove();
      syncGrips(rec.el, [], null);
    }
    function syncControls(key) {
      const c = chats.find((x) => x.key === key);
      const rec = records.get(key);
      if (!c || !rec) return;
      const entry = entryOf(key);
      rec.controls.sync(entry, entry && entry.w || c.el.getBoundingClientRect().width);
    }
    function refresh() {
      chats = findChats(doc);
      dockEl = doc.querySelector(".chat-containers");
      rootEl = dockEl && dockEl.querySelector(":scope > .zcf-root");
      dockCount = dockEl ? dockEl.childElementCount : -1;
      rootCount = rootEl ? rootEl.childElementCount : -1;
      const small = isSmall();
      const keep = /* @__PURE__ */ new Set();
      for (const c of chats) {
        keep.add(c.key);
        let rec = records.get(c.key);
        if (!rec || rec.el !== c.el) {
          if (rec) drop(rec);
          rec = { el: c.el, controls: createChatControls(c.key, act) };
          records.set(c.key, rec);
        }
        if (small || !c.header) {
          drop(rec);
          continue;
        }
        if (rec.controls.el.parentNode !== c.header) {
          const title = c.header.querySelector(":scope > .chat-title");
          if (title) title.after(rec.controls.el);
          else c.header.appendChild(rec.controls.el);
        }
        const entry = entryOf(c.key);
        rec.controls.sync(entry, !c.minimized && entry && entry.w || c.el.getBoundingClientRect().width);
        const { key, el } = c;
        const dirs = c.minimized ? [] : gripsFor({ locked: isLocked(entry), moved: isMoved(entry) });
        syncGrips(el, dirs, (dir, e) => resize.start(key, el, dir, isMoved(saved(key)), e));
      }
      for (const [key, rec] of records) {
        if (keep.has(key)) continue;
        drop(rec);
        records.delete(key);
      }
      applyStyle();
      if (menu.isOpen()) {
        if (keep.has(menu.key) && !small) menu.update(menu.key, menuModel(menu.key));
        else menu.close();
      }
    }
    function attached() {
      if (!dockEl || !dockEl.isConnected || dockEl.childElementCount !== dockCount) return false;
      if (rootEl && (rootEl.parentNode !== dockEl || rootEl.childElementCount !== rootCount)) return false;
      const small = isSmall();
      for (const c of chats) {
        if (!c.el.isConnected || c.minimized !== c.el.classList.contains("chat-minimized")) return false;
        if (c.header ? c.header.parentNode !== c.el : c.el.querySelector(":scope > .chat-header")) return false;
        const rec = records.get(c.key);
        if (!small && c.header && (!rec || rec.controls.el.parentNode !== c.header)) return false;
      }
      return true;
    }
    const resize = createResize({
      doc,
      win,
      onMove(key, rect) {
        live = { key, entry: rect };
        applyStyle();
        syncControls(key);
      },
      onCommit(key, rect) {
        live = null;
        save(key, rect);
      },
      onCancel() {
        live = null;
        refresh();
      }
    });
    const drag = createDrag({
      doc,
      win,
      enabled: () => !isSmall(),
      hit(target) {
        if (!target || !target.closest || !target.closest(".chat-containers") || target.closest(".zcf-grip, .zcf-cmenu")) return null;
        const c = findChats(doc).find((x) => x.el.contains(target));
        if (!c) return null;
        if (c.minimized) return { key: c.key, el: c.el };
        if (!c.header || !c.header.contains(target) || isLocked(saved(c.key))) return null;
        return { key: c.key, el: c.el };
      },
      onMove(key, pos) {
        live = { key, entry: pos };
        applyStyle();
      },
      onCommit(key, pos) {
        live = null;
        save(key, pos);
      },
      onCancel() {
        live = null;
        applyStyle();
      }
    });
    function onPointerDown(e) {
      const target = e.target;
      if (isSmall() || !target || !target.closest || !target.closest(".chat-containers")) return;
      const all = settings.get().chats;
      if (!Object.keys(all).some((k) => isMoved(all[k]))) return;
      const c = findChats(doc).find((x) => x.el.contains(target));
      if (!c || front[front.length - 1] === c.key) return;
      front = [...front.filter((k) => k !== c.key), c.key].slice(-MAX_FRONT);
      applyStyle();
    }
    function onViewport() {
      if (frame) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        refresh();
      });
    }
    return {
      start() {
        if (unsubscribe) return;
        unsubscribe = settings.subscribe(() => refresh());
        win.addEventListener("resize", onViewport);
        doc.addEventListener("pointerdown", onPointerDown, true);
        if (keeper) unkeep = keeper.add({ name: "chat-custom", attached, ensure: refresh });
        refresh();
      },
      refresh,
      destroy() {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        if (unkeep) unkeep();
        unkeep = null;
        win.removeEventListener("resize", onViewport);
        doc.removeEventListener("pointerdown", onPointerDown, true);
        if (frame) win.cancelAnimationFrame(frame);
        frame = 0;
        drag.destroy();
        resize.destroy();
        menu.destroy();
        for (const rec of records.values()) drop(rec);
        records.clear();
        styleEl.remove();
      }
    };
  }

  // src/ui/title-count.js
  function createTitleCount({ doc = document, win = window } = {}) {
    let want = "";
    let written = "";
    let observer = null;
    function apply() {
      const title = doc.title;
      const base = written && title.startsWith(written) ? title.slice(written.length) : title;
      const next = want + base;
      written = want;
      if (title !== next) doc.title = next;
    }
    function watch(on) {
      if (on && !observer) {
        observer = new win.MutationObserver(() => apply());
        observer.observe(doc.head || doc.documentElement, { childList: true, subtree: true, characterData: true });
      } else if (!on && observer) {
        observer.disconnect();
        observer = null;
      }
    }
    return {
      set(count, enabled) {
        want = enabled && count > 0 ? `(${count}) ` : "";
        apply();
        watch(!!want);
      },
      destroy() {
        want = "";
        apply();
        watch(false);
      }
    };
  }

  // src/ui/time-hover.js
  var DAY_MS2 = 864e5;
  var NEAR_MIN = 2;
  var TAP_MS = 2500;
  var OURS = "[data-zcf-ts]";
  var GAME = ".chat-container:not(.zcf) .msg-time";
  var minutesOf = (text2) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(text2).trim());
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  var near = (a, b) => {
    const d = Math.abs(a - b) % 1440;
    return Math.min(d, 1440 - d) <= NEAR_MIN;
  };
  function createTimeHover({ doc = document, win = window, storage, key, now = () => Date.now() }) {
    let tip = null;
    let shownFor = null;
    let hideTimer = 0;
    let clock = null;
    try {
      const v = storage.getItem(key);
      if (v === "local" || v === "game") clock = v;
    } catch {
    }
    const sameClocks = () => new Date(now()).getTimezoneOffset() === 0;
    function clockNow() {
      const d = new Date(now());
      const local = d.getHours() * 60 + d.getMinutes();
      const game = d.getUTCHours() * 60 + d.getUTCMinutes();
      const age = (from, m) => (from - m + NEAR_MIN + 1440) % 1440;
      let guess = null;
      for (const chat of doc.querySelectorAll(".chat-container:not(.zcf)")) {
        const times = chat.querySelectorAll(".msg-time");
        const m = times.length ? minutesOf(times[times.length - 1].textContent) : null;
        if (m === null) continue;
        const isLocal = near(m, local);
        if (isLocal !== near(m, game)) {
          const found = isLocal ? "local" : "game";
          if (found !== clock) {
            clock = found;
            try {
              storage.setItem(key, found);
            } catch {
            }
          }
          return clock;
        }
        const a = age(local, m);
        const b = age(game, m);
        if (a !== b && (!guess || Math.min(a, b) < guess.age)) guess = { age: Math.min(a, b), clock: a < b ? "local" : "game" };
      }
      return clock || (guess ? guess.clock : "local");
    }
    function gameMoment(minutes, clock2) {
      const t = now();
      const d = new Date(t);
      const at = clock2 === "game" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(minutes / 60), minutes % 60) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(minutes / 60), minutes % 60).getTime();
      if (at <= t + NEAR_MIN * 6e4) return at;
      if (clock2 === "game") return at - DAY_MS2;
      const y = new Date(at);
      y.setDate(y.getDate() - 1);
      return y.getTime();
    }
    function textFor(el) {
      if (el.matches(OURS)) {
        const ts2 = Number(el.getAttribute("data-zcf-ts"));
        if (!Number.isFinite(ts2) || ts2 <= 0) return "";
        const game = formatMessageTime(ts2, now(), false);
        if (sameClocks()) return el.classList.contains("zcf-time") ? "" : game;
        const local = `${formatMessageTime(ts2, now(), true)} your time`;
        return el.classList.contains("zcf-time") ? local : `${game} ZCT · ${local}`;
      }
      if (sameClocks()) return "";
      const minutes = minutesOf(el.textContent);
      if (minutes === null) return "";
      const printed = clockNow();
      const ts = gameMoment(minutes, printed);
      return printed === "game" ? `${formatClock(ts, true)} your time` : `${formatClock(ts, false)} ZCT`;
    }
    function hide() {
      clearTimeout(hideTimer);
      shownFor = null;
      if (tip) tip.hidden = true;
    }
    function show(el) {
      const text2 = textFor(el);
      if (!text2) return hide();
      if (!tip) {
        tip = doc.createElement("div");
        tip.className = "zcf-tip";
        tip.setAttribute("role", "tooltip");
      }
      if (!tip.isConnected) doc.body.appendChild(tip);
      tip.textContent = text2;
      tip.hidden = false;
      shownFor = el;
      const r = el.getBoundingClientRect();
      const w = tip.offsetWidth;
      const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, win.innerWidth - w - 4));
      const above = r.top - tip.offsetHeight - 6;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(above >= 4 ? above : r.bottom + 6)}px`;
    }
    const timeAt = (target) => target && target.closest ? target.closest(`${OURS}, ${GAME}`) : null;
    function onOver(e) {
      const el = timeAt(e.target);
      if (el === shownFor) return;
      if (el) show(el);
      else hide();
    }
    function onTap(e) {
      if (e.pointerType === "mouse") return;
      const el = timeAt(e.target);
      if (!el) return;
      show(el);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, TAP_MS);
    }
    doc.addEventListener("mouseover", onOver);
    doc.addEventListener("pointerup", onTap);
    doc.addEventListener("scroll", hide, true);
    return {
      clock: () => clock,
      destroy() {
        doc.removeEventListener("mouseover", onOver);
        doc.removeEventListener("pointerup", onTap);
        doc.removeEventListener("scroll", hide, true);
        hide();
        if (tip) tip.remove();
        tip = null;
      }
    };
  }

  // src/app.js
  var CHATTING_MS = 5 * 60 * 1e3;
  var INTERVALS = { threadsIdle: 15e3, threadsChatting: 5e3, activeDm: 2e3, activeDmBusy: 1e4, dmInfo: 6e4, presence: 6e4, hiddenNotify: 6e4 };
  var MAX_NOTIFY = 3;
  var PRESENCE_PER_SWEEP = 20;
  function createApp({ api, playerId, playerName, doc = document, win = window, storage = win.localStorage, now = () => Date.now(), sound = createSound({ win }), notifier: notifierOpt = null }) {
    const store = createStore({ playerId, storage, win, now });
    const settings = createSettingsStore({ playerId, storage, win, now });
    const enemies = createEnemiesStore({ playerId, storage, win, now });
    const router = createRouter({ win, doc });
    const toast = createToaster(doc);
    const players = createPlayers({ api, now });
    const notifier = notifierOpt || createNotifier({ win, onOpen: (id) => openFromNotification(id) });
    let notifyAsk = 0;
    const notificationsOn = () => settings.get().notify && notifier.permission() === "granted";
    const tabFocus = createTabFocus({ storage, key: `zcf:v1:${playerId}:focus`, doc, win, now });
    let stopped = false;
    let activeDmId = null;
    let chattingUntil = 0;
    const isChatting = () => now() < chattingUntil;
    const dmEntry = (id) => store.get().dock.dms.find((d) => d.id === id);
    const isExpanded = (id) => !!(dmEntry(id) && dmEntry(id).open);
    const expandedIds = () => store.get().dock.dms.filter((d) => d.open).map((d) => d.id);
    function syncPlayerInfo(id, info2) {
      if (!info2) return;
      const stale = (p) => !!p && (typeof info2.username === "string" && info2.username && info2.username !== p.username || typeof info2.avatar === "string" && info2.avatar && info2.avatar !== p.avatar);
      if (stale(store.get().friends[id])) store.update((s) => updateFriendInfo(s, id, info2));
      if (stale(enemies.get().enemies[id])) enemies.update((d) => updateEnemyInfo(d, id, info2));
    }
    const presence = createPresence({ fetchProfile: (id) => api.getProfile(id), onProfile: syncPlayerInfo, now });
    function markChatting() {
      const was = isChatting();
      chattingUntil = now() + CHATTING_MS;
      if (!was) threadsPoller.reschedule();
    }
    function markSeenIfNeeded(id) {
      if (!isExpanded(id) || doc.visibilityState === "hidden") return;
      const c = conversations.get(id);
      if (!c || !c.state.loaded) return;
      const seen = inbox.lastReply(id) || c.latestTs();
      const t = store.get().threads[id];
      if (!t || t.unread > 0 || (t.lastSeenReply || 0) < seen) store.update((s) => markSeen(s, id, seen));
    }
    const conversations = createConversations({
      api,
      myId: playerId,
      onActivity: () => markChatting(),
      onInfo: (id, info2) => {
        presence.set(id, info2);
        syncPlayerInfo(id, info2);
      },
      onChange: (id) => markSeenIfNeeded(id)
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
        if (tabFocus.elsewhere()) return;
        const name = settings.get().sound;
        if (name !== "off") sound.play(name);
        notifyNewMail(arrived);
      }
    });
    function notifyNewMail(arrived) {
      const s = settings.get();
      if (!notificationsOn() || tabFocus.focused()) return;
      const friends = store.get().friends;
      const list = arrived.filter((t) => !s.notifyFriendsOnly || friends[t.userId]).sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0)).slice(0, MAX_NOTIFY);
      for (const t of list) notifier.show({ id: t.userId, title: t.username, body: Array.from(t.preview || "").slice(0, 120).join(""), icon: avatarUrl(t.avatar) });
    }
    function openFromNotification(id) {
      const t = inbox.threads().find((x) => x.userId === id);
      actions.openDm(id, { expand: true, username: t ? t.username : void 0, avatar: t ? t.avatar : void 0 });
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
      interval: () => isChatting() ? INTERVALS.threadsChatting : INTERVALS.threadsIdle,
      // While the tab is hidden, a slow check keeps notifications coming; with them off it stops as before.
      hiddenInterval: () => notificationsOn() ? INTERVALS.hiddenNotify : null,
      onAuthLost,
      doc
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
      doc
    });
    const infoPoller = makePoller({
      run: async () => {
        for (const id of expandedIds()) await conversations.acquire(id).refreshInfo();
        return { ok: true };
      },
      interval: INTERVALS.dmInfo,
      doc
    });
    const listOpen = () => store.get().dock.friendsOpen || page.active;
    function presenceTargets() {
      const ids = /* @__PURE__ */ new Set();
      const onPage = page.active ? page.kind : null;
      if (store.get().dock.friendsOpen || onPage === "friends") for (const id of Object.keys(store.get().friends)) ids.add(Number(id));
      if (onPage === "enemies") for (const id of Object.keys(enemies.get().enemies)) ids.add(Number(id));
      return [...ids];
    }
    const presencePoller = makePoller({
      run: () => {
        const age = (id) => presence.lastTried(id);
        const stale = presenceTargets().filter((id) => presence.isStale(id));
        presence.refresh(stale.sort((a, b) => age(a) - age(b)).slice(0, PRESENCE_PER_SWEEP));
        return { ok: true };
      },
      interval: INTERVALS.presence,
      doc
    });
    const pollers = [threadsPoller, activeDmPoller, infoPoller, presencePoller];
    function syncPollers() {
      if (stopped) return;
      const s = store.get();
      const anyOpen = s.dock.dms.some((d) => d.open);
      for (const [p, on] of [[activeDmPoller, anyOpen], [infoPoller, anyOpen], [presencePoller, listOpen()]]) {
        if (on) p.start();
        else p.stop();
      }
    }
    function stopAll() {
      stopped = true;
      for (const p of pollers) p.stop();
    }
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
      openDm(id, { expand = true, username, avatar: avatar2 } = {}) {
        const small = dock.isSmall();
        store.update((s) => openDm(s, id, { expand, exclusive: small && expand, now: now(), username, avatar: avatar2 }));
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
        sound.unlock();
      },
      resetChat: (key) => settings.update((s) => resetChat(s, key)),
      resetAllChats: () => settings.update((s) => resetAllChats(s)),
      async setNotify(on) {
        const ask = ++notifyAsk;
        const off = (message, opts) => {
          settings.update((s) => setFlag(s, "notify", false));
          if (message) toast(message, opts);
        };
        if (!on) return off();
        const answer = await notifier.request();
        if (ask !== notifyAsk) return;
        if (answer === "default") return off("Notifications stay off until you allow them when your browser asks.");
        if (answer === "unsupported") return off("This browser has no desktop notifications.", { error: true });
        if (answer !== "granted") return off("Notifications are blocked for zed.city in your browser's site settings.", { error: true });
        if (!notifier.confirm()) return off("This browser won't show notifications from a web page.", { error: true });
        settings.update((s) => setFlag(s, "notify", true));
      },
      setNotifyFriendsOnly: (on) => settings.update((s) => setFlag(s, "notifyFriendsOnly", on)),
      setTitleCount: (on) => settings.update((s) => setFlag(s, "titleCount", on)),
      togglePin(id) {
        if (!settings.update((s) => togglePinned(s, id))) toast("You can pin up to 20 chats.");
      },
      markAllRead: (onProgress) => markAllRead({
        ids: chatsUnreadIds(store.get(), inbox.threads(), settings.get().muted),
        api,
        markSeen: (id) => store.update((s) => markSeen(s, id, inbox.lastReply(id))),
        onProgress,
        toast
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
      importFriends(text2) {
        const r = parseImport(text2, playerId);
        if (!r.ok) return r;
        const f = store.update((s) => mergeImport(s, r.friends, now()));
        const e = r.enemies.length ? enemies.update((d) => mergeEnemiesImport(d, r.enemies, now())) : { added: 0, notes: 0 };
        return { ok: true, added: f.added, enemiesAdded: e.added, notes: f.notes + e.notes };
      }
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
      isSmall: dock.isSmall
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
          return d && d.username || s.friends[id] && s.friends[id].username || null;
        },
        isMuted: (id) => isMuted(settings.get(), id),
        toggleMute: (id) => actions.toggleMute(id)
      }
    });
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
      myId: playerId
    });
    const marks = createEnemyMarks({ doc, win, keeper, names: () => enemyNames(enemies.get()) });
    const page = createFriendsPage(services, { doc, win, keeper });
    const titleCount = createTitleCount({ doc, win });
    const timeHover = createTimeHover({ doc, win, storage, key: `zcf:v1:${playerId}:gameClock`, now });
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
    const unlockSound = () => {
      if (settings.get().sound !== "off") sound.unlock();
    };
    doc.addEventListener("pointerdown", unlockSound, { capture: true, once: true });
    const onVisible = () => {
      if (doc.visibilityState !== "hidden") for (const id of expandedIds()) markSeenIfNeeded(id);
    };
    doc.addEventListener("visibilitychange", onVisible);
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
        timeHover.destroy();
        tabFocus.destroy();
        view.destroy();
        doc.removeEventListener("pointerdown", unlockSound, true);
        doc.removeEventListener("visibilitychange", onVisible);
        page.destroy();
        topbar.destroy();
        keeper.destroy();
        router.destroy();
        store.destroy();
        settings.destroy();
        enemies.destroy();
      }
    };
  }

  // src/ui/styles.js
  var CSS = `
.zcf-root{display:contents}
.zcf [hidden]{display:none!important}
.zcf .chat-header{background:#090a0b}
.zcf.chat-container .chat-header{gap:6px}
.zcf.chat-container .chat-title{min-width:0}
.zcf .zcf-hbtn{background:none;border:0;padding:0 2px;margin:0;color:#ffffff4d;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center}
.zcf .zcf-hbtn:hover{color:#ffffffb3}
.zcf .chat-toggle{margin-left:0}
.zcf.chat-minimized .zcf-badge{position:absolute;top:-6px;right:2px;min-height:12px;padding:0 3px;font-size:8px;line-height:12px}
.zcf.chat-minimized .chat-title{justify-content:center;position:relative}
.zcf-body{position:relative;font-size:13px}
.zcf.chat-container .chat-content{display:flex;flex-direction:column}
.zcf-dm:not(.chat-minimized){height:450px}
.chat-container.zcf-pm .chat-header .chat-title .chat-icon{color:#629464!important}
.chat-container.zcf-pm .chat-header:hover .chat-title .chat-icon{color:#3d8b40!important}
.chat-containers .zcf-pm{order:2}
.zcf-pm:not(.chat-minimized){height:450px}
.zcf-pm-main{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.zcf-pm-tabs{display:flex;flex:none;background:#090a0b;border-bottom:1px solid #000}
.zcf-pm-tab{flex:1 1 0;min-width:0;height:32px;padding:0 4px;background:none;border:0;color:#9e9e9e;font-family:Oswald,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer}
.zcf-pm-tab:hover{color:#e0e0e0}
.zcf-pm-tab.zcf-pm-tab-on{background:#0f1114;color:#e6e6e6;box-shadow:inset 0 2px 0 #0a748f}
.zcf-pm .zcf-toolbar{flex:none}
.zcf-pm-line{display:flex;align-items:center;gap:6px;min-width:0}
.zcf-pm-line .zcf-name{min-width:0}
.zcf-pm-time{margin-left:auto;flex:none;font-size:10.5px;opacity:.45;white-space:nowrap}
.zcf-pm-line .zcf-pm-pin{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:-4px;padding:0;background:none;border:0;border-radius:3px;color:#ffffff59;font-size:10px;cursor:pointer;opacity:0}
.zcf-row:hover .zcf-pm-line .zcf-pm-pin,.zcf-row:focus-within .zcf-pm-line .zcf-pm-pin,.zcf-pm-line .zcf-pm-pin.zcf-pinned{opacity:1}
.zcf-pm-line .zcf-pm-pin:hover,.zcf-pm-line .zcf-pm-pin:focus-visible{color:#e0e0e0;background:#ffffff14}
.zcf-pm-line .zcf-pm-pin.zcf-pinned{color:#f2c037}
@media (hover:none){.zcf-pm-line .zcf-pm-pin{opacity:1}}
.zcf-pm-preview.zcf-unread{color:#fff;opacity:1;font-weight:500}
.zcf-pill.zcf-pill-green{background:#3d8b40}
.zcf-pill.zcf-pill-dim{opacity:.45}
.zcf-pm-more,.zcf-pm-foot{display:block;width:100%;background:none;border:0;border-top:1px solid #ffffff0d;color:#6fb3c8;font:inherit;font-size:11.5px;padding:8px 10px;text-align:center;cursor:pointer}
.zcf-pm-more:hover,.zcf-pm-foot:hover{background:#ffffff08}
.zcf-pm-more:disabled{opacity:.5;cursor:default}
.zcf-pm-retry{color:#6fb3c8}
.zcf-pm-confirm .zcf-row-main{font-size:12.5px}
.zcf-enemy-mark{color:#ef5350;font-size:.85em;margin-right:4px}
.zcf-muted-mark{font-size:.85em;margin-left:5px;opacity:.5}
.chat-containers .zcf-settings{order:4}
.zcf-settings:not(.chat-minimized) .chat-content{overflow-y:auto}
.zcf-set{padding:2px 0 8px}
.zcf-set-sec{padding:8px 12px;border-bottom:1px solid #ffffff0d}
.zcf-set-sec:last-child{border-bottom:0}
.zcf-set-h{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff59;margin-bottom:6px}
.zcf-set-btns{display:flex;flex-wrap:wrap;gap:6px}
.zcf-set-chat{display:flex;align-items:center;gap:8px;padding:4px 0}
.zcf-set-lock{width:14px;flex:none;text-align:center;color:#9e9e9e;font-size:11px}
.zcf-set-all{margin-top:6px}
.zcf-set-sound{display:flex;align-items:center;gap:8px;font-size:12.5px}
.zcf-set-sound span{flex:1}
.zcf-set-select{background:#14171a;border:1px solid #ffffff14;border-radius:3px;color:#d9d9d9;font:inherit;font-size:12px;padding:3px 6px}
.zcf-set-play:disabled{opacity:.4;cursor:default}
.zcf-set-about{font-size:12px;opacity:.6}
.zcf-set-toggle{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;cursor:pointer}
.zcf-set-toggle input{margin:0;accent-color:#0a748f;cursor:pointer}
.zcf-set-toggle input:disabled{cursor:default}
.zcf-set-toggle input:disabled + span{opacity:.45}
.zcf-set-sub{padding-left:22px}
.zcf-set-note{font-size:11px;color:#f2c037;padding:2px 0 4px 22px}
.zcf-set-dev{display:inline-block;margin-top:8px;color:#6fb3c8;font-size:11px;text-decoration:none;opacity:.8}
.zcf-set-dev:hover{opacity:1;text-decoration:underline}
.zcf-set-dev i{font-size:10px}
.zcf-news-toggle{display:block;background:none;border:0;padding:6px 0 0;color:#6fb3c8;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.zcf-news-toggle:hover{text-decoration:underline}
.zcf-news-ver{margin-top:8px}
.zcf-news-vh{display:flex;gap:8px;align-items:baseline;font-size:12px;font-weight:700}
.zcf-news-date{font-size:11px;font-weight:400;opacity:.45}
.zcf-news-f{margin-top:5px}
.zcf-news-ft{font-size:12px;color:#e0e0e0}
.zcf-news-f ul{margin:2px 0 0;padding-left:16px;font-size:11.5px;opacity:.75}
.zcf-cc{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:6px;text-transform:none;letter-spacing:0;font-weight:400}
.chat-container.chat-minimized .zcf-cc{display:none}
.zcf-cc [hidden]{display:none!important}
.zcf-cc-icon{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;padding:0;background:none;border:0;color:#ffffff4d;font-size:11px;cursor:pointer}
.zcf-cc-icon:hover{color:#ffffffb3}
.zcf-cc-lock.zcf-cc-unlocked{color:#f2c037}
.zcf-cc-inline{display:inline-flex;align-items:center;gap:3px;margin-right:4px;color:#d9d9d9;font-size:11px}
.zcf-cc-step,.zcf-cc-btn{height:18px;min-width:18px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font:inherit;font-size:11px;line-height:1;cursor:pointer}
.zcf-cc-step:hover,.zcf-cc-btn:hover{background:#ffffff1f;color:#fff}
.zcf-cc-btn:disabled,.zcf-cc-step:disabled{opacity:.4;cursor:default}
.zcf-cc-value{min-width:34px;text-align:center;font-variant-numeric:tabular-nums}
.zcf-grip{position:absolute;z-index:10;background:transparent;touch-action:none;user-select:none}
.zcf-grip:hover{background:#0a748f59}
.zcf-grip-n{top:0;left:0;right:0;height:6px;cursor:ns-resize}
.zcf-grip-s{bottom:0;left:0;right:0;height:6px;cursor:ns-resize}
.zcf-grip-nw{top:0;left:0;width:12px;height:12px;cursor:nwse-resize;z-index:11}
.zcf-grip-se{right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize;z-index:11}
html.zcf-dragging,html.zcf-dragging *{cursor:grabbing!important;user-select:none!important}
html.zcf-resizing,html.zcf-resizing *{user-select:none!important}
.zcf-cmenu{position:fixed;z-index:4000;min-width:210px;padding:6px 0;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;color:#d9d9d9;font-size:12.5px}
.zcf-cmenu[hidden]{display:none}
.zcf-cmenu-title{padding:2px 12px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff66}
.zcf-cmenu-row{display:flex;align-items:center;gap:6px;padding:4px 12px}
.zcf-cmenu-label{flex:1}
.zcf-toolbar{display:flex;gap:6px;align-items:center;background:#ffffff05;border-bottom:1px solid #ffffff1a;min-height:42px;padding:7px 8px}
.zcf-search{flex:1;display:flex;align-items:center;gap:6px;background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:0 7px}
.zcf-search i{opacity:.45;font-size:11px}
.zcf-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 0}
.zcf-input::placeholder{color:#ffffff4d}
.zcf-list{flex:1;overflow-y:auto;overscroll-behavior:contain}
.zcf-row{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;position:relative}
.zcf-row:hover{background:#ffffff08}
.zcf-row-main{min-width:0;flex:1}
.zcf-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-name mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-status{font-size:11px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-pill{background:#ff4242;color:#fff;font-size:9px;font-weight:700;border-radius:8px;padding:1px 5px}
.zcf-mini{background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font-size:10.5px;padding:3px 6px;cursor:pointer}
.zcf-mini:hover{background:#ffffff1f;color:#fff}
.zcf-mini.zcf-danger{background:#ff42421f;color:#ff8a8a}
.zcf-add{background:#3d8b40;border:0;border-radius:3px;color:#fff;font-size:10px;text-transform:uppercase;padding:3px 8px;cursor:pointer}
.zcf-add-outline{background:none;border:1px solid #3d8b4088;color:#6fcf73}
.zcf-done{font-size:10px;text-transform:uppercase;color:#6fcf73;padding:3px 4px}
.zcf-empty{padding:6px 10px 10px;font-size:11.5px;opacity:.45}
.zcf-av{position:relative;flex:none;display:inline-block;border-radius:50%}
.zcf-av-img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;background:#2c3036}
.zcf-dot{position:absolute;bottom:-1px;right:-1px;width:7px;height:7px;border-radius:50%;border:1px solid #151619}
.zcf-on{background:#3d8b40}.zcf-off{background:#ef5350}
.zcf-pop{position:absolute;top:44px;right:8px;width:260px;max-width:calc(100% - 16px);background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;z-index:5;padding-bottom:4px}
.zcf-pop-title,.zcf-menu-title{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff66;padding:8px 10px 0}
.zcf-pop .zcf-input{display:block;width:calc(100% - 16px);margin:6px 8px;background:#0e1013;border:1px solid #0a748f;border-radius:3px;padding:6px 8px}
.zcf-results{max-height:240px;overflow-y:auto}
.zcf-result{display:flex;align-items:center;gap:8px;padding:6px 10px}
.zcf-result:hover{background:#ffffff08}
.zcf-menu{position:absolute;top:4px;right:8px;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;z-index:6;min-width:160px;padding:4px 0}
.zcf-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:#d9d9d9;font-size:12.5px;padding:7px 12px;cursor:pointer}
.zcf-menu button:hover{background:#ffffff0a}
.zcf-dm .chat-title .zcf-dm-name{text-transform:none;letter-spacing:0;font-weight:700;color:#d9d9d9;cursor:pointer;overflow:hidden;text-overflow:ellipsis}
.zcf-dm .chat-title .zcf-dm-name:hover{text-decoration:underline}
.zcf-dm .chat-title .zcf-dm-status{text-transform:none;letter-spacing:0;opacity:.55;white-space:nowrap}
.zcf-dm .chat-title .zcf-dm-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-dm.chat-minimized .zcf-close{position:absolute;top:-6px;left:-6px;width:14px;height:14px;border-radius:50%;background:#2c3036;color:#fff;font-size:8px;justify-content:center;display:none;padding:0}
.zcf-dm.chat-minimized:hover .zcf-close{display:flex}
.zcf-dm.chat-minimized .chat-header{position:relative}
.zcf-dm.chat-minimized .zcf-dm-name{display:none}
.zcf-notice{background:#f2c0371a;color:#f2c037;font-size:11.5px;padding:6px 12px;border-bottom:1px solid #f2c03733;flex:none}
.zcf-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 8px}
.zcf-loader{text-align:center;font-size:11px;opacity:.5;padding:6px}
.zcf-divider{display:flex;align-items:center;gap:8px;margin:10px 15px 2px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#ffffff59}
.zcf-divider:before,.zcf-divider:after{content:"";flex:1;border-top:1px solid #ffffff14}
.zcf-new-line{display:flex;align-items:center;gap:8px;margin:8px 15px 2px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6fcf73}
.zcf-new-line:before,.zcf-new-line:after{content:"";flex:1;border-top:1px solid #3d8b40aa}
.zcf-tip{position:fixed;z-index:4001;pointer-events:none;padding:4px 8px;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 4px 12px #00000080;color:#e0e0e0;font-size:11px;line-height:1.3;white-space:nowrap}
.zcf-tip[hidden]{display:none}
.zcf-msg{padding:2px 15px;margin-top:8px}
.zcf-msg.zcf-grouped,.zcf-pending-msg{margin-top:1px}
.zcf-msg:hover{background:#ffffff08}
.zcf-sender{font-weight:700;line-height:1.5}
.zcf-sender.zcf-them{color:#6fb3c8;cursor:pointer}
.zcf-sender.zcf-them:hover{text-decoration:underline}
.zcf-dm:not(.zcf-enemy) .zcf-them .zcf-enemy-mark{display:none}
.zcf-dm.chat-minimized .chat-title .zcf-enemy-mark{display:none}
.msg-cont .zcf-enemy-mark{margin-right:4px}
.zcf-time{opacity:.4;margin-left:8px;font-size:11px}
.zcf-text{opacity:.9;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.zcf .zcf-gif{display:block;max-width:100%;max-height:200px;width:auto;height:auto;border-radius:4px;margin:4px 0}
.zcf .zcf-emoji{height:1.35em;width:auto;vertical-align:-0.3em;display:inline;margin:0 1px}
.zcf-system .zcf-text{font-style:italic;opacity:.7}
.zcf-pending-msg .zcf-text{opacity:.55}
.zcf-failed .zcf-text{opacity:.5}
.zcf-error{color:#e57373;font-size:12px}
.zcf-link{background:none;border:0;padding:0;color:#e57373;text-decoration:underline;cursor:pointer;font:inherit}
.zcf-newchip{position:absolute;bottom:56px;left:50%;transform:translateX(-50%);background:#0a748f;color:#fff;border:0;border-radius:12px;font-size:11px;padding:3px 10px;cursor:pointer;box-shadow:0 4px 10px #0006}
.zcf-composer{display:flex;gap:6px;align-items:flex-end;border-top:1px solid #ffffff14;padding:8px;flex:none}
.zcf-compose{background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:6px 8px;resize:none;max-height:90px;line-height:1.4}
.zcf-send{background:#0a748f;color:#fff;border:0;border-radius:3px;font-size:10.5px;text-transform:uppercase;padding:7px 10px;cursor:pointer}
.zcf-send:disabled{opacity:.4;cursor:default}
.zcf-gifbtn{background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font-size:10.5px;font-weight:700;text-transform:uppercase;padding:7px 10px;cursor:pointer}
.zcf-gifbtn:hover{background:#ffffff1f;color:#fff}
.zcf-gifbtn:disabled{opacity:.4;cursor:default}
.zcf-gifbtn[aria-expanded="true"]{background:#3d8b40;color:#fff}
.zcf-gifpanel{flex:none;max-height:220px;overflow-y:auto;background:#16181c;border:1px solid #000;border-radius:4px;margin:0 8px;padding:8px}
.zcf-gif-search{display:block;box-sizing:border-box;width:100%;background:#0e1013;border:1px solid #0a748f;border-radius:3px;color:#d9d9d9;font:inherit;font-size:12px;padding:6px 8px;margin-bottom:6px}
.zcf-gif-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.zcf-gif-chip.zcf-active{background:#3d8b40;color:#fff}
.zcf-gif-status{font-size:11px;opacity:.5;text-align:center;padding:4px 0}
.zcf-gif-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.zcf-gif-thumb{display:block;width:100%;height:70px;object-fit:cover;border-radius:3px;background:#202327;cursor:pointer}
.zcf-gif-thumb:hover{outline:2px solid #0a748f}
.zcf-emojibtn{background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font-size:14px;padding:7px 9px;cursor:pointer;line-height:1;display:flex;align-items:center}
.zcf-emojibtn:hover{background:#ffffff1f;color:#fff}
.zcf-emojibtn:disabled{opacity:.4;cursor:default}
.zcf-emojibtn[aria-expanded="true"]{background:#3d8b40;color:#fff}
.zcf-empanel{flex:none;max-height:240px;overflow-y:auto;background:#16181c;border:1px solid #000;border-radius:4px;margin:0 8px;padding:8px}
.zcf-em-search{display:block;box-sizing:border-box;width:100%;background:#0e1013;border:1px solid #0a748f;border-radius:3px;color:#d9d9d9;font:inherit;font-size:12px;padding:6px 8px;margin-bottom:6px}
.zcf-em-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.zcf-em-tab{display:flex;align-items:center;justify-content:center}
.zcf-em-tab.zcf-active{background:#3d8b40;color:#fff}
.zcf-em-tab-icon{width:11px;height:11px;display:block}
.zcf-em-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.zcf-em-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0;border-radius:3px;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0}
.zcf-em-btn:hover{background:#ffffff14}
.zcf-em-img{width:22px;height:22px;object-fit:contain;display:block}
.zcf-em-empty{grid-column:1/-1;font-size:11px;opacity:.5;text-align:center;padding:10px 0}
.zcf-toasts{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.zcf-toast{background:#202327;color:#d9d9d9;border:1px solid #000;border-left:3px solid #3d8b40;border-radius:4px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 18px #00000080}
.zcf-toast-error{border-left-color:#ff4242}
.q-btn.zcf-is-friend{color:#81c784!important}
.q-btn.zcf-is-enemy{color:#ef5350!important}
.zcf-page{max-width:1000px;margin:0 auto;color:#d9d9d9;font-size:13px}
.zcf-page-title{display:flex;align-items:center;margin-bottom:16px}
.zcf-page-side{flex:1;display:flex;align-items:center;min-width:0}
.zcf-page-side-r{justify-content:flex-end}
.zcf-page-mid{text-align:center}
.zcf-page-htabs{display:flex;justify-content:center;gap:18px}
.zcf-page .zcf-page-h{color:#e0e0e0;text-decoration:none;opacity:.35;transition:opacity .15s}
.zcf-page .zcf-page-h:hover{opacity:.7}
.zcf-page .zcf-page-h.zcf-page-h-on{opacity:1}
.zcf-page .zcf-name-row{display:flex;align-items:center;gap:6px}
.zcf-page .zcf-name-row > .zcf-enemy-mark{margin:0}
.zcf-page-sub{font-size:12px;color:#9e9e9e;margin-top:2px}
.zcf-page-back{display:inline-flex;align-items:center;gap:6px;color:#bdbdbd;font-size:12px;text-transform:uppercase;text-decoration:none;padding:4px 8px;border-radius:4px}
.zcf-page-back:hover{background:#ffffff0d;color:#e0e0e0}
.zcf-page-back i{font-size:10px}
.zcf-page-addwrap{position:relative}
.zcf-page-add{display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid #e0e0e0aa;border-radius:4px;color:#e0e0e0;font:inherit;font-size:12px;text-transform:uppercase;padding:5px 10px;cursor:pointer}
.zcf-page-add:hover,.zcf-page-add.zcf-page-add-on{background:#ffffff14}
.zcf-page-add i{font-size:10px}
.zcf-page-add-short{display:none}
.zcf-page .zcf-pop{top:calc(100% + 6px);right:0;max-width:calc(100vw - 32px)}
.zcf-page-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.zcf-page-tabs{display:flex;gap:4px}
.zcf-page-tab{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;background:#121417f5;border:1px solid #000;border-radius:4px;color:#9e9e9e;font-family:Oswald,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer}
.zcf-page-tab b{font-weight:400;opacity:.55}
.zcf-page-tab:hover{color:#e0e0e0}
.zcf-page-tab.zcf-page-tab-on{background:#0f1114;color:#e6e6e6;box-shadow:inset 0 2px 0 #0a748f}
.zcf-page-search{display:flex;align-items:center;gap:8px;margin-left:auto;width:260px;height:36px;padding:0 10px;background:#ffffff26;border-radius:4px}
.zcf-page-search i{font-size:12px;opacity:.6}
.zcf-page-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#e0e0e0;font:inherit;font-size:13px}
.zcf-page-input::placeholder{color:#ffffff80}
.zcf-page-panel{background:#202327;border:1px solid #000;border-radius:4px}
.zcf-page-table{width:100%;border-collapse:collapse}
.zcf-page-table th{background:#090a0b;color:#a6a6a6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:left;white-space:nowrap;padding:10px 12px;border-bottom:1px solid #000}
.zcf-page-table td{padding:6px 12px;border-top:1px solid #2b3035;border-bottom:1px solid #090a0b;vertical-align:middle}
.zcf-page-sort{background:none;border:0;padding:0;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}
.zcf-page-sort:hover,.zcf-page-sort.zcf-page-sort-on{color:#e0e0e0}
.zcf-page-arrow{color:#0d9bbf;margin-left:4px;font-size:9px}
.zcf-page-table .zcf-col-level{width:60px}
.zcf-page-table .zcf-col-status,.zcf-page-table .zcf-col-faction{white-space:nowrap}
.zcf-page-table .zcf-col-note{width:32%;max-width:0}
.zcf-page-table .zcf-col-act{width:1%;white-space:nowrap}
.zcf-chip{display:inline-flex;align-items:center;gap:8px;min-width:160px;max-width:230px;padding:2px 10px 2px 2px;background:#151619;border-radius:6px;color:#d9d9d9;text-decoration:none}
.zcf-chip:hover{background:#0e0f11}
.zcf-page .zcf-chip .zcf-av-img{border-radius:4px}
.zcf-page .zcf-chip .zcf-dot{width:8px;height:8px;border-width:2px;bottom:-2px;right:-2px}
.zcf-chip-name{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-page mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-c-sub{display:none;font-size:11px;color:#9e9e9e;margin-top:3px}
.zcf-c-subnote{font-style:italic}
.zcf-st-on{color:#69f0ae}
.zcf-st-off{color:#ef5350}
.zcf-st-unknown{color:#9e9e9e}
.zcf-st-icon{color:#90a4ae;margin-left:7px;font-size:13px}
.zcf-fac{display:inline-flex;align-items:center;gap:6px;color:#bdbdbd;text-decoration:none}
.zcf-fac:hover{color:#e0e0e0;text-decoration:underline}
.zcf-fac i{color:#90a4ae;font-size:11px}
.zcf-dim{opacity:.35}
.zcf-note{display:block;width:100%;background:none;border:0;padding:2px 0;color:#9e9e9e;font:inherit;font-style:italic;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text}
.zcf-note:hover{color:#d9d9d9}
.zcf-note.zcf-note-empty{opacity:.4}
.zcf-page-row.zcf-editing td{background:#0a748f14}
.zcf-note-input{display:block;box-sizing:border-box;width:100%;background:#0e1013;border:1px solid #0a748f;border-radius:3px;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 8px}
.zcf-note-hint{font-size:10.5px;color:#9e9e9e;margin-top:4px}
.zcf-acts{display:flex;justify-content:flex-end;gap:4px;position:relative}
.zcf-act{position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:26px;background:#ffffff0d;border:0;border-radius:4px;color:#bdbdbd;font-size:12px;cursor:pointer}
.zcf-act:hover{background:#ffffff1f;color:#fff}
.zcf-act.zcf-act-msg{background:#0a748f;color:#fff}
.zcf-act.zcf-act-msg:hover{background:#0c86a6}
.zcf-act .zcf-pill{position:absolute;top:-6px;right:-6px}
.zcf-act.zcf-act-more{display:none}
.zcf-page-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:10;min-width:140px;padding:4px 0;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0}
.zcf-page-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:#d9d9d9;font:inherit;font-size:13px;padding:8px 12px;cursor:pointer}
.zcf-page-menu button:hover{background:#ffffff0a}
.zcf-page-confirm td{background:#ff42420f}
.zcf-confirm{display:flex;align-items:center;gap:8px}
.zcf-confirm-text{flex:1}
.zcf-page-btn{background:#ffffff0d;border:0;border-radius:4px;color:#bdbdbd;font:inherit;font-size:11px;text-transform:uppercase;padding:5px 12px;cursor:pointer}
.zcf-page-btn:hover{background:#ffffff1f;color:#fff}
.zcf-page-btn.zcf-page-danger{background:#ff42421f;color:#ff8a8a}
.zcf-page-empty{padding:28px 16px;text-align:center;color:#9e9e9e}
@media (min-width:600px){
  body .chat-containers{right:0}
  .chat-containers .chat-container.chat-minimized{touch-action:none}
  .chat-containers .zcf-dm.chat-minimized{width:auto;max-width:150px}
  .chat-containers .zcf-dm.chat-minimized .chat-header{padding:0 10px 0 8px}
  .chat-containers .zcf-dm.chat-minimized .chat-header .chat-title{justify-content:flex-start;gap:6px}
  .chat-containers .zcf-dm.chat-minimized .zcf-dm-name{display:inline-block;white-space:nowrap;flex:1;min-width:0}
}
@media (max-width:599.98px){
  .zcf-cc,.zcf-grip{display:none!important}
  .chat-containers .zcf.zcf-open{order:3;flex:1 1 340px;width:auto;min-width:0;max-width:340px}
  .chat-containers:has(> .zcf-root > .zcf.zcf-open){flex-wrap:wrap-reverse;left:10px}
  .chat-containers:has(> .zcf-root > .zcf.zcf-open) .zcf.zcf-open{order:5;flex:0 0 100%;width:100%;max-width:none}
  @supports not selector(:has(a)){
    .chat-containers .zcf.zcf-open ~ .zcf-settings.chat-minimized,.chat-containers.single-chat-mode .zcf-settings.chat-minimized{display:none}
  }
  .zcf-dm:not(.chat-minimized){height:min(450px,60vh)}
  .zcf-pm:not(.chat-minimized){height:min(450px,60vh)}
  .zcf-page-back{display:none}
  .zcf-page-add-long{display:none}
  .zcf-page-add-short{display:inline}
  .zcf-page-search{width:100%;margin-left:0}
  .zcf-page-table .zcf-col-level,.zcf-page-table .zcf-col-faction,.zcf-page-table .zcf-col-note{display:none}
  .zcf-page-table .zcf-editing .zcf-col-note{display:table-cell}
  .zcf-page-table .zcf-editing .zcf-col-status{display:none}
  .zcf-page-table th,.zcf-page-table td{padding-left:8px;padding-right:8px}
  .zcf-chip{min-width:0;max-width:170px}
  .zcf-c-sub{display:block}
  .zcf-act.zcf-act-wide{display:none}
  .zcf-act.zcf-act-more{display:flex}
  .q-gutter-xs > .zcf-topbar{margin-left:2px}
}
`;
  function injectStyles(doc = document) {
    if (doc.getElementById("zcf-styles")) return;
    const style = doc.createElement("style");
    style.id = "zcf-styles";
    style.textContent = CSS;
    doc.head.appendChild(style);
  }

  // src/main.js
  var RETRY_MS = 15e3;
  async function waitForPlayer(api, { retryMs = RETRY_MS, maxTries = Infinity, onWait } = {}) {
    for (let i = 0; i < maxTries; i += 1) {
      const r = await api.getStats();
      const me = r.ok ? statsPlayer(r.data) : null;
      if (me) return me;
      if (r.ok) warnOnce("stats-shape", r.data && typeof r.data === "object" ? Object.keys(r.data) : r.data);
      if (onWait) onWait();
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
    return null;
  }
  async function boot({ win = window, doc = document, api = createApi() } = {}) {
    if (win.__zcfStarted) return null;
    win.__zcfStarted = true;
    try {
      hideGame404Early(doc, win);
      const player = await waitForPlayer(api, { onWait: () => doc.documentElement.classList.remove(PAGE_CLASS) });
      if (!player) return null;
      injectStyles(doc);
      return createApp({ api, playerId: player.id, playerName: player.username, doc, win });
    } catch (e) {
      doc.documentElement.classList.remove(PAGE_CLASS);
      warnOnce("boot", e);
      return null;
    }
  }

  // src/index.js
  boot();
})();
