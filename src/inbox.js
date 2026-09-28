// Polls the thread list (getChats page 1): unread badges, friend pop-ups, the Recent section, and change signals.
import { normalizeThreads, findNewMail } from './mail.js';
import { openDm, threadEntry } from './state.js';
import { warnOnce } from './util.js';

export function createInbox({ api, store, myId, now = () => Date.now(), onActivity = () => {}, onThreadChanged = () => {} }) {
  let threads = [];
  let previous = null; // Map userId -> lastReply from the previous poll; null until the first poll
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

    const changes = [];
    for (const t of fresh) {
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
            openDm(s, t.userId, { now: now(), username: t.username, avatar: t.avatar });
          }
        }
        for (const id of cleared) threadEntry(s, id).unread = 0;
      });
    }

    // The first poll only sets the baseline; later polls report threads whose last reply moved.
    if (previous) {
      let chatting = false;
      for (const t of threads) {
        if (previous.has(t.userId) && previous.get(t.userId) === t.lastReply) continue;
        onThreadChanged(t.userId);
        if (state.friends[t.userId] || state.dock.dms.some((d) => d.id === t.userId)) chatting = true;
      }
      if (chatting) onActivity();
    }
    previous = new Map(threads.map((t) => [t.userId, t.lastReply]));
    emit();
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
