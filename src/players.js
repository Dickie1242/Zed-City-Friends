// Player lookups for the UI (add-friend search, chat names, profile button).
import { asArray, toId } from './util.js';

export function createPlayers({ api, ttlMs = 60000, now = () => Date.now() }) {
  const profiles = new Map();

  async function search(q) {
    const r = await api.findPlayer(q);
    if (!r.ok) return r;
    const data = asArray(r.data)
      .map((p) => ({
        id: toId(p && p.id),
        username: p && typeof p.username === 'string' ? p.username : '',
        avatar: p && typeof p.avatar === 'string' ? p.avatar : null,
      }))
      .filter((p) => p.id && p.username);
    return { ok: true, data };
  }

  // Chat names carry no player id, so only accept an exact (case-insensitive) username match.
  async function resolveExact(name) {
    const wanted = String(name || '').trim().toLowerCase();
    if (!wanted) return null;
    const r = await search(wanted);
    if (!r.ok) return null;
    return r.data.find((p) => p.username.toLowerCase() === wanted) || null;
  }

  async function get(id) {
    const hit = profiles.get(id);
    if (hit && now() - hit.at < ttlMs) return { ok: true, data: hit.data };
    const r = await api.getProfile(id);
    if (r.ok) profiles.set(id, { at: now(), data: r.data });
    return r;
  }

  return { search, resolveExact, get };
}
