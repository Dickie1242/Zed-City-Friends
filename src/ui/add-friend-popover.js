// The pop-out behind the person-plus button: search the game's players by name or ID and add them.
import { h, clear, avatar } from './dom.js';
import { debounce } from '../util.js';

export const MAX_RESULTS = 8;

export function createAddFriendPopover({ players, isFriend, onAdd }) {
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

  const search = debounce(async (q) => {
    const mine = ++seq;
    const r = await players.search(q);
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
    if (q.length >= 2 || /^\d+$/.test(q)) {
      message('Searching…');
      search(q);
    } else {
      search.cancel();
      seq += 1;
      results = [];
      message(q ? 'Keep typing…' : '');
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

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
