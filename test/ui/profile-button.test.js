import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProfileButton, ENEMY_BUTTON } from '../../src/ui/profile-button.js';
import { PROFILE_OTHER_HTML, PROFILE_BLOCKED_HTML, PROFILE_OWN_HTML } from '../fixtures/game-dom.js';
import { makeServices } from './services.js';
import { flush } from '../helpers.js';

let mounted = [];

function setup(html, profile = { username: 'TePuu', avatar: 'a.png' }) {
  document.body.innerHTML = html;
  const services = makeServices();
  services.players.get = vi.fn().mockResolvedValue({ ok: true, data: profile });
  const pb = createProfileButton({ ...services });
  services.store.subscribe(() => pb.refresh());
  mounted.push(pb);
  return { services, pb };
}

const labels = () => [...document.querySelectorAll('.profile-actions .q-btn .block')].map((n) => n.textContent);

describe('profile button', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    for (const pb of mounted) pb.destroy();
    mounted = [];
    vi.unstubAllGlobals();
  });

  it('adds "Add Friend" between Trade and Mail, styled like them', () => {
    const { pb } = setup(PROFILE_OTHER_HTML);
    pb.onRoute('/profile/42');
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Mail']);
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    expect(btn.classList.contains('q-btn--outline')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(true);
    expect(btn.querySelector('i').classList.contains('fa-user-plus')).toBe(true);
    expect(btn.querySelector('i').classList.contains('fa-envelope')).toBe(false);
  });

  it('adds the friend on click and switches to "Friends"', async () => {
    const { pb, services } = setup(PROFILE_OTHER_HTML);
    pb.onRoute('/profile/42');
    document.querySelector('.zcf-profile-btn .q-btn').click();
    await flush();
    expect(services.players.get).toHaveBeenCalledWith(42);
    expect(services.store.get().friends[42]).toMatchObject({ username: 'TePuu', avatar: 'a.png' });
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    expect(labels()[2]).toBe('Friends');
    expect(btn.classList.contains('zcf-is-friend')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(false);
    expect(btn.querySelector('i').classList.contains('fa-user-check')).toBe(true);
  });

  it('removes only after a second confirming click', async () => {
    const { pb, services } = setup(PROFILE_OTHER_HTML);
    services.store.update((s) => { s.friends[42] = { id: 42, username: 'TePuu' }; });
    pb.onRoute('/profile/42');
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    btn.click();
    await flush();
    expect(labels()[2]).toBe('Remove?');
    expect(services.store.get().friends[42]).toBeTruthy();
    btn.click();
    await flush();
    expect(services.store.get().friends[42]).toBeUndefined();
    expect(labels()[2]).toBe('Add Friend');
  });

  it('falls back to after Block, recolored grey, when Trade and Mail are hidden', () => {
    const { pb } = setup(PROFILE_BLOCKED_HTML);
    pb.onRoute('/profile/42');
    expect(labels()).toEqual(['Unblock', 'Add Friend']);
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    expect(btn.classList.contains('text-red-4')).toBe(false);
    expect(btn.classList.contains('text-grey-4')).toBe(true);
  });

  it('adds nothing on your own profile or other pages', () => {
    const own = setup(PROFILE_OWN_HTML);
    own.pb.onRoute('/profile/1');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
    const other = setup(PROFILE_OTHER_HTML);
    other.pb.onRoute('/inventory');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
  });

  it('comes back after the game re-renders the button row', async () => {
    const { pb } = setup('<div id="page"></div>');
    pb.onRoute('/profile/42');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
    document.getElementById('page').innerHTML = PROFILE_OTHER_HTML;
    await flush();
    await flush();
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Mail']);
    document.getElementById('page').innerHTML = PROFILE_OTHER_HTML;
    await flush();
    await flush();
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Mail']);
    pb.onRoute('/inventory');
  });
});

function setupBoth(html, profile = { username: 'TePuu', avatar: 'a.png' }) {
  document.body.innerHTML = html;
  const services = makeServices();
  services.players.get = vi.fn().mockResolvedValue({ ok: true, data: profile });
  const friend = createProfileButton({ ...services });
  const enemy = createProfileButton({
    spec: ENEMY_BUTTON,
    isOn: (id) => services.isEnemy(id),
    add: services.actions.addEnemy,
    remove: services.actions.removeEnemy,
    players: services.players,
    toast: services.toast,
    after: () => friend.wrap,
  });
  services.store.subscribe(() => friend.refresh());
  services.enemies.subscribe(() => enemy.refresh());
  mounted.push(friend, enemy);
  return { services, friend, enemy };
}
const route = (b, path) => {
  b.friend.onRoute(path);
  b.enemy.onRoute(path);
};

describe('enemy profile button', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    for (const pb of mounted) pb.destroy();
    mounted = [];
    vi.unstubAllGlobals();
  });

  it('adds "Add Enemy" right after Add Friend, in the same outline style', () => {
    const b = setupBoth(PROFILE_OTHER_HTML);
    route(b, '/profile/42');
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Add Enemy', 'Mail']);
    const btn = document.querySelector('.zcf-profile-btn-enemy .q-btn');
    expect(btn.classList.contains('q-btn--outline')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(true);
    expect(btn.querySelector('i').classList.contains('fa-skull')).toBe(true);
  });

  it('turns red as "Enemy" once added, and removes only after a confirming click', async () => {
    const b = setupBoth(PROFILE_OTHER_HTML);
    route(b, '/profile/42');
    const btn = document.querySelector('.zcf-profile-btn-enemy .q-btn');
    btn.click();
    await flush();
    expect(b.services.enemies.get().enemies[42]).toMatchObject({ username: 'TePuu', avatar: 'a.png' });
    expect(b.services.toast).toHaveBeenCalledWith('TePuu added to enemies');
    expect(labels()[3]).toBe('Enemy');
    expect(btn.classList.contains('zcf-is-enemy')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(false);
    btn.click();
    await flush();
    expect(labels()[3]).toBe('Remove?');
    btn.click();
    await flush();
    expect(b.services.enemies.get().enemies[42]).toBeUndefined();
    expect(labels()[3]).toBe('Add Enemy');
  });

  it('follows Add Friend after Block on a blocked profile, and adds nothing on your own', () => {
    const b = setupBoth(PROFILE_BLOCKED_HTML);
    route(b, '/profile/42');
    expect(labels()).toEqual(['Unblock', 'Add Friend', 'Add Enemy']);
    const own = setupBoth(PROFILE_OWN_HTML);
    route(own, '/profile/1');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
  });

  it('stops watching the page once it is your own profile', async () => {
    const b = setupBoth('<div id="page"></div>');
    route(b, '/profile/1');
    document.getElementById('page').innerHTML = PROFILE_OWN_HTML;
    await flush();
    await flush();
    const spy = vi.spyOn(document, 'querySelectorAll');
    for (let i = 0; i < 3; i += 1) {
      document.body.appendChild(document.createElement('p'));
      await flush();
    }
    expect(spy.mock.calls.filter((c) => String(c[0]).includes('q-btn--outline'))).toHaveLength(0);
  });
});
