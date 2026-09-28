import { describe, it, expect, vi } from 'vitest';
import { createPlayers } from '../src/players.js';
import { fakeApi } from './helpers.js';

describe('players', () => {
  it('normalizes search results', async () => {
    const api = fakeApi({ findPlayer: vi.fn().mockResolvedValue({ ok: true, data: [{ id: '5', username: 'Spike', avatar: 'a.png' }, { id: 0, username: 'bad' }] }) });
    const players = createPlayers({ api });
    expect(await players.search('spi')).toEqual({ ok: true, data: [{ id: 5, username: 'Spike', avatar: 'a.png' }] });
  });

  it('resolves only exact case-insensitive name matches', async () => {
    const api = fakeApi({ findPlayer: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 1, username: 'Spikey' }, { id: 2, username: 'SPIKE' }] }) });
    const players = createPlayers({ api });
    expect(await players.resolveExact('spike')).toMatchObject({ id: 2 });
    expect(await players.resolveExact('spik')).toBeNull();
  });

  it('caches profiles briefly', async () => {
    let t = 0;
    const api = fakeApi();
    const players = createPlayers({ api, now: () => t, ttlMs: 60000 });
    await players.get(5);
    await players.get(5);
    expect(api.getProfile).toHaveBeenCalledTimes(1);
    t = 60000;
    await players.get(5);
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });
});
