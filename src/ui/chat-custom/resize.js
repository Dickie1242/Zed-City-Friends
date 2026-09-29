// Drag-to-resize grips on unlocked chats (spec §B.3). The grips are our own child nodes of the chat; the
// gesture listens on the document so a re-render mid-resize doesn't end it.
import { h } from '../dom.js';
import { resizeLimits, resizeRect } from '../../chat-custom/geometry.js';

// Puts exactly `dirs` grips on `el` (a no-op when they're already there). onPress(dir, event).
export function syncGrips(el, dirs, onPress) {
  const current = [...el.children].filter((c) => c.classList.contains('zcf-grip'));
  const have = current.map((g) => g.dataset.zcfGrip);
  if (have.length === dirs.length && have.every((d, i) => d === dirs[i])) return;
  for (const g of current) g.remove();
  for (const dir of dirs) {
    const grip = h('div', { class: `zcf-grip zcf-grip-${dir}`, dataset: { zcfGrip: dir }, 'aria-hidden': 'true' });
    grip.addEventListener('pointerdown', (e) => onPress(dir, e));
    el.appendChild(grip);
  }
}

export function createResize({ doc = document, win = window, onMove, onCommit, onCancel }) {
  let s = null;

  function start(key, el, dir, moved, e) {
    if (s || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    s = { key, dir, moved, id: e.pointerId, sx: e.clientX, sy: e.clientY, rect, limits: resizeLimits({ dir, start: rect, moved, vw: win.innerWidth, vh: win.innerHeight }), live: null };
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', cancel, true);
    doc.documentElement.classList.add('zcf-resizing');
  }

  function move(e) {
    if (!s || e.pointerId !== s.id) return;
    if (e.cancelable) e.preventDefault();
    s.live = resizeRect({ dir: s.dir, start: s.rect, dx: e.clientX - s.sx, dy: e.clientY - s.sy, limits: s.limits, moved: s.moved });
    onMove(s.key, s.live);
  }

  function end(commit) {
    const done = s;
    s = null;
    doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', up, true);
    doc.removeEventListener('pointercancel', cancel, true);
    doc.documentElement.classList.remove('zcf-resizing');
    if (commit && done.live) onCommit(done.key, done.live);
    else onCancel(done.key);
  }

  const up = (e) => {
    if (s && e.pointerId === s.id) end(true);
  };
  const cancel = (e) => {
    if (s && e.pointerId === s.id) end(false);
  };

  return {
    start,
    isActive: () => !!s,
    destroy() {
      if (s) end(false);
    },
  };
}
