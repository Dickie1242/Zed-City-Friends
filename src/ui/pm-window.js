// The Private Messages window in the dock (spec Part A): Chats / Friends / Faction / Blocked tabs, a search
// box that starts a chat with any player, and the ⋯ menu (export / import). Replaces 0.4's Friends & Chats.
import { h, clear, icon, avatar, badge, setBadge, wireMenuKeys } from './dom.js';
import { createPlayerSearch } from './player-search.js';
import { enemyMark, mutedMark } from './marks.js';
import { buildChatRows, previewLine, buildFactionRows, buildBlockedRows } from '../pm-view.js';
import { buildFriendsTable } from '../friends-table.js';
import { chatsUnreadTotal, isFriend } from '../state.js';
import { longAgo, longStatusText } from '../time.js';
import { makePoller } from '../poller.js';
import { asArray, safe } from '../util.js';
import { createBackupFile } from './backup-file.js';
import { createStand } from './stand.js';

export const FACTION_MS = 60000;
const LOAD_MORE_PX = 80;
const TABS = [['chats', 'Chats'], ['friends', 'Friends'], ['faction', 'Faction'], ['blocked', 'Blocked']];
const SEARCH_TEXT = { short: 'Keep typing…', searching: 'Searching…' };
// After a pin click, further clicks on pins and rows wait this long (no double toggles or stray opens).
const PIN_QUIET_MS = 400;

export function createPmWindow(services, { doc = document } = {}) {
  const { store, settings, actions, presence, inbox, players, router, toast, playerId, myId, api } = services;
  const isEnemy = services.isEnemy || (() => false);
  const isMuted = services.isMuted || (() => false);

  let wasOpen = false;
  let frame = 0;
  let lastSig = null;
  let lastView = null;
  let holdRender = false; // a pointer is down in the window: a redraw now could swallow the click
  let renderWanted = false;
  let found = { kind: 'idle' }; // the search box (player-search.js states)
  // Chats: older inbox pages loaded by scrolling, kept for the session. Page 1 always comes from the poll.
  const older = [];
  let olderState = 'more'; // more | loading | error | done
  // Every thread seen on page 1 this session, so one that slides onto page 2 after page 2 was loaded
  // isn't lost. buildChatRows keeps the newest copy of each player's thread.
  const seenOnPage1 = new Map();
  function rememberPage1() {
    for (const t of inbox.threads()) seenOnPage1.set(t.userId, t);
  }
  // Faction and Blocked are loaded while their tab shows.
  let faction = { status: 'idle', data: null }; // idle | loading | ok | none | error
  let pinQuietUntil = 0;
  let blocked = { status: 'idle', pages: [], total: 0, loading: false, done: false };
  let blockedShowing = false;
  let reloadBlocked = false; // a reload asked for while a page was still loading
  let unblockId = null; // the row asking "Unblock {name}?"
  let unblockBusy = false;

  const tab = () => settings.get().pmTab;
  const searching = () => found.kind !== 'idle';
  const isOpen = () => !!store.get().dock.friendsOpen;

  // Header, minimized tab and body.
  const titleText = h('span', null, 'Private Messages');
  const unreadBadge = badge();
  unreadBadge.classList.replace('bg-red-5', 'bg-positive'); // green: new messages, not an alert
  // The top bar's friends icon, with a small speech bubble by one head (styles.js, 0.8.0).
  const pmIcon = () => h('i', { class: 'fas fa-user-friends zcf-pm-icon chat-icon', 'aria-hidden': 'true' });
  const title = h('div', { class: 'chat-title' }, pmIcon(), titleText, unreadBadge);
  const menuBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'More', 'aria-label': 'More', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon('ellipsis-h'));
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.togglePm() }, title, menuBtn, toggle);
  // Its icon in the bar while the window is open above it (0.8 spec §2).
  const stand = createStand('pm', { title: 'Private Messages', className: 'zcf-stand-pm', onClick: () => actions.togglePm() }, pmIcon());

  const tabBtns = new Map();
  const tabBar = h('div', { class: 'zcf-pm-tabs', role: 'tablist' });
  for (const [key, label] of TABS) {
    const b = h('button', { class: 'zcf-pm-tab', type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => selectTab(key) }, label);
    tabBtns.set(key, b);
    tabBar.appendChild(b);
  }
  const searchInput = h('input', {
    class: 'zcf-input',
    type: 'text',
    placeholder: 'Search by player name to start a new chat',
    'aria-label': 'Search by player name to start a new chat',
  });
  const list = h('div', { class: 'zcf-list zcf-pm-list' });
  const main = h('div', { class: 'zcf-pm-main zcf-zoom' },
    tabBar,
    h('div', { class: 'zcf-toolbar' }, h('label', { class: 'zcf-search zcf-pm-search' }, icon('search'), searchInput)),
    list);

  const backup = createBackupFile({ doc, actions, toast, playerId });
  const menu = h('div', { class: 'zcf-menu', role: 'menu', hidden: true },
    h('div', { class: 'zcf-menu-title' }, 'Your data'),
    h('button', {
      type: 'button',
      role: 'menuitem',
      onclick: () => {
        closeMenu();
        backup.save();
      },
    }, 'Save backup'),
    h('button', {
      type: 'button',
      role: 'menuitem',
      onclick: () => {
        closeMenu();
        backup.load();
      },
    }, 'Load backup'));
  const body = h('div', { class: 'chat-content zcf-body' }, main, menu, backup.input);
  const el = h('div', { class: 'chat-container zcf zcf-pm', dataset: { zcfChat: 'pm' } }, header, body);

  // The ⋯ menu.
  function closeMenu({ focusButton = false } = {}) {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    if (focusButton) menuBtn.focus();
  }
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    menu.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  });
  wireMenuKeys(menu, { onEscape: () => closeMenu({ focusButton: true }) });

  function onDocMousedown(e) {
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
  }
  doc.addEventListener('mousedown', onDocMousedown);

  // A redraw between pointerdown and click would replace the row under the pointer and lose the click.
  el.addEventListener('pointerdown', () => {
    holdRender = true;
  }, true);
  function onPointerRelease() {
    if (!holdRender) return;
    setTimeout(() => {
      holdRender = false;
      if (!renderWanted) return;
      renderWanted = false;
      safe('pm-render', renderList)();
    }, 0);
  }
  doc.addEventListener('pointerup', onPointerRelease, true);
  doc.addEventListener('pointercancel', onPointerRelease, true);

  // Search.
  const search = createPlayerSearch({
    players,
    onState(st) {
      found = st;
      renderList();
    },
  });
  searchInput.addEventListener('input', () => search.set(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !searchInput.value) return;
    e.preventDefault();
    e.stopPropagation();
    clearSearch();
  });
  function clearSearch() {
    searchInput.value = '';
    search.set('');
  }

  function selectTab(key) {
    if (tab() !== key) actions.setPmTab(key);
    if (searching()) clearSearch();
  }

  // Loading more as the list nears its bottom (Chats: older threads; Blocked: later pages).
  list.addEventListener('scroll', () => {
    if (searching() || list.scrollHeight - list.scrollTop - list.clientHeight >= LOAD_MORE_PX) return;
    if (tab() === 'chats') loadOlder();
    else if (tab() === 'blocked' && blocked.status === 'ok' && !blocked.done) loadBlocked({ more: true });
  });

  async function loadOlder() {
    if (olderState !== 'more' && olderState !== 'error') return;
    olderState = 'loading';
    renderList();
    const r = await inbox.fetchPage(older.length + 2);
    if (r.ok && !r.threads.length) olderState = 'done';
    else if (r.ok) {
      older.push(r.threads);
      olderState = 'more';
    } else olderState = r.kind === 'auth' ? 'done' : 'error';
    renderList();
  }

  async function loadFaction() {
    if (!faction.data) faction = { status: 'loading', data: null };
    renderList();
    const r = await api.getFactionMembers();
    if (r.ok) faction = r.data && r.data.faction ? { status: 'ok', data: r.data } : { status: 'none', data: null };
    // The game answers a plain error when you have no faction; anything else (offline, busy, rate limited,
    // logged out) keeps what's shown, or offers a retry.
    else if (r.kind === 'other' || r.kind === 'access') faction = { status: 'none', data: null };
    else faction = faction.data ? faction : { status: 'error', data: null };
    renderList();
    return r;
  }
  const factionPoller = makePoller({ run: loadFaction, interval: FACTION_MS, doc });

  async function loadBlocked({ more = false } = {}) {
    if (blocked.loading) {
      if (!more) reloadBlocked = true;
      return;
    }
    const page = more ? blocked.pages.length + 1 : 1;
    blocked = { ...blocked, loading: true, status: more || blocked.status === 'ok' ? blocked.status : 'loading' };
    renderList();
    const r = await api.blockList(page);
    if (r.ok) {
      const rows = asArray(r.data && r.data.list);
      const pages = more ? [...blocked.pages, rows] : [rows];
      const total = Number(r.data && r.data.total) || 0;
      blocked = { status: 'ok', pages, total, loading: false, done: !rows.length || pages.flat().length >= total };
    } else {
      blocked = { ...blocked, loading: false, status: blocked.status === 'ok' ? 'ok' : 'error' };
    }
    renderList();
    if (reloadBlocked) {
      reloadBlocked = false;
      loadBlocked();
    }
  }

  async function unblock(u) {
    unblockBusy = true;
    renderList();
    const r = await api.unblockUser(u.id);
    unblockBusy = false;
    unblockId = null;
    if (r.ok && !(r.data && r.data.success === false)) {
      toast(`${u.username} unblocked`);
      loadBlocked();
    } else {
      toast(`Failed to unblock ${u.username}`, { error: true });
      renderList();
    }
  }

  // Rows. Each list item is { sig, build }: the signature says what it shows, so an unchanged list
  // keeps its nodes (and focus, and a half-done click).
  const item = (sig, build) => ({ sig, build });
  const note = (text) => item(['note', text], () => h('div', { class: 'zcf-empty' }, text));
  const knownName = (id, name) => (name === `#${id}` ? undefined : name);
  // A name and avatar for a pinned player whose thread isn't loaded: a friend, an open DM or an enemy.
  function knownPlayer(id) {
    const s = store.get();
    const dm = s.dock.dms.find((d) => d.id === id);
    const enemy = services.enemies ? services.enemies.get().enemies[id] : null;
    return s.friends[id] || (dm && dm.username ? dm : null) || enemy || null;
  }
  function pinButton(t) {
    return h('button', {
      class: `zcf-pm-pin${t.pinned ? ' zcf-pinned' : ''}`,
      type: 'button',
      title: t.pinned ? 'Unpin' : 'Pin to the top',
      'aria-label': t.pinned ? `Unpin ${t.username}` : `Pin ${t.username} to the top`,
      'aria-pressed': String(!!t.pinned),
      'data-zcf-focus': `pin:${t.userId}`,
      onclick: (e) => {
        e.stopPropagation();
        // A double click would pin and unpin, or land on whichever row moved under the pointer.
        if (Date.now() < pinQuietUntil) return;
        pinQuietUntil = Date.now() + PIN_QUIET_MS;
        actions.togglePin(t.userId);
      },
    }, icon('thumbtack'));
  }
  const openChat = (id, username, av) => actions.openDm(id, { expand: true, username: knownName(id, username), avatar: av });

  function rowEl(focusKey, onOpen, children) {
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      'data-zcf-focus': focusKey,
      onclick: onOpen,
      onkeydown: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
        }
      },
    }, children);
  }
  const nameEl = (id, username, after) => h('div', { class: 'zcf-name' }, isEnemy(id) ? enemyMark() : null, username, after || null);
  const pill = (n, dim) => (n > 0 ? h('span', { class: `zcf-pill zcf-pill-green${dim ? ' zcf-pill-dim' : ''}` }, String(n)) : null);
  const onDot = (p) => (p ? !!p.online : undefined);

  function chatItems(s, now) {
    rememberPage1();
    const rows = buildChatRows({ page1: inbox.threads(), older: [...older, [...seenOnPage1.values()]], threads: s.threads, pinned: settings.get().pinned, stub: knownPlayer });
    const items = rows.map((t) => {
      const p = presence.get(t.userId);
      const muted = isMuted(t.userId);
      const when = t.lastReply ? longAgo(t.lastReply, now) : '';
      const line = previewLine(t, myId);
      return item(['chat', t.userId, t.username, t.avatar, line, when, t.unread, onDot(p), isEnemy(t.userId), muted, !!t.pinned], () =>
        rowEl(`row:${t.userId}`, () => Date.now() >= pinQuietUntil && openChat(t.userId, t.username, t.avatar), [
          avatar({ avatar: t.avatar, online: onDot(p), size: 30 }),
          h('div', { class: 'zcf-row-main' },
            h('div', { class: 'zcf-pm-line' }, nameEl(t.userId, t.username, muted ? mutedMark() : null), pill(t.unread, muted), h('span', { class: 'zcf-pm-time' }, when), pinButton(t)),
            h('div', { class: `zcf-status zcf-pm-preview${t.unread > 0 ? ' zcf-unread' : ''}` }, line || ' ')),
        ]));
    });
    if (!rows.length) {
      // Page 1 empty means nothing older either; before the first answer, say what's actually going on.
      const status = inbox.status ? inbox.status() : 'ok';
      return [note(status === 'loading' ? 'Loading…' : status === 'error' ? "Couldn't load your chats. Trying again…" : 'No conversations yet.')];
    }
    if (olderState !== 'done') {
      const label = olderState === 'loading' ? 'Loading…' : olderState === 'error' ? "Couldn't load. Retry" : 'Load older chats';
      items.push(item(['older', olderState], () => h('button', {
        class: 'zcf-pm-more',
        type: 'button',
        'data-zcf-focus': 'older',
        disabled: olderState === 'loading',
        onclick: () => loadOlder(),
      }, label)));
    }
    return items;
  }

  function friendItems(s, now) {
    const rows = buildFriendsTable({ friends: s.friends, presence: presence.get, threads: s.threads }).rows;
    const items = rows.map((r) => {
      const online = !!(r.presence && r.presence.online);
      const status = longStatusText(r.presence, now);
      return item(['friend', r.id, r.username, r.avatar, !!r.presence, online, status, r.unread, isEnemy(r.id)], () =>
        rowEl(`row:${r.id}`, () => openChat(r.id, r.username, r.avatar), [
          avatar({ avatar: r.avatar, online: r.presence ? online : undefined, size: 30 }),
          h('div', { class: 'zcf-row-main' },
            h('div', { class: 'zcf-pm-line' }, nameEl(r.id, r.username), pill(r.unread, false)),
            h('div', { class: `zcf-status${online ? ' zcf-status-on' : ''}` }, status || ' ')),
        ]));
    });
    if (!rows.length) items.push(note('No friends yet. Add them on a profile or on the Friends page.'));
    items.push(item(['manage'], () => h('button', { class: 'zcf-pm-foot', type: 'button', 'data-zcf-focus': 'manage', onclick: () => router.navigate('/friends') }, 'Manage friends →')));
    return items;
  }

  function retryItem(onRetry) {
    return item(['retry'], () => h('div', { class: 'zcf-empty' }, "Couldn't load. ",
      h('button', { class: 'zcf-link zcf-pm-retry', type: 'button', 'data-zcf-focus': 'retry', onclick: onRetry }, 'Retry')));
  }

  function factionItems(now) {
    if (faction.status === 'idle' || faction.status === 'loading') return [note('Loading…')];
    if (faction.status === 'none') return [note("You're not in a faction.")];
    // start() too: a logged-out answer stops the poller, and a poke alone wouldn't wake it.
    if (faction.status === 'error') return [retryItem(() => {
      factionPoller.poke();
      factionPoller.start();
    })];
    const rows = buildFactionRows(faction.data, { myId, now });
    if (!rows.length) return [note('No other members.')];
    return rows.map((m) => {
      const status = longStatusText({ online: m.online, active: m.active }, now);
      return item(['member', m.id, m.username, m.avatar, m.online, status, m.level, isEnemy(m.id)], () =>
        rowEl(`row:${m.id}`, () => openChat(m.id, m.username, m.avatar), [
          avatar({ avatar: m.avatar, online: m.online, size: 30 }),
          h('div', { class: 'zcf-row-main' },
            h('div', { class: 'zcf-pm-line' }, nameEl(m.id, m.username), h('span', { class: 'zcf-pm-time' }, m.level ? `Lv ${m.level}` : '')),
            h('div', { class: `zcf-status${m.online ? ' zcf-status-on' : ''}` }, status || ' ')),
        ]));
    });
  }

  function blockedItems() {
    if (blocked.status === 'idle' || blocked.status === 'loading') return [note('Loading…')];
    if (blocked.status === 'error') return [retryItem(() => loadBlocked())];
    const rows = buildBlockedRows(blocked.pages);
    if (!rows.length) return [note('No blocked players.')];
    const items = rows.map((u) => {
      if (unblockId === u.id) {
        return item(['confirm', u.id, u.username, unblockBusy], () => h('div', { class: 'zcf-row zcf-pm-confirm' },
          h('div', { class: 'zcf-row-main' }, `Unblock ${u.username}?`),
          h('button', { class: 'zcf-add', type: 'button', 'data-zcf-focus': `unblock-yes:${u.id}`, disabled: unblockBusy, onclick: () => unblock(u) }, 'Unblock'),
          h('button', {
            class: 'zcf-mini',
            type: 'button',
            'data-zcf-focus': `unblock-no:${u.id}`,
            onclick: () => {
              unblockId = null;
              renderList();
              focusKey(`unblock:${u.id}`);
            },
          }, 'Cancel')));
      }
      return item(['blocked', u.id, u.username, u.avatar], () => h('div', { class: 'zcf-row zcf-pm-blocked' },
        avatar({ avatar: u.avatar, size: 30 }),
        h('div', { class: 'zcf-row-main' }, h('div', { class: 'zcf-name' }, u.username)),
        h('button', {
          class: 'zcf-mini',
          type: 'button',
          'data-zcf-focus': `unblock:${u.id}`,
          onclick: () => {
            unblockId = u.id;
            renderList();
            focusKey(`unblock-no:${u.id}`);
          },
        }, 'Unblock')));
    });
    if (blocked.loading) items.push(note('Loading…'));
    return items;
  }

  function searchItems(s) {
    if (found.kind !== 'results') return [note(found.kind === 'error' ? found.text : SEARCH_TEXT[found.kind])];
    if (!found.results.length) return [note('No players found.')];
    return found.results.map((p) => {
      const friend = isFriend(s, p.id);
      return item(['result', p.id, p.username, p.avatar, friend, isEnemy(p.id)], () =>
        rowEl(`result:${p.id}`, () => {
          openChat(p.id, p.username, p.avatar);
          clearSearch();
        }, [
          avatar({ avatar: p.avatar, size: 30 }),
          h('div', { class: 'zcf-row-main' }, nameEl(p.id, p.username), h('div', { class: 'zcf-status' }, `#${p.id}`)),
          friend
            ? h('span', { class: 'zcf-done' }, '✓ Friend')
            : h('button', {
                class: 'zcf-add zcf-add-outline',
                type: 'button',
                'data-zcf-focus': `add:${p.id}`,
                onclick: (e) => {
                  e.stopPropagation();
                  if (e.detail > 1) return; // the second click of a double-click
                  actions.addFriend(p);
                  toast(`${p.username} added to friends`);
                },
              }, '+ Friend'),
        ]));
    });
  }

  function focusKey(k) {
    const target = el.querySelector(`[data-zcf-focus="${k}"]`);
    if (target) target.focus();
    return !!target;
  }

  function renderList() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    const s = store.get();
    const now = Date.now();
    const t = tab();
    for (const [k, b] of tabBtns) {
      b.classList.toggle('zcf-pm-tab-on', k === t);
      b.setAttribute('aria-selected', String(k === t));
    }
    let items;
    if (searching()) items = searchItems(s);
    else if (t === 'friends') items = friendItems(s, now);
    else if (t === 'faction') items = factionItems(now);
    else if (t === 'blocked') items = blockedItems();
    else items = chatItems(s, now);
    const view = searching() ? 'search' : t;
    const sig = JSON.stringify([view, items.map((i) => i.sig)]);
    if (sig === lastSig) return;
    lastSig = sig;
    const activeKey = list.contains(doc.activeElement) ? doc.activeElement.dataset.zcfFocus : undefined;
    const activeRow = activeKey ? [...list.querySelectorAll('.zcf-row')].findIndex((r) => r.contains(doc.activeElement)) : -1;
    const scrollTop = view === lastView ? list.scrollTop : 0;
    lastView = view;
    clear(list);
    for (const i of items) list.appendChild(i.build());
    list.scrollTop = scrollTop;
    if (activeKey && !focusKey(activeKey) && activeRow >= 0) {
      // Its row went away (an unpinned chat that only showed because it was pinned): stay nearby.
      const rows = list.querySelectorAll('.zcf-row');
      const next = rows[Math.min(activeRow, rows.length - 1)];
      if (next) next.focus();
    }
  }

  // Starts and stops what the shown tab needs: the Faction poller, a fresh Blocked page 1.
  function syncLoaders() {
    const open = isOpen();
    const t = tab();
    if (open && t === 'faction') factionPoller.start();
    else factionPoller.stop();
    const showBlocked = open && t === 'blocked';
    if (showBlocked && !blockedShowing) loadBlocked();
    blockedShowing = showBlocked;
  }

  // The minimized tab's green count: unread chats from friends and the Chats list, muted ones left out.
  function syncBadge() {
    rememberPage1(); // runs on every inbox change, open or not
    const s = store.get();
    setBadge(unreadBadge, chatsUnreadTotal(s, inbox.threads(), settings.get().muted), !s.dock.friendsOpen);
  }

  function update() {
    const open = isOpen();
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    stand.hidden = !open;
    body.hidden = !open;
    titleText.hidden = !open;
    menuBtn.hidden = !open;
    toggle.hidden = !open;
    syncBadge();
    if (open) {
      // A redraw between pointerdown and click would replace the row under the pointer and lose the click.
      if (holdRender) renderWanted = true;
      else renderList();
    } else {
      closeMenu();
      unblockId = null;
      if (wasOpen) clearSearch();
    }
    wasOpen = open;
    syncLoaders();
  }

  // Presence and inbox updates arrive in bursts; redraw at most once per frame, never mid-click.
  function scheduleList() {
    if (frame || !isOpen()) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (holdRender) {
        renderWanted = true;
        return;
      }
      safe('pm-render', renderList)();
    });
  }

  function destroy() {
    doc.removeEventListener('mousedown', onDocMousedown);
    doc.removeEventListener('pointerup', onPointerRelease, true);
    doc.removeEventListener('pointercancel', onPointerRelease, true);
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    factionPoller.destroy();
    search.cancel();
    closeMenu();
  }

  return { el, stand, update, scheduleList, syncBadge, destroy };
}
