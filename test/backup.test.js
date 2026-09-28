import { describe, it, expect } from 'vitest';
import { exportFriends, parseImport } from '../src/backup.js';
import { emptyState, addFriend } from '../src/state.js';

describe('backup', () => {
  it('round-trips an export', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike', avatar: 'a.png' }, 0);
    const text = exportFriends(s, 77);
    expect(JSON.parse(text)).toEqual({ v: 1, playerId: 77, friends: [{ id: 5, username: 'Spike' }] });
    expect(parseImport(text, 77)).toEqual({ ok: true, friends: [{ id: 5, username: 'Spike' }] });
  });

  it('rejects bad files and other players', () => {
    expect(parseImport('nope', 1)).toMatchObject({ ok: false, error: 'That file is not valid JSON.' });
    expect(parseImport('{"v":1}', 1)).toMatchObject({ ok: false, error: 'That file is not a Zed City Friends export.' });
    expect(parseImport('{"v":1,"playerId":2,"friends":[]}', 1)).toMatchObject({ ok: false, error: 'That export belongs to a different player.' });
  });

  it('keeps only valid, unique entries and trims long names', () => {
    const text = JSON.stringify({
      v: 1,
      playerId: 1,
      friends: [{ id: 3, username: 'x'.repeat(40) }, { id: 3, username: 'dup' }, { id: -1 }, { id: 'abc' }, { id: 4, extra: 'drop me' }],
    });
    expect(parseImport(text, 1)).toEqual({ ok: true, friends: [{ id: 3, username: 'x'.repeat(32) }, { id: 4, username: '#4' }] });
  });
});
