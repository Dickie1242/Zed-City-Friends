// In-memory online/last-active cache. Never persisted.
import { parseSentAt } from './time.js';
import { warnOnce } from './util.js';

// The API's `active` is seconds since the player was last active (the game's own TimeAgo
// component subtracts it from now). Anything that looks like an absolute time is parsed as one.
export function lastActive(value, now) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n < 0) return null;
    if (n < 1e9) return now - n * 1000;
  }
  return parseSentAt(value);
}

export function createPresence({
  fetchProfile,
  onProfile,
  staleMs = 60000,
  concurrency = 2,
  gapMs = 250,
  pauseMs = 300000,
  now = () => Date.now(),
}) {
  const cache = new Map();
  const queue = [];
  const queued = new Set();
  const subs = new Set();
  let inFlight = 0;
  let pausedUntil = 0;

  function emit(id) {
    for (const fn of [...subs]) {
      try {
        fn(id);
      } catch (e) {
        warnOnce('presence-subscriber', e);
      }
    }
  }

  // info: anything with { online, active } (getProfile / getChatInfo entries). `at` is the
  // freshness timestamp to record; a refresh() fetch passes the time it queued the id, so a
  // slow response doesn't push the id's next scheduled refresh out past staleMs.
  function store(id, info, at) {
    if (!info || typeof info !== 'object') return;
    cache.set(id, { online: !!info.online, active: lastActive(info.active, now()), fetchedAt: at });
    emit(id);
  }

  function set(id, info) {
    store(id, info, now());
  }

  function isStale(id) {
    const c = cache.get(id);
    return !c || now() - c.fetchedAt >= staleMs;
  }

  // Drops everything still waiting its turn and stops new fetches until pauseMs has passed.
  // The poller's own backoff never sees these (its run() always returns {ok:true}), so presence
  // has to stop hammering a rate-limited or logged-out endpoint on its own.
  function pause() {
    pausedUntil = now() + pauseMs;
    for (const { id } of queue.splice(0)) queued.delete(id);
  }

  function pump() {
    while (inFlight < concurrency && queue.length) {
      const { id, queuedAt } = queue.shift();
      // set() (e.g. from getChatInfo) may have already refreshed this id while it waited its turn.
      if (!isStale(id)) {
        queued.delete(id);
        continue;
      }
      inFlight += 1;
      // A request that never settles holds this slot forever; safe because api.js aborts GETs after 20s.
      Promise.resolve()
        .then(() => fetchProfile(id))
        .then((r) => {
          if (r && r.ok && r.data) {
            store(id, r.data, queuedAt);
            if (onProfile) onProfile(id, r.data);
          } else if (r && !r.ok && (r.kind === 'rate' || r.kind === 'auth')) {
            pause();
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
    if (now() < pausedUntil) return;
    const queuedAt = now();
    for (const id of ids) {
      if (!queued.has(id) && isStale(id)) {
        queued.add(id);
        queue.push({ id, queuedAt });
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
