// Which game tab has the player's attention, shared through localStorage. A background tab that keeps
// checking mail for desktop notifications stays quiet (no sound, no notification) while another game
// tab has focus: that tab hears the same mail itself.
export const FRESH_MS = 30000;

export function createTabFocus({ storage, key, doc, win, now = () => Date.now(), id = Math.random().toString(36).slice(2) }) {
  const focused = () => typeof doc.hasFocus === 'function' && doc.hasFocus();

  function read() {
    try {
      const v = JSON.parse(storage.getItem(key));
      return v && typeof v === 'object' && typeof v.tab === 'string' && typeof v.at === 'number' ? v : null;
    } catch {
      return null;
    }
  }

  // The focused tab says so on focus and on every mail check, so a closed or crashed tab goes stale.
  function beat() {
    if (!focused()) return;
    try {
      storage.setItem(key, JSON.stringify({ tab: id, at: now() }));
    } catch {
      // storage full or blocked: every tab just decides for itself, as before
    }
  }

  function release() {
    const v = read();
    if (!v || v.tab !== id) return;
    try {
      storage.removeItem(key);
    } catch {
      // as above
    }
  }

  win.addEventListener('focus', beat);
  win.addEventListener('blur', release);
  beat();

  return {
    beat,
    focused,
    // Another open game tab had focus within the last FRESH_MS.
    elsewhere() {
      if (focused()) return false;
      const v = read();
      return !!(v && v.tab !== id && now() - v.at < FRESH_MS);
    },
    destroy() {
      win.removeEventListener('focus', beat);
      win.removeEventListener('blur', release);
      release();
    },
  };
}
