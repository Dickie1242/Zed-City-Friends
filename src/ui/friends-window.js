// The Friends tab/window in the dock: filter, Online / Offline / Recent sections, add-friend pop-out, ⋯ menu.
import { h, clear, icon, avatar, highlightMatch, badge, setBadge, downloadText } from './dom.js';
import { createAddFriendPopover } from './add-friend-popover.js';
import { buildFriendSections } from '../friends-view.js';
import { friendsUnreadTotal, isFriend } from '../state.js';
import { statusText } from '../time.js';

export function createFriendsWindow(services, { doc = document } = {}) {
  const { store, actions, presence, inbox, players, router, toast, playerId } = services;
  let filter = '';
  let confirmId = null;
  let frame = 0;

  const titleText = h('span', null, 'Friends');
  const count = h('span', { class: 'zcf-count' });
  const unreadBadge = badge();
  const title = h('div', { class: 'chat-title' }, h('i', { class: 'fas fa-user-friends chat-icon', 'aria-hidden': 'true' }), titleText, count, unreadBadge);
  const menuBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'More', 'aria-label': 'More' }, icon('ellipsis-h'));
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleFriends() }, title, menuBtn, toggle);

  const filterInput = h('input', { class: 'zcf-input', type: 'text', placeholder: 'Search friends…', 'aria-label': 'Search friends' });
  const addBtn = h('button', { class: 'zcf-iconbtn', type: 'button', title: 'Add friend', 'aria-label': 'Add friend' }, icon('user-plus'));
  const toolbar = h('div', { class: 'zcf-toolbar' }, h('label', { class: 'zcf-search' }, icon('search'), filterInput), addBtn);
  const list = h('div', { class: 'zcf-list' });

  const pop = createAddFriendPopover({
    players,
    isFriend: (id) => isFriend(store.get(), id),
    onAdd: (p) => {
      actions.addFriend(p);
      toast(`${p.username} added to friends`);
    },
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
    addBtn.classList.toggle('zcf-active', pop.isOpen);
  });
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const res = actions.importFriends(await file.text());
    toast(res.ok ? `Imported ${res.added} new friend${res.added === 1 ? '' : 's'}.` : res.error, { error: !res.ok });
  });
  // Close the pop-out and menu on outside clicks.
  doc.addEventListener('mousedown', (e) => {
    if (pop.isOpen && !pop.el.contains(e.target) && !addBtn.contains(e.target)) {
      pop.close();
      addBtn.classList.remove('zcf-active');
    }
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) menu.hidden = true;
  });

  function onExport() {
    menu.hidden = true;
    const s = store.get();
    downloadText(`zed-city-friends-${playerId}.json`, actions.exportFriends(), doc);
    toast(`Exported ${Object.keys(s.friends).length} friends.`);
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
        h('button', { class: 'zcf-mini', type: 'button', onclick: (e) => { e.stopPropagation(); confirmId = null; renderList(); } }, 'Cancel'));
    }
    const online = !!(r.presence && r.presence.online);
    const unread = (s.threads[r.id] && s.threads[r.id].unread) || 0;
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      onclick: () => actions.openDm(r.id, { expand: true, username: r.username, avatar: r.avatar }),
    },
      avatar({ avatar: r.avatar, online: r.presence ? online : undefined }),
      h('div', { class: 'zcf-row-main' },
        h('div', { class: 'zcf-name' }, highlightMatch(r.username, filter)),
        h('div', { class: `zcf-status${online ? ' zcf-status-on' : ''}` }, statusText(r.presence, now) || ' ')),
      unread > 0 ? h('span', { class: 'zcf-pill' }, String(unread)) : null,
      h('div', { class: 'zcf-row-actions' },
        h('button', { class: 'zcf-mini', type: 'button', onclick: (e) => { e.stopPropagation(); router.navigate(`/profile/${r.id}`); } }, 'Profile'),
        h('button', { class: 'zcf-mini', type: 'button', onclick: (e) => { e.stopPropagation(); confirmId = r.id; renderList(); } }, 'Remove')));
  }

  function recentRow(t, s) {
    const unread = (s.threads[t.userId] && s.threads[t.userId].unread) || 0;
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      onclick: () => actions.openDm(t.userId, { expand: true, username: t.username, avatar: t.avatar }),
    },
      avatar({ avatar: t.avatar }),
      h('div', { class: 'zcf-row-main' },
        h('div', { class: 'zcf-name' }, highlightMatch(t.username, filter)),
        h('div', { class: 'zcf-status' }, t.preview || ' ')),
      unread > 0 ? h('span', { class: 'zcf-pill' }, String(unread)) : null,
      h('button', {
        class: 'zcf-add zcf-add-outline',
        type: 'button',
        onclick: (e) => {
          e.stopPropagation();
          actions.addFriend({ id: t.userId, username: t.username, avatar: t.avatar });
          toast(`${t.username} added to friends`);
        },
      }, '+ Friend'));
  }

  function renderList() {
    const s = store.get();
    const now = Date.now();
    const sec = buildFriendSections({ friends: s.friends, presence: presence.get, threads: inbox.threads(), filter });
    count.textContent = `${sec.onlineCount} / ${sec.total} online`;
    const scrollTop = list.scrollTop;
    clear(list);
    const none = filter ? 'No matches' : 'None';
    if (!sec.total && !filter) {
      list.appendChild(h('div', { class: 'zcf-empty' }, 'No friends yet. Use the person-plus button above, "Add Friend" on a profile, or "+ friend" next to a name in chat.'));
    } else {
      section('Online', sec.online, (r) => friendRow(r, s, now), none);
      section('Offline', sec.offline, (r) => friendRow(r, s, now), none);
    }
    if (sec.recent.length) section('Recent — not friends', sec.recent, (t) => recentRow(t, s), none);
    list.scrollTop = scrollTop;
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
      addBtn.classList.remove('zcf-active');
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

  return { el, update, scheduleList };
}
