import { warnOnce } from './util.js';

// A timer loop that pauses while the tab is hidden, never overlaps runs, and backs off on errors.
// `run` resolves to an api-style result ({ ok, kind }) or undefined. `interval` may be a function (read before every wait).
export function makePoller({ run, interval, maxBackoff = 300000, busyInterval = 60000, onAuthLost, doc = document }) {
  let active = false;
  let timer = null;
  let running = false;
  let rerun = false;
  let backoff = 0;

  const base = () => (typeof interval === 'function' ? interval() : interval);
  const visible = () => doc.visibilityState !== 'hidden';

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(ms) {
    clear();
    if (active && visible()) timer = setTimeout(tick, ms);
  }

  async function tick() {
    clear();
    if (!active || !visible()) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    let result;
    try {
      result = await run();
    } catch (e) {
      warnOnce('poller-run', e);
      result = { ok: false, kind: 'network' };
    }
    running = false;
    if (!active) return;
    // Handle the result before an explicit rerun, so a poke pending during the run can't
    // skip auth handling or backoff bookkeeping. interval()/onAuthLost() can throw here,
    // so guard it (spec §7) instead of letting tick()'s promise reject unhandled.
    try {
      let delay = base();
      if (result && result.ok === false) {
        if (result.kind === 'auth') {
          active = false;
          if (onAuthLost) onAuthLost();
          return;
        }
        if (result.kind === 'network' || result.kind === 'rate') {
          backoff = Math.min(backoff ? backoff * 2 : base() * 2, maxBackoff);
          delay = backoff;
        } else {
          backoff = 0;
          if (result.kind === 'busy') delay = Math.max(base(), busyInterval);
        }
      } else {
        backoff = 0;
      }
      // A poke that arrived while running still reruns right away.
      if (rerun) {
        rerun = false;
        tick();
        return;
      }
      schedule(delay);
    } catch (e) {
      warnOnce('poller-tick', e);
      if (active) schedule(typeof interval === 'number' ? interval : 60000);
    }
  }

  function onVisibility() {
    if (!active) return;
    if (visible()) tick();
    else clear();
  }
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    start() {
      if (active) return;
      active = true;
      tick();
    },
    stop() {
      active = false;
      rerun = false; // don't let a pending poke cause a back-to-back run on a later start()
      clear();
    },
    // Run now (or right after the current run finishes).
    poke() {
      if (active) tick();
    },
    // Restart the wait using the current interval, without running now.
    reschedule() {
      if (active && !running && !backoff) schedule(base());
    },
    get active() {
      return active;
    },
    destroy() {
      active = false;
      rerun = false;
      clear();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
