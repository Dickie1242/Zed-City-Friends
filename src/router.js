// Page-change notifications for a Vue Router (history mode) app, plus navigation through the game's own router.
import { safe } from './util.js';

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
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        win.dispatchEvent(new Event('zcf:locationchange'));
        return result;
      };
    }
    history[PATCHED] = true;
  }
  win.addEventListener('zcf:locationchange', () => queueMicrotask(check));
  win.addEventListener('popstate', check);

  function navigate(path) {
    try {
      const app = doc.querySelector('#q-app');
      const router = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$router;
      if (router && typeof router.push === 'function') {
        router.push(path);
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
  };
}
