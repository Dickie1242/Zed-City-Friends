// ==UserScript==
// @name         Zed City Friends
// @namespace    zed-city-friends
// @version      0.4.1
// @description  Friends list and Torn-style DM windows in Zed City's chat dock.
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
      findPlayer: (q) => request("GET", "findPlayer", { params: { q } })
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
    return { v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, dms: [] } };
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
        dms: Array.isArray(dock.dms) ? dock.dms.filter((d) => isObj(d) && toId(d.id)) : []
      }
    };
  }
  function isFriend(state, id) {
    return !!state.friends[id];
  }
  function addFriend(state, { id, username, avatar: avatar2 }, now) {
    if (state.friends[id]) return false;
    state.friends[id] = { id, username: username || `#${id}`, avatar: avatar2 || null, addedAt: now };
    return true;
  }
  function removeFriend(state, id) {
    delete state.friends[id];
  }
  function updateFriendInfo(state, id, { username, avatar: avatar2 }) {
    const f = state.friends[id];
    if (!f) return false;
    let changed = false;
    if (typeof username === "string" && username && username !== f.username) {
      f.username = username;
      changed = true;
    }
    if (typeof avatar2 === "string" && avatar2 && avatar2 !== f.avatar) {
      f.avatar = avatar2;
      changed = true;
    }
    return changed;
  }
  var MAX_NOTE = 200;
  var normalizeNote = (note) => typeof note === "string" ? note.trim().slice(0, MAX_NOTE).trim() : "";
  function setFriendNote(state, id, note) {
    const f = state.friends[id];
    if (!f) return false;
    const text2 = normalizeNote(note);
    if ((f.note || "") === text2) return false;
    if (text2) f.note = text2;
    else delete f.note;
    return true;
  }
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
    if (open && exclusive) for (const d of state.dock.dms) d.open = false;
  }
  function collapseAll(state) {
    state.dock.friendsOpen = false;
    for (const d of state.dock.dms) d.open = false;
  }
  function chatsUnreadTotal(state, inboxThreads) {
    const ids = new Set(Object.keys(state.friends).map(Number));
    for (const t of inboxThreads) if (!t.isSystem) ids.add(t.userId);
    let n = 0;
    for (const id of ids) {
      const t = state.threads[id];
      if (t && t.unread > 0) n += t.unread;
    }
    return n;
  }

  // src/store.js
  var storageKey = (playerId) => `zcf:v1:${playerId}`;
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
  function utcDayKey(ts) {
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function formatClock(ts) {
    const d = new Date(ts);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  function formatMessageTime(ts, now = Date.now()) {
    const clock = formatClock(ts);
    const day = utcDayKey(ts);
    if (day === utcDayKey(now)) return clock;
    if (day === utcDayKey(now - DAY_MS)) return `Yesterday at ${clock}`;
    const d = new Date(ts);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} at ${clock}`;
  }
  function formatDayLabel(ts) {
    const d = new Date(ts);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
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
  function statusText(info, now = Date.now()) {
    if (!info) return "";
    if (info.online) return "Online";
    if (info.active) return `Active ${timeAgo(info.active, now)}`;
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
  function longStatusText(info, now = Date.now()) {
    if (!info) return "";
    if (info.online) return "Online";
    if (info.active) return `Active ${longAgo(info.active, now)}`;
    return "Offline";
  }

  // src/presence.js
  function lastActive(value, now) {
    if (value === null || value === void 0 || value === "") return null;
    const n = Number(value);
    if (Number.isFinite(n)) {
      if (n < 0) return null;
      if (n < 1e9) return now - n * 1e3;
    }
    return parseSentAt(value);
  }
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
    function store(id, info, at, profile) {
      if (!info || typeof info !== "object") return;
      const prev = cache.get(id);
      cache.set(id, {
        online: !!info.online,
        active: lastActive(info.active, now()),
        fetchedAt: at,
        profile: profile || prev && prev.profile || null
      });
      emit(id);
    }
    function set(id, info) {
      store(id, info, now());
    }
    function isStale(id, maxAgeMs = staleMs) {
      if (failedAt.has(id) && now() - failedAt.get(id) < maxAgeMs) return false;
      const c = cache.get(id);
      return !c || !c.profile || now() - c.fetchedAt >= maxAgeMs;
    }
    function lastTried(id) {
      const c = cache.get(id);
      return Math.max(c ? c.fetchedAt : 0, failedAt.get(id) || 0);
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
    const parts = [];
    let buf = "";
    let last = 0;
    SHORTCODE_RE.lastIndex = 0;
    let m;
    while (m = SHORTCODE_RE.exec(text2)) {
      buf += text2.slice(last, m.index);
      const rec = findEmoji(m[1]);
      if (rec && rec.src) {
        if (buf) parts.push({ type: "text", text: buf });
        buf = "";
        parts.push({ type: "emoji", name: rec.name, src: rec.src });
      } else if (rec && rec.emoji) {
        buf += rec.emoji;
      } else {
        buf += m[0];
      }
      last = m.index + m[0].length;
    }
    buf += text2.slice(last);
    if (buf || parts.length === 0) parts.push({ type: "text", text: buf });
    return parts;
  }
  function splitFlags(text2) {
    parse();
    if (!FLAG_RE) return [{ type: "text", text: text2 }];
    const parts = [];
    let last = 0;
    FLAG_RE.lastIndex = 0;
    let m;
    while (m = FLAG_RE.exec(text2)) {
      if (m.index > last) parts.push({ type: "text", text: text2.slice(last, m.index) });
      const emoji = m[0];
      parts.push({ type: "emoji", name: FLAG_NAMES.get(emoji), src: flagImageUrl(emoji), emoji });
      last = m.index + m[0].length;
    }
    if (last < text2.length || parts.length === 0) parts.push({ type: "text", text: text2.slice(last) });
    return parts;
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
    const parts = [];
    for (const p of expanded) {
      if (p.type === "text" && p.text === "") continue;
      const top = parts[parts.length - 1];
      if (p.type === "text" && top && top.type === "text") top.text += p.text;
      else parts.push(p.type === "text" ? { type: "text", text: p.text } : p);
    }
    return parts.length ? parts : [{ type: "text", text: "" }];
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
  function normalizeThread(raw) {
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
      lastReply: parseSentAt(raw.last_reply),
      newMail: unread > 0 ? Math.floor(unread) : 0,
      isSystem: flag(raw.is_system)
    };
  }
  function normalizeThreads(data) {
    return asArray(data).map(normalizeThread).filter(Boolean);
  }
  function buildLog(messages) {
    const byId = /* @__PURE__ */ new Map();
    for (const m of messages) byId.set(m.id, m);
    const sorted = [...byId.values()].sort((a, b) => a.id - b.id);
    const items = [];
    let prev = null;
    for (const m of sorted) {
      const day = m.ts !== null ? utcDayKey(m.ts) : null;
      const prevDay = prev && prev.ts !== null ? utcDayKey(prev.ts) : null;
      if (day && day !== prevDay) items.push({ type: "divider", key: `d:${day}`, label: formatDayLabel(m.ts) });
      const grouped = !!prev && prev.senderId === m.senderId && day !== null && day === prevDay && Math.abs(m.ts - prev.ts) <= GROUP_WINDOW_MS;
      items.push({ type: "msg", key: `m:${m.id}`, msg: m, grouped });
      prev = m;
    }
    return items;
  }
  function findNewMail(threads, seen, myId) {
    const out = [];
    for (const t of threads) {
      if (t.isSystem || t.newMail <= 0 || t.senderId === myId) continue;
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
      const info = r.data && (r.data[userId] || r.data[String(userId)]);
      if (info && typeof info === "object") {
        state.info = {
          username: typeof info.username === "string" ? info.username : null,
          avatar: typeof info.avatar === "string" ? info.avatar : null,
          online: !!info.online,
          active: info.active
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
            onInfo: (info) => onInfo(userId, info)
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
  function recentSignature(list) {
    return JSON.stringify(list.map((t) => [t.userId, t.username, t.avatar, t.preview, t.lastReply, t.newMail, t.isSystem]));
  }
  function createInbox({ api, store, myId, now = () => Date.now(), onActivity = () => {
  }, onThreadChanged = () => {
  } }) {
    let threads = [];
    let previous = null;
    let lastSignature = null;
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
      if (!r.ok) return r;
      threads = normalizeThreads(r.data);
      const byId = new Map(threads.map((t) => [t.userId, t]));
      const state = store.get();
      const fresh = findNewMail(threads, state.threads, myId);
      const freshIds = new Set(fresh.map((t) => t.userId));
      const sortedFresh = [...fresh].sort((a, b) => (a.lastReply || 0) - (b.lastReply || 0));
      const changes = [];
      for (const t of sortedFresh) {
        const seen = state.threads[t.userId] || {};
        const pop = !!state.friends[t.userId] && (t.lastReply || 0) > (seen.lastNotifiedReply || 0);
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
      lastReply(userId) {
        const t = threads.find((x) => x.userId === userId);
        return t ? t.lastReply : null;
      },
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      }
    };
  }

  // src/poller.js
  function makePoller({ run, interval, maxBackoff = 3e5, busyInterval = 6e4, onAuthLost, doc = document }) {
    let active = false;
    let timer = null;
    let running = false;
    let rerun = false;
    let backoff = 0;
    const base = () => typeof interval === "function" ? interval() : interval;
    const visible = () => doc.visibilityState !== "hidden";
    function clear2() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    function schedule(ms) {
      clear2();
      if (active && visible()) timer = setTimeout(tick, ms);
    }
    async function tick() {
      clear2();
      if (!active || !visible()) return;
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
  function exportFriends(state, playerId) {
    const friends = Object.values(state.friends).map((f) => f.note ? { id: f.id, username: f.username, note: f.note } : { id: f.id, username: f.username });
    return JSON.stringify({ v: 1, playerId, friends }, null, 2);
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
    const friends = [];
    const seen = /* @__PURE__ */ new Set();
    for (const f of doc.friends) {
      const id = toId(f && f.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const username = (typeof f.username === "string" ? f.username.slice(0, 32) : "") || `#${id}`;
      const note = normalizeNote(f.note);
      friends.push(note ? { id, username, note } : { id, username });
    }
    return { ok: true, friends };
  }
  function mergeImport(state, friends, now) {
    let added = 0;
    let notes = 0;
    for (const f of friends) {
      if (addFriend(state, f, now)) added += 1;
      if (f.note && !state.friends[f.id].note && setFriendNote(state, f.id, f.note)) notes += 1;
    }
    return { added, notes };
  }
  function importMessage({ added, notes = 0 }) {
    const friends = `${added} new friend${added === 1 ? "" : "s"}`;
    return notes ? `Imported ${friends} and ${notes} note${notes === 1 ? "" : "s"}.` : `Imported ${friends}.`;
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

  // src/ui/add-friend-popover.js
  var MAX_RESULTS = 8;
  function createAddFriendPopover({ players, isFriend: isFriend2, onAdd, onClose }) {
    let seq = 0;
    let results = [];
    const input = h("input", { class: "zcf-input", type: "text", placeholder: "Name or player ID", "aria-label": "Find a player" });
    const list = h("div", { class: "zcf-results" });
    const el = h("div", { class: "zcf-pop", hidden: true }, h("div", { class: "zcf-pop-title" }, "Add friend"), input, list);
    function message(text2) {
      clear(list);
      if (text2) list.appendChild(h("div", { class: "zcf-empty" }, text2));
    }
    function row(p) {
      const action = isFriend2(p.id) ? h("span", { class: "zcf-done" }, "✓ Friend") : h("button", {
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
    const search = debounce(async (mine, q) => {
      let r;
      try {
        r = await players.search(q);
      } catch {
        r = { ok: false };
      }
      if (mine !== seq) return;
      if (!r.ok) {
        message("Search failed. Try again.");
        return;
      }
      results = r.data.slice(0, MAX_RESULTS);
      render();
    }, 300);
    input.addEventListener("input", () => {
      const q = input.value.trim();
      seq += 1;
      const mine = seq;
      if (q.length >= 2 || /^\d+$/.test(q)) {
        message("Searching…");
        search(mine, q);
      } else {
        search.cancel();
        results = [];
        message(q ? "Keep typing…" : "");
      }
    });
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
      seq += 1;
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
      // Re-draw "Add" / "✓ Friend" after the friends list changes elsewhere.
      refresh() {
        if (!el.hidden && results.length) render();
      }
    };
  }

  // src/friends-view.js
  var byName = (a, b) => a.username.localeCompare(b.username, void 0, { sensitivity: "base" });
  function buildFriendSections({ friends, presence, threads, filter }) {
    const q = String(filter || "").trim().toLowerCase();
    const matches = (name) => !q || String(name).toLowerCase().includes(q);
    const online = [];
    const offline = [];
    let onlineCount = 0;
    const all = Object.values(friends);
    for (const f of all) {
      const p = presence(f.id);
      if (p && p.online) onlineCount += 1;
      if (!matches(f.username)) continue;
      const row = { id: f.id, username: f.username, avatar: f.avatar, presence: p };
      (p && p.online ? online : offline).push(row);
    }
    online.sort(byName);
    offline.sort((a, b) => (b.presence && b.presence.active || 0) - (a.presence && a.presence.active || 0) || byName(a, b));
    const recent = threads.filter((t) => !t.isSystem && !friends[t.userId] && matches(t.username)).sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0));
    return { online, offline, recent, onlineCount, total: all.length };
  }

  // src/ui/friends-window.js
  var MAX_IMPORT_BYTES = 1024 * 1024;
  function createFriendsWindow(services, { doc = document } = {}) {
    const { store, actions, presence, inbox, players, router, toast, playerId } = services;
    let filter = "";
    let confirmId = null;
    let frame = 0;
    let lastSig = null;
    const titleText = h("span", null, "Friends & Chats");
    const count = h("span", { class: "zcf-count" });
    const unreadBadge = badge();
    unreadBadge.classList.replace("bg-red-5", "bg-positive");
    const title = h("div", { class: "chat-title" }, h("i", { class: "fas fa-user-friends chat-icon", "aria-hidden": "true" }), titleText, count, unreadBadge);
    const menuBtn = h("button", { class: "zcf-hbtn", type: "button", title: "More", "aria-label": "More" }, icon("ellipsis-h"));
    const toggle = h("div", { class: "chat-toggle", "aria-hidden": "true" }, icon("chevron-down"));
    const header = h("div", { class: "chat-header", onclick: () => actions.toggleFriends() }, title, menuBtn, toggle);
    const filterInput = h("input", { class: "zcf-input", type: "text", placeholder: "Search friends…", "aria-label": "Search friends" });
    const addBtn = h("button", { class: "zcf-iconbtn", type: "button", title: "Add friend", "aria-label": "Add friend", "aria-expanded": "false" }, icon("user-plus"));
    const toolbar = h("div", { class: "zcf-toolbar" }, h("label", { class: "zcf-search" }, icon("search"), filterInput), addBtn);
    const list = h("div", { class: "zcf-list" });
    function syncAddBtn() {
      addBtn.classList.toggle("zcf-active", pop.isOpen);
      addBtn.setAttribute("aria-expanded", String(pop.isOpen));
    }
    const pop = createAddFriendPopover({
      players,
      isFriend: (id) => isFriend(store.get(), id),
      onAdd: (p) => {
        actions.addFriend(p);
        toast(`${p.username} added to friends`);
      },
      onClose: syncAddBtn
    });
    const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    const menu = h(
      "div",
      { class: "zcf-menu", hidden: true },
      h("div", { class: "zcf-menu-title" }, "Friends list"),
      h("button", { type: "button", onclick: onExport }, "Export friends"),
      h("button", { type: "button", onclick: () => {
        menu.hidden = true;
        fileInput.click();
      } }, "Import friends")
    );
    const body = h("div", { class: "chat-content zcf-body" }, toolbar, list, pop.el, menu, fileInput);
    const el = h("div", { class: "chat-container zcf zcf-friends" }, header, body);
    filterInput.addEventListener("input", () => {
      filter = filterInput.value;
      renderList();
    });
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pop.isOpen) pop.close();
      else pop.open();
      syncAddBtn();
    });
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      if (!menu.hidden) menu.querySelector("button").focus();
    });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        menu.hidden = true;
        menuBtn.focus();
      }
    }, true);
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
    function onDocMousedown(e) {
      if (pop.isOpen && !pop.el.contains(e.target) && !addBtn.contains(e.target)) pop.close();
      if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) menu.hidden = true;
    }
    doc.addEventListener("mousedown", onDocMousedown);
    function onExport() {
      menu.hidden = true;
      const s = store.get();
      const n = Object.keys(s.friends).length;
      downloadText(`zed-city-friends-${playerId}.json`, actions.exportFriends(), doc);
      toast(`Exported ${n} friend${n === 1 ? "" : "s"}.`);
    }
    function section(label, rows, render, emptyText) {
      list.appendChild(h("div", { class: "zcf-sec" }, `${label} — ${rows.length}`));
      if (!rows.length) list.appendChild(h("div", { class: "zcf-empty" }, emptyText));
      for (const r of rows) list.appendChild(render(r));
    }
    function friendRow(r, s, now) {
      if (confirmId === r.id) {
        return h(
          "div",
          { class: "zcf-row" },
          h("div", { class: "zcf-row-main" }, `Remove ${r.username} from friends?`),
          h("button", { class: "zcf-mini zcf-danger", type: "button", onclick: (e) => {
            e.stopPropagation();
            confirmId = null;
            actions.removeFriend(r.id);
          } }, "Remove"),
          h("button", {
            class: "zcf-mini",
            type: "button",
            "data-zcf-focus": `cancel:${r.id}`,
            onclick: (e) => {
              e.stopPropagation();
              confirmId = null;
              renderList();
            }
          }, "Cancel")
        );
      }
      const online = !!(r.presence && r.presence.online);
      const unread = s.threads[r.id] && s.threads[r.id].unread || 0;
      const openRow = () => actions.openDm(r.id, { expand: true, username: r.username, avatar: r.avatar });
      return h(
        "div",
        {
          class: "zcf-row",
          tabindex: 0,
          "data-zcf-focus": `row:${r.id}`,
          onclick: openRow,
          onkeydown: (e) => {
            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
              e.preventDefault();
              openRow();
            }
          }
        },
        avatar({ avatar: r.avatar, online: r.presence ? online : void 0 }),
        h(
          "div",
          { class: "zcf-row-main" },
          h("div", { class: "zcf-name" }, highlightMatch(r.username, filter)),
          h("div", { class: `zcf-status${online ? " zcf-status-on" : ""}` }, statusText(r.presence, now) || " ")
        ),
        unread > 0 ? h("span", { class: "zcf-pill" }, String(unread)) : null,
        h(
          "div",
          { class: "zcf-row-actions" },
          h("button", { class: "zcf-mini", type: "button", "data-zcf-focus": `profile:${r.id}`, onclick: (e) => {
            e.stopPropagation();
            router.navigate(`/profile/${r.id}`);
          } }, "Profile"),
          h("button", {
            class: "zcf-mini",
            type: "button",
            "data-zcf-focus": `remove:${r.id}`,
            onclick: (e) => {
              e.stopPropagation();
              confirmId = r.id;
              renderList();
              const cancel = list.querySelector(`[data-zcf-focus="cancel:${r.id}"]`);
              if (cancel) cancel.focus();
            }
          }, "Remove")
        )
      );
    }
    function recentRow(t, s) {
      const unread = s.threads[t.userId] && s.threads[t.userId].unread || 0;
      const knownUsername = t.username === `#${t.userId}` ? void 0 : t.username;
      const openRow = () => actions.openDm(t.userId, { expand: true, username: knownUsername, avatar: t.avatar });
      return h(
        "div",
        {
          class: "zcf-row",
          tabindex: 0,
          "data-zcf-focus": `row:${t.userId}`,
          onclick: openRow,
          onkeydown: (e) => {
            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
              e.preventDefault();
              openRow();
            }
          }
        },
        avatar({ avatar: t.avatar }),
        h(
          "div",
          { class: "zcf-row-main" },
          h("div", { class: "zcf-name" }, highlightMatch(t.username, filter)),
          h("div", { class: "zcf-status" }, t.preview || " ")
        ),
        unread > 0 ? h("span", { class: "zcf-pill" }, String(unread)) : null,
        h("button", {
          class: "zcf-add zcf-add-outline",
          type: "button",
          "data-zcf-focus": `addfriend:${t.userId}`,
          onclick: (e) => {
            e.stopPropagation();
            if (e.detail > 1) return;
            actions.addFriend({ id: t.userId, username: t.username, avatar: t.avatar });
            toast(`${t.username} added to friends`);
          }
        }, "+ Friend")
      );
    }
    function rowSig(r, s, now) {
      const unread = s.threads[r.id] && s.threads[r.id].unread || 0;
      return [r.id, r.username, r.avatar, !!r.presence, !!(r.presence && r.presence.online), statusText(r.presence, now), unread];
    }
    function recentSig(t, s) {
      const unread = s.threads[t.userId] && s.threads[t.userId].unread || 0;
      return [t.userId, t.username, t.avatar, unread, t.preview || ""];
    }
    function listSignature(sec, s, now, q) {
      return JSON.stringify([
        q,
        confirmId,
        sec.online.length,
        sec.offline.length,
        sec.recent.length,
        sec.total,
        sec.onlineCount,
        sec.online.map((r) => rowSig(r, s, now)),
        sec.offline.map((r) => rowSig(r, s, now)),
        sec.recent.map((t) => recentSig(t, s))
      ]);
    }
    function renderList() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      const s = store.get();
      const now = Date.now();
      const q = filter.trim();
      const sec = buildFriendSections({ friends: s.friends, presence: presence.get, threads: inbox.threads(), filter });
      count.textContent = `${sec.onlineCount} / ${sec.total} online`;
      const sig = listSignature(sec, s, now, q);
      if (sig === lastSig) return;
      lastSig = sig;
      const activeKey = list.contains(doc.activeElement) ? doc.activeElement.dataset.zcfFocus : void 0;
      const scrollTop = list.scrollTop;
      clear(list);
      const none = q ? "No matches" : "None";
      if (!sec.total && !q) {
        list.appendChild(h("div", { class: "zcf-empty" }, 'No friends yet. Use the person-plus button above, or "Add Friend" on a profile.'));
      } else {
        section("Online", sec.online, (r) => friendRow(r, s, now), none);
        section("Offline", sec.offline, (r) => friendRow(r, s, now), none);
      }
      if (sec.recent.length) section("Recent — not friends", sec.recent, (t) => recentRow(t, s), none);
      list.scrollTop = scrollTop;
      if (activeKey) {
        const match = list.querySelector(`[data-zcf-focus="${activeKey}"]`);
        if (match) match.focus();
      }
    }
    function syncBadge() {
      const s = store.get();
      setBadge(unreadBadge, chatsUnreadTotal(s, inbox.threads()), !s.dock.friendsOpen);
    }
    function update() {
      const s = store.get();
      const open = !!s.dock.friendsOpen;
      el.classList.toggle("chat-minimized", !open);
      el.classList.toggle("zcf-open", open);
      body.hidden = !open;
      titleText.hidden = !open;
      count.hidden = !open;
      menuBtn.hidden = !open;
      toggle.hidden = !open;
      syncBadge();
      if (open) {
        renderList();
        pop.refresh();
      } else {
        pop.close();
        menu.hidden = true;
        confirmId = null;
      }
    }
    function scheduleList() {
      if (frame || !store.get().dock.friendsOpen) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderList();
      });
    }
    function destroy() {
      doc.removeEventListener("mousedown", onDocMousedown);
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      pop.close();
      menu.hidden = true;
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
    const conv = conversations.acquire(userId);
    let renderedKeys = [];
    let atBottom = true;
    let wasOpen = false;
    const avatarSlot = h("span", { class: "zcf-dm-avatar" });
    const nameEl = h("span", { class: "zcf-dm-name" });
    const statusEl = h("span", { class: "zcf-dm-status" });
    const unreadBadge = badge();
    const title = h("div", { class: "chat-title" }, avatarSlot, nameEl, statusEl, unreadBadge);
    const inboxBtn = h("button", { class: "zcf-hbtn", type: "button", title: "Open in inbox", "aria-label": "Open in inbox" }, icon("external-link-alt"));
    const minBtn = h("button", { class: "zcf-hbtn", type: "button", title: "Minimize", "aria-label": "Minimize" }, icon("minus"));
    const closeBtn = h("button", { class: "zcf-hbtn zcf-close", type: "button", title: "Close", "aria-label": "Close" }, icon("times"));
    const header = h("div", { class: "chat-header", onclick: () => actions.toggleDm(userId) }, title, inboxBtn, minBtn, closeBtn);
    const notice = h("div", { class: "zcf-notice", hidden: true });
    const loader = h("div", { class: "zcf-loader", hidden: true }, "Loading…");
    const log = h("div", { class: "zcf-log" });
    const pendingEl = h("div", { class: "zcf-pending" });
    const scroller = h("div", { class: "zcf-scroll" }, loader, log, pendingEl);
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
    const composer = h("div", { class: "zcf-composer" }, input, emojiBtn, gifBtn, sendBtn);
    const body = h("div", { class: "chat-content zcf-body zcf-dm-body" }, notice, scroller, newChip, emojiPicker.el, gifPicker.el, composer);
    const el = h("div", { class: "chat-container zcf zcf-dm", dataset: { zcfDm: String(userId) } }, header, body);
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
      const m = item.msg;
      const cls = `zcf-msg${item.grouped ? " zcf-grouped" : ""}${m.isSystem ? " zcf-system" : ""}`;
      const time = m.ts ? formatMessageTime(m.ts) : "";
      if (item.grouped) return h("div", { class: cls, title: time }, h("div", { class: "zcf-text" }, ...renderText(m.text)));
      const mine = m.senderId === myId;
      const sender = mine ? h("span", { class: "zcf-sender" }, myName) : h("span", { class: "zcf-sender zcf-them", onclick: () => router.navigate(`/profile/${userId}`) }, displayName());
      return h("div", { class: cls }, sender, h("span", { class: "zcf-time" }, time), h("div", { class: "zcf-text" }, ...renderText(m.text)));
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
      const items = buildLog(conv.messages());
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
        if (conv.trim()) return;
      } else if (prepended) {
        scroller.scrollTop = prevTop + (scroller.scrollHeight - prevHeight);
      } else if (grew) {
        newChip.hidden = false;
      }
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
      const p = presence.get(userId);
      clear(avatarSlot).appendChild(avatar({ avatar: avatarPath(), online: p ? p.online : void 0, size: open ? 18 : 24 }));
      nameEl.textContent = displayName();
      nameEl.title = displayName();
      statusEl.textContent = statusText(p);
      statusEl.classList.toggle("zcf-status-on", !!(p && p.online));
      el.title = open ? "" : displayName();
      const unread = s.threads[userId] && s.threads[userId].unread || 0;
      setBadge(unreadBadge, unread, !open);
      if (open && !wasOpen) {
        conv.ensureLoaded();
        atBottom = true;
        renderConversation();
      }
      if (!open) {
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
    const friends = createFriendsWindow(services);
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
      const desired = [...entries.map((e) => dms.get(e.id).el), friends.el];
      desired.forEach((node, i) => {
        if (root.children[i] !== node) root.insertBefore(node, root.children[i] || null);
      });
      for (const w of dms.values()) w.update();
      friends.update();
    }
    return {
      render,
      friends,
      dmWindow: (id) => dms.get(id) || null
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
  function createProfileButton({ doc = document, win = window, store, actions, players, toast }) {
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
      const friend = isFriend(store.get(), profileId);
      setIcon(friend ? "fa-user-check" : "fa-user-plus");
      label.textContent = friend ? confirming ? "Remove?" : "Friends" : "Add Friend";
      button.classList.toggle("zcf-is-friend", friend);
      button.classList.toggle("text-grey-4", !friend);
      button.title = friend ? "Click to remove from friends" : "Add to your friends list";
    }
    async function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const id = profileId;
      if (id === null) return;
      if (isFriend(store.get(), id)) {
        if (confirming) {
          confirming = false;
          clearTimeout(confirmTimer);
          actions.removeFriend(id);
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
      actions.addFriend({ id, username, avatar: typeof data.avatar === "string" ? data.avatar : null });
      toast(`${username} added to friends`);
    }
    function tryInsert() {
      if (profileId === null) return true;
      if (wrap && wrap.isConnected) return true;
      if (findButton("fa-cog", /^settings$/i)) return true;
      const mail = findButton("fa-envelope", /^mail$/i);
      const trade = findButton("fa-exchange", /^trade$/i);
      const block = findButton("fa-ban", /^(un)?block$/i);
      const template = mail || block;
      if (!template || !template.parentElement) return false;
      wrap = template.parentElement.cloneNode(true);
      wrap.classList.add("zcf-profile-btn");
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
      button.addEventListener("click", safe("profile-button-click", onClick));
      if (mail && trade) trade.parentElement.after(wrap);
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
      if (profileId === null) return;
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
        if (!wrap && !findButton("fa-cog", /^settings$/i)) warnOnce("profile-buttons-not-found", path);
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
    return { onRoute, refresh, tryInsert, destroy };
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
  function buildFriendsTable({ friends, presence, threads = {}, tab = "all", query = "", sort = DEFAULT_SORT }) {
    const q = String(query || "").trim().toLowerCase();
    const all = Object.values(friends).map((f) => {
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
    const inTab = all.filter((r) => tab === "all" || tab === "online" === isOnline(r));
    const matches = (r) => !q || r.username.toLowerCase().includes(q) || r.note.toLowerCase().includes(q);
    return { rows: sortRows(inTab.filter(matches), sort), counts };
  }

  // src/ui/friends-page.js
  var FRIENDS_PATH = "/friends";
  var PAGE_CLASS = "zcf-on-friends";
  var HIDE_404_CSS = `html.${PAGE_CLASS} .q-page-container > .fixed-center{display:none!important}`;
  var WARN_MS = 1e4;
  var isFriendsPath = (path) => path === FRIENDS_PATH || path === `${FRIENDS_PATH}/`;
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
  var TABS = [["all", "All"], ["online", "Online"], ["offline", "Offline"]];
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
    let active = false;
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
    let popFriendsSig = "";
    let headSig = null;
    let currentIds = [];
    let unkeep = null;
    let warnTimer = null;
    const rowEls = /* @__PURE__ */ new Map();
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
    const addBtn = h(
      "button",
      { class: "zcf-page-add", type: "button", "aria-expanded": "false" },
      icon("plus"),
      h("span", { class: "zcf-page-add-long" }, "Add friend"),
      h("span", { class: "zcf-page-add-short" }, "Add")
    );
    const pop = createAddFriendPopover({
      players,
      isFriend: (id) => isFriend(store.get(), id),
      onAdd: (p) => {
        actions.addFriend(p);
        toast(`${p.username} added to friends`);
      },
      onClose: () => syncAddBtn()
    });
    const title = h(
      "div",
      { class: "zcf-page-title" },
      h("div", { class: "zcf-page-side" }, link("/city", "zcf-page-back", [icon("chevron-left"), "City"])),
      h("div", { class: "zcf-page-mid" }, h("div", { class: "text-h4 text-uppercase text-no-bg zcf-page-h" }, "Friends"), subtitle),
      h("div", { class: "zcf-page-side zcf-page-side-r" }, h("div", { class: "zcf-page-addwrap" }, addBtn, pop.el))
    );
    const tabEls = /* @__PURE__ */ new Map();
    for (const [key, label] of TABS) {
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
      const f = store.get().friends[id];
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
      const f = store.get().friends[id];
      if (f && (f.note || "") !== normalizeNote(text2)) actions.setFriendNote(id, text2);
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
      actions.removeFriend(id);
      render();
      if (next !== void 0) focusKey(`name:${next}`);
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
      if (confirmId === r.id) return JSON.stringify(["confirm", r.id, r.username]);
      if (editId === r.id) return JSON.stringify(["edit", r.id]);
      return JSON.stringify([r.id, r.username, r.avatar, r.note, r.unread, !!r.presence, longStatusText(r.presence, now), r.profile, menuId === r.id, query.trim()]);
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
            h("span", { class: "zcf-confirm-text" }, `Remove ${r.username} from your friends?`),
            h("button", { class: "zcf-page-btn zcf-page-danger", type: "button", "data-zcf-focus": `confirm:${r.id}`, onclick: () => doRemove(r.id) }, "Remove"),
            h("button", { class: "zcf-page-btn", type: "button", "data-zcf-focus": `cancel:${r.id}`, onclick: () => cancelRemove(r.id) }, "Cancel")
          )
        )
      );
    }
    function buildRow(r, now) {
      if (confirmId === r.id) return confirmRow(r);
      const online = !!(r.presence && r.presence.online);
      const p = r.profile;
      const level = p && p.level ? String(p.level) : "—";
      const meta = [`Lv ${level}`, p && p.faction ? p.faction.name : null].filter(Boolean).join(" · ");
      const nameCell = h(
        "td",
        { class: "zcf-col-name" },
        link(`/profile/${r.id}`, "zcf-chip", [
          avatar({ avatar: r.avatar, online: r.presence ? online : void 0, size: 24 }),
          h("span", { class: "zcf-chip-name" }, highlightMatch(r.username, query))
        ], { "data-zcf-focus": `name:${r.id}`, title: r.username }),
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
          onclick: () => {
            menuId = menuId === r.id ? null : r.id;
            render();
          }
        }, icon("ellipsis-h")),
        menuId === r.id ? h(
          "div",
          { class: "zcf-page-menu", role: "menu" },
          h("button", {
            type: "button",
            role: "menuitem",
            onclick: () => {
              menuId = null;
              router.navigate(`/profile/${r.id}`);
            }
          }, "Profile"),
          h("button", { type: "button", role: "menuitem", onclick: () => startEdit(r.id) }, "Edit note"),
          h("button", { type: "button", role: "menuitem", onclick: () => askRemove(r.id) }, "Remove")
        ) : null
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
      const { rows, counts } = buildFriendsTable({ friends: s.friends, presence: presence.get, threads: s.threads, tab, query, sort });
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
          const sig = rowSig(r, now);
          let entry = rowEls.get(r.id);
          if (!entry || entry.sig !== sig) {
            const fresh = buildRow(r, now);
            if (entry) entry.el.replaceWith(fresh);
            entry = { sig, el: fresh };
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
        if (!counts.all) append(empty, ["No friends yet. Use ", h("b", null, "Add friend"), " above, or ", h("b", null, "Add Friend"), " on a player's profile."]);
        else if (q) empty.textContent = `No friends match "${q}".`;
        else empty.textContent = tab === "online" ? "No friends online right now." : "No offline friends.";
      }
      const friendsSig = Object.keys(s.friends).join(",");
      if (pop.isOpen && friendsSig !== popFriendsSig) pop.refresh();
      popFriendsSig = friendsSig;
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
    function ensure() {
      if (!active || el.isConnected) return;
      const slot = doc.querySelector(".q-page-container");
      if (!slot) return;
      doc.documentElement.classList.add(PAGE_CLASS);
      slot.appendChild(el);
    }
    function show() {
      active = true;
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
      doc.documentElement.classList.remove(PAGE_CLASS);
      el.remove();
    }
    function onRoute(path) {
      const want = isFriendsPath(path);
      if (want && !active) show();
      else if (!want && active) hide();
      else if (!want) doc.documentElement.classList.remove(PAGE_CLASS);
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
      destroy() {
        if (active) hide();
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

  // src/app.js
  var CHATTING_MS = 5 * 60 * 1e3;
  var INTERVALS = { threadsIdle: 15e3, threadsChatting: 5e3, activeDm: 2e3, activeDmBusy: 1e4, dmInfo: 6e4, presence: 6e4 };
  var PRESENCE_PER_SWEEP = 20;
  function createApp({ api, playerId, playerName, doc = document, win = window, storage = win.localStorage, now = () => Date.now() }) {
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
      const nameChanged = typeof info.username === "string" && info.username && info.username !== f.username;
      const avatarChanged = typeof info.avatar === "string" && info.avatar && info.avatar !== f.avatar;
      if (nameChanged || avatarChanged) store.update((s) => updateFriendInfo(s, id, info));
    }
    const presence = createPresence({ fetchProfile: (id) => api.getProfile(id), onProfile: syncFriendInfo, now });
    function markChatting() {
      const was = isChatting();
      chattingUntil = now() + CHATTING_MS;
      if (!was) threadsPoller.reschedule();
    }
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
      }
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
      interval: () => isChatting() ? INTERVALS.threadsChatting : INTERVALS.threadsIdle,
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
    const presencePoller = makePoller({
      run: () => {
        const age = (id) => presence.lastTried(id);
        const stale = Object.keys(store.get().friends).map(Number).filter((id) => presence.isStale(id));
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
      importFriends(text2) {
        const r = parseImport(text2, playerId);
        if (!r.ok) return r;
        return { ok: true, ...store.update((s) => mergeImport(s, r.friends, now())) };
      }
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
      isSmall: dock.isSmall
    };
    const view = createDockView({ root: dock.root, services });
    const profileButton = createProfileButton({ doc, win, store, actions, players, toast });
    const page = createFriendsPage(services, { doc, win, keeper });
    const topbar = createTopbarButton({ doc, keeper, router });
    store.subscribe(() => {
      view.render();
      syncPollers();
      profileButton.refresh();
      page.scheduleRender();
    });
    presence.subscribe(() => {
      view.friends.scheduleList();
      for (const d of store.get().dock.dms) {
        const w = view.dmWindow(d.id);
        if (w) w.update();
      }
      page.scheduleRender();
    });
    inbox.subscribe(() => {
      view.friends.scheduleList();
      view.friends.syncBadge();
    });
    router.onChange((path) => {
      profileButton.onRoute(path);
      page.onRoute(path);
      syncPollers();
      resumeIfLoggedIn();
    });
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
    page.start();
    topbar.start();
    if (dock.isSmall()) enforcePhoneRule();
    view.render();
    profileButton.onRoute(router.path);
    page.onRoute(router.path);
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
        page.destroy();
        topbar.destroy();
        keeper.destroy();
        router.destroy();
        store.destroy();
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
.zcf-friends .chat-title .chat-icon{color:#3d8b40}
.chat-containers .zcf-friends{order:2}
.zcf .zcf-count{text-transform:none;letter-spacing:0;opacity:.6;font-weight:400}
.zcf .zcf-hbtn{background:none;border:0;padding:0 2px;margin:0;color:#ffffff4d;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center}
.zcf .zcf-hbtn:hover{color:#ffffffb3}
.zcf .chat-toggle{margin-left:0}
.zcf.chat-minimized .zcf-badge{position:absolute;top:-6px;right:2px;min-height:12px;padding:0 3px;font-size:8px;line-height:12px}
.zcf.chat-minimized .chat-title{justify-content:center;position:relative}
.zcf-body{position:relative;font-size:13px}
.zcf.chat-container .chat-content{display:flex;flex-direction:column}
.zcf-dm:not(.chat-minimized){height:450px}
.zcf-toolbar{display:flex;gap:6px;align-items:center;background:#ffffff05;border-bottom:1px solid #ffffff1a;min-height:42px;padding:7px 8px}
.zcf-search{flex:1;display:flex;align-items:center;gap:6px;background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:0 7px}
.zcf-search i{opacity:.45;font-size:11px}
.zcf-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 0}
.zcf-input::placeholder{color:#ffffff4d}
.zcf-iconbtn{width:30px;height:28px;display:flex;align-items:center;justify-content:center;background:#ffffff0a;border:1px solid #ffffff14;border-radius:3px;color:#a6a6a6;cursor:pointer}
.zcf-iconbtn:hover,.zcf-iconbtn.zcf-active{background:#3d8b40;border-color:#3d8b40;color:#fff}
.zcf-list{flex:1;overflow-y:auto;overscroll-behavior:contain}
.zcf-sec{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff59;padding:8px 10px 4px}
.zcf-row{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;position:relative}
.zcf-row:hover{background:#ffffff08}
.zcf-row-main{min-width:0;flex:1}
.zcf-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-name mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-status{font-size:11px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-pill{background:#ff4242;color:#fff;font-size:9px;font-weight:700;border-radius:8px;padding:1px 5px}
.zcf-row-actions{display:none;gap:4px}
.zcf-row:hover .zcf-row-actions,.zcf-row:focus-within .zcf-row-actions{display:flex}
@media (hover:none){.zcf-row-actions{display:flex}}
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
.zcf-msg{padding:2px 15px;margin-top:8px}
.zcf-msg.zcf-grouped,.zcf-pending-msg{margin-top:1px}
.zcf-msg:hover{background:#ffffff08}
.zcf-sender{font-weight:700;line-height:1.5}
.zcf-sender.zcf-them{color:#6fb3c8;cursor:pointer}
.zcf-sender.zcf-them:hover{text-decoration:underline}
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
.zcf-page{max-width:1000px;margin:0 auto;color:#d9d9d9;font-size:13px}
.zcf-page-title{display:flex;align-items:center;margin-bottom:16px}
.zcf-page-side{flex:1;display:flex;align-items:center;min-width:0}
.zcf-page-side-r{justify-content:flex-end}
.zcf-page-mid{text-align:center}
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
  .chat-containers .zcf-dm.chat-minimized{width:auto;max-width:150px}
  .chat-containers .zcf-dm.chat-minimized .chat-header{padding:0 10px 0 8px}
  .chat-containers .zcf-dm.chat-minimized .chat-header .chat-title{justify-content:flex-start;gap:6px}
  .chat-containers .zcf-dm.chat-minimized .zcf-dm-name{display:inline-block;white-space:nowrap;flex:1;min-width:0}
}
@media (max-width:599.98px){
  .chat-containers .zcf.zcf-open{order:3;flex:1 1 340px;width:auto;min-width:0;max-width:340px}
  .zcf-dm:not(.chat-minimized){height:min(450px,60vh)}
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
