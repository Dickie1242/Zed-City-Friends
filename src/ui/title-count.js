// "(N) " in front of the browser tab's title while there are unread private messages (0.6 spec §1.3). The
// game rewrites the title on every route change, so while there's a count an observer on <head> puts the
// prefix back. Only the exact prefix we wrote is ever removed, and a write that changes nothing is skipped
// (no loops). With nothing to show, it stops watching.
export function createTitleCount({ doc = document, win = window } = {}) {
  let want = '';
  let written = ''; // what we last put in front, if it's still there
  let observer = null;

  function apply() {
    const title = doc.title;
    const base = written && title.startsWith(written) ? title.slice(written.length) : title;
    const next = want + base;
    written = want;
    if (title !== next) doc.title = next;
  }

  function watch(on) {
    if (on && !observer) {
      observer = new win.MutationObserver(() => apply());
      observer.observe(doc.head || doc.documentElement, { childList: true, subtree: true, characterData: true });
    } else if (!on && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  return {
    set(count, enabled) {
      want = enabled && count > 0 ? `(${count}) ` : '';
      apply();
      watch(!!want);
    },
    destroy() {
      want = '';
      apply();
      watch(false);
    },
  };
}
