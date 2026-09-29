// Userscript entry: wait until the player is logged in, then start the app once.
import { createApi } from './api.js';
import { createApp } from './app.js';
import { injectStyles } from './ui/styles.js';
import { warnOnce } from './util.js';

const RETRY_MS = 15000;

export async function waitForPlayer(api, { retryMs = RETRY_MS, maxTries = Infinity } = {}) {
  for (let i = 0; i < maxTries; i += 1) {
    const r = await api.getStats();
    if (r.ok && r.data && Number(r.data.id) > 0) {
      return { id: Number(r.data.id), username: String(r.data.username || '') };
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  return null;
}

export async function boot({ win = window, doc = document, api = createApi() } = {}) {
  if (win.__zcfStarted) return null;
  win.__zcfStarted = true;
  try {
    const player = await waitForPlayer(api);
    if (!player) return null;
    injectStyles(doc);
    return createApp({ api, playerId: player.id, playerName: player.username, doc, win });
  } catch (e) {
    warnOnce('boot', e);
    return null;
  }
}
