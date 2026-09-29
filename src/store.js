// The only module that touches storage. One JSON document per player in localStorage.
import { emptyState, normalizeState } from './state.js';
import { warnOnce } from './util.js';

export const storageKey = (playerId) => `zcf:v1:${playerId}`;

// Shared with the game itself: its own emoji picker reads/writes the exact same key, the exact
// same way (JSON array of shortcode names, most-recent-first, capped at 18).
const RECENT_EMOJI_KEY = 'zed-ui.recent-emojis';
const RECENT_EMOJI_MAX = 18;

function defaultStorage(storage) {
  if (storage) return storage;
  try {
    return window.localStorage;
  } catch (e) {
    warnOnce('store-recent-emoji-storage', e);
    return null;
  }
}

// Never throws: a missing/blocked storage, bad JSON, a non-array, or non-string entries all just
// read back as [].
export function readGameRecentEmojis(storage) {
  const s = defaultStorage(storage);
  if (!s) return [];
  try {
    const raw = s.getItem(RECENT_EMOJI_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === 'string').slice(0, RECENT_EMOJI_MAX);
  } catch (e) {
    warnOnce('store-recent-emoji-read', e);
    return [];
  }
}

export function rememberGameRecentEmoji(storage, name) {
  const s = defaultStorage(storage);
  if (!s) return;
  try {
    const current = readGameRecentEmojis(s);
    const next = [name, ...current.filter((n) => n !== name)].slice(0, RECENT_EMOJI_MAX);
    s.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
  } catch (e) {
    warnOnce('store-recent-emoji-write', e);
  }
}

export function createStore({ playerId, storage = window.localStorage, win = window, now = () => Date.now() }) {
  const key = storageKey(playerId);
  const subs = new Set();
  let saved = true; // whether the last write to storage succeeded

  // Reads the saved document without ever destroying data it can't make sense of.
  // Returns { doc, ok, repaired }: ok is false whenever storage couldn't be read, or held
  // something this script must not touch (a document from a newer script version, or corrupt
  // text with `repair` unset). Only a caller that passes `repair: true` (initial load, update())
  // may back up and remove a corrupt document; a storage-event reload never may. `repaired` is
  // true only when this call just replaced a corrupt document with a fresh empty one — the caller
  // must not treat that empty doc as the source of truth over whatever it already holds in memory.
  function read({ repair } = {}) {
    let text = null;
    try {
      text = storage.getItem(key);
    } catch (e) {
      warnOnce('store-read', e);
      return { doc: null, ok: false };
    }
    if (!text) return { doc: emptyState(), ok: true };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return corrupt(text, e, repair);
    }
    if (parsed && typeof parsed === 'object' && typeof parsed.v === 'number' && parsed.v > 1) {
      // Another tab is running a newer script version. Leave its document alone; we just can't read it.
      warnOnce('store-newer', parsed.v);
      return { doc: null, ok: false };
    }
    try {
      return { doc: normalizeState(parsed), ok: true };
    } catch (e) {
      return corrupt(text, e, repair);
    }
  }

  function corrupt(text, e, repair) {
    warnOnce('store-corrupt', e);
    if (!repair) return { doc: null, ok: false };
    try {
      storage.setItem(`${key}:corrupt:${now()}`, text);
      storage.removeItem(key);
    } catch {
      // Backup or removal failed (storage full or blocked): leave the corrupt document in place
      // rather than lose the only copy of it.
      return { doc: null, ok: false };
    }
    return { doc: emptyState(), ok: true, repaired: true };
  }

  const initial = read({ repair: true });
  let state = initial.ok ? initial.doc : emptyState();

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn(state);
      } catch (e) {
        warnOnce('store-subscriber', e);
      }
    }
  }

  function update(mutate) {
    // Re-reads the saved copy before applying `mutate`, so edits made in another game tab aren't
    // overwritten. This isn't a lock: two tabs can still save within a few ms of each other and
    // lose one change, but the storage event then brings both tabs back to the same document.
    const r = read({ repair: true });
    // The in-memory copy wins over the freshly read doc whenever the read is unusable, or this
    // call just repaired a corrupt document (its `r.doc` is a throwaway empty state), or our last
    // save failed. Trade-off: a change another tab saved in the meantime can be lost this way —
    // there's no operation log, just last-write-wins between what's on disk and what's in memory.
    const draft = r.ok && saved && !r.repaired ? r.doc : JSON.parse(JSON.stringify(state));
    const result = mutate(draft);
    state = draft;
    if (r.ok) {
      try {
        storage.setItem(key, JSON.stringify(state));
        saved = true;
      } catch (e) {
        saved = false;
        warnOnce('store-write', e);
      }
    }
    // else: storage holds a document we must not touch (corrupt, or from a newer script version)
    // — skip the save so we never clobber it; this session's changes stay in memory only.
    emit();
    return result;
  }

  function onStorage(e) {
    if (e.key !== key && e.key !== null) return; // null means another tab cleared all of storage
    const r = read({ repair: false });
    if (r.ok) {
      state = r.doc;
      saved = true;
      emit();
    }
    // else: the other tab's document is corrupt or from a newer script version. Keep our current
    // state and do nothing — reloading from another tab must never be destructive.
  }
  win.addEventListener('storage', onStorage);

  return {
    key,
    // The returned state is read-only; change it only via update().
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
