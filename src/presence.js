// In-memory online/last-active cache. Never persisted.
import { parseSentAt } from './time.js';
import { warnOnce } from './util.js';

export function createPresence({
  fetchProfile,
  onProfile,
  staleMs = 60000,
  concurrency = 2,
  gapMs = 250,
  now = () => Date.now(),
}) {
  const cache = new Map();
  const queue = [];
  const queued = new Set();
  const subs = new Set();
  let inFlight = 0;

  function emit(id) {
    for (const fn of [...subs]) {
      try {
        fn(id);
      } catch (e) {
        warnOnce('presence-subscriber', e);
      }
    }
  }

  // info: anything with { online, active } (getProfile / getChatInfo entries).
  function set(id, info) {
    if (!info || typeof info !== 'object') return;
    cache.set(id, { online: !!info.online, active: parseSentAt(info.active), fetchedAt: now() });
    emit(id);
  }

  function isStale(id) {
    const c = cache.get(id);
    return !c || now() - c.fetchedAt >= staleMs;
  }

  function pump() {
    while (inFlight < concurrency && queue.length) {
      const id = queue.shift();
      inFlight += 1;
      Promise.resolve()
        .then(() => fetchProfile(id))
        .then((r) => {
          if (r && r.ok && r.data) {
            set(id, r.data);
            if (onProfile) onProfile(id, r.data);
          }
        })
        .catch((e) => warnOnce('presence-fetch', e))
        .finally(() => {
          queued.delete(id);
          setTimeout(() => {
            inFlight -= 1;
            pump();
          }, gapMs);
        });
    }
  }

  // Queues a fetch for every id whose cached status is missing or older than staleMs.
  function refresh(ids) {
    for (const id of ids) {
      if (!queued.has(id) && isStale(id)) {
        queued.add(id);
        queue.push(id);
      }
    }
    pump();
  }

  return {
    get: (id) => cache.get(id) || null,
    set,
    refresh,
    isStale,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
