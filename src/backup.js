import { toId } from './util.js';
import { addFriend, setFriendNote, normalizeNote } from './state.js';

export function exportFriends(state, playerId) {
  const friends = Object.values(state.friends).map((f) => (f.note ? { id: f.id, username: f.username, note: f.note } : { id: f.id, username: f.username }));
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
    const username = (typeof f.username === 'string' ? f.username.slice(0, 32) : '') || `#${id}`;
    const note = normalizeNote(f.note);
    friends.push(note ? { id, username, note } : { id, username });
  }
  return { ok: true, friends };
}

// Adds new friends and fills in notes only where a friend has none yet; never removes or overwrites.
export function mergeImport(state, friends, now) {
  let added = 0;
  let notes = 0;
  for (const f of friends) {
    if (addFriend(state, f, now)) added += 1;
    if (f.note && !state.friends[f.id].note && setFriendNote(state, f.id, f.note)) notes += 1;
  }
  return { added, notes };
}

export function importMessage({ added, notes = 0 }) {
  const friends = `${added} new friend${added === 1 ? '' : 's'}`;
  return notes ? `Imported ${friends} and ${notes} note${notes === 1 ? '' : 's'}.` : `Imported ${friends}.`;
}
