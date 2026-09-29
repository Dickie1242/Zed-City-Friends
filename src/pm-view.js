// Pure data for the Private Messages window: the Chats, Faction and Blocked tab rows (spec §A.4).
import { lastActive } from './presence.js';
import { asArray, toId } from './util.js';

const byName = (a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
const str = (v) => (typeof v === 'string' && v ? v : null);
const truthy = (v) => v === true || Number(v) > 0;

// Inbox page 1 (always fresh from the poll) plus the older pages loaded by scrolling: one row per player,
// the newest thread winning when a player shows up on two pages, newest first.
// `threads` is the saved thread state, for unread counts.
export function buildChatRows({ page1 = [], older = [], threads = {} }) {
  const best = new Map();
  for (const t of [...page1, ...older.flat()]) {
    if (!t) continue;
    const prev = best.get(t.userId);
    if (!prev || (t.lastReply || 0) > (prev.lastReply || 0)) best.set(t.userId, t);
  }
  return [...best.values()]
    .map((t) => ({ ...t, unread: (threads[t.userId] && threads[t.userId].unread) || 0 }))
    .sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0) || a.userId - b.userId);
}

// "You: …" when your message was the last one, "Name: …" when theirs was.
export function previewLine(t, myId) {
  if (!t.preview) return '';
  return `${t.senderId === myId ? 'You' : t.username}: ${t.preview}`;
}

// getFactionMembers → the Faction tab, without you: online first (A-Z), then by last active.
export function buildFactionRows(data, { myId, now = Date.now() } = {}) {
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
      level: Number.isFinite(level) && level > 0 ? level : null,
    });
  }
  return rows.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.online) return byName(a, b);
    return (b.active || 0) - (a.active || 0) || byName(a, b);
  });
}

// blockList pages → the Blocked tab, A-Z, one row per player.
export function buildBlockedRows(pages) {
  const seen = new Map();
  for (const u of pages.flat()) {
    const id = toId(u && u.id);
    if (!id || seen.has(id)) continue;
    seen.set(id, { id, username: str(u.username) || `#${id}`, avatar: str(u.avatar) });
  }
  return [...seen.values()].sort(byName);
}
