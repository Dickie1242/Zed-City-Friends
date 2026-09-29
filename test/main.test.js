import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForPlayer, boot } from '../src/main.js';
import { fakeApi } from './helpers.js';

describe('main', () => {
  afterEach(() => {
    delete window.__zcfStarted;
    document.getElementById('zcf-styles')?.remove();
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

  it('starts only once per page and injects styles', async () => {
    document.body.innerHTML = '';
    const api = fakeApi();
    const app = await boot({ api });
    expect(app).not.toBeNull();
    expect(document.getElementById('zcf-styles')).not.toBeNull();
    expect(await boot({ api })).toBeNull();
    app.destroy();
  });
});
