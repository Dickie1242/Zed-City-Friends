// The settings document (spec §B.5): the Private Messages tab, the new-PM sound, per-chat customizations
// and muted conversations. Pure; store.js reads and writes it as its own localStorage document.
import { normalizeChats, normalizeChatEntry, isChatKey } from './chat-custom/chats.js';
import { toId } from './util.js';

export const PM_TABS = ['chats', 'friends', 'faction', 'blocked'];
export const SOUNDS = ['off', 'chirp', 'ping', 'bell'];
export const MAX_MUTED = 500;

export function defaultSettings() {
  return { v: 1, pmTab: 'chats', sound: 'off', chats: {}, muted: [] };
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// Positive integer ids, no duplicates, at most MAX_MUTED (the first ones win: newest first).
export function normalizeMuted(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_MUTED) break;
    const id = toId(v);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// Throws for a document that isn't ours, so the store falls back to the defaults.
export function normalizeSettings(doc) {
  if (!isObj(doc) || doc.v !== 1) throw new Error('Unsupported settings document');
  return {
    v: 1,
    pmTab: PM_TABS.includes(doc.pmTab) ? doc.pmTab : 'chats',
    sound: SOUNDS.includes(doc.sound) ? doc.sound : 'off',
    chats: normalizeChats(doc.chats),
    muted: normalizeMuted(doc.muted),
  };
}

export function setPmTab(s, tab) {
  if (PM_TABS.includes(tab)) s.pmTab = tab;
}

export function setSound(s, sound) {
  if (SOUNDS.includes(sound)) s.sound = sound;
}

export const isMuted = (s, id) => s.muted.includes(Number(id));

export function setMuted(s, id, on) {
  const n = toId(id);
  if (!n) return;
  const rest = s.muted.filter((x) => x !== n);
  s.muted = normalizeMuted(on ? [n, ...rest] : rest);
}

// Merges `patch` into one chat's entry. A null field goes back to its default, and an entry left with
// nothing but defaults is removed.
export function updateChat(s, key, patch) {
  if (!isChatKey(key)) return;
  const next = { ...(s.chats[key] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = v;
  }
  const entry = normalizeChatEntry(next);
  if (Object.keys(entry).length) s.chats[key] = entry;
  else delete s.chats[key];
}

export function resetChat(s, key) {
  delete s.chats[key];
}

export function resetAllChats(s) {
  s.chats = {};
}
