import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFriendsWindow } from '../../src/ui/friends-window.js';
import { addFriend, openDm } from '../../src/state.js';
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

  describe('no-op redraws', () => {
    it('keeps the same row nodes when a store update changes nothing visible', () => {
      const { services, el } = mount();
      services.store.update((s) => {
        addFriend(s, { id: 5, username: 'Spike' }, 0);
        s.dock.friendsOpen = true;
      });
      const before = el.querySelector('.zcf-row');
      services.store.update((s) => {
        s.dock.dms.push({ id: 99, open: false, lastUsed: 5 }); // unrelated to anything the Friends list shows
      });
      expect(el.querySelector('.zcf-row')).toBe(before);
    });

    it('keeps the same row nodes when a presence update reports the same status', async () => {
      const presenceMap = { 5: { online: true } };
      const { services, win, el } = mount({ presence: presenceMap });
      services.store.update((s) => {
        addFriend(s, { id: 5, username: 'Spike' }, 0);
        s.dock.friendsOpen = true;
      });
      const before = el.querySelector('.zcf-row');
      presenceMap[5] = { online: true }; // a redundant presence refresh, same status
      win.scheduleList();
      await new Promise((r) => setTimeout(r, 50));
      expect(el.querySelector('.zcf-row')).toBe(before);
    });

    it('rebuilds the row when presence flips from offline to online', async () => {
      const presenceMap = { 5: { online: false, active: Date.now() } };
      const { services, win, el } = mount({ presence: presenceMap });
      services.store.update((s) => {
        addFriend(s, { id: 5, username: 'Spike' }, 0);
        s.dock.friendsOpen = true;
      });
      const before = el.querySelector('.zcf-row');
      presenceMap[5] = { online: true };
      win.scheduleList();
      await new Promise((r) => setTimeout(r, 50));
      const after = el.querySelector('.zcf-row');
      expect(after).not.toBe(before);
      expect(el.querySelector('.zcf-status').textContent).toBe('Online');
    });

    it('restores focus to the same row after a real rebuild', async () => {
      const presenceMap = { 5: { online: false, active: Date.now() } };
      const { services, win, el } = mount({ presence: presenceMap });
      services.store.update((s) => {
        addFriend(s, { id: 5, username: 'Spike' }, 0);
        s.dock.friendsOpen = true;
      });
      const before = el.querySelector('.zcf-row');
      before.focus();
      presenceMap[5] = { online: true };
      win.scheduleList();
      await new Promise((r) => setTimeout(r, 50));
      const after = el.querySelector('.zcf-row');
      expect(after).not.toBe(before);
      expect(document.activeElement).toBe(after);
    });
  });

  describe('add-friend search race', () => {
    it("drops a stale search result that resolves after the user typed a newer query", async () => {
      vi.useFakeTimers();
      let resolveFirst;
      const pending = new Promise((resolve) => { resolveFirst = resolve; });
      const { services, el } = mount();
      services.players.search.mockImplementation((q) => (q === 'zo' ? pending : Promise.resolve({ ok: true, data: [] })));
      services.store.update((s) => { s.dock.friendsOpen = true; });
      el.querySelector('.zcf-iconbtn').click();
      const pop = el.querySelector('.zcf-pop');
      const input = pop.querySelector('input');
      input.value = 'zo';
      input.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(300); // the "zo" search fires
      input.value = 'zombieK';
      input.dispatchEvent(new Event('input')); // a newer query is queued but hasn't fired yet
      resolveFirst({ ok: true, data: [{ id: 3, username: 'Zorro', avatar: null }] });
      await vi.advanceTimersByTimeAsync(0);
      expect(pop.querySelector('.zcf-results').textContent).not.toContain('Zorro');
    });

    it('shows a failure message instead of leaving "Searching…" forever when the search rejects', async () => {
      vi.useFakeTimers();
      const { services, el } = mount();
      services.players.search.mockRejectedValueOnce(new Error('boom'));
      services.store.update((s) => { s.dock.friendsOpen = true; });
      el.querySelector('.zcf-iconbtn').click();
      const pop = el.querySelector('.zcf-pop');
      const input = pop.querySelector('input');
      input.value = 'zo';
      input.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(300);
      await vi.advanceTimersByTimeAsync(0);
      expect(pop.querySelector('.zcf-results').textContent).toBe('Search failed. Try again.');
    });
  });

  describe('import', () => {
    it('rejects an oversized file without reading it', async () => {
      const { services, el } = mount();
      services.store.update((s) => { s.dock.friendsOpen = true; });
      const importSpy = vi.spyOn(services.actions, 'importFriends');
      const fileInput = el.querySelector('input[type=file]');
      const big = { size: 2 * 1024 * 1024, name: 'huge.json', text: vi.fn().mockResolvedValue('{}') };
      Object.defineProperty(fileInput, 'files', { configurable: true, get: () => [big] });
      fileInput.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 0));
      expect(big.text).not.toHaveBeenCalled();
      expect(importSpy).not.toHaveBeenCalled();
      expect(services.toast).toHaveBeenCalledWith('That file is too large to be a friends export.', { error: true });
    });

    it('toasts when the picked file cannot be read', async () => {
      const { services, el } = mount();
      services.store.update((s) => { s.dock.friendsOpen = true; });
      const fileInput = el.querySelector('input[type=file]');
      const bad = { size: 10, name: 'x.json', text: () => Promise.reject(new Error('NotReadableError')) };
      Object.defineProperty(fileInput, 'files', { configurable: true, get: () => [bad] });
      fileInput.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 0));
      expect(services.toast).toHaveBeenCalledWith("Couldn't read that file.", { error: true });
    });
  });

  describe('keyboard', () => {
    it('opens a DM when Enter is pressed on a focused row', () => {
      const { services, el } = mount();
      services.store.update((s) => {
        addFriend(s, { id: 5, username: 'Spike' }, 0);
        s.dock.friendsOpen = true;
      });
      const row = el.querySelector('.zcf-row');
      row.focus();
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(services.actions.openDm).toHaveBeenCalledWith(5, { expand: true, username: 'Spike', avatar: null });
    });

    it('focuses the Cancel button after clicking Remove', () => {
      const { services, el } = mount();
      services.store.update((s) => {
        addFriend(s, { id: 5, username: 'Spike' }, 0);
        s.dock.friendsOpen = true;
      });
      const remove = [...el.querySelectorAll('.zcf-row-actions button')].find((b) => b.textContent === 'Remove');
      remove.click();
      const cancel = [...el.querySelectorAll('.zcf-row button')].find((b) => b.textContent === 'Cancel');
      expect(document.activeElement).toBe(cancel);
    });

    it('closes the pop-out on Escape dispatched from a child other than the input', async () => {
      vi.useFakeTimers();
      const { services, el } = mount({ searchResults: [{ id: 7, username: 'ZombieKing', avatar: null }] });
      services.store.update((s) => { s.dock.friendsOpen = true; });
      el.querySelector('.zcf-iconbtn').click();
      const pop = el.querySelector('.zcf-pop');
      const input = pop.querySelector('input');
      input.value = 'zo';
      input.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(300);
      const add = pop.querySelector('.zcf-add');
      add.focus();
      add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(pop.hidden).toBe(true);
    });
  });

  describe('minor fixes', () => {
    it('clears zcf-active on the add button when the pop-out closes itself via Escape', () => {
      const { services, el } = mount();
      services.store.update((s) => { s.dock.friendsOpen = true; });
      const addBtn = el.querySelector('.zcf-iconbtn');
      addBtn.click();
      expect(addBtn.classList.contains('zcf-active')).toBe(true);
      const pop = el.querySelector('.zcf-pop');
      pop.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(addBtn.classList.contains('zcf-active')).toBe(false);
    });

    it('does not overwrite a real DM name with a Recent row\'s #id placeholder', () => {
      const { services, el } = mount({ threads: [{ userId: 9, username: '#9', preview: 'hi', lastReply: 1, isSystem: false, avatar: null }] });
      services.store.update((s) => {
        openDm(s, 9, { username: 'TradeGuy', now: 1 });
        s.dock.friendsOpen = true;
      });
      el.querySelector('.zcf-row').click();
      expect(services.store.get().dock.dms.find((d) => d.id === 9).username).toBe('TradeGuy');
    });
  });
});
