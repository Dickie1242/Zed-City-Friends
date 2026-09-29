// Userscript entry: wait until the player is logged in, then start the app once.
import { createApi } from './api.js';
import { createApp } from './app.js';
import { injectStyles } from './ui/styles.js';
import { statsPlayer, warnOnce } from './util.js';
import { hideGame404Early, PAGE_CLASS } from './ui/friends-page.js';

const RETRY_MS = 15000;

export async function waitForPlayer(api, { retryMs = RETRY_MS, maxTries = Infinity, onWait } = {}) {
  for (let i = 0; i < maxTries; i += 1) {
    const r = await api.getStats();
    const me = r.ok ? statsPlayer(r.data) : null;
    if (me) return me;
    // Logged in but no id where we look: say so once, or a wrong guess at the shape fails silently.
    if (r.ok) warnOnce('stats-shape', r.data && typeof r.data === 'object' ? Object.keys(r.data) : r.data);
    if (onWait) onWait();
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  return null;
}

export async function boot({ win = window, doc = document, api = createApi() } = {}) {
  if (win.__zcfStarted) return null;
  win.__zcfStarted = true;
  try {
    hideGame404Early(doc, win);
    // Not logged in (yet): let the game's own page show. The app sets the class again once it starts.
    const player = await waitForPlayer(api, { onWait: () => doc.documentElement.classList.remove(PAGE_CLASS) });
    if (!player) return null;
    injectStyles(doc);
    return createApp({ api, playerId: player.id, playerName: player.username, doc, win });
  } catch (e) {
    doc.documentElement.classList.remove(PAGE_CLASS);
    warnOnce('boot', e);
    return null;
  }
}
