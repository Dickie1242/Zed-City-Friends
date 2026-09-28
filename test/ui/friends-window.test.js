import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFriendsWindow } from '../../src/ui/friends-window.js';
import { addFriend } from '../../src/state.js';
import { makeServices } from './services.js';

function mount(opts) {
  const services = makeServices(opts);
  const win = createFriendsWindow(services);
  document.body.appendChild(win.el);
  services.store.subscribe(() => win.update());
  win.update();
  return { services, win, el: win.el };
}

const names = (el) => [...el.querySelectorAll('.zcf-row .zcf-name')].map((n) => n.textContent);

describe('friends window', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('is a minimized game-style tab with an unread badge for friends only', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.threads = { 5: { unread: 2 }, 9: { unread: 4 } };
    });
    expect(el.classList.contains('chat-container')).toBe(true);
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.querySelector('.chat-icon').className).toContain('fa-user-friends');
    expect(el.querySelector('.unread-badge').textContent).toBe('2');
    expect(el.querySelector('.unread-badge').hidden).toBe(false);
    expect(el.querySelector('.zcf-body').hidden).toBe(true);
  });

  it('opens from the header and lists online, offline and recent sections', () => {
    const { services, el } = mount({
      presence: { 5: { online: true }, 6: { online: false, active: Date.now() - 12 * 60000 } },
      threads: [{ userId: 9, username: 'TradeGuy', preview: 'wanna buy ammo?', lastReply: 1, isSystem: false }],
    });
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      addFriend(s, { id: 6, username: 'Rusty' }, 0);
    });
    el.querySelector('.chat-header').click();
    expect(services.actions.toggleFriends).toHaveBeenCalled();
    expect(el.classList.contains('zcf-open')).toBe(true);
    expect(el.querySelector('.zcf-count').textContent).toBe('1 / 2 online');
    expect([...el.querySelectorAll('.zcf-sec')].map((s) => s.textContent)).toEqual(['Online — 1', 'Offline — 1', 'Recent — not friends — 1']);
    expect(names(el)).toEqual(['Spike', 'Rusty', 'TradeGuy']);
    expect(el.textContent).toContain('Active 12m ago');
    expect(el.textContent).toContain('wanna buy ammo?');
  });

  it('filters the list locally and highlights matches', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      addFriend(s, { id: 6, username: 'Gravedigger' }, 0);
      s.dock.friendsOpen = true;
    });
    const input = el.querySelector('.zcf-toolbar input');
    input.value = 'gra';
    input.dispatchEvent(new Event('input'));
    expect(names(el)).toEqual(['Gravedigger']);
    expect(el.querySelector('.zcf-row mark').textContent).toBe('Gra');
    expect(services.players.search).not.toHaveBeenCalled();
  });

  it('opens a DM when a row is clicked', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.dock.friendsOpen = true;
    });
    el.querySelector('.zcf-row').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(5, { expand: true, username: 'Spike', avatar: null });
  });

  it('removes a friend after an inline confirm', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.dock.friendsOpen = true;
    });
    const remove = [...el.querySelectorAll('.zcf-row-actions button')].find((b) => b.textContent === 'Remove');
    remove.click();
    expect(el.textContent).toContain('Remove Spike from friends?');
    el.querySelector('.zcf-danger').click();
    expect(services.store.get().friends).toEqual({});
  });

  it('searches players from the person-plus pop-out and adds them', async () => {
    vi.useFakeTimers();
    const { services, el } = mount({
      searchResults: [{ id: 7, username: 'ZombieKing', avatar: null }, { id: 8, username: 'Zombo', avatar: null }],
    });
    services.store.update((s) => {
      addFriend(s, { id: 8, username: 'Zombo' }, 0);
      s.dock.friendsOpen = true;
    });
    el.querySelector('.zcf-iconbtn').click();
    const pop = el.querySelector('.zcf-pop');
    expect(pop.hidden).toBe(false);
    const input = pop.querySelector('input');
    input.value = 'zo';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(299);
    expect(services.players.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(services.players.search).toHaveBeenCalledWith('zo');
    const rows = [...pop.querySelectorAll('.zcf-result')];
    expect(rows.map((r) => r.querySelector('.zcf-name').textContent)).toEqual(['ZombieKing', 'Zombo']);
    expect(rows[1].textContent).toContain('✓ Friend');
    rows[0].querySelector('.zcf-add').click();
    expect(services.actions.addFriend).toHaveBeenCalledWith({ id: 7, username: 'ZombieKing', avatar: null });
    expect(services.toast).toHaveBeenCalledWith('ZombieKing added to friends');
    expect(pop.querySelector('.zcf-result').textContent).toContain('✓ Friend');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pop.hidden).toBe(true);
  });

  it('adds a Recent player with + Friend', () => {
    const { services, el } = mount({ threads: [{ userId: 9, username: 'TradeGuy', preview: 'hi', lastReply: 1, isSystem: false }] });
    services.store.update((s) => { s.dock.friendsOpen = true; });
    el.querySelector('.zcf-add-outline').click();
    expect(services.store.get().friends[9].username).toBe('TradeGuy');
  });

  it('shows usernames as plain text', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: '<b>bold</b>' }, 0);
      s.dock.friendsOpen = true;
    });
    expect(el.querySelector('.zcf-row b')).toBeNull();
    expect(names(el)).toEqual(['<b>bold</b>']);
  });
});
