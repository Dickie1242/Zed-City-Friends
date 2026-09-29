import { toId } from './util.js';
import { addPerson, setPersonNote, normalizeNote } from './state.js';

const pick = (p) => (p.note ? { id: p.id, username: p.username, note: p.note } : { id: p.id, username: p.username });

// Friends, plus enemies when there are any (older script versions ignore the extra array).
export function exportFriends(state, playerId, enemiesDoc) {
  const doc = { v: 1, playerId, friends: Object.values(state.friends).map(pick) };
  const enemies = enemiesDoc ? Object.values(enemiesDoc.enemies).map(pick) : [];
  if (enemies.length) doc.enemies = enemies;
  return JSON.stringify(doc, null, 2);
}

function parsePeople(list) {
  const out = [];
  const seen = new Set();
  for (const p of list) {
    const id = toId(p && p.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const username = (typeof p.username === 'string' ? p.username.slice(0, 32) : '') || `#${id}`;
    const note = normalizeNote(p.note);
    out.push(note ? { id, username, note } : { id, username });
  }
  return out;
}

// Strictly validates an export file. Returns { ok: true, friends, enemies } or { ok: false, error }.
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
  return { ok: true, friends: parsePeople(doc.friends), enemies: parsePeople(Array.isArray(doc.enemies) ? doc.enemies : []) };
}

// Adds new people and fills in notes only where one has none yet; never removes or overwrites.
function mergeInto(map, people, now) {
  let added = 0;
  let notes = 0;
  for (const p of people) {
    if (addPerson(map, p, now)) added += 1;
    if (p.note && !map[p.id].note && setPersonNote(map, p.id, p.note)) notes += 1;
  }
  return { added, notes };
}

export const mergeImport = (state, friends, now) => mergeInto(state.friends, friends, now);
export const mergeEnemiesImport = (doc, enemies, now) => mergeInto(doc.enemies, enemies, now);

export function importMessage({ added, enemiesAdded = 0, notes = 0 }) {
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const parts = [count(added, 'new friend', 'new friends')];
  if (enemiesAdded) parts.push(count(enemiesAdded, 'new enemy', 'new enemies'));
  if (notes) parts.push(count(notes, 'note', 'notes'));
  const last = parts.pop();
  return `Imported ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}
