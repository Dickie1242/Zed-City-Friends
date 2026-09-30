// Reconciles our windows inside the dock root: [DM windows in store order], [Private Messages], [Chat
// settings], each followed by its stand-in icon for the bar, then a stand-in for each game chat. CSS `order`
// puts the last two right of the game's chats, the cog in the corner, and on desktop the open windows in a
// row above the bar (0.8 spec).
import { h } from './dom.js';
import { createPmWindow } from './pm-window.js';
import { createDmWindow } from './dm-window.js';
import { createSettingsWindow } from './settings-window.js';
import { createStand } from './stand.js';
import { GAME_CHATS } from '../chat-custom/chats.js';

export const SMALL_MAX_DMS = 2;
// The game chats' own icons (its template never changes them), so a stand-in has one even for a chat the
// game adds later, before anything re-renders the dock. Refreshed from the page on every render anyway.
const GAME_ICONS = { 'game:general': 'fas fa-comments', 'game:faction': 'fas fa-users', 'game:activity': 'fas fa-radar' };

// On phones only the most recently used DM entries get a tab, so the dock still fits on screen.
export function visibleDms(dms, small) {
  if (!small || dms.length <= SMALL_MAX_DMS) return dms;
  // An open window always keeps its tab: hiding it would destroy it while it's still polled.
  const keep = new Set(dms.filter((d) => d.open).map((d) => d.id));
  for (const d of dms.slice().sort((a, b) => b.lastUsed - a.lastUsed)) {
    if (keep.size >= SMALL_MAX_DMS) break;
    keep.add(d.id);
  }
  return dms.filter((d) => keep.has(d.id));
}

export function createDockView({ root, services }) {
  const pm = createPmWindow(services);
  const settingsWin = createSettingsWindow(services);
  const dms = new Map();
  const doc = root.ownerDocument;
  const gameChat = (g) => doc.querySelector(`.chat-containers > .chat-container.${g.cls}`);
  // A game chat's icon in the bar while it's open: the stylesheet shows it, and a click on it clicks the
  // game chat's own header, the game's toggle.
  const gameStands = GAME_CHATS.map((g) => {
    const icon = h('i', { class: `${GAME_ICONS[g.key] || 'fas fa-comments'} chat-icon`, 'aria-hidden': 'true' });
    const stand = createStand(g.key, {
      title: g.label,
      className: 'zcf-stand-game',
      onClick: () => {
        const header = gameChat(g) && gameChat(g).querySelector(':scope > .chat-header');
        if (header) header.click();
      },
    }, icon);
    stand.hidden = false;
    return { g, stand, icon };
  });

  // The game chats' own icons (read only), for their stand-ins.
  function syncGameIcons() {
    for (const { g, icon } of gameStands) {
      const src = gameChat(g) && gameChat(g).querySelector(':scope > .chat-header .chat-icon');
      if (src && icon.className !== src.className) icon.className = src.className;
    }
  }

  function render() {
    const s = services.store.get();
    const entries = visibleDms(s.dock.dms, services.isSmall());
    const wanted = new Set(entries.map((e) => e.id));
    for (const [id, w] of dms) {
      if (!wanted.has(id)) {
        w.destroy();
        w.el.remove();
        w.stand.remove();
        dms.delete(id);
      }
    }
    for (const e of entries) if (!dms.has(e.id)) dms.set(e.id, createDmWindow(services, e.id));
    const desired = [
      ...entries.flatMap((e) => [dms.get(e.id).el, dms.get(e.id).stand]),
      pm.el,
      pm.stand,
      settingsWin.el,
      settingsWin.stand,
      ...gameStands.map((s) => s.stand),
    ];
    desired.forEach((node, i) => {
      if (root.children[i] !== node) root.insertBefore(node, root.children[i] || null);
    });
    for (const w of dms.values()) w.update();
    pm.update();
    settingsWin.update();
    syncGameIcons();
  }

  return {
    render,
    pm,
    settings: settingsWin,
    dmWindow: (id) => dms.get(id) || null,
    // Stops every window's timers and document listeners (the Faction poller among them).
    destroy() {
      for (const w of dms.values()) w.destroy();
      dms.clear();
      pm.destroy();
      settingsWin.destroy();
    },
  };
}
