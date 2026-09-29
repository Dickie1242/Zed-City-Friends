// The Friends tab/window in the dock: filter, Online / Offline / Recent sections, add-friend pop-out, ⋯ menu.
import { h, clear, icon, avatar, highlightMatch, badge, setBadge, downloadText } from './dom.js';
import { createAddFriendPopover } from './add-friend-popover.js';
import { buildFriendSections } from '../friends-view.js';
import { friendsUnreadTotal, isFriend } from '../state.js';
import { statusText } from '../time.js';
import { safe } from '../util.js';
import { importMessage } from '../backup.js';

const MAX_IMPORT_BYTES = 1024 * 1024;

export function createFriendsWindow(services, { doc = document } = {}) {
  const { store, actions, presence, inbox, players, router, toast, playerId } = services;
  let filter = '';
  let confirmId = null;
  let frame = 0;
  let lastSig = null; // signature of what renderList last drew, so a no-op change can skip the rebuild

  const titleText = h('span', null, 'Friends & Chats');
  const count = h('span', { class: 'zcf-count' });
  const unreadBadge = badge();
  const title = h('div', { class: 'chat-title' }, h('i', { class: 'fas fa-user-friends chat-icon', 'aria-hidden': 'true' }), titleText, count, unreadBadge);
  const menuBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'More', 'aria-label': 'More' }, icon('ellipsis-h'));
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleFriends() }, title, menuBtn, toggle);

  const filterInput = h('input', { class: 'zcf-input', type: 'text', placeholder: 'Search friends…', 'aria-label': 'Search friends' });
  const addBtn = h('button', { class: 'zcf-iconbtn', type: 'button', title: 'Add friend', 'aria-label': 'Add friend', 'aria-expanded': 'false' }, icon('user-plus'));
  const toolbar = h('div', { class: 'zcf-toolbar' }, h('label', { class: 'zcf-search' }, icon('search'), filterInput), addBtn);
  const list = h('div', { class: 'zcf-list' });

  // Keeps the person-plus button's state in sync even when the pop-out closes itself (Esc, outside click).
  function syncAddBtn() {
    addBtn.classList.toggle('zcf-active', pop.isOpen);
    addBtn.setAttribute('aria-expanded', String(pop.isOpen));
  }

  const pop = createAddFriendPopover({
    players,
    isFriend: (id) => isFriend(store.get(), id),
    onAdd: (p) => {
      actions.addFriend(p);
      toast(`${p.username} added to friends`);
    },
    onClose: syncAddBtn,
  });

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const menu = h('div', { class: 'zcf-menu', hidden: true },
    h('div', { class: 'zcf-menu-title' }, 'Friends list'),
    h('button', { type: 'button', onclick: onExport }, 'Export friends'),
    h('button', { type: 'button', onclick: () => { menu.hidden = true; fileInput.click(); } }, 'Import friends'));

  const body = h('div', { class: 'chat-content zcf-body' }, toolbar, list, pop.el, menu, fileInput);
  const el = h('div', { class: 'chat-container zcf zcf-friends' }, header, body);

  filterInput.addEventListener('input', () => {
    filter = filterInput.value;
    renderList();
  });
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.isOpen) pop.close();
    else pop.open();
    syncAddBtn();
  });
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    if (!menu.hidden) menu.querySelector('button').focus();
  });
  // Capture phase so Escape closes the menu no matter which item inside it has focus.
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      menu.hidden = true;
      menuBtn.focus();
    }
  }, true);
  fileInput.addEventListener('change', safe('friends-import', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // let the same file be picked again, whatever happens below
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast('That file is too large to be a friends export.', { error: true });
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      toast("Couldn't read that file.", { error: true });
      return;
    }
    const res = actions.importFriends(text);
    toast(res.ok ? importMessage(res) : res.error, { error: !res.ok });
  }));
  // Close the pop-out and menu on outside clicks.
  function onDocMousedown(e) {
    if (pop.isOpen && !pop.el.contains(e.target) && !addBtn.contains(e.target)) pop.close();
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) menu.hidden = true;
  }
  doc.addEventListener('mousedown', onDocMousedown);

  function onExport() {
    menu.hidden = true;
    const s = store.get();
    const n = Object.keys(s.friends).length;
    downloadText(`zed-city-friends-${playerId}.json`, actions.exportFriends(), doc);
    toast(`Exported ${n} friend${n === 1 ? '' : 's'}.`);
  }

  function section(label, rows, render, emptyText) {
    list.appendChild(h('div', { class: 'zcf-sec' }, `${label} — ${rows.length}`));
    if (!rows.length) list.appendChild(h('div', { class: 'zcf-empty' }, emptyText));
    for (const r of rows) list.appendChild(render(r));
  }

  function friendRow(r, s, now) {
    if (confirmId === r.id) {
      return h('div', { class: 'zcf-row' },
        h('div', { class: 'zcf-row-main' }, `Remove ${r.username} from friends?`),
        h('button', { class: 'zcf-mini zcf-danger', type: 'button', onclick: (e) => { e.stopPropagation(); confirmId = null; actions.removeFriend(r.id); } }, 'Remove'),
        h('button', {
          class: 'zcf-mini',
          type: 'button',
          'data-zcf-focus': `cancel:${r.id}`,
          onclick: (e) => { e.stopPropagation(); confirmId = null; renderList(); },
        }, 'Cancel'));
    }
    const online = !!(r.presence && r.presence.online);
    const unread = (s.threads[r.id] && s.threads[r.id].unread) || 0;
    const openRow = () => actions.openDm(r.id, { expand: true, username: r.username, avatar: r.avatar });
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      'data-zcf-focus': `row:${r.id}`,
      onclick: openRow,
      onkeydown: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          openRow();
        }
      },
    },
      avatar({ avatar: r.avatar, online: r.presence ? online : undefined }),
      h('div', { class: 'zcf-row-main' },
        h('div', { class: 'zcf-name' }, highlightMatch(r.username, filter)),
        h('div', { class: `zcf-status${online ? ' zcf-status-on' : ''}` }, statusText(r.presence, now) || ' ')),
      unread > 0 ? h('span', { class: 'zcf-pill' }, String(unread)) : null,
      h('div', { class: 'zcf-row-actions' },
        h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': `profile:${r.id}`, onclick: (e) => { e.stopPropagation(); router.navigate(`/profile/${r.id}`); } }, 'Profile'),
        h('button', {
          class: 'zcf-mini',
          type: 'button',
          'data-zcf-focus': `remove:${r.id}`,
          onclick: (e) => {
            e.stopPropagation();
            confirmId = r.id;
            renderList();
            const cancel = list.querySelector(`[data-zcf-focus="cancel:${r.id}"]`);
            if (cancel) cancel.focus();
          },
        }, 'Remove')));
  }

  function recentRow(t, s) {
    const unread = (s.threads[t.userId] && s.threads[t.userId].unread) || 0;
    // `#id` is a placeholder for a still-unknown username; don't let it clobber a real DM entry's name (inbox.js does the same).
    const knownUsername = t.username === `#${t.userId}` ? undefined : t.username;
    const openRow = () => actions.openDm(t.userId, { expand: true, username: knownUsername, avatar: t.avatar });
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      'data-zcf-focus': `row:${t.userId}`,
      onclick: openRow,
      onkeydown: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          openRow();
        }
      },
    },
      avatar({ avatar: t.avatar }),
      h('div', { class: 'zcf-row-main' },
        h('div', { class: 'zcf-name' }, highlightMatch(t.username, filter)),
        h('div', { class: 'zcf-status' }, t.preview || ' ')),
      unread > 0 ? h('span', { class: 'zcf-pill' }, String(unread)) : null,
      h('button', {
        class: 'zcf-add zcf-add-outline',
        type: 'button',
        'data-zcf-focus': `addfriend:${t.userId}`,
        onclick: (e) => {
          e.stopPropagation();
          if (e.detail > 1) return; // the second click of a double-click; rows can shift under it
          actions.addFriend({ id: t.userId, username: t.username, avatar: t.avatar });
          toast(`${t.username} added to friends`);
        },
      }, '+ Friend'));
  }

  function rowSig(r, s, now) {
    const unread = (s.threads[r.id] && s.threads[r.id].unread) || 0;
    return [r.id, r.username, r.avatar, !!r.presence, !!(r.presence && r.presence.online), statusText(r.presence, now), unread];
  }

  function recentSig(t, s) {
    const unread = (s.threads[t.userId] && s.threads[t.userId].unread) || 0;
    return [t.userId, t.username, t.avatar, unread, t.preview || ''];
  }

  // Everything the list currently renders, so a store/presence change that doesn't touch any of it can skip the rebuild.
  function listSignature(sec, s, now, q) {
    return JSON.stringify([
      q,
      confirmId,
      sec.online.length, sec.offline.length, sec.recent.length, sec.total, sec.onlineCount,
      sec.online.map((r) => rowSig(r, s, now)),
      sec.offline.map((r) => rowSig(r, s, now)),
      sec.recent.map((t) => recentSig(t, s)),
    ]);
  }

  function renderList() {
    // A direct call (update(), a click handler, …) supersedes any frame scheduleList() already queued.
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    const s = store.get();
    const now = Date.now();
    const q = filter.trim();
    const sec = buildFriendSections({ friends: s.friends, presence: presence.get, threads: inbox.threads(), filter });
    count.textContent = `${sec.onlineCount} / ${sec.total} online`;

    const sig = listSignature(sec, s, now, q);
    if (sig === lastSig) return; // nothing visible changed: keep the existing nodes, mid-click state and focus
    lastSig = sig;

    // Remember what had focus, by a key stable across a rebuild, so we can hand it back below.
    const activeKey = list.contains(doc.activeElement) ? doc.activeElement.dataset.zcfFocus : undefined;
    const scrollTop = list.scrollTop;
    clear(list);
    const none = q ? 'No matches' : 'None';
    if (!sec.total && !q) {
      list.appendChild(h('div', { class: 'zcf-empty' }, 'No friends yet. Use the person-plus button above, or "Add Friend" on a profile.'));
    } else {
      section('Online', sec.online, (r) => friendRow(r, s, now), none);
      section('Offline', sec.offline, (r) => friendRow(r, s, now), none);
    }
    if (sec.recent.length) section('Recent — not friends', sec.recent, (t) => recentRow(t, s), none);
    list.scrollTop = scrollTop;

    if (activeKey) {
      const match = list.querySelector(`[data-zcf-focus="${activeKey}"]`);
      if (match) match.focus();
    }
  }

  function update() {
    const s = store.get();
    const open = !!s.dock.friendsOpen;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    titleText.hidden = !open;
    count.hidden = !open;
    menuBtn.hidden = !open;
    toggle.hidden = !open;
    setBadge(unreadBadge, friendsUnreadTotal(s), !open);
    if (open) {
      renderList();
      pop.refresh();
    } else {
      pop.close();
      menu.hidden = true;
      confirmId = null;
    }
  }

  // Presence and inbox updates arrive in bursts; redraw at most once per frame.
  function scheduleList() {
    if (frame || !store.get().dock.friendsOpen) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderList();
    });
  }

  // Additive: nothing calls this yet, but later work that tears the window down needs it.
  function destroy() {
    doc.removeEventListener('mousedown', onDocMousedown);
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    pop.close();
    menu.hidden = true;
  }

  return { el, update, scheduleList, destroy };
}
