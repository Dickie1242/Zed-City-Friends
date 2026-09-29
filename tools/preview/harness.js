// A stand-in for the logged-in Zed City page: the game's header, page slot and chat dock (markup as the
// live client renders it), with the real script started on a fake api. The scene comes from location.hash.
import { createApp } from '../../src/app.js';
import { injectStyles } from '../../src/ui/styles.js';
import { hideGame404Early } from '../../src/ui/friends-page.js';
import { DOCK_HTML_FULL, HEADER, CITY_PAGE, PAGE_404, PROFILE_PAGE } from './game-markup.js';

const ME = 1;
const scene = (location.hash || '#pm-chats').slice(1);
const now = Date.now();
const ago = (min) => {
  const d = new Date(now - min * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};
const ok = (data) => Promise.resolve({ ok: true, data });

const PLAYERS = {
  5: { username: 'Spike', online: 1, active: 0, rank: 27, faction: { id: 9, name: 'Ashfall' } },
  6: { username: 'Nyx', online: 1, active: 0, rank: 51, faction: null, traveling: true },
  7: { username: 'Rustbucket', online: 0, active: 18 * 60, rank: 44, faction: { id: 8, name: 'Iron Veil' }, is_injured: 1 },
  8: { username: 'Moth', online: 0, active: 3 * 86400, rank: 12, faction: null },
  9: { username: 'Gravedigger', online: 1, active: 0, rank: 33, faction: { id: 3, name: 'Dust Rats' } },
  10: { username: 'TradeGuy', online: 0, active: 7200, rank: 8, faction: null },
  11: { username: 'Hollow', online: 0, active: 400, rank: 19, faction: null },
};

const thread = (id, min, message, { mine = false, unread = 0, system = false } = {}) => ({
  other_user_id: id,
  other_user: { username: system ? 'Zed City' : PLAYERS[id].username },
  message,
  sender_id: mine ? ME : id,
  last_reply: min * 60, // seconds ago, as the game sends it
  new_mail: unread,
  is_system: system ? 1 : 0,
});

const THREADS = [
  thread(10, 4, 'wanna buy 200 nails? good price', { unread: 2 }),
  thread(5, 16, 'see you at the bunker'),
  thread(9, 50, 'ok, sending the ammo now', { mine: true }),
  thread(6, 180, '![GIF: zombie dance](https://cdn.zed.city/gif.gif)'),
  thread(7, 60 * 26, 'you still owe me those nails', { unread: 1 }),
  thread(8, 60 * 24 * 3, 'gg'),
  thread(12, 30, 'Your trade was accepted', { system: true }),
];

const MESSAGES = [
  [101, 5, 'you still need those nails?', 40],
  [102, 5, 'got 60 spare', 39],
  [103, ME, 'yeah like 40', 38],
  [104, ME, 'I can pay in ammo :smile:', 38],
  [105, 5, 'deal. meet at the bunker', 20],
  [106, 5, 'see you at the bunker', 16],
].map(([id, sender, message, min]) => ({ id, sender_id: sender, message, sent_at: ago(min), is_system: 0 }));

const api = {
  getStats: () => ok({ id: ME, username: 'Me' }),
  getChats: (page = 1) => ok(page === 1 ? THREADS : page === 2 ? [thread(11, 60 * 24 * 9, 'thanks for the help')] : []),
  getChatInfo: (id) => ok({ [id]: { username: (PLAYERS[id] || {}).username, online: (PLAYERS[id] || {}).online, active: (PLAYERS[id] || {}).active } }),
  getChatMessages: (id, page) => ok(page === 1 && id === 5 ? MESSAGES : []),
  getNewMessages: () => ok([]),
  sendMail: () => ok({ message_id: 999 }),
  getProfile: (id) => ok({ id, ...(PLAYERS[id] || { username: `#${id}`, online: 0, active: 600 }) }),
  findPlayer: () => ok([{ id: 7, username: 'Rustbucket' }, { id: 11, username: 'Hollow' }]),
  getFactionMembers: () => ok({
    faction: { id: 3, name: 'Dust Rats' },
    members: [
      { id: ME, username: 'Me', online: 1, active: 0, level: 30 },
      { id: 9, username: 'Gravedigger', online: 1, active: 0, level: 33 },
      { id: 21, username: 'Bram', online: 0, active: 600, level: 12 },
      { id: 22, username: 'Cato', online: 1, active: 0, level: 41 },
      { id: 23, username: 'Abe', online: 1, active: 0, level: 7 },
      { id: 24, username: 'Wren', online: 0, active: 3 * 86400, level: 25 },
    ],
  }),
  blockList: () => ok({ list: [{ id: 31, username: 'SpamLord' }, { id: 32, username: 'griefer99' }], total: 2 }),
  unblockUser: () => ok({ success: true }),
};

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

const friends = Object.fromEntries([5, 6, 7, 8, 9].map((id) => [id, { id, username: PLAYERS[id].username, avatar: null, addedAt: 0, ...(id === 7 ? { note: 'owes me nails' } : {}) }]));
const enemies = { 7: { id: 7, username: 'Rustbucket', avatar: null, addedAt: 0, note: 'stole my nails' }, 9: { id: 9, username: 'Gravedigger', avatar: null, addedAt: 0 } };
const tabFor = { 'pm-chats': 'chats', 'pm-friends': 'friends', 'pm-faction': 'faction', 'pm-blocked': 'blocked' };

const dock = { friendsOpen: false, settingsOpen: false, dms: [] };
const settings = { v: 1, pmTab: tabFor[scene] || 'chats', sound: 'off', chats: {}, muted: [] };
if (scene.startsWith('pm-')) {
  dock.friendsOpen = true;
  if (scene === 'pm-chats') dock.dms.push({ id: 5, open: true, lastUsed: 2, username: 'Spike', avatar: null });
}
if (scene === 'dm') dock.dms.push({ id: 5, open: true, lastUsed: 2, username: 'Spike', avatar: null });
if (scene === 'settings') {
  dock.settingsOpen = true;
  dock.dms.push({ id: 5, open: false, lastUsed: 2, username: 'Spike', avatar: null });
  settings.sound = 'chirp';
  settings.chats = { 'game:general': { x: 60, y: 90, w: 460, h: 520, text: 120, locked: false }, pm: { text: 110 }, 'dm:5': { w: 420 } };
}
if (scene === 'custom') {
  dock.dms.push({ id: 5, open: true, lastUsed: 2, username: 'Spike', avatar: null });
  settings.chats = {
    'game:general': { locked: false, x: 420, y: 120, w: 460, h: 520, text: 120 },
    'dm:5': { x: 30, y: 60, text: 90 },
  };
}

document.body.classList.add('body--dark');
document.body.innerHTML = `<div id="q-app">${HEADER}<div class="q-page-container" style="padding-top:55px">${
  scene === 'enemies' ? PAGE_404 : scene === 'profile' ? PROFILE_PAGE : CITY_PAGE
}</div></div>${DOCK_HTML_FULL}`;
// On phones only one chat is open at a time: start the game's Global chat minimized so ours can show.
// Minimizing a game chat the way its Vue template does: the title text and chevron go, the content hides.
function setMinimized(chat, on) {
  chat.classList.toggle('chat-minimized', on);
  chat.querySelector('.chat-content').classList.toggle('chat-hidden', on);
  const title = chat.querySelector('.chat-title');
  const header = chat.querySelector('.chat-header');
  const span = title.querySelector('span');
  const chevron = header.querySelector('.chat-toggle');
  if (on) {
    if (span) span.remove();
    if (chevron) chevron.remove();
  } else {
    if (!span) title.insertAdjacentHTML('beforeend', `<span>${chat.dataset.title || 'Chat'}</span>`);
    if (!chevron) header.insertAdjacentHTML('beforeend', '<div class="chat-toggle" aria-hidden="true"><i class="fas fa-chevron-down"></i></div>');
  }
}
if (window.innerWidth < 600) setMinimized(document.querySelector('.general-chat'), true);
// The game's own header toggles its chats; the harness does the same for the minimized ones.
for (const header of document.querySelectorAll('.chat-containers > .chat-container > .chat-header')) {
  header.addEventListener('click', () => setMinimized(header.parentElement, !header.parentElement.classList.contains('chat-minimized')));
}
if (scene === 'enemies') history.replaceState(null, '', `/enemies${location.search}${location.hash}`);
if (scene === 'profile') history.replaceState(null, '', `/profile/7${location.search}${location.hash}`);

const storage = memoryStorage({
  [`zcf:v1:${ME}`]: { v: 1, friends, threads: { 10: { unread: 2, lastSeenReply: 0, lastNotifiedReply: 0 }, 7: { unread: 1, lastSeenReply: 0, lastNotifiedReply: 0 } }, dock },
  [`zcf:v1:${ME}:settings`]: settings,
  [`zcf:v1:${ME}:enemies`]: { v: 1, enemies },
});

hideGame404Early(document, window); // main.js does this at boot, before login is known
injectStyles(document);
createApp({ api, playerId: ME, playerName: 'Me', storage, sound: { play() {}, unlock() {} } });

if (scene === 'custom') {
  setTimeout(() => {
    const lock = document.querySelector('.general-chat .zcf-cc-lock');
    lock.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  }, 300);
}
if (scene === 'settings') {
  setTimeout(() => {
    const news = [...document.querySelectorAll('.zcf-news-toggle')].find((b) => b.textContent.startsWith("What's new"));
    if (news) news.click();
  }, 300);
}
