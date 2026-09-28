// Polls the thread list (getChats page 1): unread badges, friend pop-ups, the Recent section, and change signals.
import { normalizeThreads, findNewMail } from './mail.js';
import { openDm, threadEntry } from './state.js';
import { warnOnce } from './util.js';

// The fields the Recent list renders, in list order; used to skip emit() when none of them moved.
function recentSignature(list) {
  return JSON.stringify(list.map((t) => [t.userId, t.username, t.avatar, t.preview, t.lastReply, t.newMail, t.isSystem]));
}

export function createInbox({ api, store, myId, now = () => Date.now(), onActivity = () => {}, onThreadChanged = () => {} }) {
  let threads = [];
  let previous = null; // Map userId -> lastReply from the previous poll; null until the first poll
  let lastSignature = null; // Recent-list signature from the previous poll; null until the first poll
  const subs = new Set();

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn();
      } catch (e) {
        warnOnce('inbox-subscriber', e);
      }
    }
  }

  async function poll() {
    const r = await api.getChats(1);
    if (!r.ok) return r;
    threads = normalizeThreads(r.data);
    const byId = new Map(threads.map((t) => [t.userId, t]));
    const state = store.get();
    const fresh = findNewMail(threads, state.threads, myId);
    const freshIds = new Set(fresh.map((t) => t.userId));

    // Oldest first: every openDm call in this poll shares the same now(), so evictDms breaks its
    // rank tie by insertion order. Pushing oldest-to-newest means the oldest is evicted, not the
    // newest, when more threads pop in one poll than the dock can hold.
    const sortedFresh = [...fresh].sort((a, b) => (a.lastReply || 0) - (b.lastReply || 0));

    const changes = [];
    for (const t of sortedFresh) {
      const seen = state.threads[t.userId] || {};
      const pop = !!state.friends[t.userId] && (t.lastReply || 0) > (seen.lastNotifiedReply || 0);
      if (seen.unread !== t.newMail || pop) changes.push({ t, pop });
    }
    // Threads we still show as unread but that were read elsewhere (e.g. in the game's inbox).
    const cleared = Object.keys(state.threads)
      .map(Number)
      .filter((id) => state.threads[id].unread > 0 && !freshIds.has(id) && byId.has(id));

    if (changes.length || cleared.length) {
      store.update((s) => {
        for (const { t, pop } of changes) {
          const entry = threadEntry(s, t.userId);
          entry.unread = t.newMail;
          if (pop) {
            entry.lastNotifiedReply = t.lastReply || 0;
            // `#id` is a placeholder for a still-unknown username (mail.js); passing it through
            // would overwrite a real name already on the dock entry. avatar is null in the same
            // case, and openDm already ignores a falsy avatar.
            const username = t.username === `#${t.userId}` ? undefined : t.username;
            openDm(s, t.userId, { now: now(), username, avatar: t.avatar });
          }
        }
        for (const id of cleared) threadEntry(s, id).unread = 0;
      });
    }

    // The first poll only sets the baseline; later polls report threads whose last reply moved.
    // `previous` is replaced before the signals below fire, so a callback that throws can't leave
    // the same change to be re-signalled (and mistaken for a network failure by the poller) next time.
    const prevBaseline = previous;
    previous = new Map(threads.map((t) => [t.userId, t.lastReply]));
    if (prevBaseline) {
      let chatting = false;
      for (const t of threads) {
        if (prevBaseline.has(t.userId) && prevBaseline.get(t.userId) === t.lastReply) continue;
        try {
          onThreadChanged(t.userId);
        } catch (e) {
          warnOnce('inbox-callback', e);
        }
        if (state.friends[t.userId] || state.dock.dms.some((d) => d.id === t.userId)) chatting = true;
      }
      if (chatting) {
        try {
          onActivity();
        } catch (e) {
          warnOnce('inbox-callback', e);
        }
      }
    }

    // Redraw the Friends window only when what its Recent list shows actually changed (spec §8);
    // store-driven changes already trigger their own renders.
    const signature = recentSignature(threads);
    if (signature !== lastSignature) {
      lastSignature = signature;
      emit();
    }
    return r;
  }

  return {
    poll,
    threads: () => threads,
    lastReply(userId) {
      const t = threads.find((x) => x.userId === userId);
      return t ? t.lastReply : null;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
