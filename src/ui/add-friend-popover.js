// The pop-out behind the Friends page's Add button: search the game's players by name or ID and add them
// to the list the page is showing (friends or enemies).
import { h, clear, avatar } from './dom.js';
import { createPlayerSearch } from './player-search.js';

export { MAX_RESULTS } from './player-search.js';

const MESSAGES = { idle: '', short: 'Keep typing…', searching: 'Searching…' };

export function createAddFriendPopover({ players, isAdded, onAdd, onClose, title = 'Add friend', doneText = '✓ Friend' }) {
  let results = [];
  let done = doneText;

  const input = h('input', { class: 'zcf-input', type: 'text', placeholder: 'Name or player ID', 'aria-label': 'Find a player' });
  const list = h('div', { class: 'zcf-results' });
  const titleEl = h('div', { class: 'zcf-pop-title' }, title);
  const el = h('div', { class: 'zcf-pop', hidden: true }, titleEl, input, list);

  function message(text) {
    clear(list);
    if (text) list.appendChild(h('div', { class: 'zcf-empty' }, text));
  }

  function row(p) {
    const action = isAdded(p.id)
      ? h('span', { class: 'zcf-done' }, done)
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

  const search = createPlayerSearch({
    players,
    onState(st) {
      if (st.kind === 'results') {
        results = st.results;
        render();
        return;
      }
      results = [];
      message(st.kind === 'error' ? st.text : MESSAGES[st.kind]);
    },
  });

  input.addEventListener('input', () => search.set(input.value));
  // Capture phase, so Escape closes the pop-out whichever of its children has focus.
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
    // Re-draw "Add" / "✓ Friend" after the list changes elsewhere.
    refresh() {
      if (!el.hidden && results.length) render();
    },
    setLabels({ title: t, doneText: d }) {
      titleEl.textContent = t;
      done = d;
      if (!el.hidden && results.length) render();
    },
  };
}
