// The only module that touches storage. One JSON document per player in localStorage.
import { emptyState, normalizeState } from './state.js';
import { warnOnce } from './util.js';

export const storageKey = (playerId) => `zcf:v1:${playerId}`;

export function createStore({ playerId, storage = window.localStorage, win = window, now = () => Date.now() }) {
  const key = storageKey(playerId);
  const subs = new Set();
  let state = read();

  function read() {
    let text = null;
    try {
      text = storage.getItem(key);
    } catch (e) {
      warnOnce('store-read', e);
      return emptyState();
    }
    if (!text) return emptyState();
    try {
      return normalizeState(JSON.parse(text));
    } catch (e) {
      warnOnce('store-corrupt', e);
      try {
        storage.setItem(`${key}:corrupt:${now()}`, text);
        storage.removeItem(key);
      } catch {
        // storage full or blocked: starting empty is still better than crashing
      }
      return emptyState();
    }
  }

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn(state);
      } catch (e) {
        warnOnce('store-subscriber', e);
      }
    }
  }

  // Re-reads the saved copy before applying `mutate`, so edits made in another game tab aren't overwritten.
  function update(mutate) {
    const draft = read();
    const result = mutate(draft);
    state = draft;
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch (e) {
      warnOnce('store-write', e);
    }
    emit();
    return result;
  }

  function onStorage(e) {
    if (e.key !== key) return;
    state = read();
    emit();
  }
  win.addEventListener('storage', onStorage);

  return {
    key,
    get: () => state,
    update,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    destroy() {
      win.removeEventListener('storage', onStorage);
      subs.clear();
    },
  };
}
