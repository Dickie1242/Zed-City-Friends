// Pure functions over the saved state document. Mutators change the draft passed in by store.update().
import { toId } from './util.js';

export const MAX_DMS = 4;

export function emptyState() {
  return { v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, dms: [] } };
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
      dms: Array.isArray(dock.dms) ? dock.dms.filter((d) => isObj(d) && toId(d.id)) : [],
    },
  };
}

export function isFriend(state, id) {
  return !!state.friends[id];
}

export function addFriend(state, { id, username, avatar }, now) {
  if (state.friends[id]) return false;
  state.friends[id] = { id, username: username || `#${id}`, avatar: avatar || null, addedAt: now };
  return true;
}

export function removeFriend(state, id) {
  delete state.friends[id];
}

export function updateFriendInfo(state, id, { username, avatar }) {
  const f = state.friends[id];
  if (!f) return false;
  let changed = false;
  if (typeof username === 'string' && username && username !== f.username) {
    f.username = username;
    changed = true;
  }
  if (typeof avatar === 'string' && avatar && avatar !== f.avatar) {
    f.avatar = avatar;
    changed = true;
  }
  return changed;
}

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

// Keeps at most `max` DM entries, dropping the least recently used ones without unread mail first.
export function evictDms(state, keepId, max = MAX_DMS) {
  while (state.dock.dms.length > max) {
    const candidates = state.dock.dms.filter((d) => d.id !== keepId);
    if (!candidates.length) break;
    const quiet = candidates.filter((d) => !(state.threads[d.id] && state.threads[d.id].unread > 0));
    const pool = (quiet.length ? quiet : candidates).slice().sort((a, b) => a.lastUsed - b.lastUsed);
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
  if (open && exclusive) for (const d of state.dock.dms) d.open = false;
}

export function collapseAll(state) {
  state.dock.friendsOpen = false;
  for (const d of state.dock.dms) d.open = false;
}

export function friendsUnreadTotal(state) {
  let n = 0;
  for (const id of Object.keys(state.friends)) {
    const t = state.threads[id];
    if (t && t.unread > 0) n += t.unread;
  }
  return n;
}
