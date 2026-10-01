// Moving chats (spec §B.3): an unlocked chat by its header, or by its bubble while minimized.
// A 6px threshold keeps a still click a click; the click that ends a real drag is swallowed in the capture
// phase, before the game's header toggle sees it. Listens on the document, so a header that Vue re-renders
// mid-drag doesn't end the gesture.
import { pastThreshold, clampPosition } from '../../chat-custom/geometry.js';

// hit(target) → { key, el } for a press that may start a drag, or null.
export function createDrag({ doc = document, win = window, enabled, hit, onMove, onCommit, onCancel }) {
  let s = null;
  let swallow = false;

  function onDown(e) {
    swallow = false; // a new gesture: any click owed from an earlier drag never came
    if (s || e.button !== 0 || !enabled()) return;
    const target = hit(e.target);
    if (!target) return;
    const r = target.el.getBoundingClientRect();
    s = { key: target.key, id: e.pointerId, sx: e.clientX, sy: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, dragging: false, pos: null };
    doc.addEventListener('pointermove', onMoveEv, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onCancelEv, true);
  }

  function onMoveEv(e) {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.sx;
    const dy = e.clientY - s.sy;
    if (!s.dragging) {
      if (!pastThreshold(dx, dy)) return;
      s.dragging = true;
      doc.documentElement.classList.add('zcf-dragging');
    }
    if (e.cancelable) e.preventDefault();
    s.pos = clampPosition({ x: s.left + dx, y: s.top + dy, w: s.w, h: s.h, vw: win.innerWidth, vh: win.innerHeight });
    onMove(s.key, s.pos);
  }

  function end(commit) {
    const done = s;
    s = null;
    doc.removeEventListener('pointermove', onMoveEv, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', onCancelEv, true);
    if (!done.dragging) return;
    doc.documentElement.classList.remove('zcf-dragging');
    swallow = true;
    if (commit) onCommit(done.key, done.pos);
    else onCancel(done.key);
  }

  const onUp = (e) => {
    if (s && e.pointerId === s.id) end(true);
  };
  const onCancelEv = (e) => {
    if (s && e.pointerId === s.id) end(false);
  };

  function onClick(e) {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }

  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('click', onClick, true);

  return {
    isDragging: () => !!(s && s.dragging),
    destroy() {
      if (s) end(false);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('click', onClick, true);
    },
  };
}
