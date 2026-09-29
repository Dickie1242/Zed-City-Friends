import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayerSearch, MAX_RESULTS } from '../../src/ui/player-search.js';

describe('player search', () => {
  afterEach(() => vi.useRealTimers());

  it('searches 300ms after typing stops, for 2+ characters or an all-digit id', async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, username: `P${i}` }));
    const players = { search: vi.fn().mockResolvedValue({ ok: true, data: many }) };
    const onState = vi.fn();
    const s = createPlayerSearch({ players, onState });
    s.set('z');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'short' });
    s.set('');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'idle' });
    s.set('7');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'searching' });
    await vi.advanceTimersByTimeAsync(299);
    expect(players.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(players.search).toHaveBeenCalledWith('7');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'results', results: many.slice(0, MAX_RESULTS) });
  });

  it('drops a reply that arrives after the query moved on, and reports failures', async () => {
    vi.useFakeTimers();
    let resolveFirst;
    const players = {
      search: vi.fn((q) => (q === 'zo' ? new Promise((r) => { resolveFirst = r; }) : Promise.reject(new Error('boom')))),
    };
    const onState = vi.fn();
    const s = createPlayerSearch({ players, onState });
    s.set('zo');
    await vi.advanceTimersByTimeAsync(300);
    s.set('zombieK');
    resolveFirst({ ok: true, data: [{ id: 3, username: 'Zorro' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(onState).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'results' }));
    await vi.advanceTimersByTimeAsync(300);
    expect(onState).toHaveBeenLastCalledWith({ kind: 'error', text: 'Search failed. Try again.' });
    s.cancel();
  });
});
