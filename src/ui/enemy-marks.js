// Red skulls before enemies' names in the game's own Global / Faction / Activity chats (spec §C.5). Rows
// carry no player ids, so senders are matched to enemies' saved usernames, case-insensitively. One
// MutationObserver on the dock looks only at added nodes, batched per frame, so the cost is O(new rows).
// We insert our own <i> next to the game's sender name and never touch the game's nodes or attributes.
import { enemyMark } from './marks.js';
import { safe } from '../util.js';

const ROW = '.msg-cont';
// Past this many queued nodes (a hidden tab pauses the frame that drains them), drop the queue and rescan.
const MAX_PENDING = 500;
// A pass adding more rows than this to one chat is the chat drawing its history, not messages arriving.
const MAX_FRESH = 5;

// names(): the Set of lower-cased enemy usernames (enemies.js enemyNames). onRow(row, { fresh }): anything
// else done to each game chat row as it appears (fresh when it arrived while you watched, see arrived()) and
// on refresh() (never fresh).
export function createEnemyMarks({ doc = document, win = window, keeper = null, names, onRow = null }) {
  let dockEl = null;
  let observer = null;
  let frame = 0;
  let pending = [];
  let rescanWanted = false;
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

  // Whether a chat's new rows (`added`, one pass) are messages arriving while you watch: at most MAX_FRESH,
  // and all of them below rows the chat already had. A chat drawing its history, drawing its rows again
  // (opened after being minimized) or loading older ones above them doesn't count.
  function arrived(chat, added) {
    if (!chat || added.size > MAX_FRESH) return false;
    let old = false;
    let seenNew = false;
    for (const row of chat.querySelectorAll(ROW)) {
      if (added.has(row)) seenNew = true;
      else if (seenNew) return false; // an older row below a new one: these were put in above
      else old = true;
    }
    return old;
  }

  function rowsIn(node) {
    if (node.nodeType !== 1) return [];
    if (node.matches(ROW)) return [node];
    return [...node.querySelectorAll(ROW)];
  }

  function flushPending() {
    frame = 0;
    if (rescanWanted) {
      rescanWanted = false;
      pending = [];
      refresh();
      return;
    }
    const set = names();
    const nodes = pending;
    pending = [];
    const rows = [];
    for (const node of nodes) {
      if (!node.isConnected) continue;
      for (const row of rowsIn(node)) {
        if (handled.has(row) || !isGameRow(row)) continue;
        handled.add(row);
        rows.push(row);
      }
    }
    const perChat = new Map(); // chat -> its new rows
    for (const row of rows) {
      const chat = row.closest('.chat-container');
      if (!perChat.has(chat)) perChat.set(chat, new Set());
      perChat.get(chat).add(row);
    }
    const fresh = new Set();
    if (onRow) for (const [chat, added] of perChat) if (arrived(chat, added)) fresh.add(chat);
    for (const row of rows) {
      markRow(row, set);
      if (onRow) onRow(row, { fresh: fresh.has(row.closest('.chat-container')) });
    }
  }

  function onMutations(records) {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && !n.classList.contains('zcf-enemy-mark') && !n.classList.contains('zcf-mention-flag')) pending.push(n);
      }
    }
    if (pending.length > MAX_PENDING) {
      pending = [];
      rescanWanted = true;
    }
    if ((pending.length || rescanWanted) && !frame) frame = win.requestAnimationFrame(safe('enemy-marks', flushPending));
  }

  // Every game chat row on screen, after the enemies list changed.
  function refresh() {
    if (!dockEl) return;
    const set = names();
    for (const row of dockEl.querySelectorAll(ROW)) {
      if (!isGameRow(row)) continue;
      handled.add(row);
      markRow(row, set);
      if (onRow) onRow(row, { fresh: false });
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
