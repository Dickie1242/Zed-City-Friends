// In-memory online/last-active cache. Never persisted.
import { parseSentAt } from './time.js';
import { toId, warnOnce } from './util.js';

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

// Level, faction and the injured / traveling flags from a getProfile answer. The profile calls
// the level `rank`; `traveling` may be a boolean or an object, so any truthy value counts.
export function profileDetails(data) {
  const level = Number(data.rank ?? data.level);
  const f = data.faction && typeof data.faction === 'object' ? data.faction : null;
  const factionId = f ? toId(f.id) : null;
  return {
    level: Number.isFinite(level) && level > 0 ? level : null,
    faction: factionId ? { id: factionId, name: typeof f.name === 'string' ? f.name : '' } : null,
    injured: !!data.is_injured,
    traveling: !!data.traveling,
  };
}

export function createPresence({
  fetchProfile,
  onProfile,
  staleMs = 60000,
  profileStaleMs = 300000,
  concurrency = 2,
  gapMs = 250,
  pauseMs = 300000,
  now = () => Date.now(),
}) {
  const cache = new Map();
  const failedAt = new Map(); // id -> when its last fetch failed (a deleted player, a bad imported id, ...)
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
  // slow response doesn't push the id's next scheduled refresh out past staleMs. `profile` comes
  // only with getProfile answers; a getChatInfo set() keeps the profile details already known.
  function store(id, info, at, profile) {
    if (!info || typeof info !== 'object') return;
    const prev = cache.get(id);
    cache.set(id, {
      online: !!info.online,
      active: lastActive(info.active, now()),
      fetchedAt: at,
      profile: profile || (prev && prev.profile) || null,
      // When level, faction and the icons were last fetched. A getChatInfo set() refreshes the online
      // status only, so fetchedAt alone can't tell whether these have gone stale (spec §D.3 #4).
      profileAt: profile ? at : (prev && prev.profileAt) || 0,
    });
    emit(id);
  }

  function set(id, info) {
    store(id, info, now());
  }

  // An entry without profile details is stale however fresh it is, so the Friends page's level
  // and faction fill in even for someone whose status so far only came from a DM header. Profile
  // details older than profileStaleMs are stale too, even when the status is fresh.
  function isStale(id, maxAgeMs = staleMs) {
    // A failed fetch waits out the same interval as a success, so a friend whose profile can't be
    // loaded can't take a slot in every sweep and starve everyone else.
    if (failedAt.has(id) && now() - failedAt.get(id) < maxAgeMs) return false;
    const c = cache.get(id);
    if (!c || !c.profile) return true;
    return now() - c.fetchedAt >= maxAgeMs || now() - c.profileAt >= Math.max(maxAgeMs, profileStaleMs);
  }

  // When an id's profile was last fetched or tried, for "stalest first" ordering; 0 if never.
  function lastTried(id) {
    const c = cache.get(id);
    return Math.max(c ? c.profileAt : 0, failedAt.get(id) || 0);
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
            failedAt.delete(id);
            store(id, r.data, queuedAt, profileDetails(r.data));
            if (onProfile) onProfile(id, r.data);
            return;
          }
          // Rate limits and logouts pause every fetch instead; the id is retried when the pause ends.
          if (r && !r.ok && (r.kind === 'rate' || r.kind === 'auth')) pause();
          else failedAt.set(id, queuedAt);
        })
        .catch((e) => {
          failedAt.set(id, queuedAt);
          warnOnce('presence-fetch', e);
        })
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
    lastTried,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
