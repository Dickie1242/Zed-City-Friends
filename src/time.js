// All game times are UTC, matching the game's own dayjs.utc() formatting.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

// Accepts unix seconds, unix ms, ISO strings and "YYYY-MM-DD HH:mm:ss" (treated as UTC). Returns ms or null.
export function parseSentAt(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 1e12 ? value * 1000 : value;
  }
  let s = String(value).trim();
  if (/^\d+$/.test(s)) return parseSentAt(Number(s));
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// A past moment the API gives either as seconds ago (profiles' `active`, the chat list's `last_reply`: the
// game's own TimeAgo subtracts it from now) or as an absolute time. Returns ms, or null.
export function pastTime(value, now) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n < 0) return null;
    if (n < 1e9) return now - n * 1000;
  }
  return parseSentAt(value);
}

// [year, month (0-11), day, hours, minutes] in game time (UTC, the game's ZCT) or, with `local`, the
// player's own time zone (0.6 spec §2.2).
function parts(ts, local) {
  const d = new Date(ts);
  return local
    ? [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]
    : [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

export function dayKey(ts, local = false) {
  const [y, m, d] = parts(ts, local);
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export const utcDayKey = (ts) => dayKey(ts, false);

export function formatClock(ts, local = false) {
  const [, , , h, mi] = parts(ts, local);
  return `${pad(h)}:${pad(mi)}`;
}

export function formatMessageTime(ts, now = Date.now(), local = false) {
  const clock = formatClock(ts, local);
  const day = dayKey(ts, local);
  if (day === dayKey(now, local)) return clock;
  if (day === dayKey(now - DAY_MS, local)) return `Yesterday at ${clock}`;
  const [y, m, d] = parts(ts, local);
  return `${pad(d)}/${pad(m + 1)}/${y} at ${clock}`;
}

export function formatDayLabel(ts, local = false) {
  const [y, m, d] = parts(ts, local);
  return `${MONTHS[m]} ${d}, ${y}`;
}

export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// info: { online: boolean, active: ms|null } from the presence cache.
export function statusText(info, now = Date.now()) {
  if (!info) return '';
  if (info.online) return 'Online';
  if (info.active) return `Active ${timeAgo(info.active, now)}`;
  return 'Offline';
}

// The Friends page's wording, like the game's player lists: "18 min ago", "3 hr ago", "2 days ago".
export function longAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (d < 30) return unit(d, 'day');
  if (d < 365) return unit(Math.floor(d / 30), 'month');
  return unit(Math.floor(d / 365), 'year');
}

// info: { online, active: ms|null } from the presence cache.
export function longStatusText(info, now = Date.now()) {
  if (!info) return '';
  if (info.online) return 'Online';
  if (info.active) return `Active ${longAgo(info.active, now)}`;
  return 'Offline';
}
