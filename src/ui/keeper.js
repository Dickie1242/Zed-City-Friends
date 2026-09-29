// One body-level MutationObserver for everything we mount into DOM the game's Vue app owns (the chat
// dock root, the top-bar button, the Friends page). Each mount's attached() must be an O(1) check that
// returns true when there's nothing to do; ensure() then runs at most once per animation frame, and only
// while some mount reports it's detached.
import { safe } from '../util.js';

export function createKeeper({ doc = document, win = window } = {}) {
  const mounts = new Set();
  let observer = null;
  let frame = 0;

  function runDetached() {
    for (const m of [...mounts]) if (!m.attached()) safe(`keeper-${m.name}`, m.ensure)();
  }

  function onMutations() {
    if (frame) return;
    for (const m of mounts) {
      if (m.attached()) continue;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        runDetached();
      });
      return;
    }
  }

  return {
    // mount: { name, attached: () => boolean, ensure: () => void }. Returns a function that removes it.
    add(mount) {
      mounts.add(mount);
      if (!observer) {
        observer = new win.MutationObserver(safe('keeper-observer', onMutations));
        observer.observe(doc.body, { childList: true, subtree: true });
      }
      return () => mounts.delete(mount);
    },
    destroy() {
      if (observer) observer.disconnect();
      observer = null;
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      mounts.clear();
    },
  };
}
