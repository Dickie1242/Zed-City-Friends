// Page-change notifications for a Vue Router (history mode) app, plus navigation through the game's own router.
import { safe, warnOnce } from './util.js';

const PATCHED = Symbol.for('zcf.historyPatched');

export function createRouter({ win = window, doc = document } = {}) {
  const subs = new Set();
  let last = win.location.pathname;

  function check() {
    const path = win.location.pathname;
    if (path === last) return;
    last = path;
    for (const fn of [...subs]) safe('router-subscriber', fn)(path);
  }

  const history = win.history;
  if (!history[PATCHED]) {
    for (const method of ['pushState', 'replaceState']) {
      try {
        const original = history[method];
        history[method] = function patchedHistoryMethod(...args) {
          const result = original.apply(this, args);
          try {
            // Vue Router falls back to a full-page location.assign if pushState throws;
            // never let our own bookkeeping be the thing that breaks that call.
            win.dispatchEvent(new Event('zcf:locationchange'));
          } catch (e) {
            warnOnce('router-dispatch', e);
          }
          return result;
        };
      } catch (e) {
        // Another extension may have made history[method] non-writable. Don't let that
        // take the rest of the app down; popstate still gets us path changes.
        warnOnce('history-patch', e);
      }
    }
    // Set regardless of per-method success, so a later router never retries or double-wraps.
    history[PATCHED] = true;
  }
  const onLocationChange = () => queueMicrotask(check);
  win.addEventListener('zcf:locationchange', onLocationChange);
  win.addEventListener('popstate', check);

  function navigate(path) {
    if (typeof path !== 'string' || !/^\/(?![/\\])/.test(path)) {
      warnOnce('navigate-bad-path', path);
      return;
    }
    try {
      const app = doc.querySelector('#q-app');
      const router = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$router;
      if (router && typeof router.push === 'function') {
        const result = router.push(path);
        if (result && typeof result.then === 'function') {
          // Duplicate/aborted navigations resolve; a rejection here means a real failure,
          // e.g. a stale tab that can't load a lazy route chunk after a deploy.
          result.then(undefined, (e) => {
            warnOnce('navigate', e);
            win.location.assign(path);
          });
        }
        return;
      }
    } catch {
      // fall through to a full page load
    }
    win.location.assign(path);
  }

  return {
    get path() {
      return win.location.pathname;
    },
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    navigate,
    destroy() {
      win.removeEventListener('zcf:locationchange', onLocationChange);
      win.removeEventListener('popstate', check);
      subs.clear();
    },
  };
}
