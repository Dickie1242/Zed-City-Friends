import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPmWindow, FACTION_MS } from '../../src/ui/pm-window.js';
import { addFriend } from '../../src/state.js';
import { makeServices, ME } from './services.js';
import { fakeApi, flush } from '../helpers.js';

const NOW = Date.now();
const thread = (userId, o = {}) => ({ userId, username: `U${userId}`, avatar: null, preview: 'hi', senderId: userId, lastReply: NOW - userId * 60000, newMail: 0, isSystem: false, ...o });

let current = null;
function mount(opts = {}, { open = true, tab } = {}) {
  const services = makeServices(opts);
  const w = createPmWindow(services);
  document.body.appendChild(w.el);
  services.store.subscribe(() => w.update());
  services.settings.subscribe(() => w.update());
  if (tab) services.settings.update((s) => { s.pmTab = tab; });
  if (open) services.store.update((s) => { s.dock.friendsOpen = true; });
  w.update();
  current = w;
  return { services, w, el: w.el };
}

const list = (el) => el.querySelector('.zcf-pm-list');
const rowNames = (el) => [...list(el).querySelectorAll('.zcf-row .zcf-name')].map((n) => n.textContent);
const tabBtn = (el, label) => [...el.querySelectorAll('.zcf-pm-tab')].find((b) => b.textContent === label);
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
function typeSearch(el, text) {
  const input = el.querySelector('.zcf-pm-search input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return input;
}

describe('private messages window', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  });
  afterEach(() => {
    if (current) current.destroy();
    current = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a minimized envelope tab with a green count of unread chats, friends and Chats alike', () => {
    const { services, el } = mount({ threads: [thread(9)] }, { open: false });
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.threads = { 5: { unread: 2 }, 9: { unread: 4 } };
    });
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.dataset.zcfChat).toBe('pm');
    expect(el.querySelector('.chat-icon').className).toContain('fa-envelope');
    const unread = el.querySelector('.unread-badge');
    expect(unread.textContent).toBe('6');
    expect(unread.hidden).toBe(false);
    expect(unread.classList.contains('bg-positive')).toBe(true);
    expect(el.querySelector('.zcf-body').hidden).toBe(true);
  });

  it('opens on the Chats tab: newest first, previews, times, unread pills, no system threads', () => {
    const { services, el } = mount({
      threads: [
        thread(7, { username: 'Nyx', preview: 'see you there', senderId: ME, lastReply: NOW - 3 * 3600000 }),
        thread(9, { username: 'TradeGuy', preview: 'wanna buy ammo?', lastReply: NOW - 18 * 60000 }),
        thread(3, { username: 'System', isSystem: true, lastReply: NOW }),
      ],
    });
    services.store.update((s) => { s.threads = { 9: { unread: 2 } }; });
    expect(el.querySelector('.chat-title').textContent).toContain('Private Messages');
    expect([...el.querySelectorAll('.zcf-pm-tab')].map((b) => b.textContent)).toEqual(['Chats', 'Friends', 'Faction', 'Blocked']);
    expect(tabBtn(el, 'Chats').getAttribute('aria-selected')).toBe('true');
    expect(rowNames(el)).toEqual(['TradeGuy', 'Nyx']);
    const [first, second] = list(el).querySelectorAll('.zcf-row');
    expect(first.querySelector('.zcf-pm-preview').textContent).toBe('TradeGuy: wanna buy ammo?');
    expect(first.querySelector('.zcf-pm-preview').classList.contains('zcf-unread')).toBe(true);
    expect(first.querySelector('.zcf-pill').textContent).toBe('2');
    expect(first.querySelector('.zcf-pm-time').textContent).toBe('18 min ago');
    expect(second.querySelector('.zcf-pm-preview').textContent).toBe('You: see you there');
    expect(second.querySelector('.zcf-pill')).toBeNull();
    expect(el.querySelector('.zcf-pm-search input').placeholder).toBe('Search by player name to start a new chat');
  });

  it('opens a DM from a chat row, without passing a #id placeholder as the name', () => {
    const { services, el } = mount({ threads: [thread(9, { username: '#9' })] });
    list(el).querySelector('.zcf-row').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(9, { expand: true, username: undefined, avatar: null });
  });

  it('loads older chats a page at a time, keeps each player once, and stops at an empty page', async () => {
    const { services, el } = mount({
      threads: [thread(1, { lastReply: NOW - 1000 })],
      olderPages: [[thread(1, { lastReply: NOW - 5000 }), thread(2)], []],
    });
    el.querySelector('.zcf-pm-more').click();
    await flush();
    expect(services.inbox.fetchPage).toHaveBeenCalledWith(2);
    expect(rowNames(el)).toEqual(['U1', 'U2']);
    list(el).dispatchEvent(new Event('scroll')); // jsdom has no layout: always "near the bottom"
    await flush();
    expect(services.inbox.fetchPage).toHaveBeenCalledWith(3);
    expect(el.querySelector('.zcf-pm-more')).toBeNull();
    list(el).dispatchEvent(new Event('scroll'));
    await flush();
    expect(services.inbox.fetchPage).toHaveBeenCalledTimes(2);
  });

  it('remembers the chosen tab in the settings document', () => {
    const { services, el } = mount();
    tabBtn(el, 'Friends').click();
    expect(services.actions.setPmTab).toHaveBeenCalledWith('friends');
    expect(services.settings.get().pmTab).toBe('friends');
    expect(tabBtn(el, 'Friends').classList.contains('zcf-pm-tab-on')).toBe(true);
  });

  it('lists friends online first (A-Z), then by last active, then unknown, and links to the Friends page', () => {
    const { services, el } = mount({
      presence: { 5: { online: true }, 6: { online: false, active: NOW - 12 * 60000 }, 7: { online: true }, 8: { online: false, active: NOW - 3 * 60000 } },
    }, { tab: 'friends' });
    services.store.update((s) => {
      for (const [id, username] of [[5, 'Spike'], [6, 'Rusty'], [7, 'Ash'], [8, 'Moth'], [9, 'Zed']]) addFriend(s, { id, username }, 0);
      s.threads = { 6: { unread: 1 } };
    });
    expect(rowNames(el)).toEqual(['Ash', 'Spike', 'Moth', 'Rusty', 'Zed']);
    expect(list(el).textContent).toContain('Active 12 min ago');
    expect(list(el).querySelectorAll('.zcf-pill')).toHaveLength(1);
    button(el, 'Manage friends →').click();
    expect(services.router.navigate).toHaveBeenCalledWith('/friends');
  });

  it('searches players to start a chat: results replace the list, + Friend adds, a click opens the DM, Esc returns', async () => {
    vi.useFakeTimers();
    const { services, el } = mount({
      threads: [thread(9)],
      searchResults: [{ id: 7, username: 'ZombieKing', avatar: null }, { id: 8, username: 'Zombo', avatar: null }],
    });
    services.store.update((s) => addFriend(s, { id: 8, username: 'Zombo' }, 0));
    const input = typeSearch(el, 'zo');
    expect(list(el).textContent).toBe('Searching…');
    await vi.advanceTimersByTimeAsync(299);
    expect(services.players.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(services.players.search).toHaveBeenCalledWith('zo');
    expect(rowNames(el)).toEqual(['ZombieKing', 'Zombo']);
    const rows = list(el).querySelectorAll('.zcf-row');
    expect(rows[0].textContent).toContain('#7');
    expect(rows[1].textContent).toContain('✓ Friend');
    rows[0].querySelector('.zcf-add').click();
    expect(services.actions.addFriend).toHaveBeenCalledWith({ id: 7, username: 'ZombieKing', avatar: null });
    expect(services.toast).toHaveBeenCalledWith('ZombieKing added to friends');
    expect(services.actions.openDm).not.toHaveBeenCalled();
    expect(list(el).querySelectorAll('.zcf-done')).toHaveLength(2);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(rowNames(el)).toEqual(['U9']);
    typeSearch(el, '7');
    await vi.advanceTimersByTimeAsync(300);
    list(el).querySelector('.zcf-row').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(7, { expand: true, username: 'ZombieKing', avatar: null });
    expect(input.value).toBe('');
  });

  it('drops a stale search reply and says so when a search fails', async () => {
    vi.useFakeTimers();
    let resolveFirst;
    const { services, el } = mount();
    services.players.search.mockImplementation((q) => (q === 'zo' ? new Promise((r) => { resolveFirst = r; }) : Promise.resolve({ ok: false })));
    typeSearch(el, 'zo');
    await vi.advanceTimersByTimeAsync(300);
    typeSearch(el, 'zombieK');
    resolveFirst({ ok: true, data: [{ id: 3, username: 'Zorro', avatar: null }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(list(el).textContent).not.toContain('Zorro');
    await vi.advanceTimersByTimeAsync(300);
    expect(list(el).textContent).toBe('Search failed. Try again.');
  });

  it('shows faction members without you, online first, with level, refreshed each minute only while shown', async () => {
    vi.useFakeTimers();
    const api = fakeApi({
      getFactionMembers: vi.fn(async () => ({
        ok: true,
        data: {
          faction: { id: 4, name: 'Ashfall' },
          members: [
            { id: ME, username: 'Me', online: 1, active: 0, level: 9 },
            { id: 21, username: 'Bram', online: 0, active: 600, level: 12 },
            { id: 22, username: 'Cato', online: 1, active: 0, level: 30 },
            { id: 23, username: 'Abe', online: 1, active: 0, level: 3 },
          ],
        },
      })),
    });
    const { el } = mount({ api }, { tab: 'faction' });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getFactionMembers).toHaveBeenCalledTimes(1);
    expect(rowNames(el)).toEqual(['Abe', 'Cato', 'Bram']);
    expect(list(el).textContent).toContain('Lv 30');
    expect(list(el).textContent).toContain('Active 10 min ago');
    await vi.advanceTimersByTimeAsync(FACTION_MS);
    expect(api.getFactionMembers).toHaveBeenCalledTimes(2);
    tabBtn(el, 'Chats').click();
    await vi.advanceTimersByTimeAsync(FACTION_MS * 2);
    expect(api.getFactionMembers).toHaveBeenCalledTimes(2);
  });

  it("says so when you're not in a faction", async () => {
    const api = fakeApi({ getFactionMembers: vi.fn(async () => ({ ok: true, data: { faction: null, members: [] } })) });
    const { el } = mount({ api }, { tab: 'faction' });
    await flush();
    expect(list(el).textContent).toBe("You're not in a faction.");
  });

  it('offers a retry when the faction list fails to load', async () => {
    const api = fakeApi({
      getFactionMembers: vi.fn()
        .mockResolvedValueOnce({ ok: false, kind: 'network' })
        .mockResolvedValue({ ok: true, data: { faction: { id: 1 }, members: [{ id: 30, username: 'Dex', online: 1 }] } }),
    });
    const { el } = mount({ api }, { tab: 'faction' });
    await flush();
    expect(list(el).textContent).toContain("Couldn't load.");
    el.querySelector('.zcf-pm-retry').click();
    await flush();
    expect(rowNames(el)).toEqual(['Dex']);
  });

  it('lists blocked players A-Z and unblocks after an inline confirm', async () => {
    const api = fakeApi({
      blockList: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: { list: [{ id: 41, username: 'Zeke' }, { id: 40, username: 'Abby' }], total: 2 } })
        .mockResolvedValue({ ok: true, data: { list: [{ id: 41, username: 'Zeke' }], total: 1 } }),
      unblockUser: vi.fn(async () => ({ ok: true, data: { success: true } })),
    });
    const { services, el } = mount({ api }, { tab: 'blocked' });
    await flush();
    expect(api.blockList).toHaveBeenCalledWith(1);
    expect(rowNames(el)).toEqual(['Abby', 'Zeke']);
    button(list(el).querySelector('.zcf-row'), 'Unblock').click();
    expect(list(el).textContent).toContain('Unblock Abby?');
    expect(document.activeElement.textContent).toBe('Cancel');
    button(list(el), 'Unblock').click();
    await flush();
    expect(api.unblockUser).toHaveBeenCalledWith(40);
    expect(services.toast).toHaveBeenCalledWith('Abby unblocked');
    await flush();
    expect(rowNames(el)).toEqual(['Zeke']);
  });

  it('reports a failed unblock, and says so when nobody is blocked', async () => {
    const api = fakeApi({
      blockList: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: { list: [{ id: 41, username: 'Zeke' }], total: 1 } })
        .mockResolvedValue({ ok: true, data: { list: [], total: 0 } }),
      unblockUser: vi.fn(async () => ({ ok: true, data: { success: false } })),
    });
    const { services, el, w } = mount({ api }, { tab: 'blocked' });
    await flush();
    button(list(el), 'Unblock').click();
    button(list(el), 'Unblock').click();
    await flush();
    expect(services.toast).toHaveBeenCalledWith('Failed to unblock Zeke', { error: true });
    expect(rowNames(el)).toEqual(['Zeke']);
    services.store.update((s) => { s.dock.friendsOpen = false; });
    services.store.update((s) => { s.dock.friendsOpen = true; }); // shown again: reloads page 1
    await flush();
    expect(list(el).textContent).toBe('No blocked players.');
    expect(w).toBeTruthy();
  });

  it('loads more blocked players on scroll until it has them all', async () => {
    const api = fakeApi({ blockList: vi.fn(async (page) => ({ ok: true, data: { list: page === 1 ? [{ id: 1, username: 'A' }] : [{ id: 2, username: 'B' }], total: 2 } })) });
    const { el } = mount({ api }, { tab: 'blocked' });
    await flush();
    list(el).dispatchEvent(new Event('scroll'));
    await flush();
    expect(api.blockList).toHaveBeenCalledWith(2);
    expect(rowNames(el)).toEqual(['A', 'B']);
    list(el).dispatchEvent(new Event('scroll'));
    await flush();
    expect(api.blockList).toHaveBeenCalledTimes(2);
  });

  it('has a ⋯ menu for export and import that works from the keyboard', () => {
    const { el } = mount();
    const btn = el.querySelector('.zcf-hbtn[title="More"]');
    btn.click();
    const menu = el.querySelector('.zcf-menu');
    expect(menu.hidden).toBe(false);
    expect(document.activeElement.textContent).toBe('Export friends');
    key('ArrowDown');
    expect(document.activeElement.textContent).toBe('Import friends');
    key('Escape');
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
  });

  it('rejects an oversized import without reading it, and toasts an unreadable one', async () => {
    const { services, el } = mount();
    const importSpy = vi.spyOn(services.actions, 'importFriends');
    const fileInput = el.querySelector('input[type=file]');
    const big = { size: 2 * 1024 * 1024, name: 'huge.json', text: vi.fn().mockResolvedValue('{}') };
    Object.defineProperty(fileInput, 'files', { configurable: true, get: () => [big] });
    fileInput.dispatchEvent(new Event('change'));
    await flush();
    expect(big.text).not.toHaveBeenCalled();
    expect(importSpy).not.toHaveBeenCalled();
    expect(services.toast).toHaveBeenCalledWith('That file is too large to be a friends export.', { error: true });
    const bad = { size: 10, name: 'x.json', text: () => Promise.reject(new Error('NotReadableError')) };
    Object.defineProperty(fileInput, 'files', { configurable: true, get: () => [bad] });
    fileInput.dispatchEvent(new Event('change'));
    await flush();
    expect(services.toast).toHaveBeenCalledWith("Couldn't read that file.", { error: true });
  });

  it('shows names as plain text, keeps rows when nothing visible changed, and gives focus back after a rebuild', async () => {
    const presenceMap = { 5: { online: false, active: NOW } };
    const { services, el, w } = mount({ presence: presenceMap }, { tab: 'friends' });
    services.store.update((s) => addFriend(s, { id: 5, username: '<b>bold</b>' }, 0));
    expect(list(el).querySelector('b')).toBeNull();
    expect(rowNames(el)).toEqual(['<b>bold</b>']);
    const before = list(el).querySelector('.zcf-row');
    services.store.update((s) => { s.dock.dms.push({ id: 99, open: false, lastUsed: 5 }); });
    expect(list(el).querySelector('.zcf-row')).toBe(before);
    before.focus();
    presenceMap[5] = { online: true };
    w.scheduleList();
    await flush();
    const after = list(el).querySelector('.zcf-row');
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(after);
  });
});
