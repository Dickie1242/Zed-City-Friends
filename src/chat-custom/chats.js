// Chat keys, limits and the per-chat settings entry (spec §B.2, §B.5). Pure.
export const GAME_CHATS = [
  { key: 'game:general', cls: 'general-chat', label: 'Global' },
  { key: 'game:faction', cls: 'faction-chat', label: 'Faction' },
  { key: 'game:activity', cls: 'activity-chat', label: 'Activity' },
];
export const LIMITS = { minW: 270, maxW: 900, minH: 200, maxH: 2000, minText: 80, maxText: 200, textStep: 10 };
export const DEFAULT_TEXT = 100;

const KEY_RE = /^(?:game:(?:general|faction|activity)|pm|settings|dm:[1-9]\d{0,15})$/;
export const isChatKey = (key) => typeof key === 'string' && KEY_RE.test(key);
export const dmKey = (id) => `dm:${id}`;
export const dmIdOf = (key) => (typeof key === 'string' && /^dm:\d+$/.test(key) ? Number(key.slice(3)) : null);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const clampText = (v) => clamp(Math.round(v / LIMITS.textStep) * LIMITS.textStep, LIMITS.minText, LIMITS.maxText);

// Keeps only valid fields, clamped. Anything equal to its default is left out: locked (the default), a
// message size equal to the size for every chat (`textAll`, 0.7 spec §3.1), no position (x and y come as a
// pair or not at all).
export function normalizeChatEntry(raw, textAll = DEFAULT_TEXT) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if (raw.locked === false) out.locked = false;
  const x = num(raw.x);
  const y = num(raw.y);
  if (x !== null && y !== null) {
    out.x = Math.max(0, Math.round(x));
    out.y = Math.max(0, Math.round(y));
  }
  const w = num(raw.w);
  if (w !== null) out.w = clamp(Math.round(w), LIMITS.minW, LIMITS.maxW);
  const h = num(raw.h);
  if (h !== null) out.h = clamp(Math.round(h), LIMITS.minH, LIMITS.maxH);
  const t = num(raw.text);
  if (t !== null && clampText(t) !== textAll) out.text = clampText(t);
  return out;
}

export function normalizeChats(chats, textAll = DEFAULT_TEXT) {
  const out = {};
  if (!chats || typeof chats !== 'object' || Array.isArray(chats)) return out;
  for (const [key, raw] of Object.entries(chats)) {
    if (!isChatKey(key)) continue;
    const entry = normalizeChatEntry(raw, textAll);
    if (Object.keys(entry).length) out[key] = entry;
  }
  return out;
}

// A chat's own message size, or else the size for every chat.
export const textOf = (entry, textAll = DEFAULT_TEXT) => (entry && entry.text) || textAll;
export const isLocked = (entry) => !(entry && entry.locked === false);
export const isMoved = (entry) => !!(entry && typeof entry.x === 'number' && typeof entry.y === 'number');

export function chatLabel(key, dmName) {
  const game = GAME_CHATS.find((g) => g.key === key);
  if (game) return game.label;
  if (key === 'pm') return 'Private Messages';
  if (key === 'settings') return 'Chat settings';
  const id = dmIdOf(key);
  return id ? dmName || `#${id}` : String(key);
}

// One line for a chat's row in Chat settings, in plain words: what differs from how the chat came.
export function chatSummary(entry, game = false) {
  const parts = [];
  if (isMoved(entry)) parts.push('Moved');
  if (entry && (entry.w || entry.h)) parts.push('Resized');
  if (entry && entry.text) parts.push(`Text ${entry.text}%`);
  if (!isLocked(entry)) parts.push('Unlocked');
  if (parts.length) return parts.join(' · ');
  return game ? 'As the game made it' : 'As it came';
}
