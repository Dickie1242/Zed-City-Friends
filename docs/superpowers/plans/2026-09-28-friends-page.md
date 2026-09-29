# Friends Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Torn-style Friends page at `zed.city/friends`, opened from a new top-bar button with a green friends-online badge. It shows a sortable, searchable game-style table with level, status icons, faction, private notes, and Message / Edit note / Remove actions.

**Architecture:** Plain ES modules bundled by esbuild into one userscript, the same as the rest of the script.
- **Pure logic, unit-tested:** a table builder (`friends-table.js`) for tabs, search and sort.
- **Presence:** the cache also keeps profile details (level, faction, injured, traveling). A background sweep keeps the badge fresh.
- **UI:** a top-bar button cloned from the game's mail button, and the page itself, drawn in the logged-in layout's 404 slot.
- **Mount keeper:** one body `MutationObserver` re-attaches the dock root, the top-bar button and the page when Vue rebuilds their parents.

**Tech Stack:** JavaScript ES modules, esbuild, Vitest + jsdom. There's no framework.

**Spec:** `docs/superpowers/specs/2026-09-28-friends-page-design.md`

**Branch:** `friends-page`, already created. Commit as the repo-local identity "Zed City Friends" (check with `git config user.name`). End every commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Run tests:** `npx vitest run <file>` for one file, `npm test` for everything. The suite passes today (304 tests).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/time.js` | modify | + `longAgo`, `longStatusText` (the page's "Active 18 min ago" wording) |
| `src/state.js` | modify | + `MAX_NOTE`, `setFriendNote` |
| `src/backup.js` | modify | notes in export/import; + `mergeImport`, `importMessage` |
| `src/presence.js` | modify | + `profileDetails`; cache keeps `profile`; a missing profile counts as stale; `isStale(id, maxAgeMs)` |
| `src/friends-table.js` | create | pure rows, tab counts, search, sort, `nextSort`, `countOnline` |
| `src/ui/keeper.js` | create | one body observer that re-attaches registered mounts |
| `src/ui/dock.js` | modify | uses the keeper instead of its own body observer |
| `src/ui/topbar-button.js` | create | the Friends button and badge in the game header |
| `src/ui/friends-page.js` | create | the page, route mount/unmount, early 404 hide |
| `src/ui/styles.js` | modify | page and top-bar CSS |
| `src/ui/friends-window.js` | modify | import toast uses `importMessage` |
| `src/app.js` | modify | presence budgets, keeper, page, top bar, badge count, new actions |
| `src/main.js` | modify | early `/friends` 404 hide; `waitForPlayer({onWait})` |
| `test/fixtures/game-dom.js` | modify | + `HEADER_HTML`, `PAGE_404_HTML` |
| `test/ui/services.js` | modify | + `setFriendNote` action; import via `mergeImport` |
| tests | create/modify | one test file per module above |
| `docs/manual-test.md`, `README.md`, `package.json` | modify | checklist, feature note, version 0.4.0 |

---

### Task 1: Long-form "last active" wording

**Files:**
- Modify: `src/time.js` (append at end)
- Test: `test/time.test.js` (append at end)

- [ ] **Step 1: Write the failing test.** Append to `test/time.test.js`:

```js
import { longAgo, longStatusText } from '../src/time.js';

describe('longAgo', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const S = 1000;
  const M = 60 * S;
  const H = 60 * M;
  const D = 24 * H;
  const ago = (ms) => longAgo(now - ms, now);

  it('uses the game player-list wording at every boundary', () => {
    expect(ago(59 * S)).toBe('just now');
    expect(ago(M)).toBe('1 min ago');
    expect(ago(59 * M)).toBe('59 min ago');
    expect(ago(H)).toBe('1 hr ago');
    expect(ago(23 * H)).toBe('23 hr ago');
    expect(ago(D)).toBe('1 day ago');
    expect(ago(2 * D)).toBe('2 days ago');
    expect(ago(29 * D)).toBe('29 days ago');
    expect(ago(30 * D)).toBe('1 month ago');
    expect(ago(60 * D)).toBe('2 months ago');
    expect(ago(364 * D)).toBe('12 months ago');
    expect(ago(365 * D)).toBe('1 year ago');
    expect(ago(730 * D)).toBe('2 years ago');
    expect(longAgo(now + M, now)).toBe('just now');
  });

  it('builds the page status line', () => {
    expect(longStatusText(null, now)).toBe('');
    expect(longStatusText({ online: true, active: now - H }, now)).toBe('Online');
    expect(longStatusText({ online: false, active: now - 18 * M }, now)).toBe('Active 18 min ago');
    expect(longStatusText({ online: false, active: null }, now)).toBe('Offline');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run test/time.test.js`. Expected: FAIL, because `longAgo` is not exported.

- [ ] **Step 3: Implement.** Append to `src/time.js`:

```js
// The Friends page's wording, like the game's player lists: "18 min ago", "3 hr ago", "2 days ago".
export function longAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (d < 30) return unit(d, 'day');
  if (d < 365) return unit(Math.floor(d / 30), 'month');
  return unit(Math.floor(d / 365), 'year');
}

// info: { online, active: ms|null } from the presence cache.
export function longStatusText(info, now = Date.now()) {
  if (!info) return '';
  if (info.online) return 'Online';
  if (info.active) return `Active ${longAgo(info.active, now)}`;
  return 'Offline';
}
```

- [ ] **Step 4: Run it and confirm it passes.** Run `npx vitest run test/time.test.js`. Expected: PASS.

### Task 2: Private notes in state

**Files:**
- Modify: `src/state.js` (after `updateFriendInfo`)
- Test: `test/state.test.js`

- [ ] **Step 1: Write the failing test.** In `test/state.test.js`, add `setFriendNote,` and `MAX_NOTE,` to the import list from `'../src/state.js'`. Then add inside `describe('state', …)`:

```js
  it('sets, trims, caps and clears a friend note', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    expect(setFriendNote(s, 5, '  owes me 40 nails  ')).toBe(true);
    expect(s.friends[5].note).toBe('owes me 40 nails');
    expect(setFriendNote(s, 5, 'owes me 40 nails')).toBe(false);
    expect(setFriendNote(s, 5, 'x'.repeat(MAX_NOTE + 50))).toBe(true);
    expect(s.friends[5].note).toHaveLength(MAX_NOTE);
    expect(setFriendNote(s, 5, '   ')).toBe(true);
    expect('note' in s.friends[5]).toBe(false);
    expect(setFriendNote(s, 9, 'not a friend')).toBe(false);
    expect(s.friends[9]).toBeUndefined();
  });

  it('keeps notes through normalizeState, so older script versions never drop them', () => {
    const doc = normalizeState({ v: 1, friends: { 5: { id: 5, username: 'Spike', note: 'hi' } } });
    expect(doc.friends[5].note).toBe('hi');
  });
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run test/state.test.js`. Expected: FAIL, because `setFriendNote` is not a function.

- [ ] **Step 3: Implement.** In `src/state.js`, insert after `updateFriendInfo`:

```js
export const MAX_NOTE = 200;

// A friend's private note: trimmed and capped; an empty note removes the field. Returns whether it changed.
export function setFriendNote(state, id, note) {
  const f = state.friends[id];
  if (!f) return false;
  const text = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE).trim() : '';
  if ((f.note || '') === text) return false;
  if (text) f.note = text;
  else delete f.note;
  return true;
}
```

- [ ] **Step 4: Run it and confirm it passes.** Run `npx vitest run test/state.test.js`. Expected: PASS.

### Task 3: Notes in export/import

**Files:**
- Modify: `src/backup.js`, `src/ui/friends-window.js:95`, `src/app.js` (the `importFriends` action and its imports), `test/ui/services.js`
- Test: `test/backup.test.js`

- [ ] **Step 1: Write the failing test.** In `test/backup.test.js`, change the imports to:

```js
import { exportFriends, parseImport, mergeImport, importMessage } from '../src/backup.js';
import { emptyState, addFriend, setFriendNote, MAX_NOTE } from '../src/state.js';
```

Then add inside `describe('backup', …)`:

```js
  it('exports notes and imports them onto new friends, or onto existing friends without one', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    setFriendNote(s, 5, 'owes me nails');
    expect(JSON.parse(exportFriends(s, 77)).friends).toEqual([{ id: 5, username: 'Spike', note: 'owes me nails' }]);

    const target = emptyState();
    addFriend(target, { id: 6, username: 'Nyx' }, 0);
    addFriend(target, { id: 7, username: 'Moth' }, 0);
    setFriendNote(target, 7, 'keep mine');
    const file = JSON.stringify({
      v: 1,
      playerId: 77,
      friends: [
        { id: 5, username: 'Spike', note: 'owes me nails' },
        { id: 6, username: 'Nyx', note: '  sells ammo  ' },
        { id: 7, username: 'Moth', note: 'theirs' },
      ],
    });
    const r = parseImport(file, 77);
    expect(mergeImport(target, r.friends, 1)).toEqual({ added: 1, notes: 2 });
    expect(target.friends[5].note).toBe('owes me nails');
    expect(target.friends[6].note).toBe('sells ammo');
    expect(target.friends[7].note).toBe('keep mine');
  });

  it('drops non-string notes and caps long ones', () => {
    const text = JSON.stringify({ v: 1, playerId: 1, friends: [{ id: 3, username: 'A', note: 42 }, { id: 4, username: 'B', note: 'y'.repeat(300) }] });
    const r = parseImport(text, 1);
    expect(r.friends[0]).toEqual({ id: 3, username: 'A' });
    expect(r.friends[1].note).toHaveLength(MAX_NOTE);
  });

  it('describes an import', () => {
    expect(importMessage({ added: 1, notes: 0 })).toBe('Imported 1 new friend.');
    expect(importMessage({ added: 0, notes: 2 })).toBe('Imported 0 new friends and 2 notes.');
    expect(importMessage({ added: 3, notes: 1 })).toBe('Imported 3 new friends and 1 note.');
  });
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run test/backup.test.js`. Expected: FAIL, because `mergeImport` is not a function.

- [ ] **Step 3: Implement `src/backup.js`.** Replace the whole file with:

```js
import { toId } from './util.js';
import { addFriend, setFriendNote, MAX_NOTE } from './state.js';

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
    const note = typeof f.note === 'string' ? f.note.trim().slice(0, MAX_NOTE).trim() : '';
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
```

- [ ] **Step 4: Wire it in.**

In `src/ui/friends-window.js`, add the import `import { importMessage } from '../backup.js';` and change line 95 to:

```js
    toast(res.ok ? importMessage(res) : res.error, { error: !res.ok });
```

In `src/app.js`, change the backup import to `import { exportFriends, parseImport, mergeImport } from './backup.js';` and replace the `importFriends` action with:

```js
    importFriends(text) {
      const r = parseImport(text, playerId);
      if (!r.ok) return r;
      return { ok: true, ...store.update((s) => mergeImport(s, r.friends, now())) };
    },
```

In `test/ui/services.js`:
- change the imports to

  ```js
  import { addFriend, removeFriend, openDm, setDmOpen, closeDm, setFriendsOpen, setFriendNote } from '../../src/state.js';
  import { exportFriends, parseImport, mergeImport } from '../../src/backup.js';
  ```

- add this action after `removeFriend`:

  ```js
  setFriendNote: vi.fn((id, note) => store.update((s) => setFriendNote(s, id, note))),
  ```

- replace the `importFriends` action with:

  ```js
    importFriends: (text) => {
      const r = parseImport(text, ME);
      if (!r.ok) return r;
      return { ok: true, ...store.update((s) => mergeImport(s, r.friends, 0)) };
    },
  ```

- [ ] **Step 5: Run the tests and confirm they pass.** Run `npm test`. Expected: all PASS, including the untouched friends-window import tests.

- [ ] **Step 6: Commit tasks 1–3.**

```bash
git add src/time.js src/state.js src/backup.js src/app.js src/ui/friends-window.js test/time.test.js test/state.test.js test/backup.test.js test/ui/services.js
git commit -m "feat: private friend notes in state and backups, long-form last-active text" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Profile details in the presence cache

**Files:**
- Modify: `src/presence.js`
- Test: `test/presence.test.js`

- [ ] **Step 1: Write the failing tests.** In `test/presence.test.js`, change the import to `import { createPresence, lastActive, profileDetails } from '../src/presence.js';`. Then replace the test `'skips an id in the queue if set() already refreshed it before its turn'` with the version below. It now needs the id to already have profile details, because an entry without them is always stale:

```js
  it('skips an id in the queue if set() already refreshed it before its turn', async () => {
    let t = 0;
    const slow = (v) => new Promise((resolve) => setTimeout(() => resolve(v), 1000));
    const fetchProfile = vi.fn(() => slow({ ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, concurrency: 1, now: () => t });
    p.refresh([3]);
    await vi.advanceTimersByTimeAsync(2000); // 3 now has profile details
    t += 60000; // ...and is stale again
    fetchProfile.mockClear();
    p.refresh([1, 2, 3]);
    // 3 is still waiting behind 1 and 2 when a getChatInfo-style set() arrives for it.
    p.set(3, { online: true, active: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchProfile.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(p.get(3)).toMatchObject({ online: true });
  });
```

Add these tests inside the same `describe`:

```js
  it('keeps level, faction and injured/traveling from getProfile, and set() leaves them alone', async () => {
    const data = { online: true, rank: 27, faction: { id: 9, name: 'Ashfall', role: 'Member' }, is_injured: 1, traveling: false };
    const p = createPresence({ fetchProfile: () => Promise.resolve({ ok: true, data }) });
    p.refresh([5]);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.get(5).profile).toEqual({ level: 27, faction: { id: 9, name: 'Ashfall' }, injured: true, traveling: false });
    p.set(5, { online: false, active: 30 });
    expect(p.get(5)).toMatchObject({ online: false, profile: { level: 27 } });
  });

  it('treats an entry without profile details as stale, however fresh', () => {
    const p = createPresence({ fetchProfile: vi.fn() });
    p.set(5, { online: true });
    expect(p.isStale(5)).toBe(true);
  });

  it('checks staleness against a caller-given age', async () => {
    let t = 0;
    const p = createPresence({ fetchProfile: () => Promise.resolve({ ok: true, data: { online: true } }), now: () => t });
    p.refresh([5]);
    await vi.advanceTimersByTimeAsync(0);
    t = 2 * 60000;
    expect(p.isStale(5)).toBe(true);
    expect(p.isStale(5, 5 * 60000)).toBe(false);
  });

  it('reads profile details defensively', () => {
    expect(profileDetails({})).toEqual({ level: null, faction: null, injured: false, traveling: false });
    expect(profileDetails({ level: '12', faction: { id: 'x' }, traveling: { to: 'Outpost' } })).toEqual({ level: 12, faction: null, injured: false, traveling: true });
  });
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run test/presence.test.js`. Expected: FAIL, because `profileDetails` is not a function and `profile` is undefined.

- [ ] **Step 3: Implement.** In `src/presence.js`:

Change the util import to `import { toId, warnOnce } from './util.js';`. Add after `lastActive`:

```js
// Level, faction and the injured / traveling flags from a getProfile answer. The profile calls
// the level `rank`; `traveling` may be a boolean or an object, so any truthy value counts.
export function profileDetails(data) {
  const level = Number(data.rank ?? data.level);
  const f = data.faction && typeof data.faction === 'object' ? data.faction : null;
  const factionId = f ? toId(f.id) : null;
  return {
    level: Number.isFinite(level) && level > 0 ? level : null,
    faction: factionId ? { id: factionId, name: typeof f.name === 'string' ? f.name : '' } : null,
    injured: !!data.is_injured,
    traveling: !!data.traveling,
  };
}
```

Replace `store`, `set` and `isStale` with:

```js
  // info: anything with { online, active } (getProfile / getChatInfo entries). `at` is the
  // freshness timestamp to record; a refresh() fetch passes the time it queued the id, so a
  // slow response doesn't push the id's next scheduled refresh out past staleMs. `profile` comes
  // only with getProfile answers; a getChatInfo set() keeps the profile details already known.
  function store(id, info, at, profile) {
    if (!info || typeof info !== 'object') return;
    const prev = cache.get(id);
    cache.set(id, {
      online: !!info.online,
      active: lastActive(info.active, now()),
      fetchedAt: at,
      profile: profile || (prev && prev.profile) || null,
    });
    emit(id);
  }

  function set(id, info) {
    store(id, info, now());
  }

  // An entry without profile details is stale however fresh it is, so the Friends page's level
  // and faction fill in even for someone whose status so far only came from a DM header.
  function isStale(id, maxAgeMs = staleMs) {
    const c = cache.get(id);
    return !c || !c.profile || now() - c.fetchedAt >= maxAgeMs;
  }
```

In `pump()`, change `store(id, r.data, queuedAt);` to:

```js
            store(id, r.data, queuedAt, profileDetails(r.data));
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run test/presence.test.js`, then `npm test`. Expected: PASS.

### Task 5: Pure table builder

**Files:**
- Create: `src/friends-table.js`
- Test: `test/friends-table.test.js`

- [ ] **Step 1: Write the failing test.** Create `test/friends-table.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildFriendsTable, nextSort, countOnline, DEFAULT_SORT } from '../src/friends-table.js';

const NOW = 1800000000000;
const friends = {
  1: { id: 1, username: 'disamble', note: 'raid buddy' },
  2: { id: 2, username: 'Nyx', note: 'sells ammo' },
  3: { id: 3, username: 'Rustbucket', note: 'owes me nails' },
  4: { id: 4, username: 'Moth' },
  5: { id: 5, username: 'Hollow' },
};
const P = {
  1: { online: true, active: NOW, profile: { level: 27, faction: { id: 9, name: 'Ashfall' }, injured: false, traveling: false } },
  2: { online: true, active: NOW, profile: { level: 51, faction: { id: 8, name: 'Dust Rats' }, injured: false, traveling: true } },
  3: { online: false, active: NOW - 18 * 60000, profile: { level: 44, faction: null, injured: true, traveling: false } },
  4: { online: false, active: NOW - 2 * 86400000, profile: null },
};
const presence = (id) => P[id] || null;
const table = (opts = {}) => buildFriendsTable({ friends, presence, threads: { 3: { unread: 2 } }, ...opts });
const ids = (t) => t.rows.map((r) => r.id);

describe('friends table', () => {
  it('counts tabs over every friend and fills each row', () => {
    const t = table();
    expect(t.counts).toEqual({ all: 5, online: 2, offline: 3 });
    expect(t.rows.find((r) => r.id === 3)).toMatchObject({
      username: 'Rustbucket', note: 'owes me nails', unread: 2, presence: { online: false }, profile: { level: 44, injured: true },
    });
    expect(t.rows.find((r) => r.id === 5)).toMatchObject({ presence: null, profile: null, note: '', unread: 0 });
  });

  it('defaults to status order: online A-Z, then most recently active, unknown last', () => {
    expect(ids(table())).toEqual([1, 2, 3, 4, 5]);
    expect(ids(table({ sort: { key: 'status', dir: 'desc' } }))).toEqual([4, 3, 1, 2, 5]);
  });

  it('sorts by level, with unknown levels last both ways', () => {
    expect(ids(table({ sort: { key: 'level', dir: 'desc' } }))).toEqual([2, 3, 1, 5, 4]);
    expect(ids(table({ sort: { key: 'level', dir: 'asc' } }))).toEqual([1, 3, 2, 5, 4]);
  });

  it('sorts by faction A-Z, with no faction last', () => {
    expect(ids(table({ sort: { key: 'faction', dir: 'asc' } }))).toEqual([1, 2, 5, 4, 3]);
    expect(ids(table({ sort: { key: 'faction', dir: 'desc' } }))).toEqual([2, 1, 5, 4, 3]);
  });

  it('sorts by name, ignoring case', () => {
    expect(ids(table({ sort: { key: 'name', dir: 'asc' } }))).toEqual([1, 5, 4, 2, 3]);
    expect(ids(table({ sort: { key: 'name', dir: 'desc' } }))).toEqual([3, 2, 4, 5, 1]);
  });

  it('filters by tab and by a search over names and notes', () => {
    expect(ids(table({ tab: 'online' }))).toEqual([1, 2]);
    expect(ids(table({ tab: 'offline' }))).toEqual([3, 4, 5]);
    expect(ids(table({ query: 'AMMO' }))).toEqual([2]);
    expect(ids(table({ query: ' mo ' }))).toEqual([2, 4]);
    expect(table({ query: 'zzz' }).counts.all).toBe(5);
  });

  it('cycles sort direction per column, starting from each column\'s natural direction', () => {
    expect(nextSort(DEFAULT_SORT, 'level')).toEqual({ key: 'level', dir: 'desc' });
    expect(nextSort({ key: 'level', dir: 'desc' }, 'level')).toEqual({ key: 'level', dir: 'asc' });
    expect(nextSort({ key: 'level', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(nextSort(DEFAULT_SORT, 'status')).toEqual({ key: 'status', dir: 'desc' });
  });

  it('counts online friends for the top-bar badge', () => {
    expect(countOnline(friends, presence)).toBe(2);
    expect(countOnline({}, presence)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run test/friends-table.test.js`. Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement.** Create `src/friends-table.js`:

```js
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
export function buildFriendsTable({ friends, presence, threads = {}, tab = 'all', query = '', sort = DEFAULT_SORT }) {
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
  const inTab = all.filter((r) => tab === 'all' || (tab === 'online') === isOnline(r));
  const matches = (r) => !q || r.username.toLowerCase().includes(q) || r.note.toLowerCase().includes(q);
  return { rows: sortRows(inTab.filter(matches), sort), counts };
}

export function countOnline(friends, presence) {
  let n = 0;
  for (const f of Object.values(friends)) {
    const p = presence(f.id);
    if (p && p.online) n += 1;
  }
  return n;
}
```

- [ ] **Step 4: Run it and confirm it passes.** Run `npx vitest run test/friends-table.test.js`. Expected: PASS.

- [ ] **Step 5: Commit tasks 4–5.**

```bash
git add src/presence.js src/friends-table.js test/presence.test.js test/friends-table.test.js
git commit -m "feat: presence keeps level/faction/status details; pure Friends table builder" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Shared mount keeper

**Files:**
- Create: `src/ui/keeper.js`
- Modify: `src/ui/dock.js`
- Test: `test/ui/keeper.test.js` (the existing `test/ui/dock.test.js` must still pass unchanged)

- [ ] **Step 1: Write the failing test.** Create `test/ui/keeper.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKeeper } from '../../src/ui/keeper.js';
import { flush } from '../helpers.js';

describe('keeper', () => {
  let keeper;
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(cb, 0)));
  });
  afterEach(() => {
    keeper.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-attaches a detached mount once per frame, however many mutations', async () => {
    keeper = createKeeper();
    const node = document.createElement('span');
    const ensure = vi.fn(() => document.getElementById('host').appendChild(node));
    keeper.add({ name: 'x', attached: () => node.isConnected, ensure });
    for (let i = 0; i < 5; i += 1) document.body.appendChild(document.createElement('p'));
    await flush();
    await flush();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(node.isConnected).toBe(true);
  });

  it('does no work while every mount is attached', async () => {
    keeper = createKeeper();
    keeper.add({ name: 'x', attached: () => true, ensure: vi.fn() });
    document.body.appendChild(document.createElement('p'));
    await flush();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('forgets a removed mount, and contains errors thrown by ensure()', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    keeper = createKeeper();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const gone = vi.fn();
    keeper.add({ name: 'bad-mount', attached: () => false, ensure: bad });
    const remove = keeper.add({ name: 'gone', attached: () => false, ensure: gone });
    remove();
    document.body.appendChild(document.createElement('p'));
    await flush();
    await flush();
    expect(bad).toHaveBeenCalled();
    expect(gone).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run test/ui/keeper.test.js`. Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement.** Create `src/ui/keeper.js`:

```js
// One body-level MutationObserver for everything we mount into DOM the game's Vue app owns (the chat
// dock root, the top-bar button, the Friends page). Each mount's attached() must be an O(1) check that
// returns true when there's nothing to do; ensure() then runs at most once per animation frame, and only
// while some mount reports it's detached.
import { safe } from '../util.js';

export function createKeeper({ doc = document, win = window } = {}) {
  const mounts = new Set();
  let observer = null;
  let frame = 0;

  function runDetached() {
    for (const m of [...mounts]) if (!m.attached()) safe(`keeper-${m.name}`, m.ensure)();
  }

  function onMutations() {
    if (frame) return;
    for (const m of mounts) {
      if (m.attached()) continue;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        runDetached();
      });
      return;
    }
  }

  return {
    // mount: { name, attached: () => boolean, ensure: () => void }. Returns a function that removes it.
    add(mount) {
      mounts.add(mount);
      if (!observer) {
        observer = new win.MutationObserver(safe('keeper-observer', onMutations));
        observer.observe(doc.body, { childList: true, subtree: true });
      }
      return () => mounts.delete(mount);
    },
    destroy() {
      if (observer) observer.disconnect();
      observer = null;
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      mounts.clear();
    },
  };
}
```

- [ ] **Step 4: Move the dock onto it.** In `src/ui/dock.js`:

Add `import { createKeeper } from './keeper.js';`. Change the signature to:

```js
export function createDock({ doc = document, win = window, keeper = null, onGameChatOpened = () => {} } = {}) {
```

Replace `let frame = 0;` with:

```js
  // The app passes its shared keeper; standalone (tests) the dock keeps its own.
  const ownKeeper = keeper ? null : createKeeper({ doc, win });
  const keep = keeper || ownKeeper;
  let unkeep = null;
```

Delete the whole `const bodyObserver = new win.MutationObserver(...)` block, along with its comment. Replace `start()` and `destroy()` in the returned object with:

```js
    start() {
      ensure();
      if (!unkeep) unkeep = keep.add({ name: 'dock', attached: () => root.isConnected, ensure });
    },
    destroy() {
      if (unkeep) unkeep();
      unkeep = null;
      if (ownKeeper) ownKeeper.destroy();
      classObserver.disconnect();
      dockEl = null;
      for (const unsubscribe of [...smallChangeUnsubs]) unsubscribe();
      root.remove();
    },
```

- [ ] **Step 5: Run the tests and confirm they pass.** Run `npx vitest run test/ui/keeper.test.js test/ui/dock.test.js`, then `npm test`. Expected: PASS. That includes the dock's "re-mounts when the game rebuilds the dock" test.

### Task 7: Top-bar Friends button

**Files:**
- Create: `src/ui/topbar-button.js`
- Modify: `test/fixtures/game-dom.js` (append)
- Test: `test/ui/topbar-button.test.js`

Note: `topbar-button.js` imports `FRIENDS_PATH` from `./friends-page.js`, which Task 8 creates. Do Task 8 Step 3 first, or temporarily create `src/ui/friends-page.js` containing only `export const FRIENDS_PATH = '/friends';` and let Task 8 replace it.

- [ ] **Step 1: Add the fixtures.** Append to `test/fixtures/game-dom.js`:

```js
const roundBtn = (href, iconClass, count) =>
  `<div><a class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--round ${count ? 'text-grey-4' : 'text-grey-7'} q-btn--actionable q-focusable q-hoverable" tabindex="0" href="${href}" style="font-size: 10px;"><span class="q-focus-helper"></span><span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon fal ${iconClass}" aria-hidden="true" role="img"></i>${count ? `<div class="q-badge flex inline items-center no-wrap q-badge--single-line bg-red-5 text-white q-badge--floating q-badge--rounded" role="status">${count}</div>` : ''}</span></a></div>`;

// The logged-in layout's header, trimmed to the right-hand icon group: [Mail][Notifications][Profile menu].
export const HEADER_HTML = `
<header class="q-header q-layout__section--marginal fixed-top text-white q-pt-xs">
  <div class="q-toolbar row no-wrap items-center">
    <div class="col row items-center">
      <div class="no-wrap col-xs-4 order-xs-first order-sm-none col-sm-auto">
        <div class="full-width q-gutter-xs row items-center justify-end">
          ${roundBtn('/mail', 'fa-envelope', 2)}
          ${roundBtn('/notifications', 'fa-bell', 0)}
          <div><button class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--rectangle q-btn--dense profile-menu" type="button"><span class="q-btn__content"><i class="q-icon fas fa-caret-down" aria-hidden="true"></i></span></button></div>
        </div>
      </div>
    </div>
  </div>
</header>`;

// The page slot while the layout's catch-all 404 route is showing (any unknown path, e.g. /friends).
export const PAGE_404_HTML = '<div class="q-page-container"><div class="fixed-center text-center"><p class="text-faded">Sorry, nothing here...</p></div></div>';
```

- [ ] **Step 2: Write the failing test.** Create `test/ui/topbar-button.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTopbarButton } from '../../src/ui/topbar-button.js';
import { createKeeper } from '../../src/ui/keeper.js';
import { HEADER_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

describe('top-bar Friends button', () => {
  let btn;
  let keeper;
  let router;
  beforeEach(() => {
    document.body.innerHTML = HEADER_HTML;
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    keeper = createKeeper();
    router = { navigate: vi.fn() };
  });
  afterEach(() => {
    btn.destroy();
    keeper.destroy();
    vi.unstubAllGlobals();
  });

  const mount = () => {
    btn = createTopbarButton({ keeper, router });
    btn.start();
    return document.querySelector('.zcf-topbar');
  };
  // Reads defaultPrevented after our handler ran, then stops jsdom from trying to follow the link.
  const clickAndCheck = (target, init) => {
    let prevented;
    document.addEventListener('click', (e) => {
      prevented = e.defaultPrevented;
      e.preventDefault();
    }, { once: true });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    return prevented;
  };

  it('sits just left of mail, cloned from it, without the mail count', () => {
    const wrap = mount();
    expect(wrap.nextElementSibling).toBe(document.querySelector('a[href="/mail"]').parentElement);
    const a = wrap.querySelector('a.q-btn');
    expect(a.getAttribute('href')).toBe('/friends');
    expect(a.classList.contains('q-btn--round')).toBe(true);
    expect(a.querySelector('i').className).toBe('q-icon fal fa-user-friends');
    expect(a.querySelector('.bg-red-5')).toBeNull();
  });

  it('shows how many friends are online, hidden at zero, colored like the mail button', () => {
    const a = mount().querySelector('a');
    const badgeEl = a.querySelector('.zcf-topbar-badge');
    expect(badgeEl.hidden).toBe(true);
    expect(a.classList.contains('text-grey-7')).toBe(true);
    btn.setCount(4);
    expect(badgeEl.hidden).toBe(false);
    expect(badgeEl.textContent).toBe('4');
    expect(a.classList.contains('text-grey-4')).toBe(true);
    expect(a.classList.contains('text-grey-7')).toBe(false);
    expect(a.getAttribute('aria-label')).toBe('Friends (4 online)');
  });

  it('navigates in-app on a plain click and leaves modified clicks to the browser', () => {
    const a = mount().querySelector('a');
    expect(clickAndCheck(a)).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith('/friends');
    expect(clickAndCheck(a, { ctrlKey: true })).toBe(false);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('comes back after the game rebuilds its header', async () => {
    mount();
    btn.setCount(2);
    document.body.innerHTML = HEADER_HTML;
    await flush();
    await flush();
    const wrap = document.querySelector('.zcf-topbar');
    expect(wrap).not.toBeNull();
    expect(wrap.nextElementSibling.querySelector('a').getAttribute('href')).toBe('/mail');
    expect(wrap.querySelector('.zcf-topbar-badge').textContent).toBe('2');
  });

  it('does nothing when the page has no top bar', () => {
    document.body.innerHTML = '<div id="q-app"></div>';
    expect(() => mount()).not.toThrow();
    expect(document.querySelector('.zcf-topbar')).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails.** Run `npx vitest run test/ui/topbar-button.test.js`. Expected: FAIL, because the module isn't found.

- [ ] **Step 4: Implement.** Create `src/ui/topbar-button.js`:

```js
// The Friends button in the game's top bar: a clone of the game's own mail button (so it matches
// exactly), left of mail, with a green count of friends online (spec §3).
import { h } from './dom.js';
import { safe, warnOnce } from '../util.js';
import { FRIENDS_PATH } from './friends-page.js';

const MAIL_SELECTOR = 'header a.q-btn[href="/mail"]';
const WARN_MS = 10000;

export function createTopbarButton({ doc = document, keeper = null, router }) {
  let wrap = null;
  let button = null;
  let badgeEl = null;
  let count = 0;
  let unkeep = null;
  let warnTimer = null;

  function render() {
    if (!button) return;
    badgeEl.textContent = String(count);
    badgeEl.hidden = count < 1;
    // Same rule as the game's mail button: brighter when there's something to see.
    button.classList.toggle('text-grey-4', count >= 1);
    button.classList.toggle('text-grey-7', count < 1);
    const label = `Friends (${count} online)`;
    button.setAttribute('title', label);
    button.setAttribute('aria-label', label);
  }

  function onClick(e) {
    // Middle and modified clicks keep the browser default (open /friends in a new tab), like any link.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.navigate(FRIENDS_PATH);
  }

  function build(mail) {
    button = mail.cloneNode(true);
    for (const b of button.querySelectorAll('.q-badge')) b.remove();
    button.setAttribute('href', FRIENDS_PATH);
    const i = button.querySelector('i');
    if (i) {
      for (const c of [...i.classList]) if (/^fa-/.test(c)) i.classList.remove(c);
      i.classList.add('fa-user-friends');
    }
    badgeEl = h('div', {
      class: 'q-badge flex inline items-center no-wrap q-badge--single-line q-badge--floating q-badge--rounded bg-positive text-white zcf-topbar-badge',
      hidden: true,
    });
    (button.querySelector('.q-btn__content') || button).appendChild(badgeEl);
    button.addEventListener('click', safe('topbar-click', onClick));
    wrap = h('div', { class: 'zcf-topbar' }, button);
  }

  function ensure() {
    if (wrap && wrap.isConnected) return;
    const mail = doc.querySelector(MAIL_SELECTOR);
    const mailWrap = mail && mail.parentElement;
    if (!mailWrap || !mailWrap.parentElement) return;
    if (!wrap) build(mail);
    mailWrap.before(wrap);
    render();
  }

  return {
    start() {
      ensure();
      if (!unkeep && keeper) unkeep = keeper.add({ name: 'topbar', attached: () => !!(wrap && wrap.isConnected), ensure });
      clearTimeout(warnTimer);
      warnTimer = setTimeout(() => {
        if (!wrap || !wrap.isConnected) warnOnce('topbar-mail-button-not-found');
      }, WARN_MS);
    },
    setCount(n) {
      if (n === count) return;
      count = n;
      render();
    },
    destroy() {
      clearTimeout(warnTimer);
      if (unkeep) unkeep();
      unkeep = null;
      if (wrap) wrap.remove();
    },
  };
}
```

- [ ] **Step 5: Run it and confirm it passes.** Run `npx vitest run test/ui/topbar-button.test.js`. Expected: PASS. It depends on Task 8's `FRIENDS_PATH` export (see the note at the top of this task).

### Task 8: The Friends page

**Files:**
- Create: `src/ui/friends-page.js`
- Test: `test/ui/friends-page.test.js`

- [ ] **Step 1: Write the failing test.** Create `test/ui/friends-page.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFriendsPage, hideGame404Early, PAGE_CLASS } from '../../src/ui/friends-page.js';
import { createKeeper } from '../../src/ui/keeper.js';
import { addFriend, setFriendNote } from '../../src/state.js';
import { makeServices } from './services.js';
import { PAGE_404_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

const NOW = Date.now();
const FRIENDS = [
  { id: 1, username: 'Disamble', note: 'raid buddy' },
  { id: 2, username: 'Nyx' },
  { id: 3, username: 'Rustbucket', note: 'owes me nails' },
];
const presenceFixture = () => ({
  1: { online: true, active: NOW, profile: { level: 27, faction: { id: 9, name: 'Ashfall' }, injured: false, traveling: false } },
  2: { online: true, active: NOW, profile: { level: 51, faction: null, injured: false, traveling: true } },
  3: { online: false, active: NOW - 18 * 60000, profile: { level: 44, faction: { id: 8, name: 'Iron Veil' }, injured: true, traveling: false } },
});

let current = null;
function mount({ friends = [], presence = {}, threads = {} } = {}) {
  document.body.innerHTML = PAGE_404_HTML;
  const services = makeServices({ presence });
  services.store.update((s) => {
    for (const f of friends) {
      addFriend(s, f, 0);
      if (f.note) setFriendNote(s, f.id, f.note);
    }
    s.threads = threads;
  });
  const keeper = createKeeper();
  const page = createFriendsPage(services, { keeper });
  page.start();
  services.store.subscribe(() => page.scheduleRender());
  page.onRoute('/friends');
  current = { services, page, keeper };
  return current;
}

const row = (id) => document.querySelector(`.zcf-page-row[data-id="${id}"]`);
const names = () => [...document.querySelectorAll('.zcf-page-row .zcf-chip-name')].map((n) => n.textContent);
const byText = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.startsWith(text));

describe('friends page', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  });
  afterEach(() => {
    if (current) {
      current.page.destroy();
      current.keeper.destroy();
    }
    current = null;
    document.documentElement.classList.remove(PAGE_CLASS);
    document.getElementById('zcf-early-styles')?.remove();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it('draws the page in the 404 slot on /friends, and removes it on leave', () => {
    const { page } = mount();
    const slot = document.querySelector('.q-page-container');
    expect(slot.querySelector('main.zcf-page')).not.toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(true);
    page.onRoute('/city');
    expect(slot.querySelector('main.zcf-page')).toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(false);
  });

  it('puts itself back when the game rebuilds the page slot', async () => {
    mount();
    document.body.innerHTML = PAGE_404_HTML;
    await flush();
    await flush();
    expect(document.querySelector('.q-page-container main.zcf-page')).not.toBeNull();
  });

  it('lists friends with level, status, icons, faction, note and unread count', () => {
    mount({ friends: FRIENDS, presence: presenceFixture(), threads: { 3: { unread: 2 } } });
    expect(names()).toEqual(['Disamble', 'Nyx', 'Rustbucket']);
    expect(document.querySelector('.zcf-page-sub').textContent).toBe('2 of 3 online');
    const r3 = row(3);
    expect(r3.querySelector('.zcf-col-level').textContent).toBe('44');
    expect(r3.querySelector('.zcf-st-off').textContent).toBe('Active 18 min ago');
    expect(r3.querySelector('.fa-skull-crossbones').getAttribute('title')).toBe('Injured');
    expect(r3.querySelector('.zcf-fac').getAttribute('href')).toBe('/faction/8');
    expect(r3.querySelector('.zcf-note').textContent).toBe('owes me nails');
    expect(r3.querySelector('.zcf-act-msg .zcf-pill').textContent).toBe('2');
    expect(row(2).querySelector('.fa-directions').getAttribute('title')).toBe('Travelling');
    expect(row(2).querySelector('.zcf-col-faction').textContent).toBe('—');
  });

  it('shows placeholders until a friend\'s profile loads', () => {
    mount({ friends: [{ id: 4, username: 'Moth' }] });
    expect(row(4).querySelector('.zcf-st-unknown').textContent).toBe('…');
    expect(row(4).querySelector('.zcf-col-level').textContent).toBe('—');
    expect(row(4).querySelector('.zcf-note').textContent).toBe('Add a note');
  });

  it('filters by tab and search, and sorts by clicking headers', () => {
    mount({ friends: FRIENDS, presence: presenceFixture() });
    expect(byText('.zcf-page-tab', 'Offline').textContent).toBe('Offline1');
    byText('.zcf-page-tab', 'Offline').click();
    expect(names()).toEqual(['Rustbucket']);
    byText('.zcf-page-tab', 'All').click();
    const input = document.querySelector('.zcf-page-input');
    input.value = 'NAILS';
    input.dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Rustbucket']);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    byText('.zcf-page-sort', 'Level').click();
    expect(names()).toEqual(['Nyx', 'Rustbucket', 'Disamble']);
    byText('.zcf-page-sort', 'Level').click();
    expect(names()).toEqual(['Disamble', 'Rustbucket', 'Nyx']);
    expect(byText('.zcf-page-sort', 'Level').closest('th').getAttribute('aria-sort')).toBe('ascending');
  });

  it('explains an empty list, a search with no match and an empty tab', () => {
    mount();
    expect(document.querySelector('.zcf-page-empty').textContent).toBe("No friends yet. Use Add friend above, or Add Friend on a player's profile.");
    expect(document.querySelector('.zcf-page-table').hidden).toBe(true);
    current.page.destroy();
    current.keeper.destroy();
    mount({ friends: [{ id: 3, username: 'Rustbucket' }], presence: { 3: presenceFixture()[3] } });
    byText('.zcf-page-tab', 'Online').click();
    expect(document.querySelector('.zcf-page-empty').textContent).toBe('No friends online right now.');
    byText('.zcf-page-tab', 'All').click();
    const input = document.querySelector('.zcf-page-input');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    expect(document.querySelector('.zcf-page-empty').textContent).toBe('No friends match "zzz".');
  });

  it('Message opens the DM window in the dock', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(1).querySelector('.zcf-act-msg').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(1, { expand: true, username: 'Disamble', avatar: null });
  });

  it('links names to profiles and factions to faction pages, in-app', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    row(1).querySelector('.zcf-chip').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(services.router.navigate).toHaveBeenCalledWith('/profile/1');
    row(1).querySelector('.zcf-fac').click();
    expect(services.router.navigate).toHaveBeenCalledWith('/faction/9');
  });

  it('edits a note inline: Enter saves, Esc cancels, clicking away saves', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(2).querySelector('.zcf-note').click();
    let input = row(2).querySelector('.zcf-note-input');
    expect(document.activeElement).toBe(input);
    input.value = '  sells ammo  ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(services.store.get().friends[2].note).toBe('sells ammo');
    expect(row(2).querySelector('.zcf-note').textContent).toBe('sells ammo');
    expect(document.activeElement).toBe(row(2).querySelector('[title="Edit note"]'));

    row(2).querySelector('[title="Edit note"]').click();
    input = row(2).querySelector('.zcf-note-input');
    input.value = 'changed my mind';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(services.store.get().friends[2].note).toBe('sells ammo');
    expect(row(2).querySelector('.zcf-note-input')).toBeNull();

    row(2).querySelector('.zcf-note').click();
    input = row(2).querySelector('.zcf-note-input');
    input.value = '';
    input.blur();
    expect('note' in services.store.get().friends[2]).toBe(false);
  });

  it('opening a second note editor saves the first', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(1).querySelector('.zcf-note').click();
    row(1).querySelector('.zcf-note-input').value = 'first';
    row(3).querySelector('.zcf-note').click();
    expect(services.store.get().friends[1].note).toBe('first');
    expect(document.querySelectorAll('.zcf-note-input')).toHaveLength(1);
    expect(row(3).querySelector('.zcf-note-input')).not.toBeNull();
  });

  it('keeps an open note editor, its draft and focus through a redraw that moves its row', () => {
    const presence = presenceFixture();
    const { page } = mount({ friends: FRIENDS, presence });
    row(3).querySelector('.zcf-note').click();
    const input = row(3).querySelector('.zcf-note-input');
    input.value = 'half-typed';
    presence[2] = { ...presence[2], online: false, active: NOW - 3 * 86400000 };
    page.render();
    expect(names()).toEqual(['Disamble', 'Rustbucket', 'Nyx']);
    expect(row(3).querySelector('.zcf-note-input')).toBe(input);
    expect(input.value).toBe('half-typed');
    expect(document.activeElement).toBe(input);
  });

  it('asks before removing, and moves focus sensibly', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(2).querySelector('[title="Remove"]').click();
    expect(row(2).classList.contains('zcf-page-confirm')).toBe(true);
    expect(row(2).textContent).toContain('Remove Nyx from your friends?');
    expect(document.activeElement.textContent).toBe('Cancel');
    document.activeElement.click();
    expect(row(2).classList.contains('zcf-page-confirm')).toBe(false);
    expect(document.activeElement).toBe(row(2).querySelector('[title="Remove"]'));
    row(2).querySelector('[title="Remove"]').click();
    [...row(2).querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
    expect(services.store.get().friends[2]).toBeUndefined();
    expect(row(2)).toBeNull();
    expect(document.activeElement).toBe(row(3).querySelector('.zcf-chip'));
  });

  it('has a ⋯ menu with Profile, Edit note and Remove that closes on an outside click', () => {
    const { services } = mount({ friends: FRIENDS, presence: presenceFixture() });
    row(1).querySelector('.zcf-act-more').click();
    expect([...row(1).querySelectorAll('.zcf-page-menu button')].map((b) => b.textContent)).toEqual(['Profile', 'Edit note', 'Remove']);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(row(1).querySelector('.zcf-page-menu')).toBeNull();
    row(1).querySelector('.zcf-act-more').click();
    row(1).querySelector('.zcf-page-menu button').click();
    expect(services.router.navigate).toHaveBeenCalledWith('/profile/1');
  });

  it('opens the add-friend search under its button', () => {
    mount();
    const btn = document.querySelector('.zcf-page-add');
    btn.click();
    expect(document.querySelector('.zcf-page .zcf-pop').hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders names and notes as text, never HTML', () => {
    mount({ friends: [{ id: 7, username: '<b>x</b>', note: '<img src=x onerror=alert(1)>' }] });
    expect(row(7).querySelector('.zcf-chip-name').innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(row(7).querySelector('img[src="x"]')).toBeNull();
    expect(row(7).querySelector('.zcf-note').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('hides the game 404 before login on a direct load of /friends', () => {
    window.history.replaceState({}, '', '/friends');
    expect(hideGame404Early(document, window)).toBe(true);
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(true);
    expect(document.getElementById('zcf-early-styles').textContent).toContain('.q-page-container > .fixed-center');
    window.history.replaceState({}, '', '/');
    expect(hideGame404Early(document, window)).toBe(false);
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run test/ui/friends-page.test.js`. Expected: FAIL, because `createFriendsPage` is not exported.

- [ ] **Step 3: Implement.** Create `src/ui/friends-page.js`:

```js
// The Friends page at /friends: a game-style table of your friends (spec §4), drawn in the slot where
// the game's logged-in layout shows its catch-all 404 for a path it doesn't know.
import { h, clear, append, icon, avatar, highlightMatch } from './dom.js';
import { createAddFriendPopover } from './add-friend-popover.js';
import { buildFriendsTable, nextSort, DEFAULT_SORT } from '../friends-table.js';
import { isFriend, MAX_NOTE } from '../state.js';
import { longStatusText } from '../time.js';
import { safe, warnOnce } from '../util.js';

export const FRIENDS_PATH = '/friends';
export const PAGE_CLASS = 'zcf-on-friends';
// Hides the game's "Sorry, nothing here..." while we're on /friends.
export const HIDE_404_CSS = `html.${PAGE_CLASS} .q-page-container > .fixed-center{display:none!important}`;
const WARN_MS = 10000;

export const isFriendsPath = (path) => path === FRIENDS_PATH || path === `${FRIENDS_PATH}/`;

// Runs at script start, before login is known (main.js), so a direct load or refresh of /friends
// never flashes the game's 404: adds the hide rule, and the <html> class when we're on /friends.
export function hideGame404Early(doc = document, win = window) {
  if (!doc.getElementById('zcf-early-styles')) {
    const style = doc.createElement('style');
    style.id = 'zcf-early-styles';
    style.textContent = HIDE_404_CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }
  const on = isFriendsPath(win.location.pathname);
  doc.documentElement.classList.toggle(PAGE_CLASS, on);
  return on;
}

const TABS = [['all', 'All'], ['online', 'Online'], ['offline', 'Offline']];
const COLUMNS = [
  { col: 'name', label: 'Name', sort: 'name' },
  { col: 'level', label: 'Level', sort: 'level' },
  { col: 'status', label: 'Status', sort: 'status' },
  { col: 'faction', label: 'Faction', sort: 'faction' },
  { col: 'note', label: 'Note' },
  { col: 'act', label: '' },
];

// A plain left click is handled in-app; middle and modified clicks stay normal link clicks (new tab).
const plainClick = (e) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

export function createFriendsPage(services, { doc = document, win = window, keeper = null } = {}) {
  const { store, actions, presence, players, router, toast } = services;
  let active = false;
  let tab = 'all';
  let query = '';
  let sort = DEFAULT_SORT;
  let editId = null;
  let editInput = null;
  let confirmId = null;
  let menuId = null;
  let rendering = false;
  let frame = 0;
  let headSig = null;
  let currentIds = [];
  let unkeep = null;
  let warnTimer = null;
  const rowEls = new Map(); // id -> { sig, el }: rows are reused while what they show is unchanged

  const link = (href, className, children, extra = {}) => h('a', {
    class: className,
    href,
    onclick: (e) => {
      if (!plainClick(e)) return;
      e.preventDefault();
      router.navigate(href);
    },
    ...extra,
  }, children);

  const subtitle = h('div', { class: 'zcf-page-sub' });
  const addBtn = h('button', { class: 'zcf-page-add', type: 'button', 'aria-expanded': 'false' },
    icon('plus'), h('span', { class: 'zcf-page-add-long' }, 'Add friend'), h('span', { class: 'zcf-page-add-short' }, 'Add'));
  const pop = createAddFriendPopover({
    players,
    isFriend: (id) => isFriend(store.get(), id),
    onAdd: (p) => {
      actions.addFriend(p);
      toast(`${p.username} added to friends`);
    },
    onClose: () => syncAddBtn(),
  });
  const title = h('div', { class: 'zcf-page-title' },
    h('div', { class: 'zcf-page-side' }, link('/city', 'zcf-page-back', [icon('chevron-left'), 'City'])),
    h('div', { class: 'zcf-page-mid' }, h('div', { class: 'text-h4 text-uppercase text-no-bg zcf-page-h' }, 'Friends'), subtitle),
    h('div', { class: 'zcf-page-side zcf-page-side-r' }, h('div', { class: 'zcf-page-addwrap' }, addBtn, pop.el)));

  const tabEls = new Map();
  for (const [key, label] of TABS) {
    const count = h('b');
    const b = h('button', {
      class: 'zcf-page-tab',
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => {
        tab = key;
        render();
      },
    }, label, count);
    tabEls.set(key, { b, count });
  }
  const search = h('input', { class: 'zcf-page-input', type: 'text', placeholder: 'Search names and notes…', 'aria-label': 'Search friends' });
  const bar = h('div', { class: 'zcf-page-bar' },
    h('div', { class: 'zcf-page-tabs' }, [...tabEls.values()].map((t) => t.b)),
    h('label', { class: 'zcf-page-search' }, icon('search'), search));
  const headRow = h('tr');
  const tbody = h('tbody');
  const table = h('table', { class: 'zcf-page-table' }, h('thead', null, headRow), tbody);
  const empty = h('div', { class: 'zcf-page-empty', hidden: true });
  const el = h('main', { class: 'q-page q-layout-padding zcf zcf-page' }, title, bar, h('div', { class: 'zcf-page-panel' }, table, empty));

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.isOpen) pop.close();
    else pop.open();
    syncAddBtn();
  });

  function syncAddBtn() {
    addBtn.setAttribute('aria-expanded', String(pop.isOpen));
    addBtn.classList.toggle('zcf-page-add-on', pop.isOpen);
  }

  function onDocMousedown(e) {
    if (pop.isOpen && !pop.el.contains(e.target) && !addBtn.contains(e.target)) pop.close();
    if (menuId !== null && !(e.target.closest && e.target.closest('.zcf-page-menu, .zcf-act-more'))) {
      menuId = null;
      render();
    }
  }

  // Focuses the first of `keys` (data-zcf-focus values) that can take focus; on phones some are hidden.
  function focusKey(...keys) {
    for (const key of keys) {
      const target = el.querySelector(`[data-zcf-focus="${key}"]`);
      if (!target) continue;
      target.focus();
      if (doc.activeElement === target) return;
    }
  }

  function startEdit(id) {
    if (editId === id) return;
    commitEdit();
    const f = store.get().friends[id];
    if (!f) return;
    menuId = null;
    confirmId = null;
    editId = id;
    editInput = h('input', { class: 'zcf-note-input', type: 'text', maxlength: MAX_NOTE, value: f.note || '', 'aria-label': `Note for ${f.username}` });
    editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit({ refocus: true });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit();
      }
    });
    // Clicking away saves. A blur caused by our own redraw moving the row doesn't.
    editInput.addEventListener('blur', () => {
      if (!rendering) commitEdit();
    });
    render();
    editInput.focus();
    const end = editInput.value.length;
    editInput.setSelectionRange(end, end);
  }

  function commitEdit({ refocus = false } = {}) {
    if (editId === null) return;
    const id = editId;
    const text = editInput.value;
    editId = null;
    editInput = null;
    actions.setFriendNote(id, text);
    render();
    if (refocus) focusKey(`edit:${id}`, `more:${id}`);
  }

  function cancelEdit() {
    if (editId === null) return;
    const id = editId;
    editId = null;
    editInput = null;
    render();
    focusKey(`edit:${id}`, `more:${id}`);
  }

  function askRemove(id) {
    commitEdit();
    menuId = null;
    confirmId = id;
    render();
    focusKey(`cancel:${id}`);
  }

  function cancelRemove(id) {
    confirmId = null;
    render();
    focusKey(`remove:${id}`, `more:${id}`);
  }

  function doRemove(id) {
    const i = currentIds.indexOf(id);
    const next = currentIds[i + 1] ?? currentIds[i - 1];
    confirmId = null;
    actions.removeFriend(id);
    render();
    if (next !== undefined) focusKey(`name:${next}`);
  }

  function renderHead() {
    const sig = `${sort.key}:${sort.dir}`;
    if (sig === headSig) return;
    headSig = sig;
    clear(headRow);
    for (const c of COLUMNS) {
      if (!c.sort) {
        headRow.appendChild(h('th', { class: `zcf-col-${c.col}` }, c.label));
        continue;
      }
      const on = sort.key === c.sort;
      headRow.appendChild(h('th', { class: `zcf-col-${c.col}`, 'aria-sort': on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', {
          class: `zcf-page-sort${on ? ' zcf-page-sort-on' : ''}`,
          type: 'button',
          'data-zcf-focus': `sort:${c.sort}`,
          onclick: () => {
            sort = nextSort(sort, c.sort);
            render();
            focusKey(`sort:${c.sort}`);
          },
        }, c.label, on ? h('span', { class: 'zcf-page-arrow', 'aria-hidden': 'true' }, sort.dir === 'asc' ? '▲' : '▼') : null)));
    }
  }

  // Everything a row shows, so an unchanged row keeps its nodes (and focus) across redraws.
  function rowSig(r, now) {
    if (confirmId === r.id) return JSON.stringify(['confirm', r.id, r.username]);
    if (editId === r.id) return JSON.stringify(['edit', r.id]);
    return JSON.stringify([r.id, r.username, r.avatar, r.note, r.unread, !!r.presence, longStatusText(r.presence, now), r.profile, menuId === r.id, query.trim()]);
  }

  function confirmRow(r) {
    return h('tr', { class: 'zcf-page-row zcf-page-confirm', dataset: { id: String(r.id) } },
      h('td', { colspan: String(COLUMNS.length) },
        h('div', {
          class: 'zcf-confirm',
          onkeydown: (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            cancelRemove(r.id);
          },
        },
        h('span', { class: 'zcf-confirm-text' }, `Remove ${r.username} from your friends?`),
        h('button', { class: 'zcf-page-btn zcf-page-danger', type: 'button', 'data-zcf-focus': `confirm:${r.id}`, onclick: () => doRemove(r.id) }, 'Remove'),
        h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': `cancel:${r.id}`, onclick: () => cancelRemove(r.id) }, 'Cancel'))));
  }

  function buildRow(r, now) {
    if (confirmId === r.id) return confirmRow(r);
    const online = !!(r.presence && r.presence.online);
    const p = r.profile;
    const level = p && p.level ? String(p.level) : '—';
    const meta = [`Lv ${level}`, p && p.faction ? p.faction.name : null].filter(Boolean).join(' · ');

    const nameCell = h('td', { class: 'zcf-col-name' },
      link(`/profile/${r.id}`, 'zcf-chip', [
        avatar({ avatar: r.avatar, online: r.presence ? online : undefined, size: 24 }),
        h('span', { class: 'zcf-chip-name' }, highlightMatch(r.username, query)),
      ], { 'data-zcf-focus': `name:${r.id}`, title: r.username }),
      h('div', { class: 'zcf-c-sub' }, meta),
      r.note ? h('div', { class: 'zcf-c-sub zcf-c-subnote' }, r.note) : null);

    const statusCell = h('td', { class: 'zcf-col-status' },
      h('span', { class: r.presence ? (online ? 'zcf-st-on' : 'zcf-st-off') : 'zcf-st-unknown' }, r.presence ? longStatusText(r.presence, now) : '…'),
      p && p.injured ? h('i', { class: 'fas fa-skull-crossbones zcf-st-icon', role: 'img', title: 'Injured', 'aria-label': 'Injured' }) : null,
      p && p.traveling ? h('i', { class: 'fas fa-directions zcf-st-icon', role: 'img', title: 'Travelling', 'aria-label': 'Travelling' }) : null);

    const factionCell = h('td', { class: 'zcf-col-faction' },
      p && p.faction
        ? link(`/faction/${p.faction.id}`, 'zcf-fac', [h('i', { class: 'fas fa-campground', 'aria-hidden': 'true' }), p.faction.name || `#${p.faction.id}`])
        : h('span', { class: 'zcf-dim' }, '—'));

    const noteCell = editId === r.id
      ? h('td', { class: 'zcf-col-note' }, editInput, h('div', { class: 'zcf-note-hint' }, 'Enter to save · Esc to cancel · only you can see notes'))
      : h('td', { class: 'zcf-col-note' },
        h('button', {
          class: `zcf-note${r.note ? '' : ' zcf-note-empty'}`,
          type: 'button',
          title: r.note || 'Add a note',
          'data-zcf-focus': `note:${r.id}`,
          onclick: () => startEdit(r.id),
        }, r.note ? highlightMatch(r.note, query) : 'Add a note'));

    const acts = h('div', { class: 'zcf-acts' },
      h('button', {
        class: 'zcf-act zcf-act-msg',
        type: 'button',
        title: 'Message',
        'aria-label': `Message ${r.username}`,
        'data-zcf-focus': `msg:${r.id}`,
        onclick: () => actions.openDm(r.id, { expand: true, username: r.username, avatar: r.avatar }),
      }, h('i', { class: 'fas fa-comment-alt', 'aria-hidden': 'true' }), r.unread > 0 ? h('span', { class: 'zcf-pill' }, String(r.unread)) : null),
      h('button', { class: 'zcf-act zcf-act-wide', type: 'button', title: 'Edit note', 'aria-label': `Edit note for ${r.username}`, 'data-zcf-focus': `edit:${r.id}`, onclick: () => startEdit(r.id) }, icon('pen')),
      h('button', { class: 'zcf-act zcf-act-wide', type: 'button', title: 'Remove', 'aria-label': `Remove ${r.username}`, 'data-zcf-focus': `remove:${r.id}`, onclick: () => askRemove(r.id) }, icon('times')),
      h('button', {
        class: 'zcf-act zcf-act-more',
        type: 'button',
        title: 'More',
        'aria-haspopup': 'menu',
        'aria-expanded': String(menuId === r.id),
        'data-zcf-focus': `more:${r.id}`,
        onclick: () => {
          menuId = menuId === r.id ? null : r.id;
          render();
        },
      }, icon('ellipsis-h')),
      menuId === r.id
        ? h('div', { class: 'zcf-page-menu', role: 'menu' },
          h('button', {
            type: 'button',
            role: 'menuitem',
            onclick: () => {
              menuId = null;
              router.navigate(`/profile/${r.id}`);
            },
          }, 'Profile'),
          h('button', { type: 'button', role: 'menuitem', onclick: () => startEdit(r.id) }, 'Edit note'),
          h('button', { type: 'button', role: 'menuitem', onclick: () => askRemove(r.id) }, 'Remove'))
        : null);

    return h('tr', { class: `zcf-page-row${editId === r.id ? ' zcf-editing' : ''}`, dataset: { id: String(r.id) } },
      nameCell, h('td', { class: 'zcf-col-level' }, level), statusCell, factionCell, noteCell, h('td', { class: 'zcf-col-act' }, acts));
  }

  function render() {
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    if (!active) return;
    const s = store.get();
    const now = Date.now();
    const { rows, counts } = buildFriendsTable({ friends: s.friends, presence: presence.get, threads: s.threads, tab, query, sort });
    const ids = rows.map((r) => r.id);
    // A note being edited for a row that just left the list (a search, a remove in another tab) is saved, not lost.
    if (editId !== null && !ids.includes(editId)) {
      commitEdit();
      return;
    }
    if (confirmId !== null && !ids.includes(confirmId)) confirmId = null;
    if (menuId !== null && !ids.includes(menuId)) menuId = null;
    currentIds = ids;

    subtitle.textContent = `${counts.online} of ${counts.all} online`;
    for (const [key, { b, count }] of tabEls) {
      count.textContent = String(counts[key]);
      b.setAttribute('aria-pressed', String(key === tab));
      b.classList.toggle('zcf-page-tab-on', key === tab);
    }
    renderHead();

    const focused = doc.activeElement;
    const focusBefore = focused && focused !== editInput && el.contains(focused) ? focused.dataset.zcfFocus : undefined;
    const editSel = editInput && focused === editInput ? [editInput.selectionStart, editInput.selectionEnd] : null;
    rendering = true;
    try {
      const seen = new Set();
      rows.forEach((r, i) => {
        const sig = rowSig(r, now);
        let entry = rowEls.get(r.id);
        if (!entry || entry.sig !== sig) {
          const fresh = buildRow(r, now);
          if (entry) entry.el.replaceWith(fresh);
          entry = { sig, el: fresh };
          rowEls.set(r.id, entry);
        }
        seen.add(r.id);
        if (tbody.children[i] !== entry.el) tbody.insertBefore(entry.el, tbody.children[i] || null);
      });
      for (const [id, entry] of rowEls) {
        if (seen.has(id)) continue;
        entry.el.remove();
        rowEls.delete(id);
      }
    } finally {
      rendering = false;
    }

    table.hidden = rows.length === 0;
    empty.hidden = rows.length > 0;
    if (!rows.length) {
      clear(empty);
      const q = query.trim();
      if (!counts.all) append(empty, ['No friends yet. Use ', h('b', null, 'Add friend'), ' above, or ', h('b', null, 'Add Friend'), " on a player's profile."]);
      else if (q) empty.textContent = `No friends match "${q}".`;
      else empty.textContent = tab === 'online' ? 'No friends online right now.' : 'No offline friends.';
    }
    if (pop.isOpen) pop.refresh();

    if (editSel && editInput && doc.activeElement !== editInput) {
      editInput.focus();
      editInput.setSelectionRange(editSel[0], editSel[1]);
    } else if (focusBefore && !el.contains(doc.activeElement)) {
      focusKey(focusBefore);
    }
  }

  // Presence and store updates arrive in bursts; redraw at most once per frame.
  function scheduleRender() {
    if (frame || !active) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      safe('friends-page-render', render)();
    });
  }

  function ensure() {
    if (!active || el.isConnected) return;
    const slot = doc.querySelector('.q-page-container');
    if (!slot) return;
    doc.documentElement.classList.add(PAGE_CLASS);
    slot.appendChild(el);
  }

  function show() {
    active = true;
    doc.documentElement.classList.add(PAGE_CLASS);
    doc.addEventListener('mousedown', onDocMousedown);
    ensure();
    render();
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => {
      if (!active || el.isConnected) return;
      // No page slot to draw into: let the game's own 404 show rather than an empty page.
      warnOnce('friends-page-no-slot');
      doc.documentElement.classList.remove(PAGE_CLASS);
    }, WARN_MS);
  }

  function hide() {
    commitEdit();
    active = false;
    confirmId = null;
    menuId = null;
    pop.close();
    clearTimeout(warnTimer);
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    doc.removeEventListener('mousedown', onDocMousedown);
    doc.documentElement.classList.remove(PAGE_CLASS);
    el.remove();
  }

  function onRoute(path) {
    const want = isFriendsPath(path);
    if (want && !active) show();
    else if (!want && active) hide();
    else if (!want) doc.documentElement.classList.remove(PAGE_CLASS); // left over from hideGame404Early
  }

  return {
    el,
    start() {
      if (!unkeep && keeper) unkeep = keeper.add({ name: 'friends-page', attached: () => !active || el.isConnected, ensure });
    },
    onRoute,
    render,
    scheduleRender,
    get active() {
      return active;
    },
    destroy() {
      if (active) hide();
      if (unkeep) unkeep();
      unkeep = null;
    },
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run test/ui/friends-page.test.js test/ui/topbar-button.test.js`. Expected: PASS.

- [ ] **Step 5: Commit tasks 6–8.**

```bash
git add src/ui/keeper.js src/ui/dock.js src/ui/topbar-button.js src/ui/friends-page.js test/ui/keeper.test.js test/ui/topbar-button.test.js test/ui/friends-page.test.js test/fixtures/game-dom.js
git commit -m "feat: Friends page at /friends and top-bar Friends button, on a shared mount keeper" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Page and top-bar styles

**Files:**
- Modify: `src/ui/styles.js` (inside the `CSS` template, before the first `@media (min-width:600px){`)
- Test: `test/ui/styles.test.js`

- [ ] **Step 1: Extend the order test (failing first).** In `test/ui/styles.test.js`:

Add these imports:

```js
import { createFriendsPage } from '../../src/ui/friends-page.js';
import { createTopbarButton } from '../../src/ui/topbar-button.js';
import { HEADER_HTML, PAGE_404_HTML } from '../fixtures/game-dom.js';
```

The existing `DOCK_HTML` import from `game-dom.js` stays. Merge the three names into one import line.

Replace the body of `'never depends on whether the game stylesheet or ours loaded last'` with a shared helper, and add a new test:

```js
function orderProblems(root) {
  const problems = [];
  for (const width of WIDTHS) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const props = new Set(OURS.filter((r) => mediaApplies(r.media, width) && matches(el, r.selector)).flatMap((r) => r.decls.map((d) => d.prop)));
      for (const prop of props) {
        const last = winner(el, prop, width, OURS_LAST);
        const first = winner(el, prop, width, OURS_FIRST);
        if (last.value !== first.value) {
          problems.push(`${width}px ${describeEl(el)} ${prop}: "${last.value}" (${last.selector}) if ours loads last, "${first.value}" (${first.selector}) if ours loads first`);
        }
      }
    }
  }
  return problems;
}
```

The helper goes at module level, below `describeEl`. The test body becomes:

```js
  it('never depends on whether the game stylesheet or ours loaded last', () => {
    const problems = new Set();
    for (const state of STATES) for (const p of orderProblems(renderDock(state))) problems.add(p);
    expect([...problems]).toEqual([]);
  });

  it('keeps the page and top-bar rules order-independent too', () => {
    document.body.innerHTML = HEADER_HTML + PAGE_404_HTML;
    const services = makeServices({ presence: { 5: { online: true, active: 0, profile: { level: 3, faction: { id: 2, name: 'F' }, injured: true, traveling: true } } } });
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      addFriend(s, { id: 6, username: 'Nyx' }, 0);
    });
    const page = createFriendsPage(services);
    page.onRoute('/friends');
    const topbar = createTopbarButton({ router: services.router });
    topbar.start();
    topbar.setCount(1);
    expect(document.querySelector('.zcf-page-table th').textContent).toBe('Name');
    expect(hasOurRule('.zcf-page-table th')).toBe(true);
    expect([...orderProblems(document.querySelector('main.zcf-page')), ...orderProblems(document.querySelector('.zcf-topbar'))]).toEqual([]);
    page.destroy();
    topbar.destroy();
  });
```

Also add this helper at module level. It proves the page CSS exists, so the test fails before Step 3:

```js
const hasOurRule = (selector) => OURS.some((r) => r.selector === selector);
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run test/ui/styles.test.js`. Expected: FAIL, because `hasOurRule('.zcf-page-table th')` is false.

- [ ] **Step 3: Add the CSS.** In `src/ui/styles.js`, insert these lines inside the `CSS` template, right before `@media (min-width:600px){`:

```css
.zcf-topbar [hidden]{display:none!important}
.zcf-page{max-width:1000px;margin:0 auto;color:#d9d9d9;font-size:13px}
.zcf-page-title{display:flex;align-items:center;margin-bottom:16px}
.zcf-page-side{flex:1;display:flex;align-items:center;min-width:0}
.zcf-page-side-r{justify-content:flex-end}
.zcf-page-mid{text-align:center}
.zcf-page-sub{font-size:12px;color:#9e9e9e;margin-top:2px}
.zcf-page-back{display:inline-flex;align-items:center;gap:6px;color:#bdbdbd;font-size:12px;text-transform:uppercase;text-decoration:none;padding:4px 8px;border-radius:4px}
.zcf-page-back:hover{background:#ffffff0d;color:#e0e0e0}
.zcf-page-back i{font-size:10px}
.zcf-page-addwrap{position:relative}
.zcf-page-add{display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid #e0e0e0aa;border-radius:4px;color:#e0e0e0;font:inherit;font-size:12px;text-transform:uppercase;padding:5px 10px;cursor:pointer}
.zcf-page-add:hover,.zcf-page-add.zcf-page-add-on{background:#ffffff14}
.zcf-page-add i{font-size:10px}
.zcf-page-add-short{display:none}
.zcf-page .zcf-pop{top:calc(100% + 6px);right:0}
.zcf-page-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.zcf-page-tabs{display:flex;gap:4px}
.zcf-page-tab{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;background:#121417f5;border:1px solid #000;border-radius:4px;color:#9e9e9e;font-family:Oswald,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer}
.zcf-page-tab b{font-weight:400;opacity:.55}
.zcf-page-tab:hover{color:#e0e0e0}
.zcf-page-tab.zcf-page-tab-on{background:#0f1114;color:#e6e6e6;box-shadow:inset 0 2px 0 #0a748f}
.zcf-page-search{display:flex;align-items:center;gap:8px;margin-left:auto;width:260px;height:36px;padding:0 10px;background:#ffffff26;border-radius:4px}
.zcf-page-search i{font-size:12px;opacity:.6}
.zcf-page-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#e0e0e0;font:inherit;font-size:13px}
.zcf-page-input::placeholder{color:#ffffff80}
.zcf-page-panel{background:#202327;border:1px solid #000;border-radius:4px}
.zcf-page-table{width:100%;border-collapse:collapse}
.zcf-page-table th{background:#090a0b;color:#a6a6a6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:left;white-space:nowrap;padding:10px 12px;border-bottom:1px solid #000}
.zcf-page-table td{padding:6px 12px;border-top:1px solid #2b3035;border-bottom:1px solid #090a0b;vertical-align:middle}
.zcf-page-sort{background:none;border:0;padding:0;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}
.zcf-page-sort:hover,.zcf-page-sort.zcf-page-sort-on{color:#e0e0e0}
.zcf-page-arrow{color:#0d9bbf;margin-left:4px;font-size:9px}
.zcf-page-table .zcf-col-level{width:60px}
.zcf-page-table .zcf-col-status,.zcf-page-table .zcf-col-faction{white-space:nowrap}
.zcf-page-table .zcf-col-note{width:32%;max-width:0}
.zcf-page-table .zcf-col-act{width:1%;white-space:nowrap}
.zcf-chip{display:inline-flex;align-items:center;gap:8px;min-width:160px;max-width:230px;padding:2px 10px 2px 2px;background:#151619;border-radius:6px;color:#d9d9d9;text-decoration:none}
.zcf-chip:hover{background:#0e0f11}
.zcf-page .zcf-chip .zcf-av-img{border-radius:4px}
.zcf-page .zcf-chip .zcf-dot{width:8px;height:8px;border-width:2px;bottom:-2px;right:-2px}
.zcf-chip-name{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-page mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-c-sub{display:none;font-size:11px;color:#9e9e9e;margin-top:3px}
.zcf-c-subnote{font-style:italic}
.zcf-st-on{color:#69f0ae}
.zcf-st-off{color:#ef5350}
.zcf-st-unknown{color:#9e9e9e}
.zcf-st-icon{color:#90a4ae;margin-left:7px;font-size:13px}
.zcf-fac{display:inline-flex;align-items:center;gap:6px;color:#bdbdbd;text-decoration:none}
.zcf-fac:hover{color:#e0e0e0;text-decoration:underline}
.zcf-fac i{color:#90a4ae;font-size:11px}
.zcf-dim{opacity:.35}
.zcf-note{display:block;width:100%;background:none;border:0;padding:2px 0;color:#9e9e9e;font:inherit;font-style:italic;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text}
.zcf-note:hover{color:#d9d9d9}
.zcf-note.zcf-note-empty{opacity:.4}
.zcf-page-row.zcf-editing td{background:#0a748f14}
.zcf-note-input{display:block;box-sizing:border-box;width:100%;background:#0e1013;border:1px solid #0a748f;border-radius:3px;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 8px}
.zcf-note-hint{font-size:10.5px;color:#9e9e9e;margin-top:4px}
.zcf-acts{display:flex;justify-content:flex-end;gap:4px;position:relative}
.zcf-act{position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:26px;background:#ffffff0d;border:0;border-radius:4px;color:#bdbdbd;font-size:12px;cursor:pointer}
.zcf-act:hover{background:#ffffff1f;color:#fff}
.zcf-act.zcf-act-msg{background:#0a748f;color:#fff}
.zcf-act.zcf-act-msg:hover{background:#0c86a6}
.zcf-act .zcf-pill{position:absolute;top:-6px;right:-6px}
.zcf-act.zcf-act-more{display:none}
.zcf-page-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:10;min-width:140px;padding:4px 0;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0}
.zcf-page-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:#d9d9d9;font:inherit;font-size:13px;padding:8px 12px;cursor:pointer}
.zcf-page-menu button:hover{background:#ffffff0a}
.zcf-page-confirm td{background:#ff42420f}
.zcf-confirm{display:flex;align-items:center;gap:8px}
.zcf-confirm-text{flex:1}
.zcf-page-btn{background:#ffffff0d;border:0;border-radius:4px;color:#bdbdbd;font:inherit;font-size:11px;text-transform:uppercase;padding:5px 12px;cursor:pointer}
.zcf-page-btn:hover{background:#ffffff1f;color:#fff}
.zcf-page-btn.zcf-page-danger{background:#ff42421f;color:#ff8a8a}
.zcf-page-empty{padding:28px 16px;text-align:center;color:#9e9e9e}
```

Inside the existing `@media (max-width:599.98px){ … }` block, append:

```css
  .zcf-page-back{display:none}
  .zcf-page-add-long{display:none}
  .zcf-page-add-short{display:inline}
  .zcf-page-search{width:100%;margin-left:0}
  .zcf-page-table .zcf-col-level,.zcf-page-table .zcf-col-faction,.zcf-page-table .zcf-col-note{display:none}
  .zcf-page-table .zcf-editing .zcf-col-note{display:table-cell}
  .zcf-page-table .zcf-editing .zcf-col-status{display:none}
  .zcf-page-table th,.zcf-page-table td{padding-left:8px;padding-right:8px}
  .zcf-chip{min-width:0;max-width:170px}
  .zcf-c-sub{display:block}
  .zcf-act.zcf-act-wide{display:none}
  .zcf-act.zcf-act-more{display:flex}
  .q-gutter-xs > .zcf-topbar{margin-left:2px}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run test/ui/styles.test.js`, then `npm test`. Expected: PASS.

### Task 10: Wire it into the app and boot

**Files:**
- Modify: `src/app.js`, `src/main.js`
- Test: `test/app.test.js`, `test/main.test.js`

- [ ] **Step 1: Write the failing tests.** In `test/app.test.js`:

Change the imports:

```js
import { createApp, INTERVALS, PRESENCE_PER_SWEEP, PRESENCE_BACKGROUND_PER_SWEEP } from '../src/app.js';
import { DOCK_HTML, HEADER_HTML, PAGE_404_HTML, wireGameHeaders } from './fixtures/game-dom.js';
```

Then add inside `describe('app', …)`:

```js
  it('keeps the top-bar online count fresh with a small background sweep when no list is open', async () => {
    vi.useFakeTimers();
    let t = 1000000;
    document.body.insertAdjacentHTML('afterbegin', HEADER_HTML);
    const ids = Array.from({ length: 30 }, (_, i) => 300 + i);
    const api = fakeApi({ getProfile: vi.fn(async (id) => ({ ok: true, data: { online: id < 303, active: 60 } })) });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: storageWith({ friends: friends(...ids) }), now: () => t });
    await vi.advanceTimersByTimeAsync(10000);
    // The first sweep uses the full budget so the count fills in quickly.
    expect(api.getProfile).toHaveBeenCalledTimes(PRESENCE_PER_SWEEP);
    expect(document.querySelector('.zcf-topbar-badge').textContent).toBe('3');
    // After that: at most PRESENCE_BACKGROUND_PER_SWEEP a sweep, and only friends not checked in 5 minutes.
    api.getProfile.mockClear();
    t += INTERVALS.presence;
    await vi.advanceTimersByTimeAsync(INTERVALS.presence);
    expect(api.getProfile).toHaveBeenCalledTimes(PRESENCE_BACKGROUND_PER_SWEEP);
    for (const [id] of api.getProfile.mock.calls) expect(id).toBeGreaterThanOrEqual(320);
  });

  it('refreshes presence right away when the Friends window opens', async () => {
    vi.useFakeTimers();
    let t = 1000000;
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: storageWith({ friends: friends(5) }), now: () => t });
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProfile).toHaveBeenCalledTimes(1);
    t += 2 * 60000; // stale for an open list (60s), not yet for the background sweep (5 min)
    app.actions.toggleFriends();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });

  it('shows the Friends page on /friends and saves notes from it', async () => {
    document.body.insertAdjacentHTML('beforeend', PAGE_404_HTML);
    window.history.replaceState({}, '', '/friends');
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: withFriend() });
    const page = document.querySelector('.q-page-container main.zcf-page');
    expect(page).not.toBeNull();
    page.querySelector('.zcf-note').click();
    const input = page.querySelector('.zcf-note-input');
    input.value = 'owes me nails';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(app.store.get().friends[SPIKE].note).toBe('owes me nails');
    window.history.pushState({}, '', '/');
    await flush();
    expect(document.querySelector('main.zcf-page')).toBeNull();
  });
```

In the same file's `afterEach`, add `window.history.replaceState({}, '', '/');` and `document.documentElement.classList.remove('zcf-on-friends');`.

In `test/main.test.js`, add inside `describe('main', …)`:

```js
  it('hides the game 404 on /friends before login, and shows it again while not logged in', async () => {
    window.history.replaceState({}, '', '/friends');
    const api = fakeApi({ getStats: vi.fn().mockResolvedValueOnce({ ok: false, kind: 'auth' }).mockReturnValue(new Promise(() => {})) });
    boot({ api }); // never finishes: the second login check never answers
    expect(document.documentElement.classList.contains('zcf-on-friends')).toBe(true);
    await flush();
    expect(document.documentElement.classList.contains('zcf-on-friends')).toBe(false);
    window.history.replaceState({}, '', '/');
  });
```

Add `flush` to that file's import from `./helpers.js`, and add `document.getElementById('zcf-early-styles')?.remove();` to its `afterEach`.

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run test/app.test.js test/main.test.js`. Expected: FAIL, because `PRESENCE_BACKGROUND_PER_SWEEP` is undefined, there's no `.zcf-topbar-badge`, and there's no page.

- [ ] **Step 3: Implement `src/app.js`.**

Imports: add `setFriendNote` to the `./state.js` import list, and add:

```js
import { countOnline } from './friends-table.js';
import { createKeeper } from './ui/keeper.js';
import { createTopbarButton } from './ui/topbar-button.js';
import { createFriendsPage } from './ui/friends-page.js';
```

Constants: after `PRESENCE_PER_SWEEP`, add:

```js
// With no friends list on screen, presence only keeps the top-bar online count roughly fresh (spec §5.3).
export const PRESENCE_BACKGROUND_PER_SWEEP = 5;
export const PRESENCE_BACKGROUND_STALE_MS = 5 * 60 * 1000;
```

Replace the `presencePoller` definition with:

```js
  // A friends list is on screen: the dock's Friends window, or the Friends page.
  const listOpen = () => store.get().dock.friendsOpen || page.active;
  let fullSweepPending = true; // the first sweep fills in the top-bar count quickly
  const presencePoller = makePoller({
    run: () => {
      // Stalest first, capped, so a long friends list can't turn into one getProfile per friend per minute.
      const full = fullSweepPending || listOpen();
      fullSweepPending = false;
      const maxAge = full ? undefined : PRESENCE_BACKGROUND_STALE_MS;
      const age = (id) => (presence.get(id) || { fetchedAt: 0 }).fetchedAt;
      const stale = Object.keys(store.get().friends).map(Number).filter((id) => presence.isStale(id, maxAge));
      presence.refresh(stale.sort((a, b) => age(a) - age(b)).slice(0, full ? PRESENCE_PER_SWEEP : PRESENCE_BACKGROUND_PER_SWEEP));
      return { ok: true };
    },
    interval: INTERVALS.presence,
    doc,
  });
```

Replace `syncPollers` with:

```js
  let wasListOpen = false;
  function syncPollers() {
    if (stopped) return;
    const s = store.get();
    const anyOpen = s.dock.dms.some((d) => d.open);
    for (const [p, on] of [[activeDmPoller, anyOpen], [infoPoller, anyOpen]]) {
      if (on) p.start();
      else p.stop();
    }
    // Presence always runs now (the top-bar count); opening a list refreshes it at once.
    const open = listOpen();
    if (!presencePoller.active) presencePoller.start();
    else if (open && !wasListOpen) presencePoller.poke();
    wasListOpen = open;
  }
```

Replace `const dock = createDock({ doc, win, onGameChatOpened: ... });` with:

```js
  const keeper = createKeeper({ doc, win });
  const dock = createDock({ doc, win, keeper, onGameChatOpened: () => store.update((s) => collapseAll(s)) });
```

In `actions`, add after `removeFriend`:

```js
    setFriendNote: (id, note) => store.update((s) => setFriendNote(s, id, note)),
```

After `const profileButton = createProfileButton(...)`, add:

```js
  const page = createFriendsPage(services, { doc, win, keeper });
  const topbar = createTopbarButton({ doc, keeper, router });
  const updateOnlineCount = () => topbar.setCount(countOnline(store.get().friends, presence.get));
```

Replace the three subscriptions (`store.subscribe`, `presence.subscribe`, `router.onChange`) with:

```js
  store.subscribe(() => {
    view.render();
    syncPollers();
    profileButton.refresh();
    page.scheduleRender();
    updateOnlineCount();
  });
  presence.subscribe(() => {
    view.friends.scheduleList();
    for (const d of store.get().dock.dms) {
      const w = view.dmWindow(d.id);
      if (w) w.update();
    }
    page.scheduleRender();
    updateOnlineCount();
  });
  inbox.subscribe(() => view.friends.scheduleList());
  router.onChange((path) => {
    profileButton.onRoute(path);
    page.onRoute(path);
    syncPollers();
    resumeIfLoggedIn();
  });
```

(The `inbox.subscribe` line is the existing one, unchanged.)

Replace the startup block, from `dock.start();` through `syncPollers();`, with:

```js
  dock.start();
  page.start();
  topbar.start();
  if (dock.isSmall()) enforcePhoneRule();
  view.render();
  profileButton.onRoute(router.path);
  page.onRoute(router.path);
  updateOnlineCount();
  threadsPoller.start();
  syncPollers();
```

In the returned `destroy()`, after `profileButton.destroy();`, add:

```js
      page.destroy();
      topbar.destroy();
      keeper.destroy();
      router.destroy();
```

- [ ] **Step 4: Implement `src/main.js`.** Add the import `import { hideGame404Early, PAGE_CLASS } from './ui/friends-page.js';`.

Change the `waitForPlayer` signature to `export async function waitForPlayer(api, { retryMs = RETRY_MS, maxTries = Infinity, onWait } = {})`. Right before the `await new Promise((resolve) => setTimeout(resolve, retryMs));` line, add:

```js
    if (onWait) onWait();
```

In `boot`, replace `const player = await waitForPlayer(api);` with:

```js
    hideGame404Early(doc, win);
    // Not logged in (yet): let the game's own page show. The app sets the class again once it starts.
    const player = await waitForPlayer(api, { onWait: () => doc.documentElement.classList.remove(PAGE_CLASS) });
```

- [ ] **Step 5: Run everything and confirm it passes.** Run `npm test`. Expected: all PASS. The earlier presence test `'presence refreshes at most PRESENCE_PER_SWEEP friends per sweep, stalest first'` still passes, because its Friends window is open.

- [ ] **Step 6: Commit tasks 9–10.**

```bash
git add src/ui/styles.js src/app.js src/main.js test/ui/styles.test.js test/app.test.js test/main.test.js
git commit -m "feat: style the Friends page and top-bar button; wire them in with background presence" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 11: Docs, build, release candidate

**Files:**
- Modify: `docs/manual-test.md`, `README.md`, `package.json`, `dist/zed-city-friends.user.js` (built)

- [ ] **Step 1: Manual checklist.** In `docs/manual-test.md`, append these items after item 23 in "B. Feature checks":

```markdown
24. **Top bar:** a friends icon sits left of the mail envelope. Its green number matches how many friends are online, and it's hidden at 0. On a 360px-wide phone layout the icons stay on one line.
25. **Friends page:** click the icon: `/friends` opens with no page reload and no "Sorry, nothing here" flash. Refresh `/friends` directly: the same page loads.
26. Sort by Name, Level, Status and Faction (click twice to reverse). Tabs and search (names and notes) narrow the list.
27. **Notes:** edit (Enter saves, Esc cancels, clicking away saves), reload, then open a second game tab: the note is there in both.
28. **Message** opens the DM in the dock. **Remove** asks first. **Add friend** finds and adds a player, who appears in the table.
29. Injured and traveling icons and the faction match those players' profiles.
30. **Export → Import** round-trips notes. When idle with the page closed, the Network tab shows at most ~9 requests a minute.
```

- [ ] **Step 2: README.** In `README.md`, add this bullet after the "Add Friend button" bullet:

```markdown
- **Friends page.** A friends icon in the top bar (with a count of friends online) opens a full Friends page at `zed.city/friends`. It's a sortable table with level, online status, injured/traveling icons and faction, plus private notes that only you can see.
```

Then add this paragraph to the end of "How often it checks for messages":

```markdown
With no friends list open, it keeps the top-bar online count fresh by re-checking up to 5 friends a minute (each at most every 5 minutes). That brings idle traffic to about 9 requests a minute.
```

- [ ] **Step 3: Version and build.** In `package.json`, set `"version": "0.4.0"`. Then run:

```bash
npm test
npm run build
```

Expected: all tests PASS; `Built dist/zed-city-friends.user.js`. Check `grep -m1 "@version" dist/zed-city-friends.user.js` prints `// @version      0.4.0`.

- [ ] **Step 4: Commit.**

```bash
git add docs/manual-test.md README.md package.json dist/zed-city-friends.user.js
git commit -m "release: 0.4.0 with the Friends page" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: One review, then a live check with the user.**
  - Run one code review over `main..friends-page`. Fix only Critical/Important findings and log Minor ones.
  - Then work through the spec's §10 items with the user on the live game:
    1. `/friends` layout, including a direct load.
    2. `getProfile` field names, from the user's console output.
    3. Optionally, whether `getChatInfo` accepts several IDs.
    4. Whether the fourth icon fits at 360px.
  - Adjust only those points. Merge to `main` and push only when the user says so.
