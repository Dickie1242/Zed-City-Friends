// Per-chat customization for every chat in the dock (spec Part B, ported from Chat+): padlocks, moving,
// resize grips, message size and the chat menu, each remembered per chat in the settings document. The
// game's chats get only child nodes of ours plus rules in #zcf-user-settings, never attribute changes.
import { findChats } from './registry.js';
import { createChatControls } from './padlock.js';
import { createChatMenu } from './menu.js';
import { createDrag } from './drag.js';
import { createResize, syncGrips } from './resize.js';
import { h } from '../dom.js';
import { buildUserCss, STYLE_ID } from '../../chat-custom/user-style.js';
import { gripsFor } from '../../chat-custom/geometry.js';
import { isLocked, isMoved, textOf, clampText, dmIdOf, chatLabel, LIMITS } from '../../chat-custom/chats.js';
import { updateChat } from '../../settings.js';

// dm: { name(id), isMuted(id), toggleMute(id) } for a DM's menu.
export function createChatCustom({ doc = document, win = window, keeper = null, settings, isSmall, dm = null }) {
  const styleEl = doc.createElement('style');
  styleEl.id = STYLE_ID;
  const records = new Map(); // key -> { el, controls }
  const all = doc.getElementsByClassName('chat-container'); // live, so a chat coming or going changes its length
  let chats = [];
  let seenCount = -1;
  let live = null; // { key, entry } while a drag or resize is under way
  let unkeep = null;
  let unsubscribe = null;
  let frame = 0;

  const saved = (key) => settings.get().chats[key];
  const entryOf = (key) => (live && live.key === key ? { ...saved(key), ...live.entry } : saved(key));
  const save = (key, patch) => settings.update((s) => updateChat(s, key, patch));

  const menu = createChatMenu({ doc, win });
  const act = {
    toggleLock: (key) => save(key, { locked: isLocked(saved(key)) ? false : null }),
    stepText: (key, delta) => save(key, { text: clampText(textOf(saved(key)) + delta) }),
    resetSize: (key) => save(key, { w: null, h: null }),
    returnToRow: (key) => save(key, { x: null, y: null }),
    openMenu: (key, anchor) => menu.open(anchor, key, menuModel(key)),
  };

  function menuModel(key) {
    const entry = saved(key);
    const id = dmIdOf(key);
    const btn = (label, onclick, extra = {}) => h('button', { class: 'zcf-cc-btn', type: 'button', onclick, ...extra }, label);
    const text = textOf(entry);
    const rows = [
      {
        label: 'Message size',
        controls: [
          btn('−', () => act.stepText(key, -LIMITS.textStep), { 'aria-label': 'Smaller messages', disabled: text <= LIMITS.minText }),
          h('span', { class: 'zcf-cc-value' }, `${text}%`),
          btn('+', () => act.stepText(key, LIMITS.textStep), { 'aria-label': 'Larger messages', disabled: text >= LIMITS.maxText }),
        ],
      },
      { label: 'Chat size', controls: [btn('Reset', () => act.resetSize(key), { disabled: !(entry && (entry.w || entry.h)) })] },
    ];
    if (isMoved(entry)) rows.push({ label: 'Position', controls: [btn('Return to row', () => act.returnToRow(key))] });
    if (id && dm) rows.push({ label: 'Notifications', controls: [btn(dm.isMuted(id) ? 'Unmute' : 'Mute', () => dm.toggleMute(id))] });
    return { title: chatLabel(key, id && dm ? dm.name(id) : null), rows };
  }

  // A moved chat's size as drawn, for keeping it fully on screen.
  function measure(c) {
    const entry = entryOf(c.key);
    if (!isMoved(entry)) return null;
    const r = c.el.getBoundingClientRect();
    const open = !c.el.classList.contains('chat-minimized');
    const w = (open && entry.w) || r.width;
    const hgt = (open && entry.h) || r.height;
    return w && hgt ? { w, h: hgt } : null;
  }

  function applyStyle() {
    const sizes = {};
    for (const c of chats) {
      const m = measure(c);
      if (m) sizes[c.key] = m;
    }
    const css = buildUserCss({ chats: settings.get().chats, live, small: isSmall(), vw: win.innerWidth, vh: win.innerHeight, sizes });
    if (styleEl.textContent !== css) styleEl.textContent = css;
    if (!styleEl.isConnected) (doc.head || doc.documentElement).appendChild(styleEl);
  }

  function drop(rec) {
    rec.controls.el.remove();
    syncGrips(rec.el, [], null);
  }

  function refresh() {
    chats = findChats(doc);
    seenCount = all.length;
    const small = isSmall();
    const keep = new Set();
    for (const c of chats) {
      keep.add(c.key);
      let rec = records.get(c.key);
      if (!rec || rec.el !== c.el) {
        if (rec) drop(rec);
        rec = { el: c.el, controls: createChatControls(c.key, act) };
        records.set(c.key, rec);
      }
      if (small || !c.header) {
        drop(rec);
        continue;
      }
      if (rec.controls.el.parentNode !== c.header) {
        const title = c.header.querySelector(':scope > .chat-title');
        if (title) title.after(rec.controls.el);
        else c.header.appendChild(rec.controls.el);
      }
      const entry = entryOf(c.key);
      rec.controls.sync(entry, (!c.minimized && entry && entry.w) || c.el.getBoundingClientRect().width);
      const { key, el } = c;
      const dirs = c.minimized ? [] : gripsFor({ locked: isLocked(entry), moved: isMoved(entry) });
      syncGrips(el, dirs, (dir, e) => resize.start(key, el, dir, isMoved(saved(key)), e));
    }
    for (const [key, rec] of records) {
      if (keep.has(key)) continue;
      drop(rec);
      records.delete(key);
    }
    applyStyle();
    if (menu.isOpen()) {
      if (keep.has(menu.key) && !small) menu.update(menu.key, menuModel(menu.key));
      else menu.close();
    }
  }

  // O(chats) check for the keeper: a chat came or went, opened or closed, or lost our controls.
  function attached() {
    if (all.length !== seenCount) return false;
    const small = isSmall();
    for (const c of chats) {
      if (!c.el.isConnected || c.minimized !== c.el.classList.contains('chat-minimized')) return false;
      const rec = records.get(c.key);
      if (!small && c.header && (!rec || rec.controls.el.parentNode !== c.header)) return false;
    }
    return true;
  }

  const resize = createResize({
    doc,
    win,
    onMove(key, rect) {
      live = { key, entry: rect };
      refresh();
    },
    onCommit(key, rect) {
      live = null;
      save(key, rect);
    },
    onCancel() {
      live = null;
      refresh();
    },
  });

  const drag = createDrag({
    doc,
    win,
    enabled: () => !isSmall(),
    hit(target) {
      if (!target || !target.closest || target.closest('.zcf-grip, .zcf-cmenu')) return null;
      const c = findChats(doc).find((x) => x.el.contains(target));
      if (!c) return null;
      if (c.minimized) return { key: c.key, el: c.el };
      if (!c.header || !c.header.contains(target) || isLocked(saved(c.key))) return null;
      return { key: c.key, el: c.el };
    },
    onMove(key, pos) {
      live = { key, entry: pos };
      applyStyle();
    },
    onCommit(key, pos) {
      live = null;
      save(key, pos);
    },
    onCancel() {
      live = null;
      applyStyle();
    },
  });

  // Viewport changes re-clamp moved chats and re-check the 400px header controls, once per frame.
  function onViewport() {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  }

  return {
    start() {
      if (unsubscribe) return;
      unsubscribe = settings.subscribe(() => refresh());
      win.addEventListener('resize', onViewport);
      if (keeper) unkeep = keeper.add({ name: 'chat-custom', attached, ensure: refresh });
      refresh();
    },
    refresh,
    destroy() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      if (unkeep) unkeep();
      unkeep = null;
      win.removeEventListener('resize', onViewport);
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      drag.destroy();
      resize.destroy();
      menu.destroy();
      for (const rec of records.values()) drop(rec);
      records.clear();
      styleEl.remove();
    },
  };
}
