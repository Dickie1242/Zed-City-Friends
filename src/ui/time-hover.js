// Hover (or tap) a chat time to see it in the other clock, in place of a setting. Our DM times are game
// time (ZCT, like the game's Mail), so they show your own time. The game's Global, Faction and Activity
// chats print times with the browser clock, which comes out as your time or as game time depending on how
// the chat server stamps messages; the newest message in a busy chat was sent just now, so whichever clock
// reads "now" there is the one in use. That answer is remembered, and re-checked on every hover.
import { formatClock, formatMessageTime } from '../time.js';

const DAY_MS = 86400000;
const NEAR_MIN = 2;
const TAP_MS = 2500;
const OURS = '[data-zcf-ts]';
const GAME = '.chat-container:not(.zcf) .msg-time';

const minutesOf = (text) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const near = (a, b) => {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d) <= NEAR_MIN;
};

export function createTimeHover({ doc = document, win = window, storage, key, now = () => Date.now() }) {
  let tip = null;
  let shownFor = null;
  let hideTimer = 0;
  let clock = null; // 'local' | 'game': which clock the game's chats print

  try {
    const v = storage.getItem(key);
    if (v === 'local' || v === 'game') clock = v;
  } catch {
    // no storage: learn it again this visit
  }

  const sameClocks = () => new Date(now()).getTimezoneOffset() === 0;

  function learnClock() {
    const d = new Date(now());
    const local = d.getHours() * 60 + d.getMinutes();
    const game = d.getUTCHours() * 60 + d.getUTCMinutes();
    for (const chat of doc.querySelectorAll('.chat-container:not(.zcf)')) {
      const times = chat.querySelectorAll('.msg-time');
      const m = times.length ? minutesOf(times[times.length - 1].textContent) : null;
      if (m === null) continue;
      const isLocal = near(m, local);
      if (isLocal === near(m, game)) continue; // neither, or a zone this close to UTC can't tell
      const found = isLocal ? 'local' : 'game';
      if (found !== clock) {
        clock = found;
        try {
          storage.setItem(key, found);
        } catch {
          // as above
        }
      }
      return;
    }
  }

  // The moment a game chat's "HH:MM" stands for: the latest one not in the future.
  function gameMoment(minutes) {
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

  function textFor(el) {
    if (el.matches(OURS)) {
      const ts = Number(el.getAttribute('data-zcf-ts'));
      if (!Number.isFinite(ts) || ts <= 0) return '';
      const game = formatMessageTime(ts, now(), false);
      if (sameClocks()) return el.classList.contains('zcf-time') ? '' : game;
      const local = `${formatMessageTime(ts, now(), true)} your time`;
      // A grouped message has no time of its own on screen, so it gets both.
      return el.classList.contains('zcf-time') ? local : `${game} ZCT · ${local}`;
    }
    if (sameClocks()) return '';
    const minutes = minutesOf(el.textContent);
    if (minutes === null) return '';
    learnClock();
    if (!clock) return '';
    const ts = gameMoment(minutes);
    return clock === 'game' ? `${formatClock(ts, true)} your time` : `${formatClock(ts, false)} ZCT`;
  }

  function hide() {
    clearTimeout(hideTimer);
    shownFor = null;
    if (tip) tip.hidden = true;
  }

  function show(el) {
    const text = textFor(el);
    if (!text) return hide();
    if (!tip) {
      tip = doc.createElement('div');
      tip.className = 'zcf-tip';
      tip.setAttribute('role', 'tooltip');
    }
    if (!tip.isConnected) doc.body.appendChild(tip);
    tip.textContent = text;
    tip.hidden = false;
    shownFor = el;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, win.innerWidth - w - 4));
    const above = r.top - tip.offsetHeight - 6;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(above >= 4 ? above : r.bottom + 6)}px`;
  }

  const timeAt = (target) => (target && target.closest ? target.closest(`${OURS}, ${GAME}`) : null);

  function onOver(e) {
    const el = timeAt(e.target);
    if (el === shownFor) return;
    if (el) show(el);
    else hide();
  }
  // Touch screens have no hover: a tap shows it for a moment.
  function onTap(e) {
    if (e.pointerType === 'mouse') return;
    const el = timeAt(e.target);
    if (!el) return;
    show(el);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, TAP_MS);
  }

  doc.addEventListener('mouseover', onOver);
  doc.addEventListener('pointerup', onTap);
  doc.addEventListener('scroll', hide, true);

  return {
    clock: () => clock,
    destroy() {
      doc.removeEventListener('mouseover', onOver);
      doc.removeEventListener('pointerup', onTap);
      doc.removeEventListener('scroll', hide, true);
      hide();
      if (tip) tip.remove();
      tip = null;
    },
  };
}
