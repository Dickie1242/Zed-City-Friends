// The pop-out behind the person-plus button: search the game's players by name or ID and add them.
import { h, clear, avatar } from './dom.js';
import { debounce } from '../util.js';

export const MAX_RESULTS = 8;

export function createAddFriendPopover({ players, isFriend, onAdd, onClose }) {
  let seq = 0;
  let results = [];

  const input = h('input', { class: 'zcf-input', type: 'text', placeholder: 'Name or player ID', 'aria-label': 'Find a player' });
  const list = h('div', { class: 'zcf-results' });
  const el = h('div', { class: 'zcf-pop', hidden: true }, h('div', { class: 'zcf-pop-title' }, 'Add friend'), input, list);

  function message(text) {
    clear(list);
    if (text) list.appendChild(h('div', { class: 'zcf-empty' }, text));
  }

  function row(p) {
    const action = isFriend(p.id)
      ? h('span', { class: 'zcf-done' }, '✓ Friend')
      : h('button', {
          class: 'zcf-add',
          type: 'button',
          onclick: (e) => {
            e.stopPropagation();
            onAdd(p);
            render();
            input.focus();
          },
        }, 'Add');
    return h('div', { class: 'zcf-result' },
      avatar({ avatar: p.avatar, size: 22 }),
      h('div', { class: 'zcf-row-main' }, h('div', { class: 'zcf-name' }, p.username), h('div', { class: 'zcf-status' }, `#${p.id}`)),
      action);
  }

  function render() {
    if (!results.length) {
      message('No players found.');
      return;
    }
    clear(list);
    for (const p of results) list.appendChild(row(p));
  }

  // `mine` is snapshotted per keystroke (below), not per debounced call, so a request already in
  // flight is dropped as soon as the query moves on, even before the next debounce fires.
  const search = debounce(async (mine, q) => {
    let r;
    try {
      r = await players.search(q);
    } catch {
      r = { ok: false };
    }
    if (mine !== seq) return;
    if (!r.ok) {
      message('Search failed. Try again.');
      return;
    }
    results = r.data.slice(0, MAX_RESULTS);
    render();
  }, 300);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    seq += 1;
    const mine = seq;
    if (q.length >= 2 || /^\d+$/.test(q)) {
      message('Searching…');
      search(mine, q);
    } else {
      search.cancel();
      results = [];
      message(q ? 'Keep typing…' : '');
    }
  });
  // Capture phase, so Escape closes the pop-out no matter which of its children (input, a result's
  // Add button, …) currently has focus.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }, true);

  function open() {
    el.hidden = false;
    input.value = '';
    results = [];
    message('');
    input.focus();
  }

  function close() {
    el.hidden = true;
    search.cancel();
    seq += 1;
    if (onClose) onClose();
  }

  return {
    el,
    input,
    open,
    close,
    get isOpen() {
      return !el.hidden;
    },
    // Re-draw "Add" / "✓ Friend" after the friends list changes elsewhere.
    refresh() {
      if (!el.hidden && results.length) render();
    },
  };
}
