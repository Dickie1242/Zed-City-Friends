// Keeps our root inside the game's .chat-containers and coordinates the phone-layout "one open chat" rule.
import { h } from './dom.js';
import { safe } from '../util.js';

export const SMALL_QUERY = '(max-width: 599.98px)';

export function createDock({ doc = document, win = window, onGameChatOpened = () => {} } = {}) {
  // display:contents lets our .chat-container children sit directly in the game's flex row.
  const root = h('div', { class: 'zcf-root' });
  let dockEl = null;
  let frame = 0;

  const isSmall = () =>
    typeof win.matchMedia === 'function' ? win.matchMedia(SMALL_QUERY).matches : win.innerWidth < 600;

  const classObserver = new win.MutationObserver(
    safe('dock-class-observer', (mutations) => {
      if (!isSmall()) return;
      for (const m of mutations) {
        const t = m.target;
        if (!t.classList || !t.classList.contains('chat-container') || root.contains(t)) continue;
        const wasMinimized = /\bchat-minimized\b/.test(m.oldValue || '');
        if (wasMinimized && !t.classList.contains('chat-minimized')) {
          onGameChatOpened();
          return;
        }
      }
    }),
  );

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
    return true;
  }

  // One cheap check per animation frame, however many DOM mutations the game makes.
  const bodyObserver = new win.MutationObserver(() => {
    if (frame || root.isConnected) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      safe('dock-ensure', ensure)();
    });
  });

  function minimizeGameChats() {
    if (!dockEl) return;
    for (const c of dockEl.querySelectorAll(':scope > .chat-container:not(.chat-minimized)')) {
      const header = c.querySelector(':scope > .chat-header');
      if (header) header.click();
    }
  }

  return {
    root,
    isSmall,
    ensure,
    minimizeGameChats,
    start() {
      ensure();
      bodyObserver.observe(doc.body, { childList: true, subtree: true });
    },
    destroy() {
      bodyObserver.disconnect();
      classObserver.disconnect();
      if (frame) win.cancelAnimationFrame(frame);
      root.remove();
    },
  };
}
