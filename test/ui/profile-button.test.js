import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProfileButton } from '../../src/ui/profile-button.js';
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
