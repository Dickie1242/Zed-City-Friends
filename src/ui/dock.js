// Keeps our root inside the game's .chat-containers and coordinates the phone-layout "one open chat" rule.
import { h } from './dom.js';
import { safe } from '../util.js';
import { createKeeper } from './keeper.js';

export const SMALL_QUERY = '(max-width: 599.98px)';

// Exact class-token check: a plain substring/regex match would also hit e.g. 'chat-minimized-x'.
function hasClassToken(value, cls) {
  return (value || '').split(/\s+/).includes(cls);
}

export function createDock({ doc = document, win = window, keeper = null, onGameChatOpened = () => {} } = {}) {
  // display:contents lets our .chat-container children sit directly in the game's flex row.
  const root = h('div', { class: 'zcf-root' });
  let dockEl = null;
  // The app passes its shared keeper; standalone (tests) the dock keeps its own.
  const ownKeeper = keeper ? null : createKeeper({ doc, win });
  const keep = keeper || ownKeeper;
  let unkeep = null;

  // One MediaQueryList for the dock's lifetime; isSmall() and onSmallChange() both read/subscribe to it.
  const mql = typeof win.matchMedia === 'function' ? win.matchMedia(SMALL_QUERY) : null;
  const smallChangeUnsubs = new Set();

  const isSmall = () => (mql ? mql.matches : win.innerWidth < 600);

  function onSmallChange(fn) {
    if (!mql || typeof mql.addEventListener !== 'function') return () => {};
    const listener = safe('dock-small-change', (e) => fn(e.matches));
    mql.addEventListener('change', listener);
    const unsubscribe = () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', listener);
      smallChangeUnsubs.delete(unsubscribe);
    };
    smallChangeUnsubs.add(unsubscribe);
    return unsubscribe;
  }

  const classObserver = new win.MutationObserver(
    safe('dock-class-observer', (mutations) => {
      if (!isSmall()) return;
      for (const m of mutations) {
        const t = m.target;
        if (!t.classList || !t.classList.contains('chat-container') || root.contains(t)) continue;
        const wasMinimized = hasClassToken(m.oldValue, 'chat-minimized');
        if (wasMinimized && !t.classList.contains('chat-minimized')) {
          onGameChatOpened();
          return;
        }
      }
    }),
  );

  // If a game chat is already open when we (re)connect while small - phone reload, rotation, a
  // dock rebuild, or a chat mounted already-open - tell the app once so it collapses ours.
  function reconcileOpenGameChat() {
    if (!dockEl || !isSmall()) return;
    if (dockEl.querySelector(':scope > .chat-container:not(.chat-minimized)')) safe('dock-reconcile', onGameChatOpened)();
  }

  function ensure() {
    if (root.isConnected) return true;
    const found = doc.querySelector('.chat-containers');
    if (found !== dockEl) {
      classObserver.disconnect();
      dockEl = found;
      if (dockEl) {
        classObserver.observe(dockEl, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
      }
    }
    if (!dockEl) return false;
    dockEl.insertBefore(root, dockEl.firstChild);
    reconcileOpenGameChat();
    return true;
  }

  // Containers whose header we already clicked this turn, so a second call before Vue's
  // microtask class update lands doesn't click (and re-open) them again.
  let clickedThisTurn = new WeakSet();

  function minimizeGameChats() {
    if (!dockEl) return;
    for (const c of dockEl.querySelectorAll(':scope > .chat-container:not(.chat-minimized)')) {
      if (clickedThisTurn.has(c)) continue;
      clickedThisTurn.add(c);
      const header = c.querySelector(':scope > .chat-header');
      if (header) header.click();
    }
    queueMicrotask(() => {
      clickedThisTurn = new WeakSet();
    });
  }

  return {
    root,
    isSmall,
    onSmallChange,
    ensure,
    minimizeGameChats,
    start() {
      ensure();
      if (!unkeep) unkeep = keep.add({ name: 'dock', attached: () => root.isConnected, ensure });
    },
    destroy() {
      if (unkeep) unkeep();
      unkeep = null;
      if (ownKeeper) ownKeeper.destroy();
      classObserver.disconnect();
      dockEl = null;
      for (const unsubscribe of [...smallChangeUnsubs]) unsubscribe();
      root.remove();
    },
  };
}
