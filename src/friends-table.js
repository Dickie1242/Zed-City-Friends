// Pure data for the Friends page: rows with presence and profile details, tab counts, a search over
// names and notes, and column sorting. Rows with no value for the sorted column always sort last.
export const DEFAULT_SORT = { key: 'status', dir: 'asc' };
// The direction a column sorts in when first clicked; clicking it again reverses it.
export const FIRST_DIR = { name: 'asc', level: 'desc', status: 'asc', faction: 'asc' };

const text = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
const byName = (a, b) => text(a.username, b.username);
const statusRank = (p) => (p.online ? 0 : p.active ? 1 : 2);

const SORTS = {
  name: { has: () => true, cmp: byName },
  level: { has: (r) => !!(r.profile && r.profile.level), cmp: (a, b) => a.profile.level - b.profile.level },
  faction: { has: (r) => !!(r.profile && r.profile.faction), cmp: (a, b) => text(a.profile.faction.name, b.profile.faction.name) },
  status: {
    has: (r) => !!r.presence,
    // Online first (A-Z via the tie-break), then offline by most recently active, then offline with no time.
    cmp: (a, b) => {
      const d = statusRank(a.presence) - statusRank(b.presence);
      if (d || statusRank(a.presence) !== 1) return d;
      return b.presence.active - a.presence.active;
    },
  },
};

export function sortRows(rows, sort = DEFAULT_SORT) {
  const { has, cmp } = SORTS[sort.key] || SORTS.status;
  const sign = sort.dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const ha = has(a);
    const hb = has(b);
    if (ha !== hb) return ha ? -1 : 1;
    return (ha ? sign * cmp(a, b) : 0) || byName(a, b);
  });
}

export function nextSort(sort, key) {
  if (sort.key === key) return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: FIRST_DIR[key] || 'asc' };
}

// friends: the saved friends map; presence(id): cache entry or null; threads: saved thread state (unread).
// pinned: ids kept in the list even when they no longer match the tab (a row mid-edit or mid-confirm).
export function buildFriendsTable({ friends, presence, threads = {}, tab = 'all', query = '', sort = DEFAULT_SORT, pinned = [] }) {
  const q = String(query || '').trim().toLowerCase();
  const all = Object.values(friends).map((f) => {
    const p = presence(f.id);
    return {
      id: f.id,
      username: f.username,
      avatar: f.avatar || null,
      note: f.note || '',
      presence: p ? { online: !!p.online, active: p.active || null } : null,
      profile: (p && p.profile) || null,
      unread: (threads[f.id] && threads[f.id].unread) || 0,
    };
  });
  const isOnline = (r) => !!(r.presence && r.presence.online);
  const online = all.filter(isOnline).length;
  const counts = { all: all.length, online, offline: all.length - online };
  const keep = new Set(pinned);
  const inTab = all.filter((r) => tab === 'all' || (tab === 'online') === isOnline(r) || keep.has(r.id));
  const matches = (r) => !q || r.username.toLowerCase().includes(q) || r.note.toLowerCase().includes(q);
  return { rows: sortRows(inTab.filter(matches), sort), counts };
}
