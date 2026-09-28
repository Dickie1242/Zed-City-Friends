import { describe, it, expect, vi } from 'vitest';
import { createStore, storageKey } from '../src/store.js';
import { addFriend } from '../src/state.js';
import { memoryStorage } from './helpers.js';

describe('store', () => {
  it('keeps a separate document per player', () => {
    const storage = memoryStorage();
    const a = createStore({ playerId: 1, storage });
    const b = createStore({ playerId: 2, storage });
    a.update((s) => addFriend(s, { id: 9, username: 'x' }, 0));
    expect(JSON.parse(storage.getItem(storageKey(1))).friends[9].username).toBe('x');
    expect(b.get().friends).toEqual({});
  });

  it('notifies subscribers and returns the mutator result', () => {
    const store = createStore({ playerId: 1, storage: memoryStorage() });
    const fn = vi.fn();
    store.subscribe(fn);
    expect(store.update((s) => addFriend(s, { id: 9, username: 'x' }, 0))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().friends[9]).toBeTruthy();
  });

  it('applies updates on top of changes written by another tab', () => {
    const storage = memoryStorage();
    const tab1 = createStore({ playerId: 1, storage });
    const tab2 = createStore({ playerId: 1, storage });
    tab1.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    tab2.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(Object.keys(tab2.get().friends)).toEqual(['1', '2']);
  });

  it('reloads when the storage event fires for its key', () => {
    const storage = memoryStorage();
    const store = createStore({ playerId: 1, storage });
    const fn = vi.fn();
    store.subscribe(fn);
    storage.setItem(storageKey(1), JSON.stringify({ v: 1, friends: { 4: { id: 4, username: 'z' } } }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(fn).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey(1) }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().friends[4].username).toBe('z');
    store.destroy();
  });

  it('backs up a corrupt document and starts empty', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage({ [storageKey(1)]: '{not json' });
    const store = createStore({ playerId: 1, storage, now: () => 123 });
    expect(store.get().friends).toEqual({});
    expect(storage.getItem(`${storageKey(1)}:corrupt:123`)).toBe('{not json');
    expect(storage.getItem(storageKey(1))).toBeNull();
  });
});
