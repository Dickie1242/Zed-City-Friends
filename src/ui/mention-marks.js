// Messages that mention you in the game's Global and Faction chats (0.7 spec Part 5). The rows are
// Vue-owned: we only add our own hidden flag next to the sender (our stylesheet tints the row through
// :has()), and colour the matched words with the CSS Custom Highlight API, which changes no DOM at all.
// Browsers without it just get the tint.
import { makeMatcher } from '../mentions.js';

export const FLAG = 'zcf-mention-flag';
export const HIGHLIGHT = 'zcf-mention';
const CHATS = '.general-chat, .faction-chat';
const MAX_RANGES = 300;

// words(): your name plus the words you added. enabled(): the Chat settings switch. myName: your username,
// whose own messages never count. onMention(row): a mention in a row that just arrived.
export function createMentionMarks({ doc = document, win = window, words, enabled, myName = '', onMention = () => {} }) {
  const registry = win.CSS && win.CSS.highlights && typeof win.Highlight === 'function' ? win.CSS.highlights : null;
  let highlight = null;
  let ranges = new Set();
  let byRow = new WeakMap(); // row -> its ranges
  let matcher = null;
  let matcherKey = null;
  const me = String(myName || '').trim().toLowerCase();

  function currentMatcher() {
    const list = words();
    const key = JSON.stringify(list);
    if (key !== matcherKey) {
      matcherKey = key;
      matcher = makeMatcher(list);
    }
    return matcher;
  }

  function clearRow(row) {
    const old = byRow.get(row);
    if (!old) return;
    for (const r of old) {
      ranges.delete(r);
      if (highlight) highlight.delete(r);
    }
    byRow.delete(row);
  }

  // Drops ranges whose message is gone, and the oldest past MAX_RANGES.
  function prune() {
    for (const r of ranges) {
      if (ranges.size > MAX_RANGES || !r.startContainer.isConnected) {
        ranges.delete(r);
        if (highlight) highlight.delete(r);
      }
    }
  }

  function addRanges(row, textEl, m) {
    if (!registry) return;
    if (!highlight) {
      highlight = new win.Highlight();
      registry.set(HIGHLIGHT, highlight);
    }
    const mine = [];
    const walker = doc.createTreeWalker(textEl, 4); // NodeFilter.SHOW_TEXT
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const [a, b] of m.ranges(node.nodeValue)) {
        const r = doc.createRange();
        r.setStart(node, a);
        r.setEnd(node, b);
        mine.push(r);
        ranges.add(r);
        highlight.add(r);
      }
    }
    byRow.set(row, mine);
    if (ranges.size > MAX_RANGES * 1.5) prune();
  }

  function setFlag(line, on) {
    const flag = line.querySelector(`:scope > .${FLAG}`);
    if (on && !flag) {
      const i = doc.createElement('i');
      i.className = FLAG;
      i.hidden = true;
      line.appendChild(i);
    } else if (!on && flag) flag.remove();
  }

  // One game chat row: flagged and coloured when it mentions you, cleaned up when it no longer does.
  // `fresh`: it arrived while you watched (enemy-marks.js), so the app may play the mention sound.
  function mark(row, { fresh = false } = {}) {
    if (!row.closest(CHATS) || row.closest('.zcf-root')) return;
    const sender = row.querySelector('.sender-name');
    const line = sender && sender.parentElement;
    const textEl = line && line.nextElementSibling;
    if (!textEl) return;
    clearRow(row);
    const m = enabled() ? currentMatcher() : null;
    const mine = !!me && sender.textContent.trim().toLowerCase() === me;
    const hit = !!m && !mine && m.test(textEl.textContent);
    setFlag(line, hit);
    if (!hit) return;
    addRanges(row, textEl, m);
    if (fresh) onMention(row);
  }

  return {
    mark,
    destroy() {
      if (registry && highlight) registry.delete(HIGHLIGHT);
      highlight = null;
      ranges = new Set();
      byRow = new WeakMap();
      for (const f of doc.querySelectorAll(`.${FLAG}`)) f.remove();
    },
  };
}
