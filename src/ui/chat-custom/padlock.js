// The controls we insert into a chat's header (spec §B.3): message size and Reset once the chat is 400px
// wide or more, the return arrow on a moved chat, and the padlock. They're our own child nodes; a game
// header's own nodes and attributes are never touched. Clicks stop here so the game's header toggle
// doesn't fire.
import { h } from '../dom.js';
import { LIMITS, DEFAULT_TEXT, textOf, isLocked, isMoved } from '../../chat-custom/chats.js';

export const HEADER_CONTROLS_MIN_WIDTH = 400;
export const TITLE_LOCKED = 'Locked — click to unlock, right-click for options';
export const TITLE_UNLOCKED = 'Unlocked — drag to move, click to lock';

// act: { toggleLock(key), stepText(key, delta), resetSize(key), returnToRow(key), openMenu(key, anchor) }
export function createChatControls(key, act) {
  const stop = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
  const value = h('span', { class: 'zcf-cc-value' });
  const reset = h('button', { class: 'zcf-cc-btn', type: 'button', title: "Reset this chat's size", onclick: stop(() => act.resetSize(key)) }, 'Reset');
  const inline = h('span', { class: 'zcf-cc-inline' },
    h('button', { class: 'zcf-cc-step', type: 'button', 'aria-label': 'Smaller messages', onclick: stop(() => act.stepText(key, -LIMITS.textStep)) }, '−'),
    value,
    h('button', { class: 'zcf-cc-step', type: 'button', 'aria-label': 'Larger messages', onclick: stop(() => act.stepText(key, LIMITS.textStep)) }, '+'),
    reset);
  const back = h('button', { class: 'zcf-cc-icon zcf-cc-return', type: 'button', title: 'Return to the row', 'aria-label': 'Return to the row', onclick: stop(() => act.returnToRow(key)) },
    h('i', { class: 'fas fa-undo-alt', 'aria-hidden': 'true' }));
  const glyph = h('i', { class: 'fas fa-lock', 'aria-hidden': 'true' });
  const lock = h('button', { class: 'zcf-cc-icon zcf-cc-lock', type: 'button', onclick: stop(() => act.toggleLock(key)) }, glyph);
  lock.addEventListener('contextmenu', stop(() => act.openMenu(key, lock)));
  const el = h('span', { class: 'zcf-cc', dataset: { zcfCc: key } }, inline, back, lock);

  // width: the chat's width now, for the 400px header controls. textAll: the size for every chat.
  function sync(entry, width, textAll = DEFAULT_TEXT) {
    const locked = isLocked(entry);
    lock.title = locked ? TITLE_LOCKED : TITLE_UNLOCKED;
    lock.setAttribute('aria-label', lock.title);
    lock.setAttribute('aria-pressed', String(locked));
    lock.classList.toggle('zcf-cc-unlocked', !locked);
    glyph.className = `fas ${locked ? 'fa-lock' : 'fa-lock-open'}`;
    back.hidden = !isMoved(entry);
    value.textContent = `${textOf(entry, textAll)}%`;
    inline.hidden = !(width >= HEADER_CONTROLS_MIN_WIDTH);
    reset.disabled = !(entry && (entry.w || entry.h));
  }

  return { el, sync };
}
