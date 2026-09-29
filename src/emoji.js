// Pure emoji data/lookup: the game's own standard + Zed City sets from emoji-data.js, plus its
// flag-image rule. No DOM here; src/ui/emoji-picker.js and src/mail.js build on top of this.
import { EMOJI_GROUPS, ZED_EMOJIS } from './emoji-data.js';

// Category order, labels and icons exactly as the game's own picker shows them. `recent` has no
// items here — the caller (the picker) fills it in from shared localStorage.
const CATEGORY_DEFS = [
  { key: 'recent', label: 'Recently used', icon: 'fas fa-history' },
  { key: 'zed city', label: 'Zed City', img: '/icons/favicon.svg' },
  { key: 'people & body', label: 'Smileys & people', icon: 'fas fa-smile-beam' },
  { key: 'animals & nature', label: 'Animals & nature', icon: 'fas fa-leaf' },
  { key: 'food & drink', label: 'Food & drink', icon: 'fas fa-hamburger' },
  { key: 'activities', label: 'Activities', icon: 'fas fa-basketball-ball' },
  { key: 'travel & places', label: 'Travel & places', icon: 'fas fa-car-side' },
  { key: 'objects', label: 'Objects', icon: 'fas fa-lightbulb' },
  { key: 'symbols', label: 'Symbols', icon: 'fas fa-heart' },
  { key: 'flags', label: 'Flags', icon: 'fas fa-flag' },
  { key: 'misc', label: 'Misc', icon: 'fas fa-puzzle-piece' },
];

let STANDARD_MAP = null; // shortcode (name or alias, lowercase) -> { name, emoji }
let ZED_MAP = null; // shortcode -> { name, src }
let GROUP_ITEMS = null; // group key -> [{ name, emoji, aliases }] or [{ name, src, aliases }] for 'zed city'
let FLAG_NAMES = null; // flag emoji string -> canonical name
let FLAG_RE = null; // matches any known flag emoji string, longest first, or null if none

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parse() {
  if (STANDARD_MAP) return;
  STANDARD_MAP = new Map();
  ZED_MAP = new Map();
  GROUP_ITEMS = new Map();
  FLAG_NAMES = new Map();

  for (const [group, block] of Object.entries(EMOJI_GROUPS)) {
    const items = [];
    for (const line of block.split('\n')) {
      if (!line) continue;
      const [emoji, name, aliasCsv] = line.split('\t');
      if (!emoji || !name) continue;
      const aliases = aliasCsv ? aliasCsv.split(',') : [];
      items.push({ emoji, name, aliases });
      STANDARD_MAP.set(name.toLowerCase(), { name, emoji });
      for (const alias of aliases) STANDARD_MAP.set(alias.toLowerCase(), { name, emoji });
      if (group === 'flags' && !FLAG_NAMES.has(emoji)) FLAG_NAMES.set(emoji, name);
    }
    GROUP_ITEMS.set(group, items);
  }

  const zedItems = [];
  for (const line of ZED_EMOJIS.split('\n')) {
    if (!line) continue;
    const [name, aliasCsv, src] = line.split('\t');
    if (!name || !src) continue;
    const aliases = aliasCsv ? aliasCsv.split(',') : [];
    zedItems.push({ name, src, aliases });
    ZED_MAP.set(name.toLowerCase(), { name, src });
    for (const alias of aliases) ZED_MAP.set(alias.toLowerCase(), { name, src });
  }
  GROUP_ITEMS.set('zed city', zedItems);

  if (FLAG_NAMES.size) {
    const alternatives = [...FLAG_NAMES.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
    FLAG_RE = new RegExp(alternatives.join('|'), 'g');
  }
}

// Ordered categories with their items (recent's items are always []; the picker fills those in).
export function emojiCategories() {
  parse();
  return CATEGORY_DEFS.map((c) => ({ ...c, items: c.key === 'recent' ? [] : GROUP_ITEMS.get(c.key) || [] }));
}

export function findEmoji(name) {
  parse();
  const key = String(name ?? '').trim().replace(/^:+|:+$/g, '').toLowerCase();
  if (!key) return null;
  return STANDARD_MAP.get(key) || ZED_MAP.get(key) || null;
}

function normalizeQuery(s) {
  return String(s ?? '').trim().replace(/^:+/, '').toLowerCase().replace(/[_-]/g, ' ').trim();
}

function normalizeName(s) {
  return s.toLowerCase().replace(/[_-]/g, ' ');
}

// Case-insensitive; exact name match first, then name-starts-with, then alias-starts-with, then
// contains. Ignores a leading ':' and treats '_'/'-' as spaces, like the game's own search.
export function searchEmoji(query, limit = 60) {
  parse();
  const q = normalizeQuery(query);
  if (!q) return [];
  const ranked = [];
  for (const items of GROUP_ITEMS.values()) {
    for (const item of items) {
      const name = normalizeName(item.name);
      let rank;
      if (name === q) rank = 0;
      else if (name.startsWith(q)) rank = 1;
      else if (item.aliases.some((a) => normalizeName(a).startsWith(q))) rank = 2;
      else if (name.includes(q) || item.aliases.some((a) => normalizeName(a).includes(q))) rank = 3;
      else continue;
      ranked.push({ rank, item });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, limit).map((r) => r.item);
}

// Windows can't draw flag glyphs, so the game always shows them as an image proxied through its
// own CDN. <cp> is every code point of the emoji string (incl. any FE0F), lowercase hex, joined by '-'.
export function flagImageUrl(emoji) {
  const codePoints = [...String(emoji)].map((ch) => ch.codePointAt(0).toString(16)).join('-');
  const url = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${codePoints}.png`;
  return `https://cdn.zed.city/?url=${encodeURIComponent(url)}`;
}

export function isFlag(emoji) {
  parse();
  return FLAG_NAMES.has(emoji);
}

const SHORTCODE_RE = /:([a-z0-9_+-]+):/gi;

// Replaces `:shortcode:` occurrences: a known standard/flag one becomes its unicode character
// (merged into surrounding text), a known Zed City one becomes a separate { type: 'emoji' } part,
// and anything unknown is left exactly as typed.
function substituteShortcodes(text) {
  const parts = [];
  let buf = '';
  let last = 0;
  SHORTCODE_RE.lastIndex = 0;
  let m;
  while ((m = SHORTCODE_RE.exec(text))) {
    buf += text.slice(last, m.index);
    const rec = findEmoji(m[1]);
    if (rec && rec.src) {
      if (buf) parts.push({ type: 'text', text: buf });
      buf = '';
      parts.push({ type: 'emoji', name: rec.name, src: rec.src });
    } else if (rec && rec.emoji) {
      buf += rec.emoji;
    } else {
      buf += m[0];
    }
    last = m.index + m[0].length;
  }
  buf += text.slice(last);
  if (buf || parts.length === 0) parts.push({ type: 'text', text: buf });
  return parts;
}

// Splits any known flag unicode sequence out of a plain text string into its own emoji part.
function splitFlags(text) {
  parse();
  if (!FLAG_RE) return [{ type: 'text', text }];
  const parts = [];
  let last = 0;
  FLAG_RE.lastIndex = 0;
  let m;
  while ((m = FLAG_RE.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) });
    const emoji = m[0];
    parts.push({ type: 'emoji', name: FLAG_NAMES.get(emoji), src: flagImageUrl(emoji), emoji });
    last = m.index + m[0].length;
  }
  if (last < text.length || parts.length === 0) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

// Turns raw message text into text/emoji parts: shortcodes resolved (standard -> unicode text,
// Zed City -> image part), then any remaining raw flag characters (typed or produced above) split
// into image parts too. Flag emoji parts carry `emoji` (their unicode form) so previewText can
// fall back to it. Used by src/mail.js; not part of the picker-facing API above.
export function emojiParts(text) {
  const out = [];
  for (const part of substituteShortcodes(text)) {
    if (part.type === 'text') out.push(...splitFlags(part.text));
    else out.push(part);
  }
  return out;
}
