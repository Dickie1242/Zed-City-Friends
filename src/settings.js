// The settings document (spec §B.5, 0.6 spec Part 3, 0.7 spec Part 7): the Private Messages and Chat
// settings tabs, sounds and their volume, per-chat customizations and the text size for every chat, muted
// and pinned conversations, mentions, and the notification, tab-title and time switches. Pure; store.js
// reads and writes it as its own localStorage document.
import { normalizeChats, normalizeChatEntry, isChatKey, clampText, DEFAULT_TEXT } from './chat-custom/chats.js';
import { toId } from './util.js';

export const PM_TABS = ['chats', 'friends', 'faction', 'blocked'];
export const SETTINGS_TABS = ['general', 'chats', 'about'];
export const SOUNDS = ['off', 'chirp', 'ping', 'bell'];
export const MAX_MUTED = 500;
export const MAX_PINNED = 20;
export const MAX_MENTION_WORDS = 10;
export const MENTION_WORD_LENGTH = { min: 2, max: 30 };
// On/off switches: notifications and Friends only (off by default), the tab-title count (on), your own time
// in the time hover (on), mention highlights (on) and the 12-hour clock (off).
export const FLAGS = ['notify', 'notifyFriendsOnly', 'titleCount', 'hoverLocal', 'mentions', 'clock12'];

export function defaultSettings() {
  return {
    v: 1,
    pmTab: 'chats',
    settingsTab: 'general',
    sound: 'off',
    mentionSound: 'off',
    volume: 100,
    chats: {},
    textAll: DEFAULT_TEXT,
    muted: [],
    pinned: [],
    notify: false,
    notifyFriendsOnly: false,
    titleCount: true,
    hoverLocal: true, // the chat time hover shows your own time under ZCT
    mentions: true,
    mentionWords: [],
    clock12: false,
  };
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Positive integer ids, no duplicates, at most `max` (the first ones win: newest first).
function normalizeIdList(list, max) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    if (out.length >= max) break;
    const id = toId(v);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export const normalizeMuted = (list) => normalizeIdList(list, MAX_MUTED);

// 0-100 in steps of 5; anything else is full volume.
export const normalizeVolume = (v) => (isNum(v) ? Math.min(100, Math.max(0, Math.round(v / 5) * 5)) : 100);

// A list, or the comma-separated text typed in Chat settings: trimmed, 2-30 characters, no duplicates
// (ignoring case), at most 10.
export function normalizeMentionWords(list) {
  const raw = typeof list === 'string' ? list.split(',') : Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    if (out.length >= MAX_MENTION_WORDS) break;
    if (typeof v !== 'string') continue;
    const word = v.trim().replace(/\s+/g, ' ');
    const key = word.toLowerCase();
    if (word.length < MENTION_WORD_LENGTH.min || word.length > MENTION_WORD_LENGTH.max || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

// Throws for a document that isn't ours, so the store falls back to the defaults.
export function normalizeSettings(doc) {
  if (!isObj(doc) || doc.v !== 1) throw new Error('Unsupported settings document');
  const textAll = isNum(doc.textAll) ? clampText(doc.textAll) : DEFAULT_TEXT;
  return {
    v: 1,
    pmTab: PM_TABS.includes(doc.pmTab) ? doc.pmTab : 'chats',
    settingsTab: SETTINGS_TABS.includes(doc.settingsTab) ? doc.settingsTab : 'general',
    sound: SOUNDS.includes(doc.sound) ? doc.sound : 'off',
    mentionSound: SOUNDS.includes(doc.mentionSound) ? doc.mentionSound : 'off',
    volume: normalizeVolume(doc.volume),
    chats: normalizeChats(doc.chats, textAll),
    textAll,
    muted: normalizeMuted(doc.muted),
    pinned: normalizeIdList(doc.pinned, MAX_PINNED),
    notify: doc.notify === true,
    notifyFriendsOnly: doc.notifyFriendsOnly === true,
    titleCount: doc.titleCount !== false,
    hoverLocal: doc.hoverLocal !== false,
    mentions: doc.mentions !== false,
    mentionWords: normalizeMentionWords(doc.mentionWords),
    clock12: doc.clock12 === true,
  };
}

export function setSettingsTab(s, tab) {
  if (SETTINGS_TABS.includes(tab)) s.settingsTab = tab;
}

export function setMentionSound(s, sound) {
  if (SOUNDS.includes(sound)) s.mentionSound = sound;
}

export function setVolume(s, v) {
  s.volume = normalizeVolume(Number(v));
}

export function setMentionWords(s, words) {
  s.mentionWords = normalizeMentionWords(words);
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

export const isPinned = (s, id) => s.pinned.includes(Number(id));

// Pins newest first; returns false (and changes nothing) when the list is already full.
export function togglePinned(s, id) {
  const n = toId(id);
  if (!n) return true;
  if (s.pinned.includes(n)) {
    s.pinned = s.pinned.filter((x) => x !== n);
    return true;
  }
  if (s.pinned.length >= MAX_PINNED) return false;
  s.pinned = [n, ...s.pinned];
  return true;
}

export function setFlag(s, key, on) {
  if (FLAGS.includes(key)) s[key] = !!on;
}

// Merges `patch` into one chat's entry. A null field goes back to its default, and an entry left with
// nothing but defaults is removed. A message size equal to the size for every chat isn't kept.
export function updateChat(s, key, patch) {
  if (!isChatKey(key)) return;
  const next = { ...(s.chats[key] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = v;
  }
  const entry = normalizeChatEntry(next, s.textAll);
  if (Object.keys(entry).length) s.chats[key] = entry;
  else delete s.chats[key];
}

export function resetChat(s, key) {
  delete s.chats[key];
}

export function resetAllChats(s) {
  s.chats = {};
  s.textAll = DEFAULT_TEXT;
}

// The text size for every chat (0.7 spec §3.1): sets it and clears each chat's own, so every chat follows.
export function setTextAll(s, text) {
  if (!isNum(text)) return;
  s.textAll = clampText(text);
  for (const key of Object.keys(s.chats)) updateChat(s, key, { text: null });
}

function replaceWith(s, next) {
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, next);
}

// Back to defaultSettings() (0.7 spec §4.3), keeping what's yours rather than a preference: muted and
// pinned chats, and the tabs you were on.
export function restoreDefaults(s) {
  replaceWith(s, { ...defaultSettings(), muted: s.muted, pinned: s.pinned, pmTab: s.pmTab, settingsTab: s.settingsTab });
}

// A backup's settings replace ours, except muted and pinned chats, which are merged (the backup's first).
// Throws for settings that aren't ours, before changing anything.
export function applyBackupSettings(s, incoming) {
  const next = normalizeSettings(incoming);
  next.muted = normalizeMuted([...next.muted, ...s.muted]);
  next.pinned = normalizeIdList([...next.pinned, ...s.pinned], MAX_PINNED);
  replaceWith(s, next);
}
