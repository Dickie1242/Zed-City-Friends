import { describe, it, expect } from 'vitest';
import { exportFriends, parseImport, mergeImport, mergeEnemiesImport, importMessage } from '../src/backup.js';
import { emptyState, addFriend, setFriendNote, MAX_NOTE } from '../src/state.js';
import { emptyEnemies, addEnemy, setEnemyNote } from '../src/enemies.js';

describe('backup', () => {
  it('round-trips an export', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike', avatar: 'a.png' }, 0);
    const text = exportFriends(s, 77);
    expect(JSON.parse(text)).toEqual({ v: 1, playerId: 77, friends: [{ id: 5, username: 'Spike' }] });
    expect(parseImport(text, 77)).toEqual({ ok: true, friends: [{ id: 5, username: 'Spike' }], enemies: [] });
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
    expect(parseImport(text, 1)).toEqual({ ok: true, friends: [{ id: 3, username: 'x'.repeat(32) }, { id: 4, username: '#4' }], enemies: [] });
  });
  it('exports notes and imports them onto new friends, or onto existing friends without one', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    setFriendNote(s, 5, 'owes me nails');
    expect(JSON.parse(exportFriends(s, 77)).friends).toEqual([{ id: 5, username: 'Spike', note: 'owes me nails' }]);

    const target = emptyState();
    addFriend(target, { id: 6, username: 'Nyx' }, 0);
    addFriend(target, { id: 7, username: 'Moth' }, 0);
    setFriendNote(target, 7, 'keep mine');
    const file = JSON.stringify({
      v: 1,
      playerId: 77,
      friends: [
        { id: 5, username: 'Spike', note: 'owes me nails' },
        { id: 6, username: 'Nyx', note: '  sells ammo  ' },
        { id: 7, username: 'Moth', note: 'theirs' },
      ],
    });
    const r = parseImport(file, 77);
    expect(mergeImport(target, r.friends, 1)).toEqual({ added: 1, notes: 2 });
    expect(target.friends[5].note).toBe('owes me nails');
    expect(target.friends[6].note).toBe('sells ammo');
    expect(target.friends[7].note).toBe('keep mine');
  });

  it('drops non-string notes and caps long ones', () => {
    const text = JSON.stringify({ v: 1, playerId: 1, friends: [{ id: 3, username: 'A', note: 42 }, { id: 4, username: 'B', note: 'y'.repeat(300) }] });
    const r = parseImport(text, 1);
    expect(r.friends[0]).toEqual({ id: 3, username: 'A' });
    expect(r.friends[1].note).toHaveLength(MAX_NOTE);
  });

  it('describes an import', () => {
    expect(importMessage({ added: 1, notes: 0 })).toBe('Imported 1 new friend.');
    expect(importMessage({ added: 0, notes: 2 })).toBe('Imported 0 new friends and 2 notes.');
    expect(importMessage({ added: 3, notes: 1 })).toBe('Imported 3 new friends and 1 note.');
  });
  it('exports enemies beside friends, and only when there are some', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    expect(JSON.parse(exportFriends(s, 77, emptyEnemies())).enemies).toBeUndefined();
    const e = emptyEnemies();
    addEnemy(e, { id: 9, username: 'Grim' }, 0);
    setEnemyNote(e, 9, 'stole my nails');
    expect(JSON.parse(exportFriends(s, 77, e)).enemies).toEqual([{ id: 9, username: 'Grim', note: 'stole my nails' }]);
  });

  it('imports enemies with the friends rules: add new, fill in missing notes, never remove', () => {
    const file = JSON.stringify({
      v: 1,
      playerId: 77,
      friends: [{ id: 5, username: 'Spike' }],
      enemies: [{ id: 9, username: 'Grim', note: 'stole my nails' }, { id: 10, username: 'Moth', note: 'theirs' }, { id: 'x' }],
    });
    const r = parseImport(file, 77);
    expect(r.enemies).toEqual([{ id: 9, username: 'Grim', note: 'stole my nails' }, { id: 10, username: 'Moth', note: 'theirs' }]);
    const target = emptyEnemies();
    addEnemy(target, { id: 10, username: 'Moth' }, 0);
    setEnemyNote(target, 10, 'mine');
    expect(mergeEnemiesImport(target, r.enemies, 1)).toEqual({ added: 1, notes: 1 });
    expect(target.enemies[10].note).toBe('mine');
  });

  it('still imports an older file without enemies', () => {
    const r = parseImport(JSON.stringify({ v: 1, playerId: 1, friends: [{ id: 3, username: 'A' }] }), 1);
    expect(r).toEqual({ ok: true, friends: [{ id: 3, username: 'A' }], enemies: [] });
  });

  it('mentions enemies in the import message', () => {
    expect(importMessage({ added: 2, enemiesAdded: 1, notes: 3 })).toBe('Imported 2 new friends, 1 new enemy and 3 notes.');
    expect(importMessage({ added: 0, enemiesAdded: 2 })).toBe('Imported 0 new friends and 2 new enemies.');
  });

  it('carries the settings document, and still reads files without one', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    const text = exportFriends(s, 77, null, { v: 1, sound: 'ping' });
    expect(JSON.parse(text).settings).toEqual({ v: 1, sound: 'ping' });
    expect(parseImport(text, 77)).toMatchObject({ ok: true, settings: { v: 1, sound: 'ping' } });
    expect(parseImport(exportFriends(s, 77), 77).settings).toBeUndefined();
    expect(parseImport(JSON.stringify({ v: 1, playerId: 77, friends: [], settings: [1] }), 77).settings).toBeUndefined();
  });

  it('says when settings came back, or could not be read', () => {
    expect(importMessage({ added: 1, settings: 'restored' })).toBe('Imported 1 new friend. Settings restored.');
    expect(importMessage({ added: 0, settings: 'unreadable' })).toBe("Imported 0 new friends. The settings in it couldn't be read.");
  });
});
