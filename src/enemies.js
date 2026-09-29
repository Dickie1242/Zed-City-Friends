// The enemies document (spec §C.2): a list of its own, apart from friends (a player can be on both), with
// private notes. Pure; store.js keeps it as its own localStorage document.
import { addPerson, removePerson, setPersonNote, updatePersonInfo, normalizeNote } from './state.js';
import { toId } from './util.js';

export function emptyEnemies() {
  return { v: 1, enemies: {} };
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// Throws for a document that isn't ours; drops entries without a valid id.
export function normalizeEnemies(doc) {
  if (!isObj(doc) || doc.v !== 1) throw new Error('Unsupported enemies document');
  const enemies = {};
  for (const e of Object.values(isObj(doc.enemies) ? doc.enemies : {})) {
    const id = toId(e && e.id);
    if (!id) continue;
    const entry = {
      id,
      username: typeof e.username === 'string' && e.username ? e.username : `#${id}`,
      avatar: typeof e.avatar === 'string' && e.avatar ? e.avatar : null,
      addedAt: Number.isFinite(e.addedAt) ? e.addedAt : 0,
    };
    const note = normalizeNote(e.note);
    if (note) entry.note = note;
    enemies[id] = entry;
  }
  return { v: 1, enemies };
}

export const isEnemy = (doc, id) => !!doc.enemies[id];
export const addEnemy = (doc, p, now) => addPerson(doc.enemies, p, now);
export const removeEnemy = (doc, id) => removePerson(doc.enemies, id);
export const setEnemyNote = (doc, id, note) => setPersonNote(doc.enemies, id, note);
export const updateEnemyInfo = (doc, id, info) => updatePersonInfo(doc.enemies, id, info);

// Lower-cased usernames, for matching senders in the game's chats (its rows carry no player ids).
export const enemyNames = (doc) => new Set(Object.values(doc.enemies).map((e) => e.username.toLowerCase()));
