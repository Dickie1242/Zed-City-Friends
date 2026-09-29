// The Friends page at /friends: a game-style table of your friends (spec §4), drawn in the slot where
// the game's logged-in layout shows its catch-all 404 for a path it doesn't know.
import { h, clear, append, icon, avatar, highlightMatch, wireMenuKeys } from './dom.js';
import { createAddFriendPopover } from './add-friend-popover.js';
import { buildFriendsTable, nextSort, DEFAULT_SORT } from '../friends-table.js';
import { isFriend, normalizeNote, MAX_NOTE } from '../state.js';
import { longStatusText } from '../time.js';
import { safe, warnOnce } from '../util.js';

export const FRIENDS_PATH = '/friends';
export const PAGE_CLASS = 'zcf-on-friends';
// Hides the game's "Sorry, nothing here..." while we're on /friends.
export const HIDE_404_CSS = `html.${PAGE_CLASS} .q-page-container > .fixed-center{display:none!important}`;
const WARN_MS = 10000;
// How long a leave waits for the next route to replace the game's 404 before giving up.
const LEAVE_MS = 1000;

export const isFriendsPath = (path) => path === FRIENDS_PATH || path === `${FRIENDS_PATH}/`;

// Runs at script start, before login is known (main.js), so a direct load or refresh of /friends
// never flashes the game's 404: adds the hide rule, and the <html> class when we're on /friends.
export function hideGame404Early(doc = document, win = window) {
  if (!doc.getElementById('zcf-early-styles')) {
    const style = doc.createElement('style');
    style.id = 'zcf-early-styles';
    style.textContent = HIDE_404_CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }
  const on = isFriendsPath(win.location.pathname);
  doc.documentElement.classList.toggle(PAGE_CLASS, on);
  return on;
}

const TABS = [['all', 'All'], ['online', 'Online'], ['offline', 'Offline']];
const COLUMNS = [
  { col: 'name', label: 'Name', sort: 'name' },
  { col: 'level', label: 'Level', sort: 'level' },
  { col: 'status', label: 'Status', sort: 'status' },
  { col: 'faction', label: 'Faction', sort: 'faction' },
  { col: 'note', label: 'Note' },
  { col: 'act', label: '' },
];

// A plain left click is handled in-app; middle and modified clicks stay normal link clicks (new tab).
const plainClick = (e) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

export function createFriendsPage(services, { doc = document, win = window, keeper = null } = {}) {
  const { store, actions, presence, players, router, toast } = services;
  let active = false;
  let tab = 'all';
  let query = '';
  let sort = DEFAULT_SORT;
  let editId = null;
  let editInput = null;
  let confirmId = null;
  let menuId = null;
  let rendering = false;
  let frame = 0;
  let holdRender = false; // a pointer is down in the page: a redraw now could swallow the click
  let renderWanted = false;
  let popFriendsSig = '';
  let headSig = null;
  let currentIds = [];
  let unkeep = null;
  let warnTimer = null;
  let leaveObserver = null;
  let leaveTimer = null;
  const rowEls = new Map(); // id -> { sig, el }: rows are reused while what they show is unchanged

  const link = (href, className, children, extra = {}) => h('a', {
    class: className,
    href,
    onclick: (e) => {
      if (!plainClick(e)) return;
      e.preventDefault();
      router.navigate(href);
    },
    ...extra,
  }, children);

  const subtitle = h('div', { class: 'zcf-page-sub' });
  const addBtn = h('button', { class: 'zcf-page-add', type: 'button', 'aria-expanded': 'false' },
    icon('plus'), h('span', { class: 'zcf-page-add-long' }, 'Add friend'), h('span', { class: 'zcf-page-add-short' }, 'Add'));
  const pop = createAddFriendPopover({
    players,
    isFriend: (id) => isFriend(store.get(), id),
    onAdd: (p) => {
      actions.addFriend(p);
      toast(`${p.username} added to friends`);
    },
    onClose: () => syncAddBtn(),
  });
  const title = h('div', { class: 'zcf-page-title' },
    h('div', { class: 'zcf-page-side' }, link('/city', 'zcf-page-back', [icon('chevron-left'), 'City'])),
    h('div', { class: 'zcf-page-mid' }, h('div', { class: 'text-h4 text-uppercase text-no-bg zcf-page-h' }, 'Friends'), subtitle),
    h('div', { class: 'zcf-page-side zcf-page-side-r' }, h('div', { class: 'zcf-page-addwrap' }, addBtn, pop.el)));

  const tabEls = new Map();
  for (const [key, label] of TABS) {
    const count = h('b');
    const b = h('button', {
      class: 'zcf-page-tab',
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => {
        tab = key;
        render();
      },
    }, label, count);
    tabEls.set(key, { b, count });
  }
  const search = h('input', { class: 'zcf-page-input', type: 'text', placeholder: 'Search names and notes…', 'aria-label': 'Search friends' });
  const bar = h('div', { class: 'zcf-page-bar' },
    h('div', { class: 'zcf-page-tabs' }, [...tabEls.values()].map((t) => t.b)),
    h('label', { class: 'zcf-page-search' }, icon('search'), search));
  const headRow = h('tr');
  const tbody = h('tbody');
  const table = h('table', { class: 'zcf-page-table' }, h('thead', null, headRow), tbody);
  const empty = h('div', { class: 'zcf-page-empty', hidden: true });
  const el = h('main', { class: 'q-page q-layout-padding zcf zcf-page' }, title, bar, h('div', { class: 'zcf-page-panel' }, table, empty));

  el.addEventListener('pointerdown', () => {
    holdRender = true;
  }, true);
  // Waits until the click that follows this pointerup has been dispatched, then draws what was held back.
  function onPointerRelease() {
    if (!holdRender) return;
    win.setTimeout(() => {
      holdRender = false;
      if (!renderWanted) return;
      renderWanted = false;
      safe('friends-page-render', render)();
    }, 0);
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.isOpen) pop.close();
    else pop.open();
    syncAddBtn();
  });

  function syncAddBtn() {
    addBtn.setAttribute('aria-expanded', String(pop.isOpen));
    addBtn.classList.toggle('zcf-page-add-on', pop.isOpen);
  }

  function onDocMousedown(e) {
    if (pop.isOpen && !pop.el.contains(e.target) && !addBtn.contains(e.target)) pop.close();
    if (menuId !== null && !(e.target.closest && e.target.closest('.zcf-page-menu, .zcf-act-more'))) {
      menuId = null;
      render();
    }
  }

  // Focuses the first of `keys` (data-zcf-focus values) that can take focus; on phones some are hidden.
  function focusKey(...keys) {
    for (const key of keys) {
      const target = el.querySelector(`[data-zcf-focus="${key}"]`);
      if (!target) continue;
      target.focus();
      if (doc.activeElement === target) return;
    }
  }

  function startEdit(id) {
    if (editId === id) return;
    commitEdit();
    const f = store.get().friends[id];
    if (!f) return;
    menuId = null;
    confirmId = null;
    editId = id;
    editInput = h('input', { class: 'zcf-note-input', type: 'text', maxlength: MAX_NOTE, value: f.note || '', 'aria-label': `Note for ${f.username}` });
    editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit({ refocus: true });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit();
      }
    });
    // Clicking or tabbing away saves. The redraw waits a frame, so focus has already landed wherever
    // Tab or the click sent it and can be handed back to the rebuilt row. A blur caused by our own
    // redraw moving the row doesn't save.
    editInput.addEventListener('blur', () => {
      if (!rendering) commitEdit({ later: true });
    });
    render();
    editInput.focus();
    const end = editInput.value.length;
    editInput.setSelectionRange(end, end);
  }

  function commitEdit({ refocus = false, later = false } = {}) {
    if (editId === null) return;
    const id = editId;
    const text = editInput.value;
    editId = null;
    editInput = null;
    const f = store.get().friends[id];
    if (f && (f.note || '') !== normalizeNote(text)) actions.setFriendNote(id, text);
    if (later) {
      scheduleRender();
      return;
    }
    render();
    if (refocus) focusKey(`edit:${id}`, `more:${id}`);
  }

  function cancelEdit() {
    if (editId === null) return;
    const id = editId;
    editId = null;
    editInput = null;
    render();
    focusKey(`edit:${id}`, `more:${id}`);
  }

  function askRemove(id) {
    commitEdit();
    menuId = null;
    confirmId = id;
    render();
    focusKey(`cancel:${id}`);
  }

  function cancelRemove(id) {
    confirmId = null;
    render();
    focusKey(`remove:${id}`, `more:${id}`);
  }

  function toggleMenu(id) {
    menuId = menuId === id ? null : id;
    render();
    if (menuId === id) focusKey(`menu:${id}:0`);
  }

  function closeMenu(id) {
    menuId = null;
    render();
    focusKey(`more:${id}`);
  }

  function doRemove(id) {
    const i = currentIds.indexOf(id);
    const next = currentIds[i + 1] ?? currentIds[i - 1];
    confirmId = null;
    actions.removeFriend(id);
    render();
    if (next !== undefined) focusKey(`name:${next}`);
  }

  function renderHead() {
    const sig = `${sort.key}:${sort.dir}`;
    if (sig === headSig) return;
    headSig = sig;
    clear(headRow);
    for (const c of COLUMNS) {
      if (!c.sort) {
        headRow.appendChild(h('th', { class: `zcf-col-${c.col}` }, c.label));
        continue;
      }
      const on = sort.key === c.sort;
      headRow.appendChild(h('th', { class: `zcf-col-${c.col}`, 'aria-sort': on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', {
          class: `zcf-page-sort${on ? ' zcf-page-sort-on' : ''}`,
          type: 'button',
          'data-zcf-focus': `sort:${c.sort}`,
          onclick: () => {
            sort = nextSort(sort, c.sort);
            render();
            focusKey(`sort:${c.sort}`);
          },
        }, c.label, on ? h('span', { class: 'zcf-page-arrow', 'aria-hidden': 'true' }, sort.dir === 'asc' ? '▲' : '▼') : null)));
    }
  }

  // Everything a row shows, so an unchanged row keeps its nodes (and focus) across redraws.
  function rowSig(r, now) {
    if (confirmId === r.id) return JSON.stringify(['confirm', r.id, r.username]);
    if (editId === r.id) return JSON.stringify(['edit', r.id]);
    return JSON.stringify([r.id, r.username, r.avatar, r.note, r.unread, !!r.presence, longStatusText(r.presence, now), r.profile, menuId === r.id, query.trim()]);
  }

  function confirmRow(r) {
    return h('tr', { class: 'zcf-page-row zcf-page-confirm', dataset: { id: String(r.id) } },
      h('td', { colspan: String(COLUMNS.length) },
        h('div', {
          class: 'zcf-confirm',
          onkeydown: (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            cancelRemove(r.id);
          },
        },
        h('span', { class: 'zcf-confirm-text' }, `Remove ${r.username} from your friends?`),
        h('button', { class: 'zcf-page-btn zcf-page-danger', type: 'button', 'data-zcf-focus': `confirm:${r.id}`, onclick: () => doRemove(r.id) }, 'Remove'),
        h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': `cancel:${r.id}`, onclick: () => cancelRemove(r.id) }, 'Cancel'))));
  }

  function rowMenu(r) {
    const item = (i, label, onclick) => h('button', { type: 'button', role: 'menuitem', 'data-zcf-focus': `menu:${r.id}:${i}`, onclick }, label);
    const menu = h('div', { class: 'zcf-page-menu', role: 'menu' },
      item(0, 'Profile', () => {
        menuId = null;
        router.navigate(`/profile/${r.id}`);
      }),
      item(1, 'Edit note', () => startEdit(r.id)),
      item(2, 'Remove', () => askRemove(r.id)));
    wireMenuKeys(menu, { onEscape: () => closeMenu(r.id) });
    return menu;
  }

  function buildRow(r, now) {
    if (confirmId === r.id) return confirmRow(r);
    const online = !!(r.presence && r.presence.online);
    const p = r.profile;
    const level = p && p.level ? String(p.level) : '—';
    const meta = [`Lv ${level}`, p && p.faction ? p.faction.name : null].filter(Boolean).join(' · ');

    const nameCell = h('td', { class: 'zcf-col-name' },
      link(`/profile/${r.id}`, 'zcf-chip', [
        avatar({ avatar: r.avatar, online: r.presence ? online : undefined, size: 24 }),
        h('span', { class: 'zcf-chip-name' }, highlightMatch(r.username, query)),
      ], { 'data-zcf-focus': `name:${r.id}`, title: r.username }),
      h('div', { class: 'zcf-c-sub' }, meta),
      r.note ? h('div', { class: 'zcf-c-sub zcf-c-subnote' }, r.note) : null);

    const statusCell = h('td', { class: 'zcf-col-status' },
      h('span', { class: r.presence ? (online ? 'zcf-st-on' : 'zcf-st-off') : 'zcf-st-unknown' }, r.presence ? longStatusText(r.presence, now) : '…'),
      p && p.injured ? h('i', { class: 'fas fa-skull-crossbones zcf-st-icon', role: 'img', title: 'Injured', 'aria-label': 'Injured' }) : null,
      p && p.traveling ? h('i', { class: 'fas fa-directions zcf-st-icon', role: 'img', title: 'Travelling', 'aria-label': 'Travelling' }) : null);

    const factionCell = h('td', { class: 'zcf-col-faction' },
      p && p.faction
        ? link(`/faction/${p.faction.id}`, 'zcf-fac', [h('i', { class: 'fas fa-campground', 'aria-hidden': 'true' }), p.faction.name || `#${p.faction.id}`])
        : h('span', { class: 'zcf-dim' }, '—'));

    const noteCell = editId === r.id
      ? h('td', { class: 'zcf-col-note' }, editInput, h('div', { class: 'zcf-note-hint' }, 'Enter to save · Esc to cancel · only you can see notes'))
      : h('td', { class: 'zcf-col-note' },
        h('button', {
          class: `zcf-note${r.note ? '' : ' zcf-note-empty'}`,
          type: 'button',
          title: r.note || 'Add a note',
          'data-zcf-focus': `note:${r.id}`,
          onclick: () => startEdit(r.id),
        }, r.note ? highlightMatch(r.note, query) : 'Add a note'));

    const acts = h('div', { class: 'zcf-acts' },
      h('button', {
        class: 'zcf-act zcf-act-msg',
        type: 'button',
        title: 'Message',
        'aria-label': `Message ${r.username}`,
        'data-zcf-focus': `msg:${r.id}`,
        onclick: () => actions.openDm(r.id, { expand: true, username: r.username, avatar: r.avatar }),
      }, h('i', { class: 'fas fa-comment-alt', 'aria-hidden': 'true' }), r.unread > 0 ? h('span', { class: 'zcf-pill' }, String(r.unread)) : null),
      h('button', { class: 'zcf-act zcf-act-wide', type: 'button', title: 'Edit note', 'aria-label': `Edit note for ${r.username}`, 'data-zcf-focus': `edit:${r.id}`, onclick: () => startEdit(r.id) }, icon('pen')),
      h('button', { class: 'zcf-act zcf-act-wide', type: 'button', title: 'Remove', 'aria-label': `Remove ${r.username}`, 'data-zcf-focus': `remove:${r.id}`, onclick: () => askRemove(r.id) }, icon('times')),
      h('button', {
        class: 'zcf-act zcf-act-more',
        type: 'button',
        title: 'More',
        'aria-haspopup': 'menu',
        'aria-expanded': String(menuId === r.id),
        'data-zcf-focus': `more:${r.id}`,
        onclick: () => toggleMenu(r.id),
      }, icon('ellipsis-h')),
      menuId === r.id ? rowMenu(r) : null);

    return h('tr', { class: `zcf-page-row${editId === r.id ? ' zcf-editing' : ''}`, dataset: { id: String(r.id) } },
      nameCell, h('td', { class: 'zcf-col-level' }, level), statusCell, factionCell, noteCell, h('td', { class: 'zcf-col-act' }, acts));
  }

  function render() {
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    if (!active) return;
    const s = store.get();
    const now = Date.now();
    // Rows mid-edit or mid-confirm stay put even if they stop matching the tab (spec §D.3 #2).
    const pinned = [editId, confirmId, menuId].filter((id) => id !== null);
    const { rows, counts } = buildFriendsTable({ friends: s.friends, presence: presence.get, threads: s.threads, tab, query, sort, pinned });
    const ids = rows.map((r) => r.id);
    // A note being edited for a row that just left the list (a search, a remove in another tab) is saved, not lost.
    if (editId !== null && !ids.includes(editId)) {
      commitEdit();
      return;
    }
    if (confirmId !== null && !ids.includes(confirmId)) confirmId = null;
    if (menuId !== null && !ids.includes(menuId)) menuId = null;
    currentIds = ids;

    subtitle.textContent = `${counts.online} of ${counts.all} online`;
    for (const [key, { b, count }] of tabEls) {
      count.textContent = String(counts[key]);
      b.setAttribute('aria-pressed', String(key === tab));
      b.classList.toggle('zcf-page-tab-on', key === tab);
    }
    renderHead();

    const focused = doc.activeElement;
    const focusBefore = focused && focused !== editInput && el.contains(focused) ? focused.dataset.zcfFocus : undefined;
    const editSel = editInput && focused === editInput ? [editInput.selectionStart, editInput.selectionEnd] : null;
    rendering = true;
    try {
      const seen = new Set();
      rows.forEach((r, i) => {
        const sig = rowSig(r, now);
        let entry = rowEls.get(r.id);
        if (!entry || entry.sig !== sig) {
          const fresh = buildRow(r, now);
          if (entry) entry.el.replaceWith(fresh);
          entry = { sig, el: fresh };
          rowEls.set(r.id, entry);
        }
        seen.add(r.id);
        if (tbody.children[i] !== entry.el) tbody.insertBefore(entry.el, tbody.children[i] || null);
      });
      for (const [id, entry] of rowEls) {
        if (seen.has(id)) continue;
        entry.el.remove();
        rowEls.delete(id);
      }
    } finally {
      rendering = false;
    }

    table.hidden = rows.length === 0;
    empty.hidden = rows.length > 0;
    if (!rows.length) {
      clear(empty);
      const q = query.trim();
      if (!counts.all) append(empty, ['No friends yet. Use ', h('b', null, 'Add friend'), ' above, or ', h('b', null, 'Add Friend'), " on a player's profile."]);
      else if (q) empty.textContent = `No friends match "${q}".`;
      else empty.textContent = tab === 'online' ? 'No friends online right now.' : 'No offline friends.';
    }
    const friendsSig = Object.keys(s.friends).join(',');
    if (pop.isOpen && friendsSig !== popFriendsSig) pop.refresh();
    popFriendsSig = friendsSig;

    if (editSel && editInput && doc.activeElement !== editInput) {
      editInput.focus();
      editInput.setSelectionRange(editSel[0], editSel[1]);
    } else if (focusBefore && !el.contains(doc.activeElement)) {
      focusKey(focusBefore);
    }
  }

  // Presence and store updates arrive in bursts; redraw at most once per frame.
  function scheduleRender() {
    if (frame || !active) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      if (holdRender) {
        renderWanted = true;
        return;
      }
      safe('friends-page-render', render)();
    });
  }

  function ensure() {
    if (!active || el.isConnected) return;
    const slot = doc.querySelector('.q-page-container');
    if (!slot) return;
    doc.documentElement.classList.add(PAGE_CLASS);
    slot.appendChild(el);
  }

  const game404 = () => doc.querySelector('.q-page-container > .fixed-center');
  const leaving = () => !!(leaveObserver || leaveTimer);

  // Takes our page and the <html> class away, once the next route has drawn (or 1s passed). Coming
  // back to the page meanwhile only stops the wait.
  function finishLeave() {
    if (leaveObserver) leaveObserver.disconnect();
    leaveObserver = null;
    clearTimeout(leaveTimer);
    leaveTimer = null;
    if (active) return;
    doc.documentElement.classList.remove(PAGE_CLASS);
    el.remove();
  }

  // The router reports popstate synchronously, before Vue has swapped routes: removing the page now
  // would show the game's 404, still in the slot, for a moment (spec §D.3 #1).
  function leaveWhenReplaced() {
    if (!game404()) {
      finishLeave();
      return;
    }
    leaveObserver = new win.MutationObserver(() => {
      if (!game404()) finishLeave();
    });
    leaveObserver.observe(doc.body, { childList: true, subtree: true });
    leaveTimer = setTimeout(finishLeave, LEAVE_MS);
  }

  function show() {
    active = true;
    finishLeave(); // back before the last leave finished: just stop waiting
    doc.documentElement.classList.add(PAGE_CLASS);
    doc.addEventListener('mousedown', onDocMousedown);
    doc.addEventListener('pointerup', onPointerRelease, true);
    doc.addEventListener('pointercancel', onPointerRelease, true);
    ensure();
    render();
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => {
      if (!active || el.isConnected) return;
      // No page slot to draw into: let the game's own 404 show rather than an empty page.
      warnOnce('friends-page-no-slot');
      doc.documentElement.classList.remove(PAGE_CLASS);
    }, WARN_MS);
  }

  function hide() {
    commitEdit();
    active = false;
    confirmId = null;
    menuId = null;
    pop.close();
    clearTimeout(warnTimer);
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    doc.removeEventListener('mousedown', onDocMousedown);
    doc.removeEventListener('pointerup', onPointerRelease, true);
    doc.removeEventListener('pointercancel', onPointerRelease, true);
    holdRender = false;
    renderWanted = false;
    leaveWhenReplaced();
  }

  function onRoute(path) {
    const want = isFriendsPath(path);
    if (want && !active) show();
    else if (!want && active) hide();
    else if (!want && !leaving()) doc.documentElement.classList.remove(PAGE_CLASS); // left over from hideGame404Early
  }

  return {
    el,
    start() {
      if (!unkeep && keeper) unkeep = keeper.add({ name: 'friends-page', attached: () => !active || el.isConnected, ensure });
    },
    onRoute,
    render,
    scheduleRender,
    get active() {
      return active;
    },
    destroy() {
      if (active) hide();
      if (leaving()) finishLeave();
      if (unkeep) unkeep();
      unkeep = null;
    },
  };
}
