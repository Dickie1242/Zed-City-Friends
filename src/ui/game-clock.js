// The times in the game's own Global, Faction and Activity chats, shown in the clock picked in Chat settings
// (Zed City time by default) like everywhere else in the dock. The game prints each message's time with
// the browser clock: new Date(stamp).getHours(). That's your time when the chat server's stamps carry a
// zone, and game time (ZCT, UTC) when they don't, since the browser then reads the server's UTC digits
// as local. So we read one stamp from the game's chat store to learn which it is, and rewrite the text of
// its time spans when that isn't the clock wanted. Only the text changes: Vue writes a message's time once
// and never again, and a row it re-creates is rewritten as it appears.
import { formatClock } from '../time.js';

const DAY_MS = 86400000;
const NEAR_MIN = 2;
export const TIME = '.msg-time';

export const minutesOf = (text) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const near = (a, b) => {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d) <= NEAR_MIN;
};

// 'local' when the stamp names a moment (epoch, or a zone), 'game' for bare UTC digits, null if unknown.
export function clockOfStamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) return 'local';
  const s = String(value).trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return 'local';
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return 'game';
  return null;
}

export function createGameClock({ doc = document, storage, key, now = () => Date.now(), onChange = () => {} }) {
  let known = null; // from the game's own store: settled for this visit
  let remembered = null;
  const printedText = new WeakMap(); // time span -> { printed: the game's text, shown: ours }

  try {
    const v = storage.getItem(key);
    if (v === 'local' || v === 'game') remembered = v;
  } catch {
    // no storage: work it out again this visit
  }

  // After the current pass: the caller redraws every row, which asks printed() again.
  const changed = () => Promise.resolve().then(onChange);

  function remember(v) {
    if (v === remembered) return;
    remembered = v;
    try {
      storage.setItem(key, v);
    } catch {
      // as above
    }
  }

  // The game's chat store (Pinia, through the Vue app on #q-app), or null.
  function fromStore() {
    try {
      const root = doc.querySelector('#q-app');
      const app = root && root.__vue_app__;
      const pinia = app && app.config && app.config.globalProperties && app.config.globalProperties.$pinia;
      const chat = pinia && pinia._s && typeof pinia._s.get === 'function' ? pinia._s.get('chat') : null;
      const rooms = chat && chat.messages;
      if (!rooms || typeof rooms.values !== 'function') return null;
      for (const list of rooms.values()) {
        if (!Array.isArray(list)) continue;
        for (const m of list) {
          if (!m || m.type === 'system') continue;
          const found = clockOfStamp(m.sent_at != null ? m.sent_at : m.timestamp);
          if (found) return found;
        }
      }
    } catch {
      // the game changed shape: fall back to reading the chats
    }
    return null;
  }

  // Without the store: a chat's newest message stamped "now" in exactly one clock settles it; else the
  // clock in which the freshest newest message is youngest (nothing is from the future).
  function fromChats() {
    const d = new Date(now());
    const local = d.getHours() * 60 + d.getMinutes();
    const game = d.getUTCHours() * 60 + d.getUTCMinutes();
    const age = (from, m) => (from - m + NEAR_MIN + 1440) % 1440;
    let guess = null;
    for (const chat of doc.querySelectorAll('.chat-container:not(.zcf)')) {
      const times = chat.querySelectorAll(TIME);
      const last = times[times.length - 1];
      const m = last ? minutesOf(printedOf(last)) : null;
      if (m === null) continue;
      const isLocal = near(m, local);
      if (isLocal !== near(m, game)) return { clock: isLocal ? 'local' : 'game', sure: true };
      const a = age(local, m);
      const b = age(game, m);
      if (a !== b && (!guess || Math.min(a, b) < guess.age)) guess = { age: Math.min(a, b), clock: a < b ? 'local' : 'game' };
    }
    return guess ? { clock: guess.clock, sure: false } : null;
  }

  // Which clock the game prints: 'local' or 'game'.
  function printed() {
    if (known) return known;
    const before = remembered;
    known = fromStore();
    if (known) remember(known);
    else {
      const seen = fromChats();
      if (seen && seen.sure) remember(seen.clock);
      if (remembered !== before) changed();
      return remembered || (seen ? seen.clock : 'local');
    }
    if (known !== before) changed();
    return known;
  }

  function printedOf(el) {
    const rec = printedText.get(el);
    const text = el.textContent.trim();
    return rec && text === rec.shown ? rec.printed : text;
  }

  // The moment a printed "HH:MM" stands for in `clock`: the latest one not in the future.
  function momentAt(minutes, clock) {
    const t = now();
    const d = new Date(t);
    const at = clock === 'game'
      ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(minutes / 60), minutes % 60)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(minutes / 60), minutes % 60).getTime();
    if (at <= t + NEAR_MIN * 60000) return at;
    if (clock === 'game') return at - DAY_MS;
    const y = new Date(at);
    y.setDate(y.getDate() - 1); // a calendar day back, right across daylight-saving changes
    return y.getTime();
  }

  // A game time span's moment, or null.
  function momentOf(el) {
    const m = minutesOf(printedOf(el));
    return m === null ? null : momentAt(m, printed());
  }

  // Shows a game row's time in `want` ('local' | 'game').
  function rewrite(row, want) {
    const el = row.matches && row.matches(TIME) ? row : row.querySelector(TIME);
    if (!el) return;
    const text = printedOf(el);
    const ts = momentOf(el);
    const shown = ts === null || printed() === want ? text : formatClock(ts, want === 'local');
    printedText.set(el, { printed: text, shown });
    const node = el.firstChild;
    // Only a plain text span is ever touched.
    if (el.childNodes.length === 1 && node.nodeType === 3 && node.nodeValue.trim() !== shown) node.nodeValue = shown;
  }

  return { printed, momentOf, rewrite };
}
