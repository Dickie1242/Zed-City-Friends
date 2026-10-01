// Builds the text of <style id="zcf-user-settings">: every chat's size, position and message size (spec
// §B.2). The game's chats are Vue-owned (it binds their class and style), so this stylesheet is the only
// way we style them. Pure: settings, the viewport and measured sizes in, CSS text out.
import { GAME_CHATS, LIMITS, DEFAULT_TEXT, isLocked, isMoved, textOf } from './chats.js';
import { clampPosition, VIEWPORT_MARGIN } from './geometry.js';

export const STYLE_ID = 'zcf-user-settings';
// For keeping a moved chat on screen when its size couldn't be measured.
const FALLBACK = { w: 350, h: 450 };

// `body .chat-containers …` so each rule outranks the game's dock rules, whichever stylesheet loads last.
export function chatSelector(key) {
  const game = GAME_CHATS.find((g) => g.key === key);
  if (game) return `body .chat-containers > .chat-container.${game.cls}`;
  return `body .chat-containers .zcf[data-zcf-chat="${key}"]`;
}

// What message size scales: a game chat's content, or our window's messages and typing box.
const zoomTargets = (key) => (key.startsWith('game:') ? ['.chat-content'] : ['.zcf-zoom']);

// Every chat's messages at once, for the text size for every chat (0.7 spec §3.1). Same specificity as a
// single chat's zoom rule, which comes later and so wins.
export const ALL_ZOOM = [
  `body .chat-containers > .chat-container:is(${GAME_CHATS.map((g) => `.${g.cls}`).join(',')}) .chat-content`,
  'body .chat-containers .zcf[data-zcf-chat] .zcf-zoom',
].join(',');

// chats: settings.chats. textAll: the text size for every chat. live: { key, entry } overriding one chat
// mid-gesture. sizes: key -> { w, h } as drawn now, to keep a moved chat fully on screen. small: the phone
// layout, where only message size applies. front: chat keys by last use, the latest last, so moved chats
// that overlap stack that way.
export function buildUserCss({ chats = {}, textAll = DEFAULT_TEXT, live = null, small = false, vw = 1280, vh = 800, sizes = {}, front = [] }) {
  const rules = [];
  if (textAll !== DEFAULT_TEXT) rules.push(`${ALL_ZOOM}{zoom:${textAll / 100}}`);
  const keys = new Set(Object.keys(chats));
  if (live) keys.add(live.key);
  for (const key of keys) {
    const isLive = !!(live && live.key === key);
    const entry = isLive ? { ...chats[key], ...live.entry } : chats[key];
    if (!entry) continue;
    const sel = chatSelector(key);
    const text = textOf(entry, textAll);
    if (text !== textAll) rules.push(`${zoomTargets(key).map((t) => `${sel} ${t}`).join(',')}{zoom:${text / 100}}`);
    if (small) continue;
    const sized = [];
    // A size saved on a bigger window (or before zooming in) still fits this one, so the header stays reachable.
    if (entry.w) sized.push(`width:${Math.min(entry.w, Math.max(LIMITS.minW, vw))}px`, 'min-width:0', 'max-width:none');
    if (entry.h) sized.push(`height:${Math.min(entry.h, Math.max(LIMITS.minH, vh - VIEWPORT_MARGIN))}px`, 'max-height:none');
    const box = [];
    if (isMoved(entry)) {
      const size = sizes[key] || { w: entry.w || FALLBACK.w, h: entry.h || FALLBACK.h };
      const p = clampPosition({ x: entry.x, y: entry.y, w: size.w, h: size.h, vw, vh });
      box.push('position:fixed', `left:${p.x}px`, `top:${p.y}px`, 'right:auto', 'bottom:auto', 'margin:0');
    } else if (!isLocked(entry)) {
      box.push('position:relative'); // the containing block for its resize grips
    }
    if (sized.length || isMoved(entry) || isLive) box.push('transition:none');
    if (box.length) rules.push(`${sel}{${box.join(';')}}`);
    if (sized.length) rules.push(`${sel}:not(.chat-minimized){${sized.join(';')};flex:none}`);
    if (!isLocked(entry)) rules.push(`${sel} > .chat-header,${sel}.chat-minimized{cursor:grab;touch-action:none}`); // a touch drag moves it, not the page
  }
  if (!small) front.forEach((key, i) => rules.push(`${chatSelector(key)}{z-index:${i + 1}}`));
  return rules.join('\n');
}
