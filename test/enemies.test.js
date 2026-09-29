import { describe, it, expect } from 'vitest';
import { emptyEnemies, normalizeEnemies, addEnemy, removeEnemy, setEnemyNote, updateEnemyInfo, isEnemy, enemyNames } from '../src/enemies.js';
import { MAX_NOTE } from '../src/state.js';

describe('enemies', () => {
  it('adds, notes, refreshes and removes enemies', () => {
    const d = emptyEnemies();
    expect(addEnemy(d, { id: 9, username: 'Grim', avatar: 'g.png' }, 5)).toBe(true);
    expect(addEnemy(d, { id: 9, username: 'Again' }, 6)).toBe(false);
    expect(d.enemies[9]).toEqual({ id: 9, username: 'Grim', avatar: 'g.png', addedAt: 5 });
    expect(isEnemy(d, 9)).toBe(true);
    expect(setEnemyNote(d, 9, '  stole my nails  ')).toBe(true);
    expect(d.enemies[9].note).toBe('stole my nails');
    expect(setEnemyNote(d, 9, 'x'.repeat(300))).toBe(true);
    expect(d.enemies[9].note).toHaveLength(MAX_NOTE);
    expect(updateEnemyInfo(d, 9, { username: 'Grimmer', avatar: '' })).toBe(true);
    expect(d.enemies[9]).toMatchObject({ username: 'Grimmer', avatar: 'g.png' });
    expect(enemyNames(d)).toEqual(new Set(['grimmer']));
    removeEnemy(d, 9);
    expect(isEnemy(d, 9)).toBe(false);
  });

  it('normalizes a saved document, dropping bad entries, and rejects other versions', () => {
    expect(normalizeEnemies({ v: 1 })).toEqual(emptyEnemies());
    expect(normalizeEnemies({
      v: 1,
      enemies: { 3: { id: 3, username: 'A', note: '  n  ', addedAt: 7 }, x: { id: 'x' }, 4: { id: 4 }, 5: null },
    })).toEqual({ v: 1, enemies: { 3: { id: 3, username: 'A', avatar: null, addedAt: 7, note: 'n' }, 4: { id: 4, username: '#4', avatar: null, addedAt: 0 } } });
    expect(() => normalizeEnemies({ v: 2 })).toThrow();
    expect(() => normalizeEnemies('x')).toThrow();
  });
});
