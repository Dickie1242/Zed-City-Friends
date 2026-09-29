// The chat menu (right-click a padlock, spec §B.3): one small pop-up on <body>, below its padlock or above it
// near the bottom of the screen. Esc or a press outside closes it.
import { h, clear } from '../dom.js';

const GAP = 4;

export function createChatMenu({ doc = document, win = window } = {}) {
  const el = h('div', { class: 'zcf-cmenu', role: 'menu', hidden: true });
  let anchor = null;
  let key = null;
  let armed = false;

  const onDocDown = (e) => {
    if (el.contains(e.target) || (anchor && anchor.contains(e.target))) return;
    close();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    const back = anchor;
    close();
    if (back && back.isConnected) back.focus(); // back where the keyboard left off
  };

  function position() {
    const r = anchor.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    const left = Math.max(GAP, Math.min(r.left, win.innerWidth - m.width - GAP));
    const below = r.bottom + GAP;
    const top = below + m.height > win.innerHeight ? r.top - GAP - m.height : below;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(Math.max(GAP, top))}px`;
  }

  // model: { title, rows: [{ label, controls: [Node] }] }
  function render(model) {
    const buttons = [...el.querySelectorAll('button')];
    const focused = buttons.indexOf(doc.activeElement);
    clear(el);
    el.appendChild(h('div', { class: 'zcf-cmenu-title' }, model.title));
    for (const row of model.rows) el.appendChild(h('div', { class: 'zcf-cmenu-row' }, h('span', { class: 'zcf-cmenu-label' }, row.label), row.controls));
    // Focus the same button again, or the nearest one still enabled (+ turns disabled at 200%).
    const again = [...el.querySelectorAll('button')];
    if (focused < 0 || !again.length) return;
    const at = Math.min(focused, again.length - 1);
    const order = again.map((b, i) => [Math.abs(i - at), b]).sort((a, b) => a[0] - b[0]);
    const target = order.find(([, b]) => !b.disabled);
    if (target) target[1].focus();
  }

  function open(anchorEl, chatKey, model) {
    anchor = anchorEl;
    key = chatKey;
    if (!el.isConnected) doc.body.appendChild(el);
    el.hidden = false;
    render(model);
    position();
    if (!armed) {
      doc.addEventListener('pointerdown', onDocDown, true);
      doc.addEventListener('keydown', onKey, true);
      armed = true;
    }
    const first = el.querySelector('button:not(:disabled)');
    if (first) first.focus();
  }

  function close() {
    if (!armed) return;
    armed = false;
    doc.removeEventListener('pointerdown', onDocDown, true);
    doc.removeEventListener('keydown', onKey, true);
    el.hidden = true;
    anchor = null;
    key = null;
  }

  return {
    el,
    open,
    close,
    // Re-draws the open menu after its chat's settings changed.
    update(chatKey, model) {
      if (!armed || chatKey !== key) return;
      render(model);
      if (anchor && anchor.isConnected) position(); // its chat may have moved (Return to row)
    },
    isOpen: () => armed,
    get key() {
      return key;
    },
    destroy() {
      close();
      el.remove();
    },
  };
}
