// Hover (or tap) any chat time to see it in the other clock. Every time in the dock, in our DMs and in the
// game's own chats, shows the clock picked in Chat settings (Zed City time by default, see game-clock.js);
// the tooltip shows the other one.
import { formatClock, formatMessageTime } from '../time.js';
import { TIME } from './game-clock.js';

const TAP_MS = 2500;
const OURS = '[data-zcf-ts]';
const GAME = `.chat-container:not(.zcf) ${TIME}`;

// isLocal(): whether times show your own clock. gameClock: game-clock.js, for the game's chats.
export function createTimeHover({ doc = document, win = window, now = () => Date.now(), isLocal = () => false, gameClock }) {
  let tip = null;
  let shownFor = null;
  let hideTimer = 0;

  const sameClocks = () => new Date(now()).getTimezoneOffset() === 0;
  const label = (local) => (local ? 'your time' : 'ZCT');

  function textFor(el) {
    if (sameClocks()) return el.matches(OURS) && !el.classList.contains('zcf-time') ? formatMessageTime(Number(el.getAttribute('data-zcf-ts')), now()) : '';
    const other = !isLocal();
    if (el.matches(OURS)) {
      const ts = Number(el.getAttribute('data-zcf-ts'));
      if (!Number.isFinite(ts) || ts <= 0) return '';
      const otherText = `${formatMessageTime(ts, now(), other)} ${label(other)}`;
      // A grouped message has no time of its own on screen, so it gets both, the shown clock first.
      if (el.classList.contains('zcf-time')) return otherText;
      return `${formatMessageTime(ts, now(), !other)} ${label(!other)} · ${otherText}`;
    }
    const ts = gameClock ? gameClock.momentOf(el) : null;
    return ts === null ? '' : `${formatClock(ts, other)} ${label(other)}`;
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
