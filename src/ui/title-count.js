// "(N) " in front of the browser tab's title while there are unread private messages (0.6 spec §1.3). The
// game rewrites the title on every route change, so an observer on <head> puts the prefix back. Only our
// own "(digits) " prefix is ever added or removed, and a write that changes nothing is skipped (no loops).
const PREFIX = /^\(\d+\) /;

export function createTitleCount({ doc = document, win = window } = {}) {
  let want = '';
  let observer = null;

  function apply() {
    const next = want + doc.title.replace(PREFIX, '');
    if (doc.title !== next) doc.title = next;
  }

  function watch() {
    if (observer) return;
    observer = new win.MutationObserver(() => apply());
    observer.observe(doc.head || doc.documentElement, { childList: true, subtree: true, characterData: true });
  }

  return {
    set(count, enabled) {
      want = enabled && count > 0 ? `(${count}) ` : '';
      apply();
      if (want) watch();
    },
    destroy() {
      if (observer) observer.disconnect();
      observer = null;
      want = '';
      apply();
    },
  };
}
