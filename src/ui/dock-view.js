// Reconciles our windows inside the dock root: [DM windows in store order] then [Friends], left of the game's chats.
import { createFriendsWindow } from './friends-window.js';
import { createDmWindow } from './dm-window.js';

export const SMALL_MAX_DMS = 2;

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
  const friends = createFriendsWindow(services);
  const dms = new Map();

  function render() {
    const s = services.store.get();
    const entries = visibleDms(s.dock.dms, services.isSmall());
    const wanted = new Set(entries.map((e) => e.id));
    for (const [id, w] of dms) {
      if (!wanted.has(id)) {
        w.destroy();
        w.el.remove();
        dms.delete(id);
      }
    }
    for (const e of entries) if (!dms.has(e.id)) dms.set(e.id, createDmWindow(services, e.id));
    const desired = [...entries.map((e) => dms.get(e.id).el), friends.el];
    desired.forEach((node, i) => {
      if (root.children[i] !== node) root.insertBefore(node, root.children[i] || null);
    });
    for (const w of dms.values()) w.update();
    friends.update();
  }

  return {
    render,
    friends,
    dmWindow: (id) => dms.get(id) || null,
  };
}
