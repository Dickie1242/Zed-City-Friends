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

export function utcDayKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatClock(ts) {
  const d = new Date(ts);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatMessageTime(ts, now = Date.now()) {
  const clock = formatClock(ts);
  const day = utcDayKey(ts);
  if (day === utcDayKey(now)) return clock;
  if (day === utcDayKey(now - DAY_MS)) return `Yesterday at ${clock}`;
  const d = new Date(ts);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} at ${clock}`;
}

export function formatDayLabel(ts) {
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
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
