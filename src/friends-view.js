// Pure data for the Friends window: filtered, sorted Online / Offline / Recent sections.
const byName = (a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });

export function buildFriendSections({ friends, presence, threads, filter }) {
  const q = String(filter || '').trim().toLowerCase();
  const matches = (name) => !q || String(name).toLowerCase().includes(q);
  const online = [];
  const offline = [];
  let onlineCount = 0;
  const all = Object.values(friends);
  for (const f of all) {
    const p = presence(f.id);
    if (p && p.online) onlineCount += 1;
    if (!matches(f.username)) continue;
    const row = { id: f.id, username: f.username, avatar: f.avatar, presence: p };
    (p && p.online ? online : offline).push(row);
  }
  online.sort(byName);
  offline.sort((a, b) => ((b.presence && b.presence.active) || 0) - ((a.presence && a.presence.active) || 0) || byName(a, b));
  const recent = threads
    .filter((t) => !t.isSystem && !friends[t.userId] && matches(t.username))
    .sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0));
  return { online, offline, recent, onlineCount, total: all.length };
}
