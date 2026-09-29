// Pure geometry for moving and resizing chats (ported from Chat+): keeping a chat on screen, the drag
// threshold, and each resize grip's math. No DOM.
import { LIMITS } from './chats.js';

// Movement must exceed this many pixels before a press becomes a drag, so a still click stays a click.
export const DRAG_THRESHOLD = 6;
// A chat may grow to the viewport's height minus this.
export const VIEWPORT_MARGIN = 60;

export const pastThreshold = (dx, dy) => Math.hypot(dx, dy) > DRAG_THRESHOLD;

// Keeps `value` in [0, limit - size]; a box that can't fit pins to 0.
export function clampAxis(value, size, limit) {
  const max = limit - size;
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

export function clampPosition({ x, y, w, h, vw, vh }) {
  return { x: Math.round(clampAxis(x, w, vw)), y: Math.round(clampAxis(y, h, vh)) };
}

// The grips an unlocked chat gets: a docked chat grows up and left (the row keeps its right and bottom
// edges), a moved one also down and right. No grip on the right edge, where the scrollbar lives.
export const gripsFor = ({ locked, moved }) => (locked ? [] : moved ? ['n', 'nw', 's', 'se'] : ['n', 'nw']);

// How far one resize may go: width 270-900, height 200 to the viewport height minus 60, and never past
// the screen edge the grip is pulling toward.
export function resizeLimits({ dir, start, moved, vw, vh }) {
  let maxW = LIMITS.maxW;
  let maxH = vh - VIEWPORT_MARGIN;
  if (dir.includes('w')) maxW = Math.min(maxW, start.left + start.width);
  if (dir.includes('e')) maxW = Math.min(maxW, vw - start.left);
  if (dir.includes('n')) maxH = Math.min(maxH, start.top + start.height);
  if (moved && dir.includes('s')) maxH = Math.min(maxH, vh - start.top);
  return { minW: LIMITS.minW, maxW: Math.max(LIMITS.minW, maxW), minH: LIMITS.minH, maxH: Math.max(LIMITS.minH, maxH) };
}

// The size a resize asks for: only the dimensions its grip pulls ('n'/'s' height, 'nw'/'se' both). A moved
// chat also gets its new top-left, since growing from the top or left edge moves that corner.
export function resizeRect({ dir, start, dx, dy, limits, moved }) {
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
  const out = {};
  if (dir.includes('e')) out.w = clamp(start.width + dx, limits.minW, limits.maxW);
  if (dir.includes('w')) out.w = clamp(start.width - dx, limits.minW, limits.maxW);
  if (dir.includes('s')) out.h = clamp(start.height + dy, limits.minH, limits.maxH);
  if (dir.includes('n')) out.h = clamp(start.height - dy, limits.minH, limits.maxH);
  if (moved) {
    out.x = Math.round(start.left + (dir.includes('w') ? Math.round(start.width) - out.w : 0));
    out.y = Math.round(start.top + (dir.includes('n') ? Math.round(start.height) - out.h : 0));
  }
  return out;
}
