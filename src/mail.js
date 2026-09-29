import { parseSentAt, pastTime, dayKey, formatDayLabel } from './time.js';
import { asArray, toId } from './util.js';
import { emojiParts } from './emoji.js';

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

// The game routes GIF embeds through its own image proxy (cdn.zed.city); only that host is
// ever fetched, so a sender can't use a Markdown image to leak the viewer's IP to another host.
const IMAGE_RE = /!\[([^\]]*)\]\((https:\/\/cdn\.zed\.city\/[^\s()<>"'\\]*)\)/g;
const MAX_ALT_LEN = 200;

// Splits message text into ordered text/image parts. Linear-time: one global-flag regex pass.
export function messageParts(text) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  const raw = [];
  let last = 0;
  IMAGE_RE.lastIndex = 0;
  let m;
  while ((m = IMAGE_RE.exec(s))) {
    if (m.index > last) raw.push({ type: 'text', text: s.slice(last, m.index) });
    raw.push({ type: 'image', alt: m[1].slice(0, MAX_ALT_LEN), src: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length || raw.length === 0) raw.push({ type: 'text', text: s.slice(last) });
  // Expand emoji shortcodes/flags within each text part (never inside a GIF's own alt/src).
  const expanded = [];
  for (const p of raw) {
    if (p.type === 'text') expanded.push(...emojiParts(p.text));
    else expanded.push(p);
  }
  // Merge adjacent text parts (can happen after expansion/dropping empties) and drop empty text parts.
  const parts = [];
  for (const p of expanded) {
    if (p.type === 'text' && p.text === '') continue;
    const top = parts[parts.length - 1];
    if (p.type === 'text' && top && top.type === 'text') top.text += p.text;
    else parts.push(p.type === 'text' ? { type: 'text', text: p.text } : p);
  }
  return parts.length ? parts : [{ type: 'text', text: '' }];
}

// Thread-list preview: same text, but each allowed GIF embed collapses to "GIF: <alt>", standard
// shortcodes/flags become unicode (already true of the text parts), and a Zed City shortcode is
// left as ":name:" rather than turned into an image nothing can show in a one-line preview.
export function previewText(text) {
  const s = messageParts(text)
    .map((p) => (p.type === 'image' ? `GIF${p.alt ? ': ' + p.alt : ''}` : p.type === 'emoji' ? p.emoji || `:${p.name}:` : p.text))
    .join('');
  return s.replace(/\s+/g, ' ').trim();
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

// A chat-list row. `last_reply` is seconds ago (what the game's inbox feeds its TimeAgo), so it becomes a time
// by our clock at `now`. `is_system` marks the last message as an invite (trade, activity), not a system account.
export function normalizeThread(raw, now = Date.now()) {
  const userId = toId(raw && raw.other_user_id);
  if (!userId) return null;
  const other = raw.other_user && typeof raw.other_user === 'object' ? raw.other_user : {};
  const unread = Number(raw.new_mail);
  return {
    userId,
    username: typeof other.username === 'string' && other.username ? other.username : `#${userId}`,
    avatar: typeof other.avatar === 'string' && other.avatar ? other.avatar : null,
    preview: previewText(messageText(raw.message)),
    senderId: toId(raw.sender_id),
    lastReply: pastTime(raw.last_reply, now),
    newMail: unread > 0 ? Math.floor(unread) : 0,
    isSystem: flag(raw.is_system),
  };
}

export function normalizeThreads(data, now = Date.now()) {
  return asArray(data).map((raw) => normalizeThread(raw, now)).filter(Boolean);
}

// Turns messages (any order, duplicates allowed) into render items: day dividers + messages with a `grouped` flag.
// `local`: group and label days in the player's time zone instead of game time.
export function buildLog(messages, { local = false } = {}) {
  const byId = new Map();
  for (const m of messages) byId.set(m.id, m);
  const sorted = [...byId.values()].sort((a, b) => a.id - b.id);
  const items = [];
  let prev = null;
  for (const m of sorted) {
    const day = m.ts !== null ? dayKey(m.ts, local) : null;
    const prevDay = prev && prev.ts !== null ? dayKey(prev.ts, local) : null;
    if (day && day !== prevDay) items.push({ type: 'divider', key: `d:${day}`, label: formatDayLabel(m.ts, local) });
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
    if (t.newMail <= 0 || t.senderId === myId) continue;
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
