// Pure functions over the saved state document. Mutators change the draft passed in by store.update().
import { toId } from './util.js';

export const MAX_DMS = 4;

export function emptyState() {
  return { v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, settingsOpen: false, dms: [] } };
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// Validates a parsed document; throws for anything we can't read so the store can back it up.
export function normalizeState(doc) {
  if (!isObj(doc) || doc.v !== 1) throw new Error('Unsupported state document');
  const dock = isObj(doc.dock) ? doc.dock : {};
  return {
    v: 1,
    friends: isObj(doc.friends) ? doc.friends : {},
    threads: isObj(doc.threads) ? doc.threads : {},
    dock: {
      friendsOpen: !!dock.friendsOpen,
      settingsOpen: !!dock.settingsOpen,
      dms: Array.isArray(dock.dms) ? dock.dms.filter((d) => isObj(d) && toId(d.id)) : [],
    },
  };
}

export function isFriend(state, id) {
  return !!state.friends[id];
}

export const MAX_NOTE = 200;

export const normalizeNote = (note) => (typeof note === 'string' ? note.trim().slice(0, MAX_NOTE).trim() : '');

// Friends and enemies are both maps of id -> { id, username, avatar, addedAt, note? }; these work on either.
export function addPerson(map, { id, username, avatar }, now) {
  if (map[id]) return false;
  map[id] = { id, username: username || `#${id}`, avatar: avatar || null, addedAt: now };
  return true;
}

export function removePerson(map, id) {
  delete map[id];
}

export function updatePersonInfo(map, id, { username, avatar }) {
  const p = map[id];
  if (!p) return false;
  let changed = false;
  if (typeof username === 'string' && username && username !== p.username) {
    p.username = username;
    changed = true;
  }
  if (typeof avatar === 'string' && avatar && avatar !== p.avatar) {
    p.avatar = avatar;
    changed = true;
  }
  return changed;
}

// A private note: trimmed and capped; an empty note removes the field. Returns whether it changed.
export function setPersonNote(map, id, note) {
  const p = map[id];
  if (!p) return false;
  const text = normalizeNote(note);
  if ((p.note || '') === text) return false;
  if (text) p.note = text;
  else delete p.note;
  return true;
}

export const addFriend = (state, p, now) => addPerson(state.friends, p, now);
export const removeFriend = (state, id) => removePerson(state.friends, id);
export const updateFriendInfo = (state, id, info) => updatePersonInfo(state.friends, id, info);
export const setFriendNote = (state, id, note) => setPersonNote(state.friends, id, note);

export function threadEntry(state, id) {
  if (!state.threads[id]) state.threads[id] = { lastSeenReply: 0, lastNotifiedReply: 0, unread: 0 };
  return state.threads[id];
}

export function markSeen(state, id, lastReply) {
  const t = threadEntry(state, id);
  t.unread = 0;
  if (lastReply && lastReply > (t.lastSeenReply || 0)) t.lastSeenReply = lastReply;
}

function collapseOthers(state, keep) {
  for (const d of state.dock.dms) if (d !== keep) d.open = false;
  state.dock.friendsOpen = false;
  state.dock.settingsOpen = false;
}

// Adds (or refreshes) a DM entry in the dock. `exclusive` is used on phones where only one window may be open.
export function openDm(state, id, opts = {}) {
  const { expand = false, exclusive = false, now = 0, max = MAX_DMS, username, avatar } = opts;
  let entry = state.dock.dms.find((d) => d.id === id);
  if (!entry) {
    entry = { id, open: false, lastUsed: now, username: username || null, avatar: avatar || null };
    state.dock.dms.push(entry);
  }
  if (username) entry.username = username;
  if (avatar) entry.avatar = avatar;
  entry.lastUsed = now;
  if (expand) {
    entry.open = true;
    if (exclusive) collapseOthers(state, entry);
  }
  evictDms(state, id, max);
}

// Keeps at most `max` DM entries. Eviction order: minimized+quiet, then minimized+unread, then
// open entries last (an expanded window is never closed out from under the person reading it),
// with ties broken by the least recently used.
export function evictDms(state, keepId, max = MAX_DMS) {
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

export function setDmOpen(state, id, open, { exclusive = false, now } = {}) {
  const entry = state.dock.dms.find((d) => d.id === id);
  if (!entry) return;
  entry.open = !!open;
  if (now) entry.lastUsed = now;
  if (open && exclusive) collapseOthers(state, entry);
}

export function closeDm(state, id) {
  state.dock.dms = state.dock.dms.filter((d) => d.id !== id);
}

export function setFriendsOpen(state, open, { exclusive = false } = {}) {
  state.dock.friendsOpen = !!open;
  if (open && exclusive) {
    for (const d of state.dock.dms) d.open = false;
    state.dock.settingsOpen = false;
  }
}

export function setSettingsOpen(state, open, { exclusive = false } = {}) {
  state.dock.settingsOpen = !!open;
  if (open && exclusive) {
    for (const d of state.dock.dms) d.open = false;
    state.dock.friendsOpen = false;
  }
}

export function collapseAll(state) {
  state.dock.friendsOpen = false;
  state.dock.settingsOpen = false;
  for (const d of state.dock.dms) d.open = false;
}

// Chat settings → Close all private chats. Their per-chat settings live elsewhere and are kept.
export function closeAllDms(state) {
  state.dock.dms = [];
}

// Chats with unread messages that the Private Messages window lists: all friends, plus the other threads on
// the first inbox page. Muted conversations are left out (spec §D.1).
export function chatsUnreadIds(state, inboxThreads, muted = []) {
  const ids = new Set(Object.keys(state.friends).map(Number));
  for (const t of inboxThreads) ids.add(t.userId);
  const skip = new Set(muted);
  return [...ids].filter((id) => !skip.has(id) && state.threads[id] && state.threads[id].unread > 0);
}

export function chatsUnreadTotal(state, inboxThreads, muted = []) {
  return chatsUnreadIds(state, inboxThreads, muted).reduce((n, id) => n + state.threads[id].unread, 0);
}
