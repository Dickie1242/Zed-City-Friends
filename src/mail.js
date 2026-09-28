import { parseSentAt, utcDayKey, formatDayLabel } from './time.js';
import { asArray, toId } from './util.js';

// Same grouping window the game's inbox uses (MailView groupWindowMs).
export const GROUP_WINDOW_MS = 900000;

// The PHP backend may send numeric flags as strings ("0"/"1"); a plain !!raw.field
// would treat "0" as truthy, so coerce through Number instead.
const flag = (v) => v === true || Number(v) > 0;

export function messageText(message) {
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object') {
    if (message.cmd === 'tradeInvite') return 'Sent a trade invite';
    if (message.cmd === 'activityInvite') return 'Sent an activity invite';
    return 'Sent a message that can only be viewed in the inbox';
  }
  if (message === null || message === undefined) return '';
  return String(message);
}

export function normalizeMessage(raw) {
  const id = toId(raw && raw.id);
  if (!id) return null;
  return {
    id,
    senderId: toId(raw.sender_id),
    text: messageText(raw.message),
    ts: parseSentAt(raw.sent_at),
    isSystem: flag(raw.is_system),
  };
}

export function normalizeMessages(data) {
  return asArray(data).map(normalizeMessage).filter(Boolean);
}

export function normalizeThread(raw) {
  const userId = toId(raw && raw.other_user_id);
  if (!userId) return null;
  const other = raw.other_user && typeof raw.other_user === 'object' ? raw.other_user : {};
  const unread = Number(raw.new_mail);
  return {
    userId,
    username: typeof other.username === 'string' && other.username ? other.username : `#${userId}`,
    avatar: typeof other.avatar === 'string' && other.avatar ? other.avatar : null,
    preview: messageText(raw.message),
    senderId: toId(raw.sender_id),
    lastReply: parseSentAt(raw.last_reply),
    newMail: unread > 0 ? Math.floor(unread) : 0,
    isSystem: flag(raw.is_system),
  };
}

export function normalizeThreads(data) {
  return asArray(data).map(normalizeThread).filter(Boolean);
}

// Turns messages (any order, duplicates allowed) into render items: day dividers + messages with a `grouped` flag.
export function buildLog(messages) {
  const byId = new Map();
  for (const m of messages) byId.set(m.id, m);
  const sorted = [...byId.values()].sort((a, b) => a.id - b.id);
  const items = [];
  let prev = null;
  for (const m of sorted) {
    const day = m.ts !== null ? utcDayKey(m.ts) : null;
    const prevDay = prev && prev.ts !== null ? utcDayKey(prev.ts) : null;
    if (day && day !== prevDay) items.push({ type: 'divider', key: `d:${day}`, label: formatDayLabel(m.ts) });
    const grouped =
      !!prev &&
      prev.senderId === m.senderId &&
      day !== null &&
      day === prevDay &&
      Math.abs(m.ts - prev.ts) <= GROUP_WINDOW_MS;
    items.push({ type: 'msg', key: `m:${m.id}`, msg: m, grouped });
    prev = m;
  }
  return items;
}

// Threads with unread mail from the other person that is newer than what we've already seen.
// `seen` is state.threads: { [userId]: { lastSeenReply } }.
export function findNewMail(threads, seen, myId) {
  const out = [];
  for (const t of threads) {
    if (t.isSystem || t.newMail <= 0 || t.senderId === myId) continue;
    const lastSeen = (seen[t.userId] && seen[t.userId].lastSeenReply) || 0;
    // <=, not <: the server may not mark a thread read (spec §12.6), so re-polling the same
    // lastReply (1-second precision) must not resurrect the badge on every poll.
    if (t.lastReply !== null && t.lastReply <= lastSeen) continue;
    out.push(t);
  }
  return out;
}

// Drops optimistic messages once the server copy (matched by message_id) has arrived.
export function reconcilePending(pending, messages) {
  const ids = new Set(messages.map((m) => m.id));
  return pending.filter((p) => !(p.realId && ids.has(p.realId)));
}
