// One DM thread: loads pages, fetches new messages, sends with optimistic "pending" copies.
import { normalizeMessages, reconcilePending } from './mail.js';
import { asArray, toId, warnOnce } from './util.js';

export const PAGE_SIZE = 10;
export const MAX_MESSAGES = 200;

export function createConversation({
  api,
  userId,
  myId,
  now = () => Date.now(),
  onActivity = () => {},
  onInfo = () => {},
}) {
  const messages = new Map();
  const subs = new Set();
  let pending = [];
  let localSeq = 0;
  const state = {
    loaded: false,
    loading: false,
    loadingOlder: false,
    hasMore: true,
    blocked: false,
    busy: null,
    info: null,
  };

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn();
      } catch (e) {
        warnOnce('conversation-subscriber', e);
      }
    }
  }

  function add(list) {
    let added = 0;
    let fromThem = false;
    for (const m of list) {
      if (messages.has(m.id)) continue;
      messages.set(m.id, m);
      added += 1;
      if (m.senderId !== myId) fromThem = true;
    }
    return { added, fromThem };
  }

  function fail(r) {
    if (r.kind === 'access') state.blocked = true;
    else if (r.kind === 'busy') state.busy = r.busy || 'busy';
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

  // Pages are counted from the newest message, so the next older page follows from how many we hold.
  // Overlap (new messages arrived since) is harmless because messages are keyed by id.
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
        // Only keep what is older than the oldest held message; anything newer is fetchNew's job,
        // and adding it here would push lastId past messages we never fetched (a permanent gap).
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
    // Blocked is sticky, so polling a blocked thread can't change anything the window shows.
    if (state.blocked) return { ok: false, kind: 'access' };
    if (!state.loaded) return loadInitial();
    const r = await api.getNewMessages(userId, lastId());
    if (!r.ok) {
      fail(r);
      emit();
      return r;
    }
    const wasBusy = state.busy;
    state.busy = null;
    // A slower, overlapping fetchNew can resolve after a newer one plus a trim; anything at or
    // below the current top is already held or was trimmed on purpose, so only add what's newer.
    const top = lastId();
    const { added, fromThem } = add(normalizeMessages(r.data).filter((m) => m.id > top));
    const before = pending.length;
    pending = reconcilePending(pending, list());
    if (added || pending.length !== before || wasBusy) emit();
    if (fromThem) onActivity();
    return r;
  }

  async function refreshInfo() {
    // Blocked is sticky, so polling a blocked thread can't change anything the window shows.
    if (state.blocked) return { ok: false, kind: 'access' };
    const r = await api.getChatInfo(userId);
    if (!r.ok) {
      fail(r);
      emit();
      return r;
    }
    const wasBusy = state.busy;
    state.busy = null;
    let changed = wasBusy !== null;
    const info = r.data && (r.data[userId] || r.data[String(userId)]);
    if (info && typeof info === 'object') {
      state.info = {
        username: typeof info.username === 'string' ? info.username : null,
        avatar: typeof info.avatar === 'string' ? info.avatar : null,
        online: !!info.online,
        active: info.active,
      };
      onInfo(state.info);
      changed = true;
    }
    if (changed) emit();
    return r;
  }

  // First expand: load the newest page and the header info together.
  function ensureLoaded() {
    if (state.loaded || state.loading) return;
    loadInitial();
    refreshInfo();
  }

  async function send(text) {
    const body = String(text || '').trim();
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

  // Drops the oldest messages beyond MAX_MESSAGES (called while the view is pinned to the bottom).
  function trim(max = MAX_MESSAGES) {
    // Trimming mid-load would drop the block between what's held and the incoming older page,
    // and with loadOlder's older-than-oldest filter, that gap would be permanent.
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
    },
  };
}

// Keeps one conversation per user id while its DM window exists.
export function createConversations({ api, myId, onActivity = () => {}, onInfo = () => {}, onChange = () => {} }) {
  const map = new Map();
  return {
    acquire(userId) {
      let c = map.get(userId);
      if (!c) {
        c = createConversation({
          api,
          userId,
          myId,
          onActivity: () => onActivity(userId),
          onInfo: (info) => onInfo(userId, info),
        });
        c.subscribe(() => onChange(userId));
        map.set(userId, c);
      }
      return c;
    },
    get: (userId) => map.get(userId) || null,
    release: (userId) => map.delete(userId),
  };
}
