// ==UserScript==
// @name         Zed City Friends & DMs
// @namespace    zed-city-friends
// @version      0.1.0
// @description  Friends list and Torn-style DM windows in Zed City's chat dock.
// @match        https://www.zed.city/*
// @grant        none
// @run-at       document-idle
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
  function friendsUnreadTotal(state) {
    let n = 0;
    for (const id of Object.keys(state.friends)) {
      const t = state.threads[id];
      if (t && t.unread > 0) n += t.unread;
    }
    return n;
  }

  // src/store.js
  var storageKey = (playerId) => `zcf:v1:${playerId}`;
  function createStore({ playerId, storage = window.localStorage, win = window, now = () => Date.now() }) {
    const key = storageKey(playerId);
    const subs = /* @__PURE__ */ new Set();
    let saved = true;
    function read({ repair } = {}) {
      let text = null;
      try {
        text = storage.getItem(key);
      } catch (e) {
        warnOnce("store-read", e);
        return { doc: null, ok: false };
      }
      if (!text) return { doc: emptyState(), ok: true };
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return corrupt(text, e, repair);
      }
      if (parsed && typeof parsed === "object" && typeof parsed.v === "number" && parsed.v > 1) {
        warnOnce("store-newer", parsed.v);
        return { doc: null, ok: false };
      }
      try {
        return { doc: normalizeState(parsed), ok: true };
      } catch (e) {
        return corrupt(text, e, repair);
      }
    }
    function corrupt(text, e, repair) {
      warnOnce("store-corrupt", e);
      if (!repair) return { doc: null, ok: false };
      try {
        storage.setItem(`${key}:corrupt:${now()}`, text);
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

  // src/presence.js
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
    function store(id, info, at) {
      if (!info || typeof info !== "object") return;
      cache.set(id, { online: !!info.online, active: parseSentAt(info.active), fetchedAt: at });
      emit(id);
    }
    function set(id, info) {
      store(id, info, now());
    }
    function isStale(id) {
      const c = cache.get(id);
      return !c || now() - c.fetchedAt >= staleMs;
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
            store(id, r.data, queuedAt);
            if (onProfile) onProfile(id, r.data);
          } else if (r && !r.ok && (r.kind === "rate" || r.kind === "auth")) {
            pause();
          }
        }).catch((e) => warnOnce("presence-fetch", e)).finally(() => {
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
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      }
    };
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
  function messageParts(text) {
    const s = typeof text === "string" ? text : String(text ?? "");
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
    const parts = [];
    for (const p of raw) {
      if (p.type === "text" && p.text === "") continue;
      const top = parts[parts.length - 1];
      if (p.type === "text" && top && top.type === "text") top.text += p.text;
      else parts.push(p.type === "text" ? { type: "text", text: p.text } : p);
    }
    return parts.length ? parts : [{ type: "text", text: "" }];
  }
  function previewText(text) {
    const s = messageParts(text).map((p) => p.type === "image" ? `GIF${p.alt ? ": " + p.alt : ""}` : p.text).join("");
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
    async function send(text) {
      const body = String(text || "").trim();
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
    const friends = Object.values(state.friends).map((f) => ({ id: f.id, username: f.username }));
    return JSON.stringify({ v: 1, playerId, friends }, null, 2);
  }
  function parseImport(text, playerId) {
    let doc;
    try {
      doc = JSON.parse(text);
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
      const username = typeof f.username === "string" ? f.username.slice(0, 32) : "";
      friends.push({ id, username: username || `#${id}` });
    }
    return { ok: true, friends };
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
  function highlightMatch(text, query) {
    const s = String(text ?? "");
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
  function downloadText(filename, text, doc = document) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename, style: { display: "none" } });
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }

  // src/ui/dock.js
  var SMALL_QUERY = "(max-width: 599.98px)";
  function hasClassToken(value, cls) {
    return (value || "").split(/\s+/).includes(cls);
  }
  function createDock({ doc = document, win = window, onGameChatOpened = () => {
  } } = {}) {
    const root = h("div", { class: "zcf-root" });
    let dockEl = null;
    let frame = 0;
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
    const bodyObserver = new win.MutationObserver(
      safe("dock-body-observer", () => {
        if (frame || root.isConnected) return;
        frame = win.requestAnimationFrame(() => {
          frame = 0;
          safe("dock-ensure", ensure)();
        });
      })
    );
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
        bodyObserver.observe(doc.body, { childList: true, subtree: true });
      },
      destroy() {
        bodyObserver.disconnect();
        classObserver.disconnect();
        if (frame) win.cancelAnimationFrame(frame);
        frame = 0;
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
    function message(text) {
      clear(list);
      if (text) list.appendChild(h("div", { class: "zcf-empty" }, text));
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
    const titleText = h("span", null, "Friends");
    const count = h("span", { class: "zcf-count" });
    const unreadBadge = badge();
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
      let text;
      try {
        text = await file.text();
      } catch {
        toast("Couldn't read that file.", { error: true });
        return;
      }
      const res = actions.importFriends(text);
      toast(res.ok ? `Imported ${res.added} new friend${res.added === 1 ? "" : "s"}.` : res.error, { error: !res.ok });
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
        list.appendChild(h("div", { class: "zcf-empty" }, 'No friends yet. Use the person-plus button above, "Add Friend" on a profile, or "+ friend" next to a name in chat.'));
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
      setBadge(unreadBadge, friendsUnreadTotal(s), !open);
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
    return { el, update, scheduleList, destroy };
  }

  // src/ui/dm-window.js
  var BUSY_TEXT = {
    fight: "Mail is unavailable while you are in a fight.",
    traveling: "Mail is unavailable while you are traveling.",
    exploring: "Mail is unavailable while you are exploring.",
    offline: "Mail is unavailable while the game is offline."
  };
  function createDmWindow(services, userId) {
    const { store, actions, conversations, presence, router, myId, myName } = services;
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
    const sendBtn = h("button", { class: "zcf-send", type: "button" }, "Send");
    const body = h("div", { class: "chat-content zcf-body zcf-dm-body" }, notice, scroller, newChip, h("div", { class: "zcf-composer" }, input, sendBtn));
    const el = h("div", { class: "chat-container zcf zcf-dm", dataset: { zcfDm: String(userId) } }, header, body);
    const stop = (fn) => (e) => {
      e.stopPropagation();
      fn(e);
    };
    nameEl.addEventListener("click", stop(() => router.navigate(`/profile/${userId}`)));
    inboxBtn.addEventListener("click", stop(() => router.navigate(`/mail/${userId}`)));
    minBtn.addEventListener("click", stop(() => actions.minimizeDm(userId)));
    closeBtn.addEventListener("click", stop(() => actions.closeDm(userId)));
    newChip.addEventListener("click", () => scrollToBottom());
    sendBtn.addEventListener("click", () => submit());
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
      const text = input.value;
      input.value = "";
      atBottom = true;
      conv.send(text);
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
    function renderText(text) {
      return messageParts(text).map((part) => part.type === "image" ? renderGif(part) : document.createTextNode(part.text));
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
      const text = conv.state.blocked ? "You can't message this player." : conv.state.busy ? BUSY_TEXT[conv.state.busy] || "Mail is unavailable right now." : "";
      notice.textContent = text;
      notice.hidden = !text;
      input.disabled = conv.state.blocked;
      sendBtn.disabled = conv.state.blocked || !!conv.state.busy;
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
      wasOpen = open;
    }
    return {
      el,
      update,
      destroy() {
        unsubscribe();
        conversations.release(userId);
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
    return function toast(text, { error = false, ms = 3500 } = {}) {
      if (!host || !host.isConnected) {
        host = h("div", { class: "zcf-toasts", role: "status", "aria-live": "polite" });
        doc.body.appendChild(host);
      }
      const el = h("div", { class: `zcf-toast${error ? " zcf-toast-error" : ""}` }, text);
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

  // src/ui/chat-names.js
  function createChatNames({ doc = document, store, myName, players, actions, toast }) {
    let currentName = null;
    let busy = false;
    let friendNames = /* @__PURE__ */ new Set();
    const btn = h("button", { class: "zcf-addname", type: "button", title: "Add friend" }, icon("user-plus"), " friend");
    function refresh() {
      friendNames = new Set(Object.values(store.get().friends).map((f) => String(f.username).toLowerCase()));
      if (currentName && friendNames.has(currentName.toLowerCase())) btn.remove();
    }
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", safe("chat-add-click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const name = currentName;
      if (!name || busy) return;
      busy = true;
      try {
        const p = await players.resolveExact(name);
        if (!p) {
          toast(`Couldn't find ${name}`, { error: true });
          return;
        }
        actions.addFriend(p);
        toast(`${p.username} added to friends`);
        btn.remove();
      } finally {
        busy = false;
      }
    }));
    const onOver = safe("chat-names-over", (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== "function" || btn.contains(t)) return;
      const row = t.closest(".msg-cont");
      if (!row) return;
      const container = row.closest(".chat-container");
      if (!container || container.classList.contains("zcf")) return;
      const nameEl = row.querySelector(".sender-name");
      if (!nameEl) return;
      const name = nameEl.textContent.trim();
      if (!name || name.toLowerCase() === String(myName).toLowerCase() || friendNames.has(name.toLowerCase())) {
        btn.remove();
        return;
      }
      currentName = name;
      if (nameEl.nextSibling !== btn) nameEl.after(btn);
    });
    return {
      button: btn,
      refresh,
      start() {
        refresh();
        doc.addEventListener("mouseover", onOver);
      },
      stop() {
        doc.removeEventListener("mouseover", onOver);
        btn.remove();
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
    const presencePoller = makePoller({
      run: () => {
        const age = (id) => (presence.get(id) || { fetchedAt: 0 }).fetchedAt;
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
      for (const [p, on] of [[activeDmPoller, anyOpen], [infoPoller, anyOpen], [presencePoller, s.dock.friendsOpen]]) {
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
    const dock = createDock({ doc, win, onGameChatOpened: () => store.update((s) => collapseAll(s)) });
    const actions = {
      addFriend(p) {
        store.update((s) => addFriend(s, p, now()));
        presence.refresh([p.id]);
      },
      removeFriend: (id) => store.update((s) => removeFriend(s, id)),
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
      importFriends(text) {
        const r = parseImport(text, playerId);
        if (!r.ok) return r;
        const added = store.update((s) => r.friends.reduce((n, f) => n + (addFriend(s, f, now()) ? 1 : 0), 0));
        return { ok: true, added };
      }
    };
    const services = {
      playerId,
      myId: playerId,
      myName: playerName,
      store,
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
    const chatNames = createChatNames({ doc, store, myName: playerName, players, actions, toast });
    store.subscribe(() => {
      view.render();
      syncPollers();
      profileButton.refresh();
      chatNames.refresh();
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
    chatNames.start();
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
        chatNames.stop();
        store.destroy();
      }
    };
  }

  // src/ui/styles.js
  var CSS = `
.zcf-root{display:contents}
.zcf [hidden]{display:none!important}
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
.zcf-body{display:flex;flex-direction:column;height:420px;position:relative;font-size:13px}
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
.zcf-notice{background:#f2c0371a;color:#f2c037;font-size:11.5px;padding:6px 12px;border-bottom:1px solid #f2c03733}
.zcf-scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 8px}
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
.zcf-system .zcf-text{font-style:italic;opacity:.7}
.zcf-pending-msg .zcf-text{opacity:.55}
.zcf-failed .zcf-text{opacity:.5}
.zcf-error{color:#e57373;font-size:12px}
.zcf-link{background:none;border:0;padding:0;color:#e57373;text-decoration:underline;cursor:pointer;font:inherit}
.zcf-newchip{position:absolute;bottom:56px;left:50%;transform:translateX(-50%);background:#0a748f;color:#fff;border:0;border-radius:12px;font-size:11px;padding:3px 10px;cursor:pointer;box-shadow:0 4px 10px #0006}
.zcf-composer{display:flex;gap:6px;align-items:flex-end;border-top:1px solid #ffffff14;padding:8px}
.zcf-compose{background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:6px 8px;resize:none;max-height:90px;line-height:1.4}
.zcf-send{background:#0a748f;color:#fff;border:0;border-radius:3px;font-size:10.5px;text-transform:uppercase;padding:7px 10px;cursor:pointer}
.zcf-send:disabled{opacity:.4;cursor:default}
.zcf-toasts{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.zcf-toast{background:#202327;color:#d9d9d9;border:1px solid #000;border-left:3px solid #3d8b40;border-radius:4px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 18px #00000080}
.zcf-toast-error{border-left-color:#ff4242}
.zcf-addname{background:none;border:1px solid #3d8b4088;border-radius:3px;color:#6fcf73;font-size:10px;line-height:15px;padding:0 4px;margin-left:6px;cursor:pointer;vertical-align:1px}
.zcf-addname:hover{background:#3d8b40;color:#fff}
.q-btn.zcf-is-friend{color:#81c784!important}
@media (min-width:600px){
  .chat-containers .zcf-dm.chat-minimized{width:auto;max-width:150px}
  .chat-containers .zcf-dm.chat-minimized .chat-header{padding:0 10px 0 8px}
  .chat-containers .zcf-dm.chat-minimized .chat-title{justify-content:flex-start;gap:6px}
  .chat-containers .zcf-dm.chat-minimized .zcf-dm-name{display:inline-block;white-space:nowrap;flex:1;min-width:0}
}
@media (max-width:599.98px){
  .chat-containers .zcf.zcf-open{order:3;flex:1 1 340px;width:auto;min-width:0;max-width:340px}
  .zcf-body{height:min(420px,60vh)}
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
  async function waitForPlayer(api, { retryMs = RETRY_MS, maxTries = Infinity } = {}) {
    for (let i = 0; i < maxTries; i += 1) {
      const r = await api.getStats();
      const me = r.ok ? statsPlayer(r.data) : null;
      if (me) return me;
      if (r.ok) warnOnce("stats-shape", r.data && typeof r.data === "object" ? Object.keys(r.data) : r.data);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
    return null;
  }
  async function boot({ win = window, doc = document, api = createApi() } = {}) {
    if (win.__zcfStarted) return null;
    win.__zcfStarted = true;
    try {
      const player = await waitForPlayer(api);
      if (!player) return null;
      injectStyles(doc);
      return createApp({ api, playerId: player.id, playerName: player.username, doc, win });
    } catch (e) {
      warnOnce("boot", e);
      return null;
    }
  }

  // src/index.js
  boot();
})();
