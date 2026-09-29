// The Chat settings window (spec §B.4, §D.2): the cog tab in the dock's corner, opening into utilities,
// every chat with its settings and a Reset, the new-message sound, the version and What's new. The cog
// never shows a badge or a dot.
import { h, clear, icon } from './dom.js';
import { findChats } from './chat-custom/registry.js';
import { chatLabel, describeChat, isLocked, dmKey, dmIdOf } from '../chat-custom/chats.js';
import { SOUNDS } from '../settings.js';
import { WHATS_NEW } from '../whats-new.js';
import { VERSION, DEV_PROFILE_ID } from '../version.js';

const SOUND_LABELS = { off: 'Off', chirp: 'Chirp', ping: 'Ping', bell: 'Bell' };
const ORDER = (key) => (key.startsWith('game:') ? 0 : key === 'pm' ? 1 : key === 'settings' ? 2 : 3);

export function createSettingsWindow(services, { doc = document } = {}) {
  const { store, settings, actions, sound, router } = services;
  let marking = null; // { done, total } while Mark all as read runs
  let showNews = false;
  let showOlder = false;
  let lastSig = null;

  const titleText = h('span', null, 'Chat settings');
  const title = h('div', { class: 'chat-title' }, h('i', { class: 'fas fa-cog chat-icon', 'aria-hidden': 'true' }), titleText);
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleSettings() }, title, toggle);
  const content = h('div', { class: 'zcf-set zcf-zoom' });
  const body = h('div', { class: 'chat-content zcf-body' }, content);
  const el = h('div', { class: 'chat-container zcf zcf-settings', dataset: { zcfChat: 'settings' } }, header, body);

  // Built once and moved into each redraw, so these controls keep their state; their focus keys hand focus
  // back after a redraw.
  const select = h('select', { class: 'zcf-set-select', 'aria-label': 'New private message sound', 'data-zcf-focus': 'sound' },
    SOUNDS.map((k) => h('option', { value: k }, SOUND_LABELS[k])));
  const play = h('button', { class: 'zcf-mini zcf-set-play', type: 'button', title: 'Play it', 'aria-label': 'Play the sound', 'data-zcf-focus': 'play' }, '▶');
  select.addEventListener('change', () => actions.setSound(select.value));
  play.addEventListener('click', () => sound.play(select.value, { fromUser: true }));

  const checkbox = (label, focusKey, onChange) => {
    const input = h('input', { type: 'checkbox', class: 'zcf-set-check', 'data-zcf-focus': focusKey });
    input.addEventListener('change', () => onChange(input.checked));
    return { input, row: h('label', { class: 'zcf-set-toggle' }, input, h('span', null, label)) };
  };
  const notifyBox = checkbox('Desktop notifications', 'notify', (on) => actions.setNotify(on));
  const friendsOnlyBox = checkbox('Friends only', 'notify-friends', (on) => actions.setNotifyFriendsOnly(on));
  const titleBox = checkbox('Unread count in the browser tab', 'title-count', (on) => actions.setTitleCount(on));
  const note = h('div', { class: 'zcf-set-note' });

  // What the browser allows, in words, or '' when notifications can simply be switched on.
  function permissionNote() {
    const n = services.notifier;
    if (!n || !n.supported) return 'Not supported in this browser.';
    return n.permission() === 'denied' ? "Notifications are blocked for zed.city in your browser's site settings." : '';
  }

  function dmName(id) {
    const s = store.get();
    const d = s.dock.dms.find((x) => x.id === id);
    return (d && d.username) || (s.friends[id] && s.friends[id].username) || null;
  }

  // Every chat that exists now or has settings: the game's, ours, open DMs, and customized closed DMs.
  function chatRows() {
    const saved = settings.get().chats;
    const keys = new Set(['pm', 'settings']);
    for (const c of findChats(doc)) keys.add(c.key);
    for (const d of store.get().dock.dms) keys.add(dmKey(d.id));
    for (const k of Object.keys(saved)) keys.add(k);
    return [...keys]
      .sort((a, b) => ORDER(a) - ORDER(b) || a.localeCompare(b))
      .map((key) => {
        const id = dmIdOf(key);
        return { key, name: chatLabel(key, id ? dmName(id) : null), entry: saved[key] };
      });
  }

  const section = (label, ...children) => h('div', { class: 'zcf-set-sec' }, h('div', { class: 'zcf-set-h' }, label), children);
  const disclosure = (label, open, focusKey, onToggle) => h('button', {
    class: 'zcf-news-toggle',
    type: 'button',
    'aria-expanded': String(open),
    'data-zcf-focus': focusKey,
    onclick: onToggle,
  }, label, ' ', open ? '▾' : '▸');
  const versionBlock = (v) => h('div', { class: 'zcf-news-ver' },
    h('div', { class: 'zcf-news-vh' }, `v${v.version}`, h('span', { class: 'zcf-news-date' }, v.date)),
    v.features.map((f) => h('div', { class: 'zcf-news-f' }, h('div', { class: 'zcf-news-ft' }, f.title), h('ul', null, f.points.map((p) => h('li', null, p))))));

  function whatsNew() {
    const [latest, ...older] = WHATS_NEW;
    return h('div', { class: 'zcf-news' },
      disclosure(`What's new in v${latest.version}`, showNews, 'news', () => {
        showNews = !showNews;
        render();
      }),
      showNews ? versionBlock(latest) : null,
      showNews && older.length
        ? disclosure('Earlier versions', showOlder, 'older', () => {
            showOlder = !showOlder;
            render();
          })
        : null,
      showNews && showOlder ? older.map(versionBlock) : null);
  }

  // A plain left click navigates in-app; middle and modified clicks open the profile in a new tab.
  function devLink() {
    if (!DEV_PROFILE_ID) return null;
    const href = `/profile/${DEV_PROFILE_ID}`;
    return h('a', {
      class: 'zcf-set-dev',
      href,
      'data-zcf-focus': 'dev',
      onclick: (e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.navigate(href);
      },
    }, h('i', { class: 'fas fa-user-plus', 'aria-hidden': 'true' }), ' Become friends or enemies with the dev!');
  }

  async function markAll() {
    if (marking) return;
    marking = { done: 0, total: 0 };
    render();
    try {
      await actions.markAllRead((done, total) => {
        marking = { done, total };
        render();
      });
    } finally {
      marking = null;
      render();
    }
  }

  function build(rows) {
    const s = settings.get();
    return [
      section('Utilities', h('div', { class: 'zcf-set-btns' },
        h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'mark', disabled: !!marking, onclick: markAll },
          marking ? `Marking… ${marking.done}/${marking.total}` : 'Mark all as read'),
        h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'closeall', onclick: () => actions.closeAllDms() }, 'Close all private chats'))),
      section('Your chats',
        rows.map((r) => h('div', { class: 'zcf-set-chat' },
          h('i', {
            class: `fas ${isLocked(r.entry) ? 'fa-lock' : 'fa-lock-open'} zcf-set-lock`,
            role: 'img',
            title: isLocked(r.entry) ? 'Locked' : 'Unlocked',
            'aria-label': isLocked(r.entry) ? 'Locked' : 'Unlocked',
          }),
          h('div', { class: 'zcf-row-main' }, h('div', { class: 'zcf-name' }, r.name), h('div', { class: 'zcf-status' }, describeChat(r.entry))),
          h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': `reset:${r.key}`, disabled: !r.entry, onclick: () => actions.resetChat(r.key) }, 'Reset'))),
        h('button', { class: 'zcf-page-btn zcf-set-all', type: 'button', 'data-zcf-focus': 'resetall', disabled: !Object.keys(s.chats).length, onclick: () => actions.resetAllChats() }, 'Reset all chats')),
      section('Notifications', notifyBox.row, h('div', { class: 'zcf-set-sub' }, friendsOnlyBox.row), note, titleBox.row),
      section('Sounds', h('label', { class: 'zcf-set-sound' }, h('span', null, 'New private message'), select, play)),
      section('About', h('div', { class: 'zcf-set-about' }, `Zed City Friends v${VERSION}`), whatsNew(), devLink()),
    ];
  }

  function render() {
    if (!store.get().dock.settingsOpen) return;
    const s = settings.get();
    select.value = s.sound;
    play.disabled = s.sound === 'off';
    const blocked = permissionNote();
    notifyBox.input.checked = s.notify;
    notifyBox.input.disabled = !(services.notifier && services.notifier.supported);
    friendsOnlyBox.input.checked = s.notifyFriendsOnly;
    friendsOnlyBox.input.disabled = !s.notify;
    titleBox.input.checked = s.titleCount;
    note.textContent = blocked;
    note.hidden = !blocked;
    const rows = chatRows();
    const sig = JSON.stringify([rows, marking, showNews, showOlder, Object.keys(s.chats).length]);
    if (sig === lastSig) return;
    lastSig = sig;
    const focusKey = content.contains(doc.activeElement) && doc.activeElement.dataset ? doc.activeElement.dataset.zcfFocus : undefined;
    const scrollTop = body.scrollTop;
    clear(content);
    for (const node of build(rows)) content.appendChild(node);
    body.scrollTop = scrollTop;
    if (focusKey) {
      const target = content.querySelector(`[data-zcf-focus="${focusKey}"]`);
      if (target) target.focus();
    }
  }

  function update() {
    const open = !!store.get().dock.settingsOpen;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    titleText.hidden = !open;
    toggle.hidden = !open;
    el.title = open ? '' : 'Chat settings';
    if (open) render();
    else lastSig = null;
  }

  return {
    el,
    update,
    destroy() {
      clear(content);
    },
  };
}
