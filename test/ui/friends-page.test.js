import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFriendsPage, hideGame404Early, PAGE_CLASS } from '../../src/ui/friends-page.js';
import { createKeeper } from '../../src/ui/keeper.js';
import { addFriend, setFriendNote } from '../../src/state.js';
import { makeServices } from './services.js';
import { PAGE_404_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

const NOW = Date.now();
const FRIENDS = [
  { id: 1, username: 'Disamble', note: 'raid buddy' },
  { id: 2, username: 'Nyx' },
  { id: 3, username: 'Rustbucket', note: 'owes me nails' },
];
const presenceFixture = () => ({
  1: { online: true, active: NOW, profile: { level: 27, faction: { id: 9, name: 'Ashfall' }, injured: false, traveling: false } },
  2: { online: true, active: NOW, profile: { level: 51, faction: null, injured: false, traveling: true } },
  3: { online: false, active: NOW - 18 * 60000, profile: { level: 44, faction: { id: 8, name: 'Iron Veil' }, injured: true, traveling: false } },
});

let current = null;
function mount({ friends = [], presence = {}, threads = {} } = {}) {
  document.body.innerHTML = PAGE_404_HTML;
  const services = makeServices({ presence });
  services.store.update((s) => {
    for (const f of friends) {
      addFriend(s, f, 0);
      if (f.note) setFriendNote(s, f.id, f.note);
    }
    s.threads = threads;
  });
  const keeper = createKeeper();
  const page = createFriendsPage(services, { keeper });
  page.start();
  services.store.subscribe(() => page.scheduleRender());
  page.onRoute('/friends');
  current = { services, page, keeper };
  return current;
}

const row = (id) => document.querySelector(`.zcf-page-row[data-id="${id}"]`);
const names = () => [...document.querySelectorAll('.zcf-page-row .zcf-chip-name')].map((n) => n.textContent);
const byText = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.startsWith(text));

describe('friends page', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  });
  afterEach(() => {
    if (current) {
      current.page.destroy();
      current.keeper.destroy();
    }
    current = null;
    document.documentElement.classList.remove(PAGE_CLASS);
    document.getElementById('zcf-early-styles')?.remove();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it('draws the page in the 404 slot on /friends, and removes it on leave', () => {
    const { page } = mount();
    const slot = document.querySelector('.q-page-container');
    expect(slot.querySelector('main.zcf-page')).not.toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(true);
    page.onRoute('/city');
    expect(slot.querySelector('main.zcf-page')).toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(false);
  });

  it('puts itself back when the game rebuilds the page slot', async () => {
    mount();
    document.body.innerHTML = PAGE_404_HTML;
    await flush();
    await flush();
    expect(document.querySelector('.q-page-container main.zcf-page')).not.toBeNull();
  });

  it('lists friends with level, status, icons, faction, note and unread count', () => {
    mount({ friends: FRIENDS, presence: presenceFixture(), threads: { 3: { unread: 2 } } });
    expect(names()).toEqual(['Disamble', 'Nyx', 'Rustbucket']);
    expect(document.querySelector('.zcf-page-sub').textContent).toBe('2 of 3 online');
    const r3 = row(3);
    expect(r3.querySelector('.zcf-col-level').textContent).toBe('44');
    expect(r3.querySelector('.zcf-st-off').textContent).toBe('Active 18 min ago');
    expect(r3.querySelector('.fa-skull-crossbones').getAttribute('title')).toBe('Injured');
    expect(r3.querySelector('.zcf-fac').getAttribute('href')).toBe('/faction/8');
    expect(r3.querySelector('.zcf-note').textContent).toBe('owes me nails');
    expect(r3.querySelector('.zcf-act-msg .zcf-pill').textContent).toBe('2');
    expect(row(2).querySelector('.fa-directions').getAttribute('title')).toBe('Travelling');
    expect(row(2).querySelector('.zcf-col-faction').textContent).toBe('—');
  });

  it('shows placeholders until a friend\'s profile loads', () => {
    mount({ friends: [{ id: 4, username: 'Moth' }] });
    expect(row(4).querySelector('.zcf-st-unknown').textContent).toBe('…');
    expect(row(4).querySelector('.zcf-col-level').textContent).toBe('—');
    expect(row(4).querySelector('.zcf-note').textContent).toBe('Add a note');
  });

  it('filters by tab and search, and sorts by clicking headers', () => {
    mount({ friends: FRIENDS, presence: presenceFixture() });
    expect(byText('.zcf-page-tab', 'Offline').textContent).toBe('Offline1');
    byText('.zcf-page-tab', 'Offline').click();
    expect(names()).toEqual(['Rustbucket']);
    byText('.zcf-page-tab', 'All').click();
    const input = document.querySelector('.zcf-page-input');
    input.value = 'NAILS';
    input.dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Rustbucket']);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    byText('.zcf-page-sort', 'Level').click();
    expect(names()).toEqual(['Nyx', 'Rustbucket', 'Disamble']);
    byText('.zcf-page-sort', 'Level').click();
    expect(names()).toEqual(['Disamble', 'Rustbucket', 'Nyx']);
    expect(byText('.zcf-page-sort', 'Level').closest('th').getAttribute('aria-sort')).toBe('ascending');
  });

  it('explains an empty list, a search with no match and an empty tab', () => {
    mount();
    expect(document.querySelector('.zcf-page-empty').textContent).toBe("No friends yet. Use Add friend above, or Add Friend on a player's profile.");
    expect(document.querySelector('.zcf-page-table').hidden).toBe(true);
    current.page.destroy();
    current.keeper.destroy();
    mount({ friends: [{ id: 3, username: 'Rustbucket' }], presence: { 3: presenceFixture()[3] } });
    byText('.zcf-page-tab', 'Online').click();
    expect(document.querySelector('.zcf-page-empty').textContent).toBe('No friends online right now.');
    byText('.zcf-page-tab', 'All').click();
    const input = document.querySelector('.zcf-page-input');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    expect(document.querySelector('.zcf-page-empty').textContent).toBe('No friends match "zzz".');
  });

  it('Message opens the DM window in the dock', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(1).querySelector('.zcf-act-msg').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(1, { expand: true, username: 'Disamble', avatar: null });
  });

  it('links names to profiles and factions to faction pages, in-app', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    row(1).querySelector('.zcf-chip').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(services.router.navigate).toHaveBeenCalledWith('/profile/1');
    row(1).querySelector('.zcf-fac').click();
    expect(services.router.navigate).toHaveBeenCalledWith('/faction/9');
  });

  it('edits a note inline: Enter saves, Esc cancels, clicking away saves', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(2).querySelector('.zcf-note').click();
    let input = row(2).querySelector('.zcf-note-input');
    expect(document.activeElement).toBe(input);
    input.value = '  sells ammo  ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(services.store.get().friends[2].note).toBe('sells ammo');
    expect(row(2).querySelector('.zcf-note').textContent).toBe('sells ammo');
    expect(document.activeElement).toBe(row(2).querySelector('[title="Edit note"]'));

    row(2).querySelector('[title="Edit note"]').click();
    input = row(2).querySelector('.zcf-note-input');
    input.value = 'changed my mind';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(services.store.get().friends[2].note).toBe('sells ammo');
    expect(row(2).querySelector('.zcf-note-input')).toBeNull();

    row(2).querySelector('.zcf-note').click();
    input = row(2).querySelector('.zcf-note-input');
    input.value = '';
    input.blur();
    expect('note' in services.store.get().friends[2]).toBe(false);
  });

  it('opening a second note editor saves the first', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(1).querySelector('.zcf-note').click();
    row(1).querySelector('.zcf-note-input').value = 'first';
    row(3).querySelector('.zcf-note').click();
    expect(services.store.get().friends[1].note).toBe('first');
    expect(document.querySelectorAll('.zcf-note-input')).toHaveLength(1);
    expect(row(3).querySelector('.zcf-note-input')).not.toBeNull();
  });

  it('keeps an open note editor, its draft and focus through a redraw that moves its row', () => {
    const presence = presenceFixture();
    const { page } = mount({ friends: FRIENDS, presence });
    row(3).querySelector('.zcf-note').click();
    const input = row(3).querySelector('.zcf-note-input');
    input.value = 'half-typed';
    presence[2] = { ...presence[2], online: false, active: NOW - 3 * 86400000 };
    page.render();
    expect(names()).toEqual(['Disamble', 'Rustbucket', 'Nyx']);
    expect(row(3).querySelector('.zcf-note-input')).toBe(input);
    expect(input.value).toBe('half-typed');
    expect(document.activeElement).toBe(input);
  });

  it('asks before removing, and moves focus sensibly', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(2).querySelector('[title="Remove"]').click();
    expect(row(2).classList.contains('zcf-page-confirm')).toBe(true);
    expect(row(2).textContent).toContain('Remove Nyx from your friends?');
    expect(document.activeElement.textContent).toBe('Cancel');
    document.activeElement.click();
    expect(row(2).classList.contains('zcf-page-confirm')).toBe(false);
    expect(document.activeElement).toBe(row(2).querySelector('[title="Remove"]'));
    row(2).querySelector('[title="Remove"]').click();
    [...row(2).querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
    expect(services.store.get().friends[2]).toBeUndefined();
    expect(row(2)).toBeNull();
    expect(document.activeElement).toBe(row(3).querySelector('.zcf-chip'));
  });

  it('has a ⋯ menu with Profile, Edit note and Remove that closes on an outside click', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(1).querySelector('.zcf-act-more').click();
    expect([...row(1).querySelectorAll('.zcf-page-menu button')].map((b) => b.textContent)).toEqual(['Profile', 'Edit note', 'Remove']);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(row(1).querySelector('.zcf-page-menu')).toBeNull();
    row(1).querySelector('.zcf-act-more').click();
    row(1).querySelector('.zcf-page-menu button').click();
    expect(services.router.navigate).toHaveBeenCalledWith('/profile/1');
  });

  it('opens the add-friend search under its button', () => {
    mount();
    const btn = document.querySelector('.zcf-page-add');
    btn.click();
    expect(document.querySelector('.zcf-page .zcf-pop').hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders names and notes as text, never HTML', () => {
    mount({ friends: [{ id: 7, username: '<b>x</b>', note: '<img src=x onerror=alert(1)>' }] });
    expect(row(7).querySelector('.zcf-chip-name').innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(row(7).querySelector('img[src="x"]')).toBeNull();
    expect(row(7).querySelector('.zcf-note').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('hides the game 404 before login on a direct load of /friends', () => {
    window.history.replaceState({}, '', '/friends');
    expect(hideGame404Early(document, window)).toBe(true);
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(true);
    expect(document.getElementById('zcf-early-styles').textContent).toContain('.q-page-container > .fixed-center');
    window.history.replaceState({}, '', '/');
    expect(hideGame404Early(document, window)).toBe(false);
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(false);
  });
});
