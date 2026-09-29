import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForPlayer, boot } from '../src/main.js';
import { resetWarnings } from '../src/util.js';
import { fakeApi, flush } from './helpers.js';

describe('main', () => {
  afterEach(() => {
    delete window.__zcfStarted;
    document.getElementById('zcf-styles')?.remove();
    document.getElementById('zcf-early-styles')?.remove();
  });

  it('waits until getStats returns a logged-in player', async () => {
    const api = fakeApi({
      getStats: vi.fn()
        .mockResolvedValueOnce({ ok: false, kind: 'auth' })
        .mockResolvedValueOnce({ ok: true, data: { id: 42, username: 'TePuu' } }),
    });
    expect(await waitForPlayer(api, { retryMs: 0 })).toEqual({ id: 42, username: 'TePuu' });
    expect(api.getStats).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxTries', async () => {
    const api = fakeApi({ getStats: vi.fn().mockResolvedValue({ ok: false, kind: 'auth' }) });
    expect(await waitForPlayer(api, { retryMs: 0, maxTries: 2 })).toBeNull();
  });

  it('boots from a flat getStats shape', async () => {
    const api = fakeApi({ getStats: vi.fn().mockResolvedValue({ ok: true, data: { id: 42, username: 'X' } }) });
    expect(await waitForPlayer(api, { retryMs: 0 })).toEqual({ id: 42, username: 'X' });
  });

  it('boots from a getStats shape with the player nested under `user`', async () => {
    const api = fakeApi({ getStats: vi.fn().mockResolvedValue({ ok: true, data: { user: { id: 42, username: 'X' } } }) });
    expect(await waitForPlayer(api, { retryMs: 0 })).toEqual({ id: 42, username: 'X' });
  });

  it('warns once when getStats is ok but neither shape has a player id', async () => {
    resetWarnings();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = fakeApi({ getStats: vi.fn().mockResolvedValue({ ok: true, data: { user: {} } }) });
    expect(await waitForPlayer(api, { retryMs: 0, maxTries: 2 })).toBeNull();
    expect(spy.mock.calls.some((c) => c[1] === 'stats-shape')).toBe(true);
  });

  it('starts only once per page and injects styles', async () => {
    document.body.innerHTML = '';
    const api = fakeApi();
    const app = await boot({ api });
    expect(app).not.toBeNull();
    expect(document.getElementById('zcf-styles')).not.toBeNull();
    expect(await boot({ api })).toBeNull();
    app.destroy();
  });
  it('hides the game 404 on /friends before login, and shows it again while not logged in', async () => {
    window.history.replaceState({}, '', '/friends');
    const api = fakeApi({ getStats: vi.fn().mockResolvedValueOnce({ ok: false, kind: 'auth' }).mockReturnValue(new Promise(() => {})) });
    boot({ api }); // never finishes: the second login check never answers
    expect(document.documentElement.classList.contains('zcf-on-friends')).toBe(true);
    await flush();
    expect(document.documentElement.classList.contains('zcf-on-friends')).toBe(false);
    window.history.replaceState({}, '', '/');
  });
});
