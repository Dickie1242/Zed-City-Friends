// Red skulls before enemies' names in the game's own Global / Faction / Activity chats (spec §C.5). Rows
// carry no player ids, so senders are matched to enemies' saved usernames, case-insensitively. One
// MutationObserver on the dock looks only at added nodes, batched per frame, so the cost is O(new rows).
// We insert our own <i> next to the game's sender name and never touch the game's nodes or attributes.
import { enemyMark } from './marks.js';
import { safe } from '../util.js';

const ROW = '.msg-cont';

// names(): the Set of lower-cased enemy usernames (enemies.js enemyNames).
export function createEnemyMarks({ doc = document, win = window, keeper = null, names }) {
  let dockEl = null;
  let observer = null;
  let frame = 0;
  let pending = [];
  let handled = new WeakSet(); // rows already looked at, so a burst of mutations doesn't redo them
  let unkeep = null;

  const isGameRow = (row) => !row.closest('.zcf-root');

  function markRow(row, set) {
    const sender = row.querySelector('.sender-name');
    if (!sender || !sender.parentNode) return;
    const prev = sender.previousElementSibling;
    const has = !!(prev && prev.classList.contains('zcf-enemy-mark'));
    const want = set.has(sender.textContent.trim().toLowerCase());
    if (want && !has) sender.parentNode.insertBefore(enemyMark(), sender);
    else if (!want && has) prev.remove();
  }

  function rowsIn(node) {
    if (node.nodeType !== 1) return [];
    if (node.matches(ROW)) return [node];
    return [...node.querySelectorAll(ROW)];
  }

  function flushPending() {
    frame = 0;
    const set = names();
    const nodes = pending;
    pending = [];
    for (const node of nodes) {
      if (!node.isConnected) continue;
      for (const row of rowsIn(node)) {
        if (handled.has(row) || !isGameRow(row)) continue;
        handled.add(row);
        markRow(row, set);
      }
    }
  }

  function onMutations(records) {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && !n.classList.contains('zcf-enemy-mark')) pending.push(n);
      }
    }
    if (pending.length && !frame) frame = win.requestAnimationFrame(safe('enemy-marks', flushPending));
  }

  // Every game chat row on screen, after the enemies list changed.
  function refresh() {
    if (!dockEl) return;
    const set = names();
    for (const row of dockEl.querySelectorAll(ROW)) {
      if (!isGameRow(row)) continue;
      handled.add(row);
      markRow(row, set);
    }
  }

  function ensure() {
    const found = doc.querySelector('.chat-containers');
    if (found === dockEl) return;
    if (observer) observer.disconnect();
    observer = null;
    dockEl = found;
    handled = new WeakSet();
    if (!dockEl) return;
    observer = new win.MutationObserver(safe('enemy-marks-observer', onMutations));
    observer.observe(dockEl, { childList: true, subtree: true });
    refresh();
  }

  return {
    start() {
      ensure();
      if (keeper && !unkeep) unkeep = keeper.add({ name: 'enemy-marks', attached: () => !!(dockEl && dockEl.isConnected), ensure });
    },
    refresh,
    destroy() {
      if (unkeep) unkeep();
      unkeep = null;
      if (observer) observer.disconnect();
      observer = null;
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      dockEl = null;
    },
  };
}
