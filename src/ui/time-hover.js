// A detailed timestamp over any chat time. Every time in the dock, in our DMs and in the game's own chats,
// is Zed City time (ZCT, see game-clock.js), and the game prints only "18:27". Resting the pointer on one
// for a moment (or tapping it) shows the day and time in ZCT, the same moment in your own time zone, and
// how long ago it was.
import { formatStamp, longAgo } from '../time.js';
import { TIME } from './game-clock.js';

const DELAY_MS = 500;
const TAP_MS = 3000;
const OURS = '[data-zcf-ts]';
const GAME = `.chat-container:not(.zcf) ${TIME}`;

// gameClock: game-clock.js, for the moments behind the game's chat times. showLocal(): whether the tooltip
// adds your own time (a Chat settings switch).
export function createTimeHover({ doc = document, win = window, now = () => Date.now(), gameClock, showLocal = () => true }) {
  let tip = null;
  let shownFor = null;
  let waitingFor = null;
  let showTimer = 0;
  let hideTimer = 0;

  function momentOf(el) {
    const ts = el.matches(OURS) ? Number(el.getAttribute('data-zcf-ts')) : gameClock ? gameClock.momentOf(el) : null;
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  }

  // ["Tue, Sep 29, 18:27 ZCT", "Tue, Sep 29, 14:27 EDT", "12 min ago"]; no second line when it's switched off
  // or where your time is ZCT.
  function linesFor(ts) {
    const lines = [formatStamp(ts, false)];
    if (showLocal() && new Date(ts).getTimezoneOffset() !== 0) lines.push(formatStamp(ts, true));
    lines.push(longAgo(ts, now()));
    return lines;
  }

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    waitingFor = null;
    shownFor = null;
    if (tip) tip.hidden = true;
  }

  function show(el) {
    clearTimeout(showTimer);
    waitingFor = null;
    const ts = el.isConnected ? momentOf(el) : null;
    if (ts === null) return hide();
    if (!tip) {
      tip = doc.createElement('div');
      tip.className = 'zcf-tip';
      tip.setAttribute('role', 'tooltip');
    }
    if (!tip.isConnected) doc.body.appendChild(tip);
    const lines = linesFor(ts);
    tip.replaceChildren(...lines.map((text, i) => {
      const line = doc.createElement('div');
      if (i === lines.length - 1) line.className = 'zcf-tip-ago';
      line.textContent = text;
      return line;
    }));
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

  // A moment's rest before it shows, so sweeping across a chat doesn't flash tooltips; moving from one
  // time to the next while one is up switches straight away.
  function onOver(e) {
    const el = timeAt(e.target);
    if (!el) return hide();
    if (el === shownFor || el === waitingFor) return;
    if (shownFor) return show(el);
    clearTimeout(showTimer);
    waitingFor = el;
    showTimer = setTimeout(() => show(el), DELAY_MS);
  }
  // Touch screens have no hover: a tap shows it for a few seconds.
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
    hide,
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
