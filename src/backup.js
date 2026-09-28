import { toId } from './util.js';

export function exportFriends(state, playerId) {
  const friends = Object.values(state.friends).map((f) => ({ id: f.id, username: f.username }));
  return JSON.stringify({ v: 1, playerId, friends }, null, 2);
}

// Strictly validates an export file. Returns { ok: true, friends } or { ok: false, error }.
export function parseImport(text, playerId) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!doc || typeof doc !== 'object' || doc.v !== 1 || !Array.isArray(doc.friends)) {
    return { ok: false, error: 'That file is not a Zed City Friends export.' };
  }
  if (toId(doc.playerId) !== toId(playerId)) {
    return { ok: false, error: 'That export belongs to a different player.' };
  }
  const friends = [];
  const seen = new Set();
  for (const f of doc.friends) {
    const id = toId(f && f.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const username = typeof f.username === 'string' ? f.username.slice(0, 32) : '';
    friends.push({ id, username: username || `#${id}` });
  }
  return { ok: true, friends };
}
