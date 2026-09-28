import { describe, it, expect, vi } from 'vitest';
import { createStore, storageKey } from '../src/store.js';
import { addFriend } from '../src/state.js';
import { memoryStorage } from './helpers.js';

// Builds a storage-event Object matching what jsdom would dispatch, for our fake `win` EventTargets.
const storageEvent = (key) => Object.assign(new Event('storage'), { key });

describe('store', () => {
  it('keeps a separate document per player', () => {
    const storage = memoryStorage();
    const a = createStore({ playerId: 1, storage, win: new EventTarget() });
    const b = createStore({ playerId: 2, storage, win: new EventTarget() });
    a.update((s) => addFriend(s, { id: 9, username: 'x' }, 0));
    expect(JSON.parse(storage.getItem(storageKey(1))).friends[9].username).toBe('x');
    expect(b.get().friends).toEqual({});
    a.destroy();
    b.destroy();
  });

  it('notifies subscribers and returns the mutator result', () => {
    const store = createStore({ playerId: 1, storage: memoryStorage(), win: new EventTarget() });
    const fn = vi.fn();
    store.subscribe(fn);
    expect(store.update((s) => addFriend(s, { id: 9, username: 'x' }, 0))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().friends[9]).toBeTruthy();
    store.destroy();
  });

  it('applies updates on top of changes written by another tab', () => {
    const storage = memoryStorage();
    const tab1 = createStore({ playerId: 1, storage, win: new EventTarget() });
    const tab2 = createStore({ playerId: 1, storage, win: new EventTarget() });
    tab1.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    tab2.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(Object.keys(tab2.get().friends)).toEqual(['1', '2']);
    tab1.destroy();
    tab2.destroy();
  });

  it('reloads when the storage event fires for its key', () => {
    const storage = memoryStorage();
    const win = new EventTarget();
    const store = createStore({ playerId: 1, storage, win });
    const fn = vi.fn();
    store.subscribe(fn);
    storage.setItem(storageKey(1), JSON.stringify({ v: 1, friends: { 4: { id: 4, username: 'z' } } }));
    win.dispatchEvent(storageEvent('unrelated'));
    expect(fn).not.toHaveBeenCalled();
    win.dispatchEvent(storageEvent(storageKey(1)));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().friends[4].username).toBe('z');
    store.destroy();
  });

  it('backs up a corrupt document and starts empty', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage({ [storageKey(1)]: '{not json' });
    const store = createStore({ playerId: 1, storage, now: () => 123, win: new EventTarget() });
    expect(store.get().friends).toEqual({});
    expect(storage.getItem(`${storageKey(1)}:corrupt:123`)).toBe('{not json');
    expect(storage.getItem(storageKey(1))).toBeNull();
    store.destroy();
  });

  it('keeps changes in memory when storage is blocked', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const store = createStore({ playerId: 1, storage, win: new EventTarget() });
    expect(() => {
      store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
      store.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    }).not.toThrow();
    expect(Object.keys(store.get().friends)).toEqual(['1', '2']);
    store.destroy();
  });

  it('keeps a failed save in memory and saves it on the next successful update', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage();
    let failSave = true;
    const realSetItem = storage.setItem;
    storage.setItem = (k, v) => {
      if (failSave) throw new Error('quota');
      return realSetItem(k, v);
    };
    const store = createStore({ playerId: 1, storage, win: new EventTarget() });
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1']);
    expect(storage.getItem(storageKey(1))).toBeNull();
    failSave = false;
    store.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1', '2']);
    expect(Object.keys(JSON.parse(storage.getItem(storageKey(1))).friends)).toEqual(['1', '2']);
    store.destroy();
  });

  it('leaves a newer document alone at load and keeps working in memory', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const newer = JSON.stringify({ v: 2, friends: { 9: { id: 9, username: 'future' } } });
    const storage = memoryStorage({ [storageKey(1)]: newer });
    const store = createStore({ playerId: 1, storage, win: new EventTarget() });
    expect(store.get().friends).toEqual({});
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1']);
    expect(storage.getItem(storageKey(1))).toBe(newer);
    expect(storage.keys().some((k) => k.includes(':corrupt:'))).toBe(false);
    store.destroy();
  });

  it('ignores a storage event that delivers a newer document version', () => {
    const storage = memoryStorage();
    const win = new EventTarget();
    const store = createStore({ playerId: 1, storage, win });
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    const fn = vi.fn();
    store.subscribe(fn);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const newer = JSON.stringify({ v: 2, friends: { 9: { id: 9, username: 'future' } } });
    storage.setItem(storageKey(1), newer);
    win.dispatchEvent(storageEvent(storageKey(1)));
    expect(fn).not.toHaveBeenCalled();
    expect(Object.keys(store.get().friends)).toEqual(['1']);
    expect(storage.getItem(storageKey(1))).toBe(newer);
    // A stale tab can keep working and saving to memory, but must never touch the newer document.
    store.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1', '2']);
    expect(storage.getItem(storageKey(1))).toBe(newer);
    store.destroy();
  });

  it('leaves a corrupt document in place when the backup write fails', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage({ [storageKey(1)]: '{not json' });
    const realSetItem = storage.setItem;
    storage.setItem = (k, v) => {
      if (String(k).includes(':corrupt:')) throw new Error('quota');
      return realSetItem(k, v);
    };
    const store = createStore({ playerId: 1, storage, win: new EventTarget() });
    expect(store.get().friends).toEqual({});
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1']);
    expect(storage.getItem(storageKey(1))).toBe('{not json');
    store.destroy();
  });

  it('does not destroy state when a storage event delivers corrupt JSON', () => {
    const storage = memoryStorage();
    const win = new EventTarget();
    const store = createStore({ playerId: 1, storage, win });
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    const fn = vi.fn();
    store.subscribe(fn);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(storageKey(1), '{not json');
    win.dispatchEvent(storageEvent(storageKey(1)));
    expect(fn).not.toHaveBeenCalled();
    expect(Object.keys(store.get().friends)).toEqual(['1']);
    expect(storage.getItem(storageKey(1))).toBe('{not json');
    expect(storage.keys().some((k) => k.includes(':corrupt:'))).toBe(false);
    // A later update() repairs the corrupt doc (backs it up, removes it) — friend 1, held only in
    // memory since the event above, must survive that repair rather than be replaced by its empty result.
    store.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1', '2']);
    const saved = JSON.parse(storage.getItem(storageKey(1)));
    expect(Object.keys(saved.friends)).toEqual(['1', '2']);
    expect(storage.keys().some((k) => k.includes(':corrupt:'))).toBe(true);
    store.destroy();
  });

  it('keeps in-memory changes across a corrupt document once repairing it starts working', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage({ [storageKey(1)]: '{not json' });
    let failBackup = true;
    const realSetItem = storage.setItem;
    storage.setItem = (k, v) => {
      if (failBackup && String(k).includes(':corrupt:')) throw new Error('quota');
      return realSetItem(k, v);
    };
    const store = createStore({ playerId: 1, storage, win: new EventTarget() });
    expect(store.get().friends).toEqual({});
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1']);
    expect(storage.getItem(storageKey(1))).toBe('{not json'); // repair failed: corrupt text untouched

    failBackup = false;
    store.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(Object.keys(store.get().friends)).toEqual(['1', '2']);
    const saved = JSON.parse(storage.getItem(storageKey(1)));
    expect(Object.keys(saved.friends)).toEqual(['1', '2']);
    expect(storage.keys().some((k) => k.includes(':corrupt:'))).toBe(true);
    store.destroy();
  });

  it('reloads to an empty state and notifies when another tab clears storage', () => {
    const storage = memoryStorage();
    const win = new EventTarget();
    const store = createStore({ playerId: 1, storage, win });
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    const fn = vi.fn();
    store.subscribe(fn);
    storage.removeItem(storageKey(1));
    win.dispatchEvent(storageEvent(null));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().friends).toEqual({});
    store.destroy();
  });

  it('stops notifying after unsubscribe, and after destroy a storage event no longer notifies', () => {
    const storage = memoryStorage();
    const win = new EventTarget();
    const store = createStore({ playerId: 1, storage, win });
    const fn = vi.fn();
    const unsubscribe = store.subscribe(fn);
    store.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    expect(fn).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(fn).toHaveBeenCalledTimes(1);

    const fn2 = vi.fn();
    store.subscribe(fn2);
    store.destroy();

    // A kept listener would reload this valid empty doc and wipe out friends ['1', '2'].
    storage.setItem(storageKey(1), JSON.stringify({ v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, dms: [] } }));
    win.dispatchEvent(storageEvent(storageKey(1)));
    expect(fn2).not.toHaveBeenCalled();
    expect(Object.keys(store.get().friends)).toEqual(['1', '2']);

    // A kept subscriber list would still notify fn2 on a plain update() after destroy().
    store.update((s) => addFriend(s, { id: 3, username: 'c' }, 0));
    expect(fn2).not.toHaveBeenCalled();
  });
});
