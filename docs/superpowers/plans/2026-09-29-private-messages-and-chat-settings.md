# Zed City Friends 0.5.0 (Private Messages, Chat settings, Enemies, Mute) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 0.5.0 from `docs/superpowers/specs/2026-09-29-private-messages-and-chat-settings-design.md`: the Private Messages window (Part A), per-chat Chat+ customization and the Chat settings cog (Part B), the Enemies list (Part C), and mute / What's new / four fixes (Part D).

**Architecture:** Everything stays a single esbuild-bundled userscript. New pure modules (`pm-view.js`, `settings.js`, `enemies.js`, `chat-custom/*.js`, `whats-new.js`) hold the logic and are unit-tested without a DOM. DOM modules (`ui/pm-window.js`, `ui/settings-window.js`, `ui/chat-custom/*.js`, `ui/enemy-marks.js`) render with the existing `h()` helper and are tested in jsdom against the live-markup fixtures. Two new localStorage documents (settings, enemies) sit beside the main one through one generic document store, so older script versions never drop their fields. The game's own chats are styled only through our `<style id="zcf-user-settings">`, never by touching Vue-owned attributes.

**Tech Stack:** Vanilla ES modules, esbuild (IIFE bundle), Vitest 5 + jsdom, headless Edge for the visual check.

---

## Conventions for every task

- **Branch:** `pm-and-settings` (already created from `main`). Never push or merge.
- **Identity:** before the first commit run `git config user.name` and check it prints `Zed City Friends`.
- **Commit trailer** (every commit message ends with):
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018xFLSnTGkyRmowXEhicgAC
  ```
- **Run one test file:** `npx vitest run test/path/file.test.js`
- **Run everything:** `npx vitest run` (357 tests pass on `main` before this plan).
- **New files** in this plan are given in full after a marker line `<!-- file: path -->`. Transcribe them exactly (a helper script may copy them out of this document). **Changes to existing files** are given as exact before/after snippets.
- **Pace:** TDD per task, commits batched per part; no per-task review. One review at the end (Task 27) fixes only Critical/Important findings and logs the rest.
- **Game-owned DOM:** never add classes, attributes or inline styles to the game's `.chat-container` elements or their existing children. Our controls are child nodes we insert; all per-chat styling goes through `#zcf-user-settings`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/presence.js` | modify | `profileAt`: profile details go stale after 5 min even while `getChatInfo` keeps status fresh (D.3 #4) |
| `src/friends-table.js` | modify | `pinned` ids kept on a tab they no longer match (D.3 #2); `list` param for friends or enemies (C) |
| `src/ui/dom.js` | modify | `wireMenuKeys()` for arrow/Esc keyboard menus (D.3 #3) |
| `src/ui/friends-page.js` | modify | leave-without-404-flash (D.3 #1), pinned rows, menu keys, FRIENDS \| ENEMIES title tabs and `/enemies` (C) |
| `src/api.js` | modify | `getFactionMembers`, `blockList`, `unblockUser` |
| `src/inbox.js` | modify | `fetchPage(n)` for older chats; `isMuted` / `onNewMail` (D.1, B.4 sound) |
| `src/store.js` | modify | `createDocStore` (generic), `createSettingsStore`, `createEnemiesStore` |
| `src/settings.js` | new | the settings document: `pmTab`, `sound`, `chats`, `muted` and their mutators |
| `src/chat-custom/chats.js` | new | chat keys, limits, per-chat entry normalization, labels |
| `src/chat-custom/geometry.js` | new | on-screen clamping, drag threshold, grip resize math |
| `src/chat-custom/user-style.js` | new | builds the `#zcf-user-settings` CSS text |
| `src/pm-view.js` | new | Chats / Faction / Blocked row data |
| `src/ui/player-search.js` | new | debounced player search shared by the pop-out and the PM search box |
| `src/ui/add-friend-popover.js` | modify | uses `player-search.js`; labels for friend or enemy |
| `src/ui/marks.js` | new | the enemy skull and muted bell-slash icons |
| `src/ui/pm-window.js` | new | the Private Messages window (replaces `friends-window.js`) |
| `src/ui/friends-window.js`, `src/friends-view.js` | delete | replaced by the PM window |
| `src/ui/dock-view.js` | modify | PM window and Chat settings window in the row |
| `src/state.js` | modify | shared person helpers, `dock.settingsOpen`, `chatsUnreadIds`, muted-aware unread total |
| `src/enemies.js` | new | enemies document and mutators |
| `src/backup.js` | modify | enemies in export / import; toast wording |
| `src/ui/profile-button.js` | modify | one component per list: Add Friend and Add Enemy |
| `src/ui/enemy-marks.js` | new | skulls in the game's Global / Faction / Activity chats |
| `src/ui/dm-window.js` | modify | `data-zcf-chat`, skulls, mute bell, zoom targets |
| `src/sound.js` | new | WebAudio tones for the new-PM sound |
| `src/version.js`, `src/whats-new.js` | new | version from the build; release notes |
| `src/ui/chat-custom/registry.js` | new | finds every chat element and its header |
| `src/ui/chat-custom/padlock.js` | new | header controls (message size, Reset, return arrow, padlock) |
| `src/ui/chat-custom/menu.js` | new | the right-click chat menu |
| `src/ui/chat-custom/drag.js` | new | header and bubble drags with threshold and click suppression |
| `src/ui/chat-custom/resize.js` | new | resize grips and gestures |
| `src/ui/chat-custom/index.js` | new | wires settings, registry, style, controls, drag, resize, menu |
| `src/ui/settings-window.js` | new | the cog tab and Chat settings window |
| `src/ui/styles.js` | modify | new CSS; flush-right dock; removal of Friends-window-only rules |
| `src/app.js` | modify | wiring for all of the above |
| `build.mjs`, `vitest.config.js` | modify | `__ZCF_VERSION__` define |
| `test/ui/cascade.js` | new | the CSS cascade helper, moved out of `styles.test.js` for reuse |
| `tools/preview/*` | new | headless-Edge visual check harness |

---

# Part D.3: Four fixes

### Task 1: Profile details go stale after 5 minutes (D.3 #4)

**Files:**
- Modify: `src/presence.js`
- Test: `test/presence.test.js`

- [ ] **Step 1: Write the failing test** (append inside the `describe('presence', …)` block, before its closing `});`)

```js
  it('refetches profile details older than 5 minutes even while set() keeps the status fresh', async () => {
    let t = 0;
    const fetchProfile = vi.fn(() => Promise.resolve({ ok: true, data: { online: true, rank: 3 } }));
    const p = createPresence({ fetchProfile, now: () => t });
    p.refresh([5]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    for (t = 60000; t <= 300000; t += 60000) {
      p.set(5, { online: true }); // getChatInfo from an open DM, once a minute
      p.refresh([5]);
      await vi.advanceTimersByTimeAsync(300);
    }
    // Status never went stale, but at 5 minutes the level / faction / icons were due again.
    expect(fetchProfile).toHaveBeenCalledTimes(2);
    expect(p.lastTried(5)).toBe(300000);
  });

  it('orders an entry known only from set() first, since it has no profile yet', () => {
    const p = createPresence({ fetchProfile: vi.fn(), now: () => 9000 });
    p.set(5, { online: true });
    expect(p.lastTried(5)).toBe(0);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/presence.test.js`
Expected: FAIL: the first new test sees 1 call (not 2); the second sees `9000`.

- [ ] **Step 3: Implement** in `src/presence.js`

Change the options list:

```js
export function createPresence({
  fetchProfile,
  onProfile,
  staleMs = 60000,
  profileStaleMs = 300000,
  concurrency = 2,
  gapMs = 250,
  pauseMs = 300000,
  now = () => Date.now(),
}) {
```

Replace `store()`:

```js
  function store(id, info, at, profile) {
    if (!info || typeof info !== 'object') return;
    const prev = cache.get(id);
    cache.set(id, {
      online: !!info.online,
      active: lastActive(info.active, now()),
      fetchedAt: at,
      profile: profile || (prev && prev.profile) || null,
      // When level, faction and the icons were last fetched. A getChatInfo set() refreshes the online
      // status only, so fetchedAt alone can't tell whether these have gone stale (spec §D.3 #4).
      profileAt: profile ? at : (prev && prev.profileAt) || 0,
    });
    emit(id);
  }
```

Replace `isStale()` and `lastTried()`:

```js
  // An entry without profile details is stale however fresh it is, so the Friends page's level
  // and faction fill in even for someone whose status so far only came from a DM header. Profile
  // details older than profileStaleMs are stale too, even when the status is fresh.
  function isStale(id, maxAgeMs = staleMs) {
    // A failed fetch waits out the same interval as a success, so a friend whose profile can't be
    // loaded can't take a slot in every sweep and starve everyone else.
    if (failedAt.has(id) && now() - failedAt.get(id) < maxAgeMs) return false;
    const c = cache.get(id);
    if (!c || !c.profile) return true;
    return now() - c.fetchedAt >= maxAgeMs || now() - c.profileAt >= Math.max(maxAgeMs, profileStaleMs);
  }

  // When an id's profile was last fetched or tried, for "stalest first" ordering; 0 if never.
  function lastTried(id) {
    const c = cache.get(id);
    return Math.max(c ? c.profileAt : 0, failedAt.get(id) || 0);
  }
```

- [ ] **Step 4: Run the file again**

Run: `npx vitest run test/presence.test.js`
Expected: PASS (all presence tests, old and new).

### Task 2: Keep the edited or confirmed row on its tab (D.3 #2)

**Files:**
- Modify: `src/friends-table.js`, `src/ui/friends-page.js`
- Test: `test/friends-table.test.js`, `test/ui/friends-page.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/friends-table.test.js` inside its `describe`:

```js
  it('keeps pinned rows on a tab they no longer match, without changing the counts', () => {
    const t = table({ tab: 'online', pinned: [3] });
    expect(ids(t)).toEqual([1, 2, 3]);
    expect(t.counts).toEqual({ all: 5, online: 2, offline: 3 });
  });
```

Append to `test/ui/friends-page.test.js` inside its `describe`:

```js
  it('keeps a row being edited on the Online tab after that friend goes offline', () => {
    const presence = presenceFixture();
    const { page } = mount({ friends: FRIENDS, presence });
    byText('.zcf-page-tab', 'Online').click();
    row(1).querySelector('.zcf-note').click();
    const input = row(1).querySelector('.zcf-note-input');
    input.value = 'half-typed';
    presence[1] = { ...presence[1], online: false };
    page.render();
    expect(row(1).querySelector('.zcf-note-input')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('keeps a remove confirm on the Online tab after that friend goes offline', () => {
    const presence = presenceFixture();
    const { page } = mount({ friends: FRIENDS, presence });
    byText('.zcf-page-tab', 'Online').click();
    row(2).querySelector('[title="Remove"]').click();
    presence[2] = { ...presence[2], online: false };
    page.render();
    expect(row(2).classList.contains('zcf-page-confirm')).toBe(true);
    expect(document.activeElement.textContent).toBe('Cancel');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/friends-table.test.js test/ui/friends-page.test.js`
Expected: FAIL (row 3 missing from the Online tab; the page rows vanish).

- [ ] **Step 3: Implement**

In `src/friends-table.js`, replace the `buildFriendsTable` signature line and the `inTab` line:

```js
// friends: the saved friends map; presence(id): cache entry or null; threads: saved thread state (unread).
// pinned: ids kept in the list even when they no longer match the tab (a row mid-edit or mid-confirm).
export function buildFriendsTable({ friends, presence, threads = {}, tab = 'all', query = '', sort = DEFAULT_SORT, pinned = [] }) {
```

```js
  const keep = new Set(pinned);
  const inTab = all.filter((r) => tab === 'all' || (tab === 'online') === isOnline(r) || keep.has(r.id));
```

In `src/ui/friends-page.js` `render()`, replace the `buildFriendsTable` call:

```js
    const pinned = [editId, confirmId, menuId].filter((id) => id !== null);
    const { rows, counts } = buildFriendsTable({ friends: s.friends, presence: presence.get, threads: s.threads, tab, query, sort, pinned });
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/friends-table.test.js test/ui/friends-page.test.js`
Expected: PASS.

### Task 3: Keyboard for the ⋯ menu (D.3 #3)

**Files:**
- Modify: `src/ui/dom.js`, `src/ui/friends-page.js`
- Test: `test/ui/dom.test.js`, `test/ui/friends-page.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/ui/dom.test.js` (add `wireMenuKeys` to its import from `../../src/ui/dom.js`):

```js
describe('wireMenuKeys', () => {
  it('moves between items with the arrows, wrapping, and calls onEscape on Esc', () => {
    document.body.innerHTML = '<div id="m"><button>a</button><button>b</button><button hidden>x</button><button>c</button></div>';
    const menu = document.getElementById('m');
    const onEscape = vi.fn();
    wireMenuKeys(menu, { onEscape });
    const [a, b, , c] = menu.querySelectorAll('button');
    const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    a.focus();
    key('ArrowDown');
    expect(document.activeElement).toBe(b);
    key('ArrowDown');
    expect(document.activeElement).toBe(c); // the hidden item is skipped
    key('ArrowDown');
    expect(document.activeElement).toBe(a);
    key('ArrowUp');
    expect(document.activeElement).toBe(c);
    key('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
```

(`test/ui/dom.test.js` imports `describe, it, expect` from vitest; add `vi` to that import if it is missing.)

Append to `test/ui/friends-page.test.js`:

```js
  it('drives the ⋯ menu from the keyboard: first item focused, arrows move, Esc returns to ⋯', () => {
    mount({ friends: FRIENDS, presence: presenceFixture() });
    row(1).querySelector('.zcf-act-more').click();
    const items = () => [...row(1).querySelectorAll('.zcf-page-menu button')];
    const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items()[0]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key('ArrowUp');
    key('ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    key('Escape');
    expect(row(1).querySelector('.zcf-page-menu')).toBeNull();
    expect(document.activeElement).toBe(row(1).querySelector('.zcf-act-more'));
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/ui/dom.test.js test/ui/friends-page.test.js`
Expected: FAIL (`wireMenuKeys` is not exported; the menu doesn't take focus).

- [ ] **Step 3: Implement**

Append to `src/ui/dom.js`:

```js
// Keyboard for a small pop-up menu of buttons: Up/Down move between its visible, enabled items
// (wrapping), Esc calls onEscape. Capture phase, so it works whichever item has focus.
export function wireMenuKeys(menu, { onEscape }) {
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...menu.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(menu.ownerDocument.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1;
    items[next].focus();
  }, true);
}
```

In `src/ui/friends-page.js`:
- add `wireMenuKeys` to the import from `./dom.js`;
- add two helpers after `cancelRemove`:

```js
  function toggleMenu(id) {
    menuId = menuId === id ? null : id;
    render();
    if (menuId === id) focusKey(`menu:${id}:0`);
  }

  function closeMenu(id) {
    menuId = null;
    render();
    focusKey(`more:${id}`);
  }
```

- in `buildRow`, change the ⋯ button's `onclick` to `onclick: () => toggleMenu(r.id),` and replace the whole `menuId === r.id ? h('div', { class: 'zcf-page-menu', role: 'menu' }, …) : null` expression with:

```js
      menuId === r.id ? rowMenu(r) : null);
```

- add `rowMenu` right before `buildRow`:

```js
  function rowMenu(r) {
    const item = (i, label, onclick) => h('button', { type: 'button', role: 'menuitem', 'data-zcf-focus': `menu:${r.id}:${i}`, onclick }, label);
    const menu = h('div', { class: 'zcf-page-menu', role: 'menu' },
      item(0, 'Profile', () => {
        menuId = null;
        router.navigate(`/profile/${r.id}`);
      }),
      item(1, 'Edit note', () => startEdit(r.id)),
      item(2, 'Remove', () => askRemove(r.id)));
    wireMenuKeys(menu, { onEscape: () => closeMenu(r.id) });
    return menu;
  }
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/ui/dom.test.js test/ui/friends-page.test.js`
Expected: PASS.

### Task 4: Leaving /friends never flashes the game's 404 (D.3 #1)

**Files:**
- Modify: `src/ui/friends-page.js`
- Test: `test/ui/friends-page.test.js`, `test/app.test.js`

- [ ] **Step 1: Write the failing tests**

In `test/ui/friends-page.test.js`:
- add `vi.useRealTimers();` as the first line of the `afterEach` callback;
- replace the test `'draws the page in the 404 slot on /friends, and removes it on leave'` with:

```js
  it('draws the page in the 404 slot, and on leave keeps it until the next route replaces the 404', async () => {
    const { page } = mount();
    const slot = document.querySelector('.q-page-container');
    expect(slot.querySelector('main.zcf-page')).not.toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(true);
    page.onRoute('/city');
    expect(slot.querySelector('main.zcf-page')).not.toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(true);
    slot.querySelector('.fixed-center').remove(); // Vue swaps in the next route's page
    await flush();
    expect(slot.querySelector('main.zcf-page')).toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(false);
  });

  it('stops waiting for the next route after 1s', () => {
    vi.useFakeTimers();
    const { page } = mount();
    page.onRoute('/city');
    vi.advanceTimersByTime(999);
    expect(document.querySelector('main.zcf-page')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('main.zcf-page')).toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(false);
  });

  it('coming straight back keeps the page', async () => {
    const { page } = mount();
    page.onRoute('/city');
    page.onRoute('/friends');
    document.querySelector('.fixed-center').remove();
    await flush();
    expect(document.querySelector('main.zcf-page')).not.toBeNull();
    expect(document.documentElement.classList.contains(PAGE_CLASS)).toBe(true);
  });
```

In `test/app.test.js`, in `'shows the Friends page on /friends and saves notes from it'`, replace

```js
    window.history.pushState({}, '', '/');
    await flush();
```

with

```js
    window.history.pushState({}, '', '/');
    document.querySelector('.q-page-container > .fixed-center').remove(); // the next route replaces the 404
    await flush();
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/ui/friends-page.test.js`
Expected: FAIL (the page is removed at once on leave).

- [ ] **Step 3: Implement** in `src/ui/friends-page.js`

Add a constant under `WARN_MS`:

```js
// How long a leave waits for the next route to replace the game's 404 before giving up.
const LEAVE_MS = 1000;
```

Add state next to `warnTimer`:

```js
  let leaveObserver = null;
  let leaveTimer = null;
```

Add these helpers right before `function show()`:

```js
  const game404 = () => doc.querySelector('.q-page-container > .fixed-center');
  const leaving = () => !!(leaveObserver || leaveTimer);

  // Takes our page and the <html> class away, once the next route has drawn (or 1s passed).
  // Coming back to the page meanwhile only stops the wait.
  function finishLeave() {
    if (leaveObserver) leaveObserver.disconnect();
    leaveObserver = null;
    clearTimeout(leaveTimer);
    leaveTimer = null;
    if (active) return;
    doc.documentElement.classList.remove(PAGE_CLASS);
    el.remove();
  }

  // The router reports popstate synchronously, before Vue has swapped routes: removing the page
  // now would show the game's 404, still in the slot, for a moment (spec §D.3 #1).
  function leaveWhenReplaced() {
    if (!game404()) {
      finishLeave();
      return;
    }
    leaveObserver = new win.MutationObserver(() => {
      if (!game404()) finishLeave();
    });
    leaveObserver.observe(doc.body, { childList: true, subtree: true });
    leaveTimer = setTimeout(finishLeave, LEAVE_MS);
  }
```

In `show()`, right after `active = true;` add:

```js
    finishLeave(); // back before the last leave finished: just stop waiting
```

In `hide()`, replace the last two lines

```js
    doc.documentElement.classList.remove(PAGE_CLASS);
    el.remove();
```

with

```js
    leaveWhenReplaced();
```

In `onRoute()`, replace the last branch

```js
    else if (!want) doc.documentElement.classList.remove(PAGE_CLASS); // left over from hideGame404Early
```

with

```js
    else if (!want && !leaving()) doc.documentElement.classList.remove(PAGE_CLASS); // left over from hideGame404Early
```

In `destroy()`, replace `if (active) hide();` with:

```js
      if (active) hide();
      if (leaving()) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
        finishLeave();
      }
```

- [ ] **Step 4: Run the page and app tests**

Run: `npx vitest run test/ui/friends-page.test.js test/app.test.js`
Expected: PASS.

- [ ] **Step 5: Full run and commit Part D.3**

Run: `npx vitest run`
Expected: all pass.

```bash
git add src/presence.js src/friends-table.js src/ui/dom.js src/ui/friends-page.js test/presence.test.js test/friends-table.test.js test/ui/dom.test.js test/ui/friends-page.test.js test/app.test.js
git commit -m "fix: stale profile details, pinned rows, menu keys, no 404 flash leaving /friends

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018xFLSnTGkyRmowXEhicgAC"
```

---
# Part A: Private Messages window

### Task 5: API calls and older inbox pages

**Files:**
- Modify: `src/api.js`, `src/inbox.js`, `test/helpers.js`
- Test: `test/api.test.js`, `test/inbox.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/api.test.js` inside `describe('createApi', …)`:

```js
  it('calls the faction, block-list and unblock endpoints the game uses', async () => {
    const fetchImpl = vi.fn((url) => Promise.resolve(url.endsWith('csrfToken') ? response(200, { token: 'tok' }) : response(200, { success: true })));
    const api = createApi({ fetchImpl });
    await api.getFactionMembers();
    await api.blockList(3);
    const r = await api.unblockUser(41);
    expect(r).toEqual({ ok: true, data: { success: true } });
    const urls = fetchImpl.mock.calls.map(([u]) => u);
    expect(urls).toContain('https://api.zed.city/getFactionMembers');
    expect(urls).toContain('https://api.zed.city/blockList?page=3');
    const [, init] = fetchImpl.mock.calls.find(([u]) => u.endsWith('unblockUser'));
    expect(init.method).toBe('POST');
    expect(init.headers['X-CSRF-Token']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({ user_id: 41 });
  });
```

Append to `test/inbox.test.js` inside `describe('inbox', …)`:

```js
  it('fetches an older page of threads on request, normalized, without touching the poll state', async () => {
    const { api, inbox } = setup([]);
    api.getChats.mockResolvedValueOnce({ ok: true, data: [rawThread(8, { username: 'Old' })] });
    const r = await inbox.fetchPage(2);
    expect(api.getChats).toHaveBeenCalledWith(2);
    expect(r.ok).toBe(true);
    expect(r.threads.map((t) => [t.userId, t.username])).toEqual([[8, 'Old']]);
    expect(inbox.threads()).toEqual([]);
    api.getChats.mockResolvedValueOnce({ ok: false, kind: 'network' });
    expect(await inbox.fetchPage(3)).toMatchObject({ ok: false, kind: 'network' });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/api.test.js test/inbox.test.js`
Expected: FAIL (`api.getFactionMembers is not a function`, `inbox.fetchPage is not a function`).

- [ ] **Step 3: Implement**

In `src/api.js`, add to the returned object after `findPlayer`:

```js
    getFactionMembers: () => request('GET', 'getFactionMembers'),
    blockList: (page = 1) => request('GET', 'blockList', { params: { page } }),
    unblockUser: (userId) => request('POST', 'unblockUser', { body: { user_id: userId } }),
```

In `src/inbox.js`, add to the returned object after `lastReply`:

```js
    // An older page of the thread list, for the Private Messages window's Chats tab. Nothing else
    // (badges, pop-ups, change signals) looks at these; page 1 stays the poll's job.
    async fetchPage(page) {
      const r = await api.getChats(page);
      if (!r.ok) return r;
      return { ok: true, threads: normalizeThreads(r.data) };
    },
```

In `test/helpers.js` `fakeApi`, add after `findPlayer`:

```js
    getFactionMembers: vi.fn(() => ok({ faction: null, members: [] })),
    blockList: vi.fn(() => ok({ list: [], total: 0 })),
    unblockUser: vi.fn(() => ok({ success: true })),
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/api.test.js test/inbox.test.js`
Expected: PASS.

### Task 6: The settings document and a generic document store

**Files:**
- Create: `src/chat-custom/chats.js`, `src/settings.js`
- Modify: `src/store.js`
- Test: `test/chat-custom/chats.test.js`, `test/settings.test.js`, `test/store.test.js`

- [ ] **Step 1: Write the failing tests**

<!-- file: test/chat-custom/chats.test.js -->
```js
import { describe, it, expect } from 'vitest';
import {
  isChatKey,
  dmKey,
  dmIdOf,
  normalizeChatEntry,
  normalizeChats,
  clampText,
  textOf,
  isLocked,
  isMoved,
  chatLabel,
  describeChat,
  LIMITS,
} from '../../src/chat-custom/chats.js';

describe('chat keys and entries', () => {
  it('accepts only the known chat keys', () => {
    for (const k of ['game:general', 'game:faction', 'game:activity', 'pm', 'settings', 'dm:5', dmKey(123)]) expect(isChatKey(k)).toBe(true);
    for (const k of ['game:trade', 'dm:0', 'dm:-1', 'dm:x', 'PM', '', null, 'dm:5 ']) expect(isChatKey(k)).toBe(false);
    expect(dmIdOf('dm:77')).toBe(77);
    expect(dmIdOf('pm')).toBeNull();
  });

  it('clamps sizes and message size, and drops defaults', () => {
    expect(normalizeChatEntry({ w: 10, h: 99999, text: 137, locked: true, x: 5 })).toEqual({ w: LIMITS.minW, h: LIMITS.maxH, text: 140 });
    expect(normalizeChatEntry({ w: 420.4, h: 520, text: 100, locked: false, x: -3, y: 40.6 })).toEqual({ w: 420, h: 520, locked: false, x: 0, y: 41 });
    expect(normalizeChatEntry({ text: 20 })).toEqual({ text: 80 });
    expect(normalizeChatEntry({ w: 'wide', x: NaN, y: 1 })).toEqual({});
    expect(normalizeChatEntry(null)).toEqual({});
    expect(clampText(250)).toBe(200);
  });

  it('keeps only valid keys and non-empty entries', () => {
    expect(normalizeChats({ pm: { w: 380 }, 'dm:3': { text: 100 }, bogus: { w: 400 }, 'game:general': { locked: false } })).toEqual({
      pm: { w: 380 },
      'game:general': { locked: false },
    });
    expect(normalizeChats([])).toEqual({});
    expect(normalizeChats('x')).toEqual({});
  });

  it('reads an entry with defaults', () => {
    expect(textOf(undefined)).toBe(100);
    expect(isLocked(undefined)).toBe(true);
    expect(isLocked({ locked: false })).toBe(false);
    expect(isMoved({ x: 0, y: 0 })).toBe(true);
    expect(isMoved({ w: 400 })).toBe(false);
  });

  it('labels chats and describes their settings', () => {
    expect(chatLabel('game:general')).toBe('Global');
    expect(chatLabel('game:activity')).toBe('Activity');
    expect(chatLabel('pm')).toBe('Private Messages');
    expect(chatLabel('settings')).toBe('Chat settings');
    expect(chatLabel('dm:5', 'Spike')).toBe('Spike');
    expect(chatLabel('dm:5')).toBe('#5');
    expect(describeChat(undefined)).toBe('docked · default size · text 100%');
    expect(describeChat({ x: 1, y: 2, w: 420, h: 520, text: 120 })).toBe('moved · 420×520 · text 120%');
    expect(describeChat({ w: 400 })).toBe('docked · 400×auto · text 100%');
  });
});
```

<!-- file: test/settings.test.js -->
```js
import { describe, it, expect } from 'vitest';
import {
  defaultSettings,
  normalizeSettings,
  setPmTab,
  setSound,
  isMuted,
  setMuted,
  updateChat,
  resetChat,
  resetAllChats,
  MAX_MUTED,
} from '../src/settings.js';

describe('settings document', () => {
  it('normalizes, and rejects documents that are not ours', () => {
    expect(normalizeSettings({ v: 1 })).toEqual(defaultSettings());
    expect(normalizeSettings({ v: 1, pmTab: 'blocked', sound: 'bell', muted: [3, '4', 3, -1, 'x'], chats: { pm: { w: 380 }, bad: {} } })).toEqual({
      v: 1,
      pmTab: 'blocked',
      sound: 'bell',
      chats: { pm: { w: 380 } },
      muted: [3, 4],
    });
    expect(normalizeSettings({ v: 1, pmTab: 'nope', sound: 'siren' })).toMatchObject({ pmTab: 'chats', sound: 'off' });
    expect(() => normalizeSettings({ v: 2 })).toThrow();
    expect(() => normalizeSettings([])).toThrow();
  });

  it('sets the tab and sound only to known values', () => {
    const s = defaultSettings();
    setPmTab(s, 'faction');
    setPmTab(s, 'nope');
    setSound(s, 'ping');
    setSound(s, 'siren');
    expect(s).toMatchObject({ pmTab: 'faction', sound: 'ping' });
  });

  it('mutes and unmutes, newest first, capped', () => {
    const s = defaultSettings();
    setMuted(s, 5, true);
    setMuted(s, '6', true);
    setMuted(s, 5, true);
    expect(s.muted).toEqual([5, 6]);
    expect(isMuted(s, 6)).toBe(true);
    setMuted(s, 6, false);
    expect(s.muted).toEqual([5]);
    for (let id = 1000; id < 1000 + MAX_MUTED + 5; id += 1) setMuted(s, id, true);
    expect(s.muted).toHaveLength(MAX_MUTED);
    expect(s.muted[0]).toBe(1000 + MAX_MUTED + 4);
  });

  it('merges per-chat changes, resets fields with null, and removes entries back at the defaults', () => {
    const s = defaultSettings();
    updateChat(s, 'pm', { locked: false, w: 380 });
    updateChat(s, 'pm', { text: 120 });
    expect(s.chats.pm).toEqual({ locked: false, w: 380, text: 120 });
    updateChat(s, 'pm', { w: null, text: 100, locked: null });
    expect(s.chats.pm).toBeUndefined();
    updateChat(s, 'bogus', { w: 400 });
    expect(s.chats).toEqual({});
    updateChat(s, 'dm:5', { x: 10, y: 20 });
    updateChat(s, 'game:general', { h: 600 });
    resetChat(s, 'dm:5');
    expect(Object.keys(s.chats)).toEqual(['game:general']);
    resetAllChats(s);
    expect(s.chats).toEqual({});
  });
});
```

Append to `test/store.test.js` (add `createDocStore, createSettingsStore, settingsKey` to its import from `../src/store.js`):

```js
describe('document store', () => {
  const normalize = (d) => {
    if (!d || d.v !== 1) throw new Error('bad');
    return { v: 1, n: Number(d.n) || 0 };
  };
  const make = (storage, win = new EventTarget()) => createDocStore({ key: 'k', empty: () => ({ v: 1, n: 0 }), normalize, storage, win, now: () => 7 });

  it('reads, updates on top of other tabs, and saves under its own key', () => {
    const storage = memoryStorage({ k: JSON.stringify({ v: 1, n: 2 }) });
    const a = make(storage);
    const b = make(storage);
    expect(a.get()).toEqual({ v: 1, n: 2 });
    a.update((d) => { d.n += 1; });
    b.update((d) => { d.n += 10; });
    expect(JSON.parse(storage.getItem('k'))).toEqual({ v: 1, n: 13 });
    a.destroy();
    b.destroy();
  });

  it('reloads on the storage event for its key only', () => {
    const storage = memoryStorage();
    const win = new EventTarget();
    const store = make(storage, win);
    const fn = vi.fn();
    store.subscribe(fn);
    storage.setItem('k', JSON.stringify({ v: 1, n: 5 }));
    win.dispatchEvent(storageEvent('other'));
    expect(fn).not.toHaveBeenCalled();
    win.dispatchEvent(storageEvent('k'));
    expect(store.get().n).toBe(5);
    expect(fn).toHaveBeenCalledTimes(1);
    store.destroy();
  });

  it('backs up a corrupt document and starts empty; leaves a newer version alone', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage({ k: '{nope' });
    const store = make(storage);
    expect(store.get()).toEqual({ v: 1, n: 0 });
    expect(storage.getItem('k:corrupt:7')).toBe('{nope');
    store.destroy();
    const newer = memoryStorage({ k: JSON.stringify({ v: 2, n: 9 }) });
    const s2 = make(newer);
    s2.update((d) => { d.n = 1; });
    expect(s2.get().n).toBe(1);
    expect(JSON.parse(newer.getItem('k')).v).toBe(2);
    s2.destroy();
  });

  it('keeps the settings document beside the main one', () => {
    const storage = memoryStorage();
    const settings = createSettingsStore({ playerId: 1, storage, win: new EventTarget() });
    expect(settings.key).toBe(settingsKey(1));
    expect(settingsKey(1)).toBe('zcf:v1:1:settings');
    settings.update((s) => { s.pmTab = 'friends'; });
    expect(JSON.parse(storage.getItem('zcf:v1:1:settings')).pmTab).toBe('friends');
    expect(storage.getItem(storageKey(1))).toBeNull();
    settings.destroy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/chat-custom/chats.test.js test/settings.test.js test/store.test.js`
Expected: FAIL (modules and exports missing).

- [ ] **Step 3: Implement**

<!-- file: src/chat-custom/chats.js -->
```js
// Chat keys, limits and the per-chat settings entry (spec §B.2, §B.5). Pure.
export const GAME_CHATS = [
  { key: 'game:general', cls: 'general-chat', label: 'Global' },
  { key: 'game:faction', cls: 'faction-chat', label: 'Faction' },
  { key: 'game:activity', cls: 'activity-chat', label: 'Activity' },
];
export const LIMITS = { minW: 270, maxW: 900, minH: 200, maxH: 2000, minText: 80, maxText: 200, textStep: 10 };
export const DEFAULT_TEXT = 100;

const KEY_RE = /^(?:game:(?:general|faction|activity)|pm|settings|dm:[1-9]\d{0,15})$/;
export const isChatKey = (key) => typeof key === 'string' && KEY_RE.test(key);
export const dmKey = (id) => `dm:${id}`;
export const dmIdOf = (key) => (typeof key === 'string' && /^dm:\d+$/.test(key) ? Number(key.slice(3)) : null);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const clampText = (v) => clamp(Math.round(v / LIMITS.textStep) * LIMITS.textStep, LIMITS.minText, LIMITS.maxText);

// Keeps only valid fields, clamped. Anything equal to its default is left out: locked (the default),
// 100% message size, no position (x and y come as a pair or not at all).
export function normalizeChatEntry(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if (raw.locked === false) out.locked = false;
  const x = num(raw.x);
  const y = num(raw.y);
  if (x !== null && y !== null) {
    out.x = Math.max(0, Math.round(x));
    out.y = Math.max(0, Math.round(y));
  }
  const w = num(raw.w);
  if (w !== null) out.w = clamp(Math.round(w), LIMITS.minW, LIMITS.maxW);
  const h = num(raw.h);
  if (h !== null) out.h = clamp(Math.round(h), LIMITS.minH, LIMITS.maxH);
  const t = num(raw.text);
  if (t !== null && clampText(t) !== DEFAULT_TEXT) out.text = clampText(t);
  return out;
}

export function normalizeChats(chats) {
  const out = {};
  if (!chats || typeof chats !== 'object' || Array.isArray(chats)) return out;
  for (const [key, raw] of Object.entries(chats)) {
    if (!isChatKey(key)) continue;
    const entry = normalizeChatEntry(raw);
    if (Object.keys(entry).length) out[key] = entry;
  }
  return out;
}

export const textOf = (entry) => (entry && entry.text) || DEFAULT_TEXT;
export const isLocked = (entry) => !(entry && entry.locked === false);
export const isMoved = (entry) => !!(entry && typeof entry.x === 'number' && typeof entry.y === 'number');

export function chatLabel(key, dmName) {
  const game = GAME_CHATS.find((g) => g.key === key);
  if (game) return game.label;
  if (key === 'pm') return 'Private Messages';
  if (key === 'settings') return 'Chat settings';
  const id = dmIdOf(key);
  return id ? dmName || `#${id}` : String(key);
}

// One line for the Chat settings list, e.g. "moved · 420×520 · text 120%".
export function describeChat(entry) {
  const size = entry && (entry.w || entry.h) ? `${entry.w || 'auto'}×${entry.h || 'auto'}` : 'default size';
  return [isMoved(entry) ? 'moved' : 'docked', size, `text ${textOf(entry)}%`].join(' · ');
}
```

<!-- file: src/settings.js -->
```js
// The settings document (spec §B.5): the Private Messages tab, the new-PM sound, per-chat customizations
// and muted conversations. Pure; store.js reads and writes it as its own localStorage document.
import { normalizeChats, normalizeChatEntry, isChatKey } from './chat-custom/chats.js';
import { toId } from './util.js';

export const PM_TABS = ['chats', 'friends', 'faction', 'blocked'];
export const SOUNDS = ['off', 'chirp', 'ping', 'bell'];
export const MAX_MUTED = 500;

export function defaultSettings() {
  return { v: 1, pmTab: 'chats', sound: 'off', chats: {}, muted: [] };
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// Positive integer ids, no duplicates, at most MAX_MUTED (the first ones win: newest first).
export function normalizeMuted(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_MUTED) break;
    const id = toId(v);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// Throws for a document that isn't ours, so the store falls back to the defaults.
export function normalizeSettings(doc) {
  if (!isObj(doc) || doc.v !== 1) throw new Error('Unsupported settings document');
  return {
    v: 1,
    pmTab: PM_TABS.includes(doc.pmTab) ? doc.pmTab : 'chats',
    sound: SOUNDS.includes(doc.sound) ? doc.sound : 'off',
    chats: normalizeChats(doc.chats),
    muted: normalizeMuted(doc.muted),
  };
}

export function setPmTab(s, tab) {
  if (PM_TABS.includes(tab)) s.pmTab = tab;
}

export function setSound(s, sound) {
  if (SOUNDS.includes(sound)) s.sound = sound;
}

export const isMuted = (s, id) => s.muted.includes(Number(id));

export function setMuted(s, id, on) {
  const n = toId(id);
  if (!n) return;
  const rest = s.muted.filter((x) => x !== n);
  s.muted = normalizeMuted(on ? [n, ...rest] : rest);
}

// Merges `patch` into one chat's entry. A null field goes back to its default, and an entry left with
// nothing but defaults is removed.
export function updateChat(s, key, patch) {
  if (!isChatKey(key)) return;
  const next = { ...(s.chats[key] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = v;
  }
  const entry = normalizeChatEntry(next);
  if (Object.keys(entry).length) s.chats[key] = entry;
  else delete s.chats[key];
}

export function resetChat(s, key) {
  delete s.chats[key];
}

export function resetAllChats(s) {
  s.chats = {};
}
```

In `src/store.js`:
- add to the imports: `import { defaultSettings, normalizeSettings } from './settings.js';`
- add under `storageKey`:

```js
export const settingsKey = (playerId) => `zcf:v1:${playerId}:settings`;
```

- append at the end of the file:

```js
// A small JSON document of its own (settings, enemies), kept apart from the main document because older
// script versions normalize that one and would drop fields they don't know. Same get / update / subscribe
// shape as createStore, following other tabs through the storage event. A corrupt document is backed up
// and replaced with empty(); one from a newer script version is left alone (changes stay in memory).
export function createDocStore({ key, empty, normalize, storage = window.localStorage, win = window, now = () => Date.now() }) {
  const subs = new Set();
  let saved = true;

  function read({ repair } = {}) {
    let text = null;
    try {
      text = storage.getItem(key);
    } catch (e) {
      warnOnce(`docstore-read:${key}`, e);
      return { doc: null, ok: false };
    }
    if (!text) return { doc: empty(), ok: true };
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && typeof parsed.v === 'number' && parsed.v > 1) {
        warnOnce(`docstore-newer:${key}`, parsed.v);
        return { doc: null, ok: false };
      }
      return { doc: normalize(parsed), ok: true };
    } catch (e) {
      warnOnce(`docstore-corrupt:${key}`, e);
      if (!repair) return { doc: null, ok: false };
      try {
        storage.setItem(`${key}:corrupt:${now()}`, text);
        storage.removeItem(key);
      } catch {
        return { doc: null, ok: false };
      }
      return { doc: empty(), ok: true, repaired: true };
    }
  }

  const initial = read({ repair: true });
  let doc = initial.ok ? initial.doc : empty();

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn(doc);
      } catch (e) {
        warnOnce(`docstore-subscriber:${key}`, e);
      }
    }
  }

  function update(mutate) {
    // Same merge rule as createStore: apply on top of what another tab saved, unless that copy is
    // unusable or our own last save failed.
    const r = read({ repair: true });
    const draft = r.ok && saved && !r.repaired ? r.doc : JSON.parse(JSON.stringify(doc));
    const result = mutate(draft);
    doc = normalize(draft);
    if (r.ok) {
      try {
        storage.setItem(key, JSON.stringify(doc));
        saved = true;
      } catch (e) {
        saved = false;
        warnOnce(`docstore-write:${key}`, e);
      }
    }
    emit();
    return result;
  }

  function onStorage(e) {
    if (e.key !== key && e.key !== null) return;
    const r = read({ repair: false });
    if (!r.ok) return;
    doc = r.doc;
    saved = true;
    emit();
  }
  win.addEventListener('storage', onStorage);

  return {
    key,
    get: () => doc,
    update,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    destroy() {
      win.removeEventListener('storage', onStorage);
      subs.clear();
    },
  };
}

export function createSettingsStore({ playerId, ...opts }) {
  return createDocStore({ key: settingsKey(playerId), empty: defaultSettings, normalize: normalizeSettings, ...opts });
}
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/chat-custom/chats.test.js test/settings.test.js test/store.test.js`
Expected: PASS.

### Task 7: Pure rows for the PM window

**Files:**
- Create: `src/pm-view.js`
- Test: `test/pm-view.test.js`

- [ ] **Step 1: Write the failing test**

<!-- file: test/pm-view.test.js -->
```js
import { describe, it, expect } from 'vitest';
import { buildChatRows, previewLine, buildFactionRows, buildBlockedRows } from '../src/pm-view.js';

const T = (userId, lastReply, o = {}) => ({ userId, username: `U${userId}`, avatar: null, preview: 'hi', senderId: userId, lastReply, newMail: 0, isSystem: false, ...o });

describe('pm view', () => {
  it('merges page 1 with older pages: newest per player, newest first, no system threads', () => {
    const rows = buildChatRows({
      page1: [T(1, 500), T(2, 900), T(3, 999, { isSystem: true })],
      older: [[T(1, 100), T(4, 50)], [T(5, 700)]],
      threads: { 2: { unread: 3 } },
    });
    expect(rows.map((r) => [r.userId, r.lastReply, r.unread])).toEqual([[2, 900, 3], [5, 700, 0], [1, 500, 0], [4, 50, 0]]);
  });

  it('prefixes the preview with You or the sender name', () => {
    expect(previewLine(T(7, 1, { username: 'Nyx', preview: 'see you' }), 1)).toBe('Nyx: see you');
    expect(previewLine(T(7, 1, { senderId: 1, preview: 'on my way' }), 1)).toBe('You: on my way');
    expect(previewLine(T(7, 1, { preview: '' }), 1)).toBe('');
  });

  it('builds faction rows without you: online A-Z, then most recently active', () => {
    const now = 1800000000000;
    const rows = buildFactionRows({
      faction: { id: 1 },
      members: [
        { id: 1, username: 'Me', online: 1 },
        { id: 2, username: 'bram', online: '0', active: 600, level: '12' },
        { id: 3, username: 'Cato', online: true, level: 30, avatar: 'c.png' },
        { id: 4, username: 'Abe', online: 1, level: 0 },
        { id: 5, username: 'Dex', online: 0, active: 60 },
        { id: 'x', username: 'Bad' },
      ],
    }, { myId: 1, now });
    expect(rows.map((r) => r.username)).toEqual(['Abe', 'Cato', 'Dex', 'bram']);
    expect(rows[1]).toEqual({ id: 3, username: 'Cato', avatar: 'c.png', online: true, active: null, level: 30 });
    expect(rows[0].level).toBeNull();
    expect(rows[3]).toMatchObject({ online: false, active: now - 600000, level: 12 });
  });

  it('builds blocked rows A-Z, one per player', () => {
    expect(buildBlockedRows([[{ id: 2, username: 'zed' }, { id: 1, username: 'Abby', avatar: 'a.png' }], [{ id: 2, username: 'zed' }, { id: 0 }]])).toEqual([
      { id: 1, username: 'Abby', avatar: 'a.png' },
      { id: 2, username: 'zed', avatar: null },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/pm-view.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

<!-- file: src/pm-view.js -->
```js
// Pure data for the Private Messages window: the Chats, Faction and Blocked tab rows (spec §A.4).
import { lastActive } from './presence.js';
import { asArray, toId } from './util.js';

const byName = (a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
const str = (v) => (typeof v === 'string' && v ? v : null);
const truthy = (v) => v === true || Number(v) > 0;

// Inbox page 1 (always fresh from the poll) plus the older pages loaded by scrolling: one row per player,
// the newest thread winning when a player shows up on two pages, newest first, no system threads.
// `threads` is the saved thread state, for unread counts.
export function buildChatRows({ page1 = [], older = [], threads = {} }) {
  const best = new Map();
  for (const t of [...page1, ...older.flat()]) {
    if (!t || t.isSystem) continue;
    const prev = best.get(t.userId);
    if (!prev || (t.lastReply || 0) > (prev.lastReply || 0)) best.set(t.userId, t);
  }
  return [...best.values()]
    .map((t) => ({ ...t, unread: (threads[t.userId] && threads[t.userId].unread) || 0 }))
    .sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0) || a.userId - b.userId);
}

// "You: …" when your message was the last one, "Name: …" when theirs was.
export function previewLine(t, myId) {
  if (!t.preview) return '';
  return `${t.senderId === myId ? 'You' : t.username}: ${t.preview}`;
}

// getFactionMembers → the Faction tab, without you: online first (A-Z), then by last active.
export function buildFactionRows(data, { myId, now = Date.now() } = {}) {
  const rows = [];
  for (const m of asArray(data && data.members)) {
    const id = toId(m && m.id);
    if (!id || id === myId) continue;
    const level = Number(m.level);
    rows.push({
      id,
      username: str(m.username) || `#${id}`,
      avatar: str(m.avatar),
      online: truthy(m.online),
      active: lastActive(m.active, now),
      level: Number.isFinite(level) && level > 0 ? level : null,
    });
  }
  return rows.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.online) return byName(a, b);
    return (b.active || 0) - (a.active || 0) || byName(a, b);
  });
}

// blockList pages → the Blocked tab, A-Z, one row per player.
export function buildBlockedRows(pages) {
  const seen = new Map();
  for (const u of pages.flat()) {
    const id = toId(u && u.id);
    if (!id || seen.has(id)) continue;
    seen.set(id, { id, username: str(u.username) || `#${id}`, avatar: str(u.avatar) });
  }
  return [...seen.values()].sort(byName);
}
```

- [ ] **Step 4: Run it again**

Run: `npx vitest run test/pm-view.test.js`
Expected: PASS.

### Task 8: Shared player search; the pop-out uses it

**Files:**
- Create: `src/ui/player-search.js`, `src/ui/marks.js`
- Modify: `src/ui/add-friend-popover.js`, `src/ui/friends-page.js`
- Test: `test/ui/player-search.test.js`, `test/ui/add-friend-popover.test.js`

- [ ] **Step 1: Write the failing tests**

<!-- file: test/ui/player-search.test.js -->
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayerSearch, MAX_RESULTS } from '../../src/ui/player-search.js';

describe('player search', () => {
  afterEach(() => vi.useRealTimers());

  it('searches 300ms after typing stops, for 2+ characters or an all-digit id', async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, username: `P${i}` }));
    const players = { search: vi.fn().mockResolvedValue({ ok: true, data: many }) };
    const onState = vi.fn();
    const s = createPlayerSearch({ players, onState });
    s.set('z');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'short' });
    s.set('');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'idle' });
    s.set('7');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'searching' });
    await vi.advanceTimersByTimeAsync(299);
    expect(players.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(players.search).toHaveBeenCalledWith('7');
    expect(onState).toHaveBeenLastCalledWith({ kind: 'results', results: many.slice(0, MAX_RESULTS) });
  });

  it('drops a reply that arrives after the query moved on, and reports failures', async () => {
    vi.useFakeTimers();
    let resolveFirst;
    const players = {
      search: vi.fn((q) => (q === 'zo' ? new Promise((r) => { resolveFirst = r; }) : Promise.reject(new Error('boom')))),
    };
    const onState = vi.fn();
    const s = createPlayerSearch({ players, onState });
    s.set('zo');
    await vi.advanceTimersByTimeAsync(300);
    s.set('zombieK');
    resolveFirst({ ok: true, data: [{ id: 3, username: 'Zorro' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(onState).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'results' }));
    await vi.advanceTimersByTimeAsync(300);
    expect(onState).toHaveBeenLastCalledWith({ kind: 'error', text: 'Search failed. Try again.' });
    s.cancel();
  });
});
```

<!-- file: test/ui/add-friend-popover.test.js -->
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAddFriendPopover } from '../../src/ui/add-friend-popover.js';

function setup(opts = {}) {
  const added = new Set([8]);
  const players = { search: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 7, username: 'ZombieKing', avatar: null }, { id: 8, username: 'Zombo', avatar: null }] }) };
  const onAdd = vi.fn((p) => added.add(p.id));
  const onClose = vi.fn();
  const pop = createAddFriendPopover({ players, isAdded: (id) => added.has(id), onAdd, onClose, ...opts });
  document.body.innerHTML = '';
  document.body.appendChild(pop.el);
  return { pop, players, onAdd, onClose };
}

describe('add pop-out', () => {
  afterEach(() => vi.useRealTimers());

  it('finds players, adds one, marks those already added, and closes on Esc', async () => {
    vi.useFakeTimers();
    const { pop, players, onAdd, onClose } = setup();
    pop.open();
    expect(pop.isOpen).toBe(true);
    pop.input.value = 'zo';
    pop.input.dispatchEvent(new Event('input'));
    expect(pop.el.textContent).toContain('Searching…');
    await vi.advanceTimersByTimeAsync(300);
    expect(players.search).toHaveBeenCalledWith('zo');
    const rows = [...pop.el.querySelectorAll('.zcf-result')];
    expect(rows.map((r) => r.querySelector('.zcf-name').textContent)).toEqual(['ZombieKing', 'Zombo']);
    expect(rows[1].textContent).toContain('✓ Friend');
    rows[0].querySelector('.zcf-add').click();
    expect(onAdd).toHaveBeenCalledWith({ id: 7, username: 'ZombieKing', avatar: null });
    expect(pop.el.querySelector('.zcf-result').textContent).toContain('✓ Friend');
    pop.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pop.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('can be relabelled for another list', async () => {
    vi.useFakeTimers();
    const { pop } = setup();
    pop.setLabels({ title: 'Add enemy', doneText: '✓ Enemy' });
    pop.open();
    expect(pop.el.querySelector('.zcf-pop-title').textContent).toBe('Add enemy');
    pop.input.value = 'zo';
    pop.input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect(pop.el.querySelectorAll('.zcf-result')[1].textContent).toContain('✓ Enemy');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/ui/player-search.test.js test/ui/add-friend-popover.test.js`
Expected: FAIL (module missing; `isAdded`/`setLabels` unknown).

- [ ] **Step 3: Implement**

<!-- file: src/ui/player-search.js -->
```js
// The debounced player lookup behind the add pop-out and the Private Messages search box: it asks the
// game 300ms after typing stops, for 2+ characters or any all-digit ID, and drops a reply that arrives
// after the query moved on.
import { debounce } from '../util.js';

export const MAX_RESULTS = 8;
export const SEARCH_MS = 300;

// onState({ kind: 'idle' | 'short' | 'searching' | 'error' | 'results', text?, results? })
export function createPlayerSearch({ players, onState }) {
  let seq = 0;
  // `mine` is snapshotted per keystroke, not per debounced call, so a request already in flight is
  // dropped as soon as the query moves on, even before the next debounce fires.
  const run = debounce(async (mine, q) => {
    let r;
    try {
      r = await players.search(q);
    } catch {
      r = { ok: false };
    }
    if (mine !== seq) return;
    if (!r.ok) onState({ kind: 'error', text: 'Search failed. Try again.' });
    else onState({ kind: 'results', results: r.data.slice(0, MAX_RESULTS) });
  }, SEARCH_MS);

  return {
    set(value) {
      const q = String(value || '').trim();
      seq += 1;
      const mine = seq;
      if (q.length >= 2 || /^\d+$/.test(q)) {
        onState({ kind: 'searching' });
        run(mine, q);
      } else {
        run.cancel();
        onState({ kind: q ? 'short' : 'idle' });
      }
    },
    cancel() {
      run.cancel();
      seq += 1;
    },
  };
}
```

<!-- file: src/ui/add-friend-popover.js -->
```js
// The pop-out behind the Friends page's Add button: search the game's players by name or ID and add them
// to the list the page is showing (friends or enemies).
import { h, clear, avatar } from './dom.js';
import { createPlayerSearch } from './player-search.js';

export { MAX_RESULTS } from './player-search.js';

const MESSAGES = { idle: '', short: 'Keep typing…', searching: 'Searching…' };

export function createAddFriendPopover({ players, isAdded, onAdd, onClose, title = 'Add friend', doneText = '✓ Friend' }) {
  let results = [];
  let done = doneText;

  const input = h('input', { class: 'zcf-input', type: 'text', placeholder: 'Name or player ID', 'aria-label': 'Find a player' });
  const list = h('div', { class: 'zcf-results' });
  const titleEl = h('div', { class: 'zcf-pop-title' }, title);
  const el = h('div', { class: 'zcf-pop', hidden: true }, titleEl, input, list);

  function message(text) {
    clear(list);
    if (text) list.appendChild(h('div', { class: 'zcf-empty' }, text));
  }

  function row(p) {
    const action = isAdded(p.id)
      ? h('span', { class: 'zcf-done' }, done)
      : h('button', {
          class: 'zcf-add',
          type: 'button',
          onclick: (e) => {
            e.stopPropagation();
            onAdd(p);
            render();
            input.focus();
          },
        }, 'Add');
    return h('div', { class: 'zcf-result' },
      avatar({ avatar: p.avatar, size: 22 }),
      h('div', { class: 'zcf-row-main' }, h('div', { class: 'zcf-name' }, p.username), h('div', { class: 'zcf-status' }, `#${p.id}`)),
      action);
  }

  function render() {
    if (!results.length) {
      message('No players found.');
      return;
    }
    clear(list);
    for (const p of results) list.appendChild(row(p));
  }

  const search = createPlayerSearch({
    players,
    onState(st) {
      if (st.kind === 'results') {
        results = st.results;
        render();
        return;
      }
      results = [];
      message(st.kind === 'error' ? st.text : MESSAGES[st.kind]);
    },
  });

  input.addEventListener('input', () => search.set(input.value));
  // Capture phase, so Escape closes the pop-out whichever of its children has focus.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }, true);

  function open() {
    el.hidden = false;
    input.value = '';
    results = [];
    message('');
    input.focus();
  }

  function close() {
    el.hidden = true;
    search.cancel();
    if (onClose) onClose();
  }

  return {
    el,
    input,
    open,
    close,
    get isOpen() {
      return !el.hidden;
    },
    // Re-draw "Add" / "✓ Friend" after the list changes elsewhere.
    refresh() {
      if (!el.hidden && results.length) render();
    },
    setLabels({ title: t, doneText: d }) {
      titleEl.textContent = t;
      done = d;
      if (!el.hidden && results.length) render();
    },
  };
}
```

<!-- file: src/ui/marks.js -->
```js
// Small inline markers shared by the Private Messages, DM and game chats.
import { h } from './dom.js';

// The red skull before an enemy's name (spec §C.5).
export const enemyMark = () => h('i', { class: 'fas fa-skull zcf-enemy-mark', role: 'img', title: 'Enemy', 'aria-label': 'Enemy' });

// After a muted conversation's name in the Chats tab (spec §D.1).
export const mutedMark = () => h('i', { class: 'fas fa-bell-slash zcf-muted-mark', role: 'img', title: 'Muted', 'aria-label': 'Muted' });
```

In `src/ui/friends-page.js`, change the `createAddFriendPopover({ … isFriend: (id) => isFriend(store.get(), id), …})` option name to `isAdded:` (same value).

- [ ] **Step 4: Run them again, plus the page**

Run: `npx vitest run test/ui/player-search.test.js test/ui/add-friend-popover.test.js test/ui/friends-page.test.js`
Expected: PASS.

### Task 9: The Private Messages window

**Files:**
- Create: `src/ui/pm-window.js`
- Modify: `test/ui/services.js`
- Test: `test/ui/pm-window.test.js`

- [ ] **Step 1: Update the test services**

In `test/ui/services.js`:
- change the store import to `import { createStore, createSettingsStore } from '../../src/store.js';` and add `import { setPmTab } from '../../src/settings.js';`
- change the signature to `export function makeServices({ api = fakeApi(), threads = [], presence = {}, searchResults = [], fetchImpl, storage = memoryStorage(), olderPages = [] } = {}) {`
- after `const store = …` add `const settings = createSettingsStore({ playerId: ME, storage });`
- replace the `toggleFriends` action with:

```js
    togglePm: vi.fn(() => store.update((s) => setFriendsOpen(s, !s.dock.friendsOpen))),
    setPmTab: vi.fn((tab) => settings.update((s) => setPmTab(s, tab))),
```

- replace the `inbox:` line with:

```js
    inbox: {
      threads: () => threads,
      subscribe: () => () => {},
      lastReply: () => null,
      fetchPage: vi.fn(async (page) => ({ ok: true, threads: olderPages[page - 2] || [] })),
    },
    settings,
```

- [ ] **Step 2: Write the failing test**

<!-- file: test/ui/pm-window.test.js -->
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPmWindow, FACTION_MS } from '../../src/ui/pm-window.js';
import { addFriend } from '../../src/state.js';
import { makeServices, ME } from './services.js';
import { fakeApi, flush } from '../helpers.js';

const NOW = Date.now();
const thread = (userId, o = {}) => ({ userId, username: `U${userId}`, avatar: null, preview: 'hi', senderId: userId, lastReply: NOW - userId * 60000, newMail: 0, isSystem: false, ...o });

let current = null;
function mount(opts = {}, { open = true, tab } = {}) {
  const services = makeServices(opts);
  const w = createPmWindow(services);
  document.body.appendChild(w.el);
  services.store.subscribe(() => w.update());
  services.settings.subscribe(() => w.update());
  if (tab) services.settings.update((s) => { s.pmTab = tab; });
  if (open) services.store.update((s) => { s.dock.friendsOpen = true; });
  w.update();
  current = w;
  return { services, w, el: w.el };
}

const list = (el) => el.querySelector('.zcf-pm-list');
const rowNames = (el) => [...list(el).querySelectorAll('.zcf-row .zcf-name')].map((n) => n.textContent);
const tabBtn = (el, label) => [...el.querySelectorAll('.zcf-pm-tab')].find((b) => b.textContent === label);
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
function typeSearch(el, text) {
  const input = el.querySelector('.zcf-pm-search input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return input;
}

describe('private messages window', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  });
  afterEach(() => {
    if (current) current.destroy();
    current = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a minimized envelope tab with a green count of unread chats, friends and Chats alike', () => {
    const { services, el } = mount({ threads: [thread(9)] }, { open: false });
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.threads = { 5: { unread: 2 }, 9: { unread: 4 } };
    });
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.dataset.zcfChat).toBe('pm');
    expect(el.querySelector('.chat-icon').className).toContain('fa-envelope');
    const unread = el.querySelector('.unread-badge');
    expect(unread.textContent).toBe('6');
    expect(unread.hidden).toBe(false);
    expect(unread.classList.contains('bg-positive')).toBe(true);
    expect(el.querySelector('.zcf-body').hidden).toBe(true);
  });

  it('opens on the Chats tab: newest first, previews, times, unread pills, no system threads', () => {
    const { services, el } = mount({
      threads: [
        thread(7, { username: 'Nyx', preview: 'see you there', senderId: ME, lastReply: NOW - 3 * 3600000 }),
        thread(9, { username: 'TradeGuy', preview: 'wanna buy ammo?', lastReply: NOW - 18 * 60000 }),
        thread(3, { username: 'System', isSystem: true, lastReply: NOW }),
      ],
    });
    services.store.update((s) => { s.threads = { 9: { unread: 2 } }; });
    expect(el.querySelector('.chat-title').textContent).toContain('Private Messages');
    expect([...el.querySelectorAll('.zcf-pm-tab')].map((b) => b.textContent)).toEqual(['Chats', 'Friends', 'Faction', 'Blocked']);
    expect(tabBtn(el, 'Chats').getAttribute('aria-selected')).toBe('true');
    expect(rowNames(el)).toEqual(['TradeGuy', 'Nyx']);
    const [first, second] = list(el).querySelectorAll('.zcf-row');
    expect(first.querySelector('.zcf-pm-preview').textContent).toBe('TradeGuy: wanna buy ammo?');
    expect(first.querySelector('.zcf-pm-preview').classList.contains('zcf-unread')).toBe(true);
    expect(first.querySelector('.zcf-pill').textContent).toBe('2');
    expect(first.querySelector('.zcf-pm-time').textContent).toBe('18 min ago');
    expect(second.querySelector('.zcf-pm-preview').textContent).toBe('You: see you there');
    expect(second.querySelector('.zcf-pill')).toBeNull();
    expect(el.querySelector('.zcf-pm-search input').placeholder).toBe('Search by player name to start a new chat');
  });

  it('opens a DM from a chat row, without passing a #id placeholder as the name', () => {
    const { services, el } = mount({ threads: [thread(9, { username: '#9' })] });
    list(el).querySelector('.zcf-row').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(9, { expand: true, username: undefined, avatar: null });
  });

  it('loads older chats a page at a time, keeps each player once, and stops at an empty page', async () => {
    const { services, el } = mount({
      threads: [thread(1, { lastReply: NOW - 1000 })],
      olderPages: [[thread(1, { lastReply: NOW - 5000 }), thread(2)], []],
    });
    el.querySelector('.zcf-pm-more').click();
    await flush();
    expect(services.inbox.fetchPage).toHaveBeenCalledWith(2);
    expect(rowNames(el)).toEqual(['U1', 'U2']);
    list(el).dispatchEvent(new Event('scroll')); // jsdom has no layout: always "near the bottom"
    await flush();
    expect(services.inbox.fetchPage).toHaveBeenCalledWith(3);
    expect(el.querySelector('.zcf-pm-more')).toBeNull();
    list(el).dispatchEvent(new Event('scroll'));
    await flush();
    expect(services.inbox.fetchPage).toHaveBeenCalledTimes(2);
  });

  it('remembers the chosen tab in the settings document', () => {
    const { services, el } = mount();
    tabBtn(el, 'Friends').click();
    expect(services.actions.setPmTab).toHaveBeenCalledWith('friends');
    expect(services.settings.get().pmTab).toBe('friends');
    expect(tabBtn(el, 'Friends').classList.contains('zcf-pm-tab-on')).toBe(true);
  });

  it('lists friends online first (A-Z), then by last active, then unknown, and links to the Friends page', () => {
    const { services, el } = mount({
      presence: { 5: { online: true }, 6: { online: false, active: NOW - 12 * 60000 }, 7: { online: true }, 8: { online: false, active: NOW - 3 * 60000 } },
    }, { tab: 'friends' });
    services.store.update((s) => {
      for (const [id, username] of [[5, 'Spike'], [6, 'Rusty'], [7, 'Ash'], [8, 'Moth'], [9, 'Zed']]) addFriend(s, { id, username }, 0);
      s.threads = { 6: { unread: 1 } };
    });
    expect(rowNames(el)).toEqual(['Ash', 'Spike', 'Moth', 'Rusty', 'Zed']);
    expect(list(el).textContent).toContain('Active 12 min ago');
    expect(list(el).querySelectorAll('.zcf-pill')).toHaveLength(1);
    button(el, 'Manage friends →').click();
    expect(services.router.navigate).toHaveBeenCalledWith('/friends');
  });

  it('searches players to start a chat: results replace the list, + Friend adds, a click opens the DM, Esc returns', async () => {
    vi.useFakeTimers();
    const { services, el } = mount({
      threads: [thread(9)],
      searchResults: [{ id: 7, username: 'ZombieKing', avatar: null }, { id: 8, username: 'Zombo', avatar: null }],
    });
    services.store.update((s) => addFriend(s, { id: 8, username: 'Zombo' }, 0));
    const input = typeSearch(el, 'zo');
    expect(list(el).textContent).toBe('Searching…');
    await vi.advanceTimersByTimeAsync(299);
    expect(services.players.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(services.players.search).toHaveBeenCalledWith('zo');
    expect(rowNames(el)).toEqual(['ZombieKing', 'Zombo']);
    const rows = list(el).querySelectorAll('.zcf-row');
    expect(rows[0].textContent).toContain('#7');
    expect(rows[1].textContent).toContain('✓ Friend');
    rows[0].querySelector('.zcf-add').click();
    expect(services.actions.addFriend).toHaveBeenCalledWith({ id: 7, username: 'ZombieKing', avatar: null });
    expect(services.toast).toHaveBeenCalledWith('ZombieKing added to friends');
    expect(services.actions.openDm).not.toHaveBeenCalled();
    expect(list(el).querySelectorAll('.zcf-done')).toHaveLength(2);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(rowNames(el)).toEqual(['U9']);
    typeSearch(el, '7');
    await vi.advanceTimersByTimeAsync(300);
    list(el).querySelector('.zcf-row').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(7, { expand: true, username: 'ZombieKing', avatar: null });
    expect(input.value).toBe('');
  });

  it('drops a stale search reply and says so when a search fails', async () => {
    vi.useFakeTimers();
    let resolveFirst;
    const { services, el } = mount();
    services.players.search.mockImplementation((q) => (q === 'zo' ? new Promise((r) => { resolveFirst = r; }) : Promise.resolve({ ok: false })));
    typeSearch(el, 'zo');
    await vi.advanceTimersByTimeAsync(300);
    typeSearch(el, 'zombieK');
    resolveFirst({ ok: true, data: [{ id: 3, username: 'Zorro', avatar: null }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(list(el).textContent).not.toContain('Zorro');
    await vi.advanceTimersByTimeAsync(300);
    expect(list(el).textContent).toBe('Search failed. Try again.');
  });

  it('shows faction members without you, online first, with level, refreshed each minute only while shown', async () => {
    vi.useFakeTimers();
    const api = fakeApi({
      getFactionMembers: vi.fn(async () => ({
        ok: true,
        data: {
          faction: { id: 4, name: 'Ashfall' },
          members: [
            { id: ME, username: 'Me', online: 1, active: 0, level: 9 },
            { id: 21, username: 'Bram', online: 0, active: 600, level: 12 },
            { id: 22, username: 'Cato', online: 1, active: 0, level: 30 },
            { id: 23, username: 'Abe', online: 1, active: 0, level: 3 },
          ],
        },
      })),
    });
    const { el } = mount({ api }, { tab: 'faction' });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getFactionMembers).toHaveBeenCalledTimes(1);
    expect(rowNames(el)).toEqual(['Abe', 'Cato', 'Bram']);
    expect(list(el).textContent).toContain('Lv 30');
    expect(list(el).textContent).toContain('Active 10 min ago');
    await vi.advanceTimersByTimeAsync(FACTION_MS);
    expect(api.getFactionMembers).toHaveBeenCalledTimes(2);
    tabBtn(el, 'Chats').click();
    await vi.advanceTimersByTimeAsync(FACTION_MS * 2);
    expect(api.getFactionMembers).toHaveBeenCalledTimes(2);
  });

  it("says so when you're not in a faction", async () => {
    const api = fakeApi({ getFactionMembers: vi.fn(async () => ({ ok: true, data: { faction: null, members: [] } })) });
    const { el } = mount({ api }, { tab: 'faction' });
    await flush();
    expect(list(el).textContent).toBe("You're not in a faction.");
  });

  it('offers a retry when the faction list fails to load', async () => {
    const api = fakeApi({
      getFactionMembers: vi.fn()
        .mockResolvedValueOnce({ ok: false, kind: 'network' })
        .mockResolvedValue({ ok: true, data: { faction: { id: 1 }, members: [{ id: 30, username: 'Dex', online: 1 }] } }),
    });
    const { el } = mount({ api }, { tab: 'faction' });
    await flush();
    expect(list(el).textContent).toContain("Couldn't load.");
    el.querySelector('.zcf-pm-retry').click();
    await flush();
    expect(rowNames(el)).toEqual(['Dex']);
  });

  it('lists blocked players A-Z and unblocks after an inline confirm', async () => {
    const api = fakeApi({
      blockList: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: { list: [{ id: 41, username: 'Zeke' }, { id: 40, username: 'Abby' }], total: 2 } })
        .mockResolvedValue({ ok: true, data: { list: [{ id: 41, username: 'Zeke' }], total: 1 } }),
      unblockUser: vi.fn(async () => ({ ok: true, data: { success: true } })),
    });
    const { services, el } = mount({ api }, { tab: 'blocked' });
    await flush();
    expect(api.blockList).toHaveBeenCalledWith(1);
    expect(rowNames(el)).toEqual(['Abby', 'Zeke']);
    button(list(el).querySelector('.zcf-row'), 'Unblock').click();
    expect(list(el).textContent).toContain('Unblock Abby?');
    expect(document.activeElement.textContent).toBe('Cancel');
    button(list(el), 'Unblock').click();
    await flush();
    expect(api.unblockUser).toHaveBeenCalledWith(40);
    expect(services.toast).toHaveBeenCalledWith('Abby unblocked');
    await flush();
    expect(rowNames(el)).toEqual(['Zeke']);
  });

  it('reports a failed unblock, and says so when nobody is blocked', async () => {
    const api = fakeApi({
      blockList: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: { list: [{ id: 41, username: 'Zeke' }], total: 1 } })
        .mockResolvedValue({ ok: true, data: { list: [], total: 0 } }),
      unblockUser: vi.fn(async () => ({ ok: true, data: { success: false } })),
    });
    const { services, el, w } = mount({ api }, { tab: 'blocked' });
    await flush();
    button(list(el), 'Unblock').click();
    button(list(el), 'Unblock').click();
    await flush();
    expect(services.toast).toHaveBeenCalledWith('Failed to unblock Zeke', { error: true });
    expect(rowNames(el)).toEqual(['Zeke']);
    services.store.update((s) => { s.dock.friendsOpen = false; });
    services.store.update((s) => { s.dock.friendsOpen = true; }); // shown again: reloads page 1
    await flush();
    expect(list(el).textContent).toBe('No blocked players.');
    expect(w).toBeTruthy();
  });

  it('loads more blocked players on scroll until it has them all', async () => {
    const api = fakeApi({ blockList: vi.fn(async (page) => ({ ok: true, data: { list: page === 1 ? [{ id: 1, username: 'A' }] : [{ id: 2, username: 'B' }], total: 2 } })) });
    const { el } = mount({ api }, { tab: 'blocked' });
    await flush();
    list(el).dispatchEvent(new Event('scroll'));
    await flush();
    expect(api.blockList).toHaveBeenCalledWith(2);
    expect(rowNames(el)).toEqual(['A', 'B']);
    list(el).dispatchEvent(new Event('scroll'));
    await flush();
    expect(api.blockList).toHaveBeenCalledTimes(2);
  });

  it('has a ⋯ menu for export and import that works from the keyboard', () => {
    const { el } = mount();
    const btn = el.querySelector('.zcf-hbtn[title="More"]');
    btn.click();
    const menu = el.querySelector('.zcf-menu');
    expect(menu.hidden).toBe(false);
    expect(document.activeElement.textContent).toBe('Export friends');
    key('ArrowDown');
    expect(document.activeElement.textContent).toBe('Import friends');
    key('Escape');
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
  });

  it('rejects an oversized import without reading it, and toasts an unreadable one', async () => {
    const { services, el } = mount();
    const importSpy = vi.spyOn(services.actions, 'importFriends');
    const fileInput = el.querySelector('input[type=file]');
    const big = { size: 2 * 1024 * 1024, name: 'huge.json', text: vi.fn().mockResolvedValue('{}') };
    Object.defineProperty(fileInput, 'files', { configurable: true, get: () => [big] });
    fileInput.dispatchEvent(new Event('change'));
    await flush();
    expect(big.text).not.toHaveBeenCalled();
    expect(importSpy).not.toHaveBeenCalled();
    expect(services.toast).toHaveBeenCalledWith('That file is too large to be a friends export.', { error: true });
    const bad = { size: 10, name: 'x.json', text: () => Promise.reject(new Error('NotReadableError')) };
    Object.defineProperty(fileInput, 'files', { configurable: true, get: () => [bad] });
    fileInput.dispatchEvent(new Event('change'));
    await flush();
    expect(services.toast).toHaveBeenCalledWith("Couldn't read that file.", { error: true });
  });

  it('shows names as plain text, keeps rows when nothing visible changed, and gives focus back after a rebuild', async () => {
    const presenceMap = { 5: { online: false, active: NOW } };
    const { services, el, w } = mount({ presence: presenceMap }, { tab: 'friends' });
    services.store.update((s) => addFriend(s, { id: 5, username: '<b>bold</b>' }, 0));
    expect(list(el).querySelector('b')).toBeNull();
    expect(rowNames(el)).toEqual(['<b>bold</b>']);
    const before = list(el).querySelector('.zcf-row');
    services.store.update((s) => { s.dock.dms.push({ id: 99, open: false, lastUsed: 5 }); });
    expect(list(el).querySelector('.zcf-row')).toBe(before);
    before.focus();
    presenceMap[5] = { online: true };
    w.scheduleList();
    await flush();
    const after = list(el).querySelector('.zcf-row');
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(after);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run test/ui/pm-window.test.js`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement**

<!-- file: src/ui/pm-window.js -->
```js
// The Private Messages window in the dock (spec Part A): Chats / Friends / Faction / Blocked tabs, a search
// box that starts a chat with any player, and the ⋯ menu (export / import). Replaces 0.4's Friends & Chats.
import { h, clear, icon, avatar, badge, setBadge, downloadText, wireMenuKeys } from './dom.js';
import { createPlayerSearch } from './player-search.js';
import { enemyMark, mutedMark } from './marks.js';
import { buildChatRows, previewLine, buildFactionRows, buildBlockedRows } from '../pm-view.js';
import { buildFriendsTable } from '../friends-table.js';
import { chatsUnreadTotal, isFriend } from '../state.js';
import { longAgo, longStatusText } from '../time.js';
import { makePoller } from '../poller.js';
import { asArray, safe } from '../util.js';
import { importMessage } from '../backup.js';

const MAX_IMPORT_BYTES = 1024 * 1024;
export const FACTION_MS = 60000;
const LOAD_MORE_PX = 80;
const TABS = [['chats', 'Chats'], ['friends', 'Friends'], ['faction', 'Faction'], ['blocked', 'Blocked']];
const SEARCH_TEXT = { short: 'Keep typing…', searching: 'Searching…' };

export function createPmWindow(services, { doc = document } = {}) {
  const { store, settings, actions, presence, inbox, players, router, toast, playerId, myId, api } = services;
  const isEnemy = services.isEnemy || (() => false);
  const isMuted = services.isMuted || (() => false);

  let wasOpen = false;
  let frame = 0;
  let lastSig = null;
  let lastView = null;
  let holdRender = false; // a pointer is down in the window: a redraw now could swallow the click
  let renderWanted = false;
  let found = { kind: 'idle' }; // the search box (player-search.js states)
  // Chats: older inbox pages loaded by scrolling, kept for the session. Page 1 always comes from the poll.
  const older = [];
  let olderState = 'more'; // more | loading | error | done
  // Faction and Blocked are loaded while their tab shows.
  let faction = { status: 'idle', data: null }; // idle | loading | ok | none | error
  let blocked = { status: 'idle', pages: [], total: 0, loading: false, done: false };
  let blockedShowing = false;
  let unblockId = null; // the row asking "Unblock {name}?"
  let unblockBusy = false;

  const tab = () => settings.get().pmTab;
  const searching = () => found.kind !== 'idle';
  const isOpen = () => !!store.get().dock.friendsOpen;

  // Header, minimized tab and body.
  const titleText = h('span', null, 'Private Messages');
  const unreadBadge = badge();
  unreadBadge.classList.replace('bg-red-5', 'bg-positive'); // green: new messages, not an alert
  const title = h('div', { class: 'chat-title' }, h('i', { class: 'fas fa-envelope chat-icon', 'aria-hidden': 'true' }), titleText, unreadBadge);
  const menuBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'More', 'aria-label': 'More', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon('ellipsis-h'));
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.togglePm() }, title, menuBtn, toggle);

  const tabBtns = new Map();
  const tabBar = h('div', { class: 'zcf-pm-tabs', role: 'tablist' });
  for (const [key, label] of TABS) {
    const b = h('button', { class: 'zcf-pm-tab', type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => selectTab(key) }, label);
    tabBtns.set(key, b);
    tabBar.appendChild(b);
  }
  const searchInput = h('input', {
    class: 'zcf-input',
    type: 'text',
    placeholder: 'Search by player name to start a new chat',
    'aria-label': 'Search by player name to start a new chat',
  });
  const list = h('div', { class: 'zcf-list zcf-pm-list' });
  const main = h('div', { class: 'zcf-pm-main zcf-zoom' },
    tabBar,
    h('div', { class: 'zcf-toolbar' }, h('label', { class: 'zcf-search zcf-pm-search' }, icon('search'), searchInput)),
    list);

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const menu = h('div', { class: 'zcf-menu', role: 'menu', hidden: true },
    h('div', { class: 'zcf-menu-title' }, 'Friends list'),
    h('button', { type: 'button', role: 'menuitem', onclick: onExport }, 'Export friends'),
    h('button', {
      type: 'button',
      role: 'menuitem',
      onclick: () => {
        closeMenu();
        fileInput.click();
      },
    }, 'Import friends'));
  const body = h('div', { class: 'chat-content zcf-body' }, main, menu, fileInput);
  const el = h('div', { class: 'chat-container zcf zcf-pm', dataset: { zcfChat: 'pm' } }, header, body);

  // The ⋯ menu.
  function closeMenu({ focusButton = false } = {}) {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    if (focusButton) menuBtn.focus();
  }
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    menu.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  });
  wireMenuKeys(menu, { onEscape: () => closeMenu({ focusButton: true }) });
  fileInput.addEventListener('change', safe('friends-import', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // let the same file be picked again, whatever happens below
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast('That file is too large to be a friends export.', { error: true });
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      toast("Couldn't read that file.", { error: true });
      return;
    }
    const res = actions.importFriends(text);
    toast(res.ok ? importMessage(res) : res.error, { error: !res.ok });
  }));

  function onExport() {
    closeMenu();
    const n = Object.keys(store.get().friends).length;
    downloadText(`zed-city-friends-${playerId}.json`, actions.exportFriends(), doc);
    toast(`Exported ${n} friend${n === 1 ? '' : 's'}.`);
  }

  function onDocMousedown(e) {
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
  }
  doc.addEventListener('mousedown', onDocMousedown);

  // A redraw between pointerdown and click would replace the row under the pointer and lose the click.
  el.addEventListener('pointerdown', () => {
    holdRender = true;
  }, true);
  function onPointerRelease() {
    if (!holdRender) return;
    setTimeout(() => {
      holdRender = false;
      if (!renderWanted) return;
      renderWanted = false;
      safe('pm-render', renderList)();
    }, 0);
  }
  doc.addEventListener('pointerup', onPointerRelease, true);
  doc.addEventListener('pointercancel', onPointerRelease, true);

  // Search.
  const search = createPlayerSearch({
    players,
    onState(st) {
      found = st;
      renderList();
    },
  });
  searchInput.addEventListener('input', () => search.set(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !searchInput.value) return;
    e.preventDefault();
    e.stopPropagation();
    clearSearch();
  });
  function clearSearch() {
    searchInput.value = '';
    search.set('');
  }

  function selectTab(key) {
    if (tab() !== key) actions.setPmTab(key);
    if (searching()) clearSearch();
  }

  // Loading more as the list nears its bottom (Chats: older threads; Blocked: later pages).
  list.addEventListener('scroll', () => {
    if (searching() || list.scrollHeight - list.scrollTop - list.clientHeight >= LOAD_MORE_PX) return;
    if (tab() === 'chats') loadOlder();
    else if (tab() === 'blocked' && blocked.status === 'ok' && !blocked.done) loadBlocked({ more: true });
  });

  async function loadOlder() {
    if (olderState !== 'more' && olderState !== 'error') return;
    olderState = 'loading';
    renderList();
    const r = await inbox.fetchPage(older.length + 2);
    if (r.ok && !r.threads.length) olderState = 'done';
    else if (r.ok) {
      older.push(r.threads);
      olderState = 'more';
    } else olderState = r.kind === 'auth' ? 'done' : 'error';
    renderList();
  }

  async function loadFaction() {
    if (!faction.data) faction = { status: 'loading', data: null };
    renderList();
    const r = await api.getFactionMembers();
    if (r.ok) faction = r.data && r.data.faction ? { status: 'ok', data: r.data } : { status: 'none', data: null };
    else if (r.kind === 'network' || r.kind === 'rate') faction = faction.data ? faction : { status: 'error', data: null };
    else if (r.kind !== 'auth') faction = { status: 'none', data: null }; // the game answers an error when you have no faction
    renderList();
    return r;
  }
  const factionPoller = makePoller({ run: loadFaction, interval: FACTION_MS, doc });

  async function loadBlocked({ more = false } = {}) {
    if (blocked.loading) return;
    const page = more ? blocked.pages.length + 1 : 1;
    blocked = { ...blocked, loading: true, status: more || blocked.status === 'ok' ? blocked.status : 'loading' };
    renderList();
    const r = await api.blockList(page);
    if (r.ok) {
      const rows = asArray(r.data && r.data.list);
      const pages = more ? [...blocked.pages, rows] : [rows];
      const total = Number(r.data && r.data.total) || 0;
      blocked = { status: 'ok', pages, total, loading: false, done: !rows.length || pages.flat().length >= total };
    } else {
      blocked = { ...blocked, loading: false, status: blocked.status === 'ok' ? 'ok' : 'error' };
    }
    renderList();
  }

  async function unblock(u) {
    unblockBusy = true;
    renderList();
    const r = await api.unblockUser(u.id);
    unblockBusy = false;
    unblockId = null;
    if (r.ok && !(r.data && r.data.success === false)) {
      toast(`${u.username} unblocked`);
      loadBlocked();
    } else {
      toast(`Failed to unblock ${u.username}`, { error: true });
      renderList();
    }
  }

  // Rows. Each list item is { sig, build }: the signature says what it shows, so an unchanged list
  // keeps its nodes (and focus, and a half-done click).
  const item = (sig, build) => ({ sig, build });
  const note = (text) => item(['note', text], () => h('div', { class: 'zcf-empty' }, text));
  const knownName = (id, name) => (name === `#${id}` ? undefined : name);
  const openChat = (id, username, av) => actions.openDm(id, { expand: true, username: knownName(id, username), avatar: av });

  function rowEl(focusKey, onOpen, children) {
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      'data-zcf-focus': focusKey,
      onclick: onOpen,
      onkeydown: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
        }
      },
    }, children);
  }
  const nameEl = (id, username, after) => h('div', { class: 'zcf-name' }, isEnemy(id) ? enemyMark() : null, username, after || null);
  const pill = (n, dim) => (n > 0 ? h('span', { class: `zcf-pill zcf-pill-green${dim ? ' zcf-pill-dim' : ''}` }, String(n)) : null);
  const onDot = (p) => (p ? !!p.online : undefined);

  function chatItems(s, now) {
    const rows = buildChatRows({ page1: inbox.threads(), older, threads: s.threads });
    const items = rows.map((t) => {
      const p = presence.get(t.userId);
      const muted = isMuted(t.userId);
      const when = t.lastReply ? longAgo(t.lastReply, now) : '';
      const line = previewLine(t, myId);
      return item(['chat', t.userId, t.username, t.avatar, line, when, t.unread, onDot(p), isEnemy(t.userId), muted], () =>
        rowEl(`row:${t.userId}`, () => openChat(t.userId, t.username, t.avatar), [
          avatar({ avatar: t.avatar, online: onDot(p), size: 30 }),
          h('div', { class: 'zcf-row-main' },
            h('div', { class: 'zcf-pm-line' }, nameEl(t.userId, t.username, muted ? mutedMark() : null), pill(t.unread, muted), h('span', { class: 'zcf-pm-time' }, when)),
            h('div', { class: `zcf-status zcf-pm-preview${t.unread > 0 ? ' zcf-unread' : ''}` }, line || ' ')),
        ]));
    });
    if (!rows.length && olderState === 'done') items.push(note('No conversations yet.'));
    if (olderState !== 'done') {
      const label = olderState === 'loading' ? 'Loading…' : olderState === 'error' ? "Couldn't load. Retry" : 'Load older chats';
      items.push(item(['older', olderState], () => h('button', {
        class: 'zcf-pm-more',
        type: 'button',
        'data-zcf-focus': 'older',
        disabled: olderState === 'loading',
        onclick: () => loadOlder(),
      }, label)));
    }
    return items;
  }

  function friendItems(s, now) {
    const rows = buildFriendsTable({ friends: s.friends, presence: presence.get, threads: s.threads }).rows;
    const items = rows.map((r) => {
      const online = !!(r.presence && r.presence.online);
      const status = longStatusText(r.presence, now);
      return item(['friend', r.id, r.username, r.avatar, !!r.presence, online, status, r.unread, isEnemy(r.id)], () =>
        rowEl(`row:${r.id}`, () => openChat(r.id, r.username, r.avatar), [
          avatar({ avatar: r.avatar, online: r.presence ? online : undefined, size: 30 }),
          h('div', { class: 'zcf-row-main' },
            h('div', { class: 'zcf-pm-line' }, nameEl(r.id, r.username), pill(r.unread, false)),
            h('div', { class: `zcf-status${online ? ' zcf-status-on' : ''}` }, status || ' ')),
        ]));
    });
    if (!rows.length) items.push(note('No friends yet. Add them on a profile or on the Friends page.'));
    items.push(item(['manage'], () => h('button', { class: 'zcf-pm-foot', type: 'button', 'data-zcf-focus': 'manage', onclick: () => router.navigate('/friends') }, 'Manage friends →')));
    return items;
  }

  function retryItem(onRetry) {
    return item(['retry'], () => h('div', { class: 'zcf-empty' }, "Couldn't load. ",
      h('button', { class: 'zcf-link zcf-pm-retry', type: 'button', 'data-zcf-focus': 'retry', onclick: onRetry }, 'Retry')));
  }

  function factionItems(now) {
    if (faction.status === 'idle' || faction.status === 'loading') return [note('Loading…')];
    if (faction.status === 'none') return [note("You're not in a faction.")];
    if (faction.status === 'error') return [retryItem(() => factionPoller.poke())];
    const rows = buildFactionRows(faction.data, { myId, now });
    if (!rows.length) return [note('No other members.')];
    return rows.map((m) => {
      const status = longStatusText({ online: m.online, active: m.active }, now);
      return item(['member', m.id, m.username, m.avatar, m.online, status, m.level, isEnemy(m.id)], () =>
        rowEl(`row:${m.id}`, () => openChat(m.id, m.username, m.avatar), [
          avatar({ avatar: m.avatar, online: m.online, size: 30 }),
          h('div', { class: 'zcf-row-main' },
            h('div', { class: 'zcf-pm-line' }, nameEl(m.id, m.username), h('span', { class: 'zcf-pm-time' }, m.level ? `Lv ${m.level}` : '')),
            h('div', { class: `zcf-status${m.online ? ' zcf-status-on' : ''}` }, status || ' ')),
        ]));
    });
  }

  function blockedItems() {
    if (blocked.status === 'idle' || blocked.status === 'loading') return [note('Loading…')];
    if (blocked.status === 'error') return [retryItem(() => loadBlocked())];
    const rows = buildBlockedRows(blocked.pages);
    if (!rows.length) return [note('No blocked players.')];
    const items = rows.map((u) => {
      if (unblockId === u.id) {
        return item(['confirm', u.id, u.username, unblockBusy], () => h('div', { class: 'zcf-row zcf-pm-confirm' },
          h('div', { class: 'zcf-row-main' }, `Unblock ${u.username}?`),
          h('button', { class: 'zcf-add', type: 'button', 'data-zcf-focus': `unblock-yes:${u.id}`, disabled: unblockBusy, onclick: () => unblock(u) }, 'Unblock'),
          h('button', {
            class: 'zcf-mini',
            type: 'button',
            'data-zcf-focus': `unblock-no:${u.id}`,
            onclick: () => {
              unblockId = null;
              renderList();
              focusKey(`unblock:${u.id}`);
            },
          }, 'Cancel')));
      }
      return item(['blocked', u.id, u.username, u.avatar], () => h('div', { class: 'zcf-row zcf-pm-blocked' },
        avatar({ avatar: u.avatar, size: 30 }),
        h('div', { class: 'zcf-row-main' }, h('div', { class: 'zcf-name' }, u.username)),
        h('button', {
          class: 'zcf-mini',
          type: 'button',
          'data-zcf-focus': `unblock:${u.id}`,
          onclick: () => {
            unblockId = u.id;
            renderList();
            focusKey(`unblock-no:${u.id}`);
          },
        }, 'Unblock')));
    });
    if (blocked.loading) items.push(note('Loading…'));
    return items;
  }

  function searchItems(s) {
    if (found.kind !== 'results') return [note(found.kind === 'error' ? found.text : SEARCH_TEXT[found.kind])];
    if (!found.results.length) return [note('No players found.')];
    return found.results.map((p) => {
      const friend = isFriend(s, p.id);
      return item(['result', p.id, p.username, p.avatar, friend, isEnemy(p.id)], () =>
        rowEl(`result:${p.id}`, () => {
          openChat(p.id, p.username, p.avatar);
          clearSearch();
        }, [
          avatar({ avatar: p.avatar, size: 30 }),
          h('div', { class: 'zcf-row-main' }, nameEl(p.id, p.username), h('div', { class: 'zcf-status' }, `#${p.id}`)),
          friend
            ? h('span', { class: 'zcf-done' }, '✓ Friend')
            : h('button', {
                class: 'zcf-add zcf-add-outline',
                type: 'button',
                'data-zcf-focus': `add:${p.id}`,
                onclick: (e) => {
                  e.stopPropagation();
                  if (e.detail > 1) return; // the second click of a double-click
                  actions.addFriend(p);
                  toast(`${p.username} added to friends`);
                },
              }, '+ Friend'),
        ]));
    });
  }

  function focusKey(k) {
    const target = el.querySelector(`[data-zcf-focus="${k}"]`);
    if (target) target.focus();
  }

  function renderList() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    const s = store.get();
    const now = Date.now();
    const t = tab();
    for (const [k, b] of tabBtns) {
      b.classList.toggle('zcf-pm-tab-on', k === t);
      b.setAttribute('aria-selected', String(k === t));
    }
    let items;
    if (searching()) items = searchItems(s);
    else if (t === 'friends') items = friendItems(s, now);
    else if (t === 'faction') items = factionItems(now);
    else if (t === 'blocked') items = blockedItems();
    else items = chatItems(s, now);
    const view = searching() ? 'search' : t;
    const sig = JSON.stringify([view, items.map((i) => i.sig)]);
    if (sig === lastSig) return;
    lastSig = sig;
    const activeKey = list.contains(doc.activeElement) ? doc.activeElement.dataset.zcfFocus : undefined;
    const scrollTop = view === lastView ? list.scrollTop : 0;
    lastView = view;
    clear(list);
    for (const i of items) list.appendChild(i.build());
    list.scrollTop = scrollTop;
    if (activeKey) focusKey(activeKey);
  }

  // Starts and stops what the shown tab needs: the Faction poller, a fresh Blocked page 1.
  function syncLoaders() {
    const open = isOpen();
    const t = tab();
    if (open && t === 'faction') factionPoller.start();
    else factionPoller.stop();
    const showBlocked = open && t === 'blocked';
    if (showBlocked && !blockedShowing) loadBlocked();
    blockedShowing = showBlocked;
  }

  // The minimized tab's green count: unread chats from friends and the Chats list, muted ones left out.
  function syncBadge() {
    const s = store.get();
    setBadge(unreadBadge, chatsUnreadTotal(s, inbox.threads(), settings.get().muted), !s.dock.friendsOpen);
  }

  function update() {
    const open = isOpen();
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    titleText.hidden = !open;
    menuBtn.hidden = !open;
    toggle.hidden = !open;
    syncBadge();
    if (open) renderList();
    else {
      closeMenu();
      unblockId = null;
      if (wasOpen) clearSearch();
    }
    wasOpen = open;
    syncLoaders();
  }

  // Presence and inbox updates arrive in bursts; redraw at most once per frame, never mid-click.
  function scheduleList() {
    if (frame || !isOpen()) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (holdRender) {
        renderWanted = true;
        return;
      }
      safe('pm-render', renderList)();
    });
  }

  function destroy() {
    doc.removeEventListener('mousedown', onDocMousedown);
    doc.removeEventListener('pointerup', onPointerRelease, true);
    doc.removeEventListener('pointercancel', onPointerRelease, true);
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    factionPoller.destroy();
    search.cancel();
    closeMenu();
  }

  return { el, update, scheduleList, syncBadge, destroy };
}
```

- [ ] **Step 5: Run it again**

Run: `npx vitest run test/ui/pm-window.test.js`
Expected: PASS.

### Task 10: Swap the dock to the PM window; wire it in the app; styles

**Files:**
- Modify: `src/ui/dock-view.js`, `src/app.js`, `src/state.js`, `src/ui/styles.js`
- Delete: `src/ui/friends-window.js`, `test/ui/friends-window.test.js`, `src/friends-view.js`, `test/friends-view.test.js`
- Create: `test/ui/cascade.js`
- Test: `test/ui/dock-view.test.js`, `test/ui/styles.test.js`, `test/app.test.js`, `test/state.test.js`

- [ ] **Step 1: Move the cascade helper out of the styles test**

Create `test/ui/cascade.js` holding, unchanged, the helpers from the top of `test/ui/styles.test.js`: `splitSelectors`, `specificity`, `parseCss`, `mediaApplies`, `matchCache` + `matches`, `compareKeys`, `winner`. Export `specificity`, `parseCss`, `mediaApplies`, `matches`, `winner`. Then in `test/ui/styles.test.js` delete those definitions and add:

```js
import { specificity, parseCss, mediaApplies, matches, winner } from './cascade.js';
```

Run: `npx vitest run test/ui/styles.test.js`
Expected: PASS (pure move).

- [ ] **Step 2: Write the failing tests**

In `test/ui/dock-view.test.js`, replace the last two tests with:

```js
  it('orders DM windows (store order) before the Private Messages window and removes closed ones', () => {
    const services = makeServices();
    const root = document.createElement('div');
    const view = createDockView({ root, services });
    services.store.update((s) => {
      openDm(s, 7, { now: 1 });
      openDm(s, 8, { now: 2 });
    });
    view.render();
    expect([...root.children].map((c) => c.dataset.zcfChat)).toEqual(['dm:7', 'dm:8', 'pm']);
    services.store.update((s) => { s.dock.dms = s.dock.dms.filter((d) => d.id !== 7); });
    view.render();
    expect([...root.children].map((c) => c.dataset.zcfChat)).toEqual(['dm:8', 'pm']);
    expect(services.conversations.get(7)).toBeNull();
  });

  it('tucks Private Messages into the corner with CSS order, beyond an open window on phones', () => {
    expect(CSS).toContain('.chat-containers .zcf-pm{order:2}');
    expect(CSS).toContain('.chat-containers .zcf.zcf-open{order:3');
  });
```

In `test/ui/styles.test.js`:
- in `'lays out every open window body as a flex column…'` change `'friends'` to `'pm'` in both places (`checked.add(… ? 'dm' : 'pm')` and `toEqual(['dm', 'pm'])`);
- add a test:

```js
  it('sits the dock flush against the right edge on desktop only', () => {
    renderDock(STATES[0]);
    const dock = document.querySelector('.chat-containers');
    for (const sheets of [OURS_LAST, OURS_FIRST]) {
      expect(winner(dock, 'right', 1280, sheets).value).toBe('0');
      expect(winner(dock, 'right', 400, sheets).value).toBe('10px');
    }
  });
```

In `test/app.test.js`:
- `'puts the Friends tab into the game dock…'`: rename to `'puts Private Messages into the game dock, left of the game chats'` and change `.zcf-friends.chat-container.chat-minimized` to `.zcf-pm.chat-container.chat-minimized`;
- `'pops up a friend DM…'`: change `.zcf-friends .unread-badge` to `.zcf-pm .unread-badge`;
- replace every `app.actions.toggleFriends()` with `app.actions.togglePm()`.

In `test/state.test.js`, rename the test `'sums unread messages in every chat the Friends & Chats window lists'` to `'sums unread messages in every chat the Private Messages window lists'`.

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run test/ui/dock-view.test.js test/ui/styles.test.js test/app.test.js`
Expected: FAIL (dock still builds the Friends window; no `right:0` rule; `togglePm` missing).

- [ ] **Step 4: Implement**

`src/ui/dock-view.js`: replace the friends window with the PM window.

```js
// Reconciles our windows inside the dock root: [DM windows in store order] then [Private Messages]. CSS
// `order` puts Private Messages right of the game's chats.
import { createPmWindow } from './pm-window.js';
import { createDmWindow } from './dm-window.js';
```

and in `createDockView`: `const pm = createPmWindow(services);`, `const desired = [...entries.map((e) => dms.get(e.id).el), pm.el];`, `pm.update();` in place of `friends.update();`, and return `{ render, pm, dmWindow: (id) => dms.get(id) || null }`.

`src/state.js`: update the `chatsUnreadTotal` comment to say "the Private Messages window" instead of "the Friends & Chats window" (no code change yet).

`src/app.js`:
- imports: add `createSettingsStore` to the `./store.js` import, and `import { setPmTab } from './settings.js';`
- after `const store = createStore(…)` add `const settings = createSettingsStore({ playerId, storage, win, now });`
- rename the `toggleFriends()` action to `togglePm()` (same body), and add `setPmTab: (tab) => settings.update((s) => setPmTab(s, tab)),`
- in `services`, add `api,` and `settings,`
- replace `view.friends.` with `view.pm.` (three places);
- after the `inbox.subscribe(…)` block add:

```js
  settings.subscribe(() => view.render());
```

- in `destroy()`, add `settings.destroy();` after `store.destroy();`
- update the comment above `listOpen`: `// A friends list is on screen: the Private Messages window, or the Friends page.`

`src/ui/styles.js`:
- delete these rules: `.zcf-friends .chat-title .chat-icon{…}`, `.chat-containers .zcf-friends{order:2}`, `.zcf .zcf-count{…}`, `.zcf-iconbtn{…}`, `.zcf-iconbtn:hover,.zcf-iconbtn.zcf-active{…}`, `.zcf-sec{…}`, `.zcf-row-actions{display:none;gap:4px}`, `.zcf-row:hover .zcf-row-actions,.zcf-row:focus-within .zcf-row-actions{display:flex}`, `@media (hover:none){.zcf-row-actions{display:flex}}`;
- add after `.zcf-dm:not(.chat-minimized){height:450px}`:

```css
.zcf-pm .chat-title .chat-icon{color:#3d8b40}
.chat-containers .zcf-pm{order:2}
.zcf-pm:not(.chat-minimized){height:450px}
.zcf-pm-main{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.zcf-pm-tabs{display:flex;flex:none;background:#090a0b;border-bottom:1px solid #000}
.zcf-pm-tab{flex:1 1 0;min-width:0;height:32px;padding:0 4px;background:none;border:0;color:#9e9e9e;font-family:Oswald,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer}
.zcf-pm-tab:hover{color:#e0e0e0}
.zcf-pm-tab.zcf-pm-tab-on{background:#0f1114;color:#e6e6e6;box-shadow:inset 0 2px 0 #0a748f}
.zcf-pm .zcf-toolbar{flex:none}
.zcf-pm-line{display:flex;align-items:center;gap:6px;min-width:0}
.zcf-pm-line .zcf-name{min-width:0}
.zcf-pm-time{margin-left:auto;flex:none;font-size:10.5px;opacity:.45;white-space:nowrap}
.zcf-pm-preview.zcf-unread{color:#fff;opacity:1;font-weight:500}
.zcf-pill.zcf-pill-green{background:#3d8b40}
.zcf-pill.zcf-pill-dim{opacity:.45}
.zcf-pm-more,.zcf-pm-foot{display:block;width:100%;background:none;border:0;border-top:1px solid #ffffff0d;color:#6fb3c8;font:inherit;font-size:11.5px;padding:8px 10px;text-align:center;cursor:pointer}
.zcf-pm-more:hover,.zcf-pm-foot:hover{background:#ffffff08}
.zcf-pm-more:disabled{opacity:.5;cursor:default}
.zcf-pm-retry{color:#6fb3c8}
.zcf-pm-confirm .zcf-row-main{font-size:12.5px}
.zcf-enemy-mark{color:#ef5350;font-size:.85em;margin-right:4px}
.zcf-muted-mark{font-size:.85em;margin-left:5px;opacity:.5}
```

- in the `@media (min-width:600px){ … }` block add as its first line:

```css
  body .chat-containers{right:0}
```

Delete the four old files:

```bash
git rm src/ui/friends-window.js test/ui/friends-window.test.js src/friends-view.js test/friends-view.test.js
```

- [ ] **Step 5: Run everything**

Run: `npx vitest run`
Expected: all pass. (If `test/build.test.js` or anything else still imports a deleted file, fix the import.)

- [ ] **Step 6: Rename in the docs**

- `README.md`: "Friends window" → "Private Messages window"; describe the tabs in one sentence under the feature list (Chats, Friends, Faction, Blocked; search to start a chat).
- `docs/manual-test.md`: B.1 → "The dock shows Private Messages (green envelope) to the right of the game's chats, in the bottom-right corner (flush against the screen edge on desktop)." B.4 → "**Private Messages search:** typing a name shows players; **+ Friend** adds; clicking a player opens a DM; Esc returns to the tab." B.13 and B.20: "Friends window" → "Private Messages window". B.24: "Friends & Chats tab" → "Private Messages tab".

- [ ] **Step 7: Commit Part A**

```bash
git add -A src test README.md docs/manual-test.md
git commit -m "feat: Private Messages window with Chats, Friends, Faction and Blocked tabs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018xFLSnTGkyRmowXEhicgAC"
```

---
# Part C: Enemies list

### Task 11: The enemies document

**Files:**
- Create: `src/enemies.js`
- Modify: `src/state.js`, `src/store.js`
- Test: `test/enemies.test.js`, `test/store.test.js`, `test/state.test.js`

- [ ] **Step 1: Write the failing tests**

<!-- file: test/enemies.test.js -->
```js
import { describe, it, expect } from 'vitest';
import { emptyEnemies, normalizeEnemies, addEnemy, removeEnemy, setEnemyNote, updateEnemyInfo, isEnemy, enemyNames } from '../src/enemies.js';
import { MAX_NOTE } from '../src/state.js';

describe('enemies', () => {
  it('adds, notes, refreshes and removes enemies', () => {
    const d = emptyEnemies();
    expect(addEnemy(d, { id: 9, username: 'Grim', avatar: 'g.png' }, 5)).toBe(true);
    expect(addEnemy(d, { id: 9, username: 'Again' }, 6)).toBe(false);
    expect(d.enemies[9]).toEqual({ id: 9, username: 'Grim', avatar: 'g.png', addedAt: 5 });
    expect(isEnemy(d, 9)).toBe(true);
    expect(setEnemyNote(d, 9, '  stole my nails  ')).toBe(true);
    expect(d.enemies[9].note).toBe('stole my nails');
    expect(setEnemyNote(d, 9, 'x'.repeat(300))).toBe(true);
    expect(d.enemies[9].note).toHaveLength(MAX_NOTE);
    expect(updateEnemyInfo(d, 9, { username: 'Grimmer', avatar: '' })).toBe(true);
    expect(d.enemies[9]).toMatchObject({ username: 'Grimmer', avatar: 'g.png' });
    expect(enemyNames(d)).toEqual(new Set(['grimmer']));
    removeEnemy(d, 9);
    expect(isEnemy(d, 9)).toBe(false);
  });

  it('normalizes a saved document, dropping bad entries, and rejects other versions', () => {
    expect(normalizeEnemies({ v: 1 })).toEqual(emptyEnemies());
    expect(normalizeEnemies({
      v: 1,
      enemies: { 3: { id: 3, username: 'A', note: '  n  ', addedAt: 7 }, x: { id: 'x' }, 4: { id: 4 }, 5: null },
    })).toEqual({ v: 1, enemies: { 3: { id: 3, username: 'A', avatar: null, addedAt: 7, note: 'n' }, 4: { id: 4, username: '#4', avatar: null, addedAt: 0 } } });
    expect(() => normalizeEnemies({ v: 2 })).toThrow();
    expect(() => normalizeEnemies('x')).toThrow();
  });
});
```

Append to `test/store.test.js` (add `createEnemiesStore, enemiesKey` to its `../src/store.js` import):

```js
describe('enemies store', () => {
  it('keeps enemies in their own document and follows other tabs', () => {
    const storage = memoryStorage();
    const win = new EventTarget();
    const a = createEnemiesStore({ playerId: 1, storage, win });
    const b = createEnemiesStore({ playerId: 1, storage, win: new EventTarget() });
    expect(enemiesKey(1)).toBe('zcf:v1:1:enemies');
    b.update((d) => { d.enemies[9] = { id: 9, username: 'Grim' }; });
    win.dispatchEvent(storageEvent(enemiesKey(1)));
    expect(a.get().enemies[9].username).toBe('Grim');
    expect(storage.getItem(storageKey(1))).toBeNull();
    a.destroy();
    b.destroy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/enemies.test.js test/store.test.js`
Expected: FAIL (module and exports missing).

- [ ] **Step 3: Implement**

In `src/state.js`, replace `addFriend`, `removeFriend`, `updateFriendInfo` and `setFriendNote` with shared person helpers plus thin friend wrappers. Keep `MAX_NOTE` and `normalizeNote` where they are (above the helpers that use them):

```js
// Friends and enemies are both maps of id -> { id, username, avatar, addedAt, note? }; these work on either.
export function addPerson(map, { id, username, avatar }, now) {
  if (map[id]) return false;
  map[id] = { id, username: username || `#${id}`, avatar: avatar || null, addedAt: now };
  return true;
}

export function removePerson(map, id) {
  delete map[id];
}

export function updatePersonInfo(map, id, { username, avatar }) {
  const p = map[id];
  if (!p) return false;
  let changed = false;
  if (typeof username === 'string' && username && username !== p.username) {
    p.username = username;
    changed = true;
  }
  if (typeof avatar === 'string' && avatar && avatar !== p.avatar) {
    p.avatar = avatar;
    changed = true;
  }
  return changed;
}

// A private note: trimmed and capped; an empty note removes the field. Returns whether it changed.
export function setPersonNote(map, id, note) {
  const p = map[id];
  if (!p) return false;
  const text = normalizeNote(note);
  if ((p.note || '') === text) return false;
  if (text) p.note = text;
  else delete p.note;
  return true;
}

export const addFriend = (state, p, now) => addPerson(state.friends, p, now);
export const removeFriend = (state, id) => removePerson(state.friends, id);
export const updateFriendInfo = (state, id, info) => updatePersonInfo(state.friends, id, info);
export const setFriendNote = (state, id, note) => setPersonNote(state.friends, id, note);
```

(Move the `MAX_NOTE` / `normalizeNote` block above `addPerson` so it reads top-down.)

<!-- file: src/enemies.js -->
```js
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
```

In `src/store.js`:
- add `import { emptyEnemies, normalizeEnemies } from './enemies.js';`
- add under `settingsKey`: `export const enemiesKey = (playerId) => `zcf:v1:${playerId}:enemies`;`
- append:

```js
export function createEnemiesStore({ playerId, ...opts }) {
  return createDocStore({ key: enemiesKey(playerId), empty: emptyEnemies, normalize: normalizeEnemies, ...opts });
}
```

- [ ] **Step 4: Run them, plus the state tests**

Run: `npx vitest run test/enemies.test.js test/store.test.js test/state.test.js`
Expected: PASS.

### Task 12: Enemies in export / import

**Files:**
- Modify: `src/backup.js`
- Test: `test/backup.test.js`

- [ ] **Step 1: Write the failing tests** (append inside `describe('backup', …)`; add `import { emptyEnemies, addEnemy, setEnemyNote } from '../src/enemies.js';` and add `mergeEnemiesImport` to the backup import)

```js
  it('exports enemies beside friends, and only when there are some', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    expect(JSON.parse(exportFriends(s, 77, emptyEnemies())).enemies).toBeUndefined();
    const e = emptyEnemies();
    addEnemy(e, { id: 9, username: 'Grim' }, 0);
    setEnemyNote(e, 9, 'stole my nails');
    expect(JSON.parse(exportFriends(s, 77, e)).enemies).toEqual([{ id: 9, username: 'Grim', note: 'stole my nails' }]);
  });

  it('imports enemies with the friends rules: add new, fill in missing notes, never remove', () => {
    const file = JSON.stringify({
      v: 1,
      playerId: 77,
      friends: [{ id: 5, username: 'Spike' }],
      enemies: [{ id: 9, username: 'Grim', note: 'stole my nails' }, { id: 10, username: 'Moth', note: 'theirs' }, { id: 'x' }],
    });
    const r = parseImport(file, 77);
    expect(r.enemies).toEqual([{ id: 9, username: 'Grim', note: 'stole my nails' }, { id: 10, username: 'Moth', note: 'theirs' }]);
    const target = emptyEnemies();
    addEnemy(target, { id: 10, username: 'Moth' }, 0);
    setEnemyNote(target, 10, 'mine');
    expect(mergeEnemiesImport(target, r.enemies, 1)).toEqual({ added: 1, notes: 1 });
    expect(target.enemies[10].note).toBe('mine');
  });

  it('still imports an older file without enemies', () => {
    const r = parseImport(JSON.stringify({ v: 1, playerId: 1, friends: [{ id: 3, username: 'A' }] }), 1);
    expect(r).toEqual({ ok: true, friends: [{ id: 3, username: 'A' }], enemies: [] });
  });

  it('mentions enemies in the import message', () => {
    expect(importMessage({ added: 2, enemiesAdded: 1, notes: 3 })).toBe('Imported 2 new friends, 1 new enemy and 3 notes.');
    expect(importMessage({ added: 0, enemiesAdded: 2 })).toBe('Imported 0 new friends and 2 new enemies.');
  });
```

Also update the existing `'round-trips an export'` expectation for `parseImport(text, 77)` to `{ ok: true, friends: [{ id: 5, username: 'Spike' }], enemies: [] }`, and `'keeps only valid, unique entries…'` to include `enemies: []`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/backup.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

<!-- file: src/backup.js -->
```js
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
```

- [ ] **Step 4: Run it again**

Run: `npx vitest run test/backup.test.js`
Expected: PASS.

### Task 13: FRIENDS | ENEMIES page

**Files:**
- Modify: `src/friends-table.js`, `src/ui/friends-page.js` (full file below), `test/ui/services.js`
- Test: `test/friends-table.test.js`, `test/ui/friends-page.test.js`

- [ ] **Step 1: Test services get the enemies store**

In `test/ui/services.js`:
- add `createEnemiesStore` to the `../../src/store.js` import and `import { addEnemy, removeEnemy, setEnemyNote, isEnemy } from '../../src/enemies.js';`
- after `const settings = …` add `const enemies = createEnemiesStore({ playerId: ME, storage });`
- add actions:

```js
    addEnemy: vi.fn((p) => enemies.update((d) => addEnemy(d, p, 0))),
    removeEnemy: vi.fn((id) => enemies.update((d) => removeEnemy(d, id))),
    setEnemyNote: vi.fn((id, note) => enemies.update((d) => setEnemyNote(d, id, note))),
```

- add to the returned services: `enemies,` and `isEnemy: (id) => isEnemy(enemies.get(), id),`

- [ ] **Step 2: Write the failing tests**

Append to `test/friends-table.test.js`:

```js
  it('shows whichever list it is given', () => {
    const t = buildFriendsTable({ list: { 9: { id: 9, username: 'Grim' } }, presence, threads: {} });
    expect(ids(t)).toEqual([9]);
  });
```

In `test/ui/friends-page.test.js`:
- add `import { addEnemy } from '../../src/enemies.js';`
- in `mount`, after `services.store.subscribe(() => page.scheduleRender());` add `services.enemies.subscribe(() => page.scheduleRender());`
- append:

```js
  it('shows the Enemies list on /enemies with skulls and its own wording', () => {
    const { services, page } = mount({ friends: FRIENDS, presence: presenceFixture() });
    services.enemies.update((d) => {
      addEnemy(d, { id: 3, username: 'Rustbucket' }, 0);
      addEnemy(d, { id: 9, username: 'Grim' }, 0);
    });
    page.onRoute('/enemies');
    expect(page.kind).toBe('enemies');
    expect(names()).toEqual(['Rustbucket', 'Grim']);
    expect(row(9).querySelector('.zcf-col-name .zcf-enemy-mark')).not.toBeNull();
    const [f, e] = document.querySelectorAll('.zcf-page-h');
    expect(e.classList.contains('zcf-page-h-on')).toBe(true);
    expect(e.getAttribute('aria-current')).toBe('page');
    expect(f.classList.contains('zcf-page-h-on')).toBe(false);
    expect(document.querySelector('.zcf-page-sub').textContent).toBe('0 of 2 online');
    expect(document.querySelector('.zcf-page-add-long').textContent).toBe('Add enemy');
    row(9).querySelector('[title="Remove"]').click();
    expect(row(9).textContent).toContain('Remove Grim from your enemies?');
    [...row(9).querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
    expect(services.enemies.get().enemies[9]).toBeUndefined();
  });

  it('marks friends who are also enemies on the Friends list', () => {
    const { services, page } = mount({ friends: FRIENDS, presence: presenceFixture() });
    services.enemies.update((d) => addEnemy(d, { id: 3, username: 'Rustbucket' }, 0));
    page.render();
    expect(row(3).querySelector('.zcf-enemy-mark')).not.toBeNull();
    expect(row(1).querySelector('.zcf-enemy-mark')).toBeNull();
  });

  it('switches lists from the title tabs, keeping sort and tab but resetting the search', () => {
    const { services, page } = mount({ friends: FRIENDS, presence: presenceFixture() });
    byText('.zcf-page-tab', 'Offline').click();
    const input = document.querySelector('.zcf-page-input');
    input.value = 'rust';
    input.dispatchEvent(new Event('input'));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    document.querySelectorAll('.zcf-page-h')[1].dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(services.router.navigate).toHaveBeenCalledWith('/enemies');
    page.onRoute('/enemies');
    expect(document.querySelector('.zcf-page-input').value).toBe('');
    expect(byText('.zcf-page-tab', 'Offline').classList.contains('zcf-page-tab-on')).toBe(true);
    page.onRoute('/friends');
    expect(names()).toEqual(['Rustbucket']);
  });

  it('explains an empty Enemies list', () => {
    const { page } = mount();
    page.onRoute('/enemies');
    expect(document.querySelector('.zcf-page-empty').textContent).toBe("No enemies yet. Use Add enemy above, or Add Enemy on a player's profile.");
  });

  it('adds an enemy from the Add enemy search, showing ✓ Enemy afterwards', async () => {
    const { services, page } = mount({ friends: FRIENDS });
    services.players.search.mockResolvedValue({ ok: true, data: [{ id: 50, username: 'Grackle' }] });
    page.onRoute('/enemies');
    document.querySelector('.zcf-page-add').click();
    expect(document.querySelector('.zcf-page .zcf-pop-title').textContent).toBe('Add enemy');
    const input = document.querySelector('.zcf-page .zcf-pop input');
    input.value = 'gra';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 350));
    document.querySelector('.zcf-page .zcf-result .zcf-add').click();
    expect(services.actions.addEnemy).toHaveBeenCalledWith({ id: 50, username: 'Grackle' });
    expect(services.toast).toHaveBeenCalledWith('Grackle added to enemies');
    expect(document.querySelector('.zcf-page .zcf-result .zcf-done').textContent).toBe('✓ Enemy');
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run test/friends-table.test.js test/ui/friends-page.test.js`
Expected: FAIL.

- [ ] **Step 4: Implement**

`src/friends-table.js`: take the list to show.

```js
// list (or friends): the saved map to show, friends or enemies; presence(id): cache entry or null;
// threads: saved thread state (unread). pinned: ids kept even when they no longer match the tab.
export function buildFriendsTable({ list, friends, presence, threads = {}, tab = 'all', query = '', sort = DEFAULT_SORT, pinned = [] }) {
  const q = String(query || '').trim().toLowerCase();
  const all = Object.values(list || friends || {}).map((f) => {
```

(the rest of the function body is unchanged).

Replace `src/ui/friends-page.js` with this complete file (it carries Tasks 2–4 and adds the Enemies list):

<!-- file: src/ui/friends-page.js -->
```js
// The Friends page at /friends and the Enemies page at /enemies (spec §4, §C.3): a game-style table of one
// of your lists, drawn in the slot where the game's logged-in layout shows its catch-all 404 for a path it
// doesn't know. The title is two tabs, FRIENDS | ENEMIES.
import { h, clear, append, icon, avatar, highlightMatch, wireMenuKeys } from './dom.js';
import { createAddFriendPopover } from './add-friend-popover.js';
import { enemyMark } from './marks.js';
import { buildFriendsTable, nextSort, DEFAULT_SORT } from '../friends-table.js';
import { normalizeNote, MAX_NOTE } from '../state.js';
import { longStatusText } from '../time.js';
import { safe, warnOnce } from '../util.js';

export const FRIENDS_PATH = '/friends';
export const ENEMIES_PATH = '/enemies';
export const PAGE_CLASS = 'zcf-on-friends';
// Hides the game's "Sorry, nothing here..." while one of our pages is showing.
export const HIDE_404_CSS = `html.${PAGE_CLASS} .q-page-container > .fixed-center{display:none!important}`;
const WARN_MS = 10000;
// How long a leave waits for the next route to replace the game's 404 before giving up.
const LEAVE_MS = 1000;

// Which list a path shows: 'friends', 'enemies', or null for any other page.
export function pageKind(path) {
  if (path === FRIENDS_PATH || path === `${FRIENDS_PATH}/`) return 'friends';
  if (path === ENEMIES_PATH || path === `${ENEMIES_PATH}/`) return 'enemies';
  return null;
}
export const isFriendsPath = (path) => pageKind(path) !== null;

const LISTS = {
  friends: { path: FRIENDS_PATH, many: 'friends', title: 'Friends', add: 'Add friend', done: '✓ Friend', profile: 'Add Friend' },
  enemies: { path: ENEMIES_PATH, many: 'enemies', title: 'Enemies', add: 'Add enemy', done: '✓ Enemy', profile: 'Add Enemy' },
};

// Runs at script start, before login is known (main.js), so a direct load or refresh of one of our pages
// never flashes the game's 404: adds the hide rule, and the <html> class when we're on one.
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
  const enemies = services.enemies || { get: () => ({ enemies: {} }) };
  const isEnemy = services.isEnemy || (() => false);
  let active = false;
  let kind = 'friends';
  let tab = 'all';
  let query = '';
  let sort = DEFAULT_SORT;
  let editId = null;
  let editInput = null;
  let confirmId = null;
  let menuId = null;
  let rendering = false;
  let frame = 0;
  let holdRender = false; // a pointer is down in the page: a redraw now could swallow the click
  let renderWanted = false;
  let popSig = '';
  let headSig = null;
  let currentIds = [];
  let unkeep = null;
  let warnTimer = null;
  let leaveObserver = null;
  let leaveTimer = null;
  const rowEls = new Map(); // id -> { sig, el }: rows are reused while what they show is unchanged

  const L = () => LISTS[kind];
  const listOf = () => (kind === 'enemies' ? enemies.get().enemies : store.get().friends);
  const listActions = () => (kind === 'enemies'
    ? { add: actions.addEnemy, remove: actions.removeEnemy, setNote: actions.setEnemyNote }
    : { add: actions.addFriend, remove: actions.removeFriend, setNote: actions.setFriendNote });

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
  const addLong = h('span', { class: 'zcf-page-add-long' }, LISTS.friends.add);
  const addBtn = h('button', { class: 'zcf-page-add', type: 'button', 'aria-expanded': 'false' },
    icon('plus'), addLong, h('span', { class: 'zcf-page-add-short' }, 'Add'));
  const pop = createAddFriendPopover({
    players,
    isAdded: (id) => !!listOf()[id],
    onAdd: (p) => {
      listActions().add(p);
      toast(`${p.username} added to ${L().many}`);
    },
    onClose: () => syncAddBtn(),
  });
  const headings = new Map(Object.entries(LISTS).map(([k, l]) => [k, link(l.path, 'text-h4 text-uppercase text-no-bg zcf-page-h', l.title)]));
  const title = h('div', { class: 'zcf-page-title' },
    h('div', { class: 'zcf-page-side' }, link('/city', 'zcf-page-back', [icon('chevron-left'), 'City'])),
    h('div', { class: 'zcf-page-mid' }, h('div', { class: 'zcf-page-htabs' }, [...headings.values()]), subtitle),
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

  // The title tabs, the Add button and the search box follow the list being shown.
  function syncKind() {
    for (const [k, a] of headings) {
      a.classList.toggle('zcf-page-h-on', k === kind);
      if (k === kind) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    addLong.textContent = L().add;
    search.setAttribute('aria-label', `Search ${L().many}`);
    pop.setLabels({ title: L().add, doneText: L().done });
  }
  syncKind();

  el.addEventListener('pointerdown', () => {
    holdRender = true;
  }, true);
  // Waits until the click that follows this pointerup has been dispatched, then draws what was held back.
  function onPointerRelease() {
    if (!holdRender) return;
    win.setTimeout(() => {
      holdRender = false;
      if (!renderWanted) return;
      renderWanted = false;
      safe('friends-page-render', render)();
    }, 0);
  }

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
    const f = listOf()[id];
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
    // Clicking or tabbing away saves. The redraw waits a frame, so focus has already landed wherever
    // Tab or the click sent it and can be handed back to the rebuilt row. A blur caused by our own
    // redraw moving the row doesn't save.
    editInput.addEventListener('blur', () => {
      if (!rendering) commitEdit({ later: true });
    });
    render();
    editInput.focus();
    const end = editInput.value.length;
    editInput.setSelectionRange(end, end);
  }

  function commitEdit({ refocus = false, later = false } = {}) {
    if (editId === null) return;
    const id = editId;
    const text = editInput.value;
    editId = null;
    editInput = null;
    const f = listOf()[id];
    if (f && (f.note || '') !== normalizeNote(text)) listActions().setNote(id, text);
    if (later) {
      scheduleRender();
      return;
    }
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
    listActions().remove(id);
    render();
    if (next !== undefined) focusKey(`name:${next}`);
  }

  function toggleMenu(id) {
    menuId = menuId === id ? null : id;
    render();
    if (menuId === id) focusKey(`menu:${id}:0`);
  }

  function closeMenu(id) {
    menuId = null;
    render();
    focusKey(`more:${id}`);
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
    if (confirmId === r.id) return JSON.stringify(['confirm', r.id, r.username, kind]);
    if (editId === r.id) return JSON.stringify(['edit', r.id]);
    return JSON.stringify([r.id, r.username, r.avatar, r.note, r.unread, !!r.presence, longStatusText(r.presence, now), r.profile, menuId === r.id, query.trim(), isEnemy(r.id)]);
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
        h('span', { class: 'zcf-confirm-text' }, `Remove ${r.username} from your ${L().many}?`),
        h('button', { class: 'zcf-page-btn zcf-page-danger', type: 'button', 'data-zcf-focus': `confirm:${r.id}`, onclick: () => doRemove(r.id) }, 'Remove'),
        h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': `cancel:${r.id}`, onclick: () => cancelRemove(r.id) }, 'Cancel'))));
  }

  function rowMenu(r) {
    const item = (i, label, onclick) => h('button', { type: 'button', role: 'menuitem', 'data-zcf-focus': `menu:${r.id}:${i}`, onclick }, label);
    const menu = h('div', { class: 'zcf-page-menu', role: 'menu' },
      item(0, 'Profile', () => {
        menuId = null;
        router.navigate(`/profile/${r.id}`);
      }),
      item(1, 'Edit note', () => startEdit(r.id)),
      item(2, 'Remove', () => askRemove(r.id)));
    wireMenuKeys(menu, { onEscape: () => closeMenu(r.id) });
    return menu;
  }

  function buildRow(r, now) {
    if (confirmId === r.id) return confirmRow(r);
    const online = !!(r.presence && r.presence.online);
    const p = r.profile;
    const level = p && p.level ? String(p.level) : '—';
    const meta = [`Lv ${level}`, p && p.faction ? p.faction.name : null].filter(Boolean).join(' · ');

    const nameCell = h('td', { class: 'zcf-col-name' },
      isEnemy(r.id) ? enemyMark() : null,
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
        onclick: () => toggleMenu(r.id),
      }, icon('ellipsis-h')),
      menuId === r.id ? rowMenu(r) : null);

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
    // Rows mid-edit or mid-confirm stay put even if they stop matching the tab (spec §D.3 #2).
    const pinned = [editId, confirmId, menuId].filter((id) => id !== null);
    const { rows, counts } = buildFriendsTable({ list: listOf(), presence: presence.get, threads: s.threads, tab, query, sort, pinned });
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
      if (!counts.all) append(empty, [`No ${L().many} yet. Use `, h('b', null, L().add), ' above, or ', h('b', null, L().profile), " on a player's profile."]);
      else if (q) empty.textContent = `No ${L().many} match "${q}".`;
      else empty.textContent = tab === 'online' ? `No ${L().many} online right now.` : `No offline ${L().many}.`;
    }
    const sig = `${kind}:${Object.keys(listOf()).join(',')}`;
    if (pop.isOpen && sig !== popSig) pop.refresh();
    popSig = sig;

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
      if (holdRender) {
        renderWanted = true;
        return;
      }
      safe('friends-page-render', render)();
    });
  }

  // Friends ↔ Enemies: the search and any edit / confirm / menu reset; sort and the All/Online/Offline tab carry over.
  function switchKind(next) {
    if (next === kind) return;
    commitEdit();
    kind = next;
    query = '';
    search.value = '';
    confirmId = null;
    menuId = null;
    pop.close();
    for (const entry of rowEls.values()) entry.el.remove();
    rowEls.clear();
    popSig = '';
    syncKind();
    render();
  }

  function ensure() {
    if (!active || el.isConnected) return;
    const slot = doc.querySelector('.q-page-container');
    if (!slot) return;
    doc.documentElement.classList.add(PAGE_CLASS);
    slot.appendChild(el);
  }

  const game404 = () => doc.querySelector('.q-page-container > .fixed-center');
  const leaving = () => !!(leaveObserver || leaveTimer);

  // Takes our page and the <html> class away, once the next route has drawn (or 1s passed). Coming
  // back to the page meanwhile only stops the wait.
  function finishLeave() {
    if (leaveObserver) leaveObserver.disconnect();
    leaveObserver = null;
    clearTimeout(leaveTimer);
    leaveTimer = null;
    if (active) return;
    doc.documentElement.classList.remove(PAGE_CLASS);
    el.remove();
  }

  // The router reports popstate synchronously, before Vue has swapped routes: removing the page now
  // would show the game's 404, still in the slot, for a moment (spec §D.3 #1).
  function leaveWhenReplaced() {
    if (!game404()) {
      finishLeave();
      return;
    }
    leaveObserver = new win.MutationObserver(() => {
      if (!game404()) finishLeave();
    });
    leaveObserver.observe(doc.body, { childList: true, subtree: true });
    leaveTimer = setTimeout(finishLeave, LEAVE_MS);
  }

  function show() {
    active = true;
    finishLeave(); // back before the last leave finished: just stop waiting
    doc.documentElement.classList.add(PAGE_CLASS);
    doc.addEventListener('mousedown', onDocMousedown);
    doc.addEventListener('pointerup', onPointerRelease, true);
    doc.addEventListener('pointercancel', onPointerRelease, true);
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
    doc.removeEventListener('pointerup', onPointerRelease, true);
    doc.removeEventListener('pointercancel', onPointerRelease, true);
    holdRender = false;
    renderWanted = false;
    leaveWhenReplaced();
  }

  function onRoute(path) {
    const want = pageKind(path);
    if (want) switchKind(want);
    if (want && !active) show();
    else if (!want && active) hide();
    else if (!want && !leaving()) doc.documentElement.classList.remove(PAGE_CLASS); // left over from hideGame404Early
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
    get kind() {
      return kind;
    },
    destroy() {
      if (active) hide();
      if (leaving()) finishLeave();
      if (unkeep) unkeep();
      unkeep = null;
    },
  };
}
```

Add to `src/ui/styles.js` (after the `.zcf-page-mid{text-align:center}` rule):

```css
.zcf-page-htabs{display:flex;justify-content:center;gap:18px}
.zcf-page .zcf-page-h{color:#e0e0e0;text-decoration:none;opacity:.35;transition:opacity .15s}
.zcf-page .zcf-page-h:hover{opacity:.7}
.zcf-page .zcf-page-h.zcf-page-h-on{opacity:1}
.zcf-page .zcf-col-name > .zcf-enemy-mark{margin-right:6px}
```

- [ ] **Step 5: Run the page tests and the whole suite**

Run: `npx vitest run test/friends-table.test.js test/ui/friends-page.test.js && npx vitest run`
Expected: PASS.

### Task 14: Add Enemy on profiles

**Files:**
- Modify: `src/ui/profile-button.js` (full file below)
- Test: `test/ui/profile-button.test.js`

- [ ] **Step 1: Write the failing tests** (append to `test/ui/profile-button.test.js`; add `ENEMY_BUTTON` to the import from `../../src/ui/profile-button.js`)

```js
function setupBoth(html, profile = { username: 'TePuu', avatar: 'a.png' }) {
  document.body.innerHTML = html;
  const services = makeServices();
  services.players.get = vi.fn().mockResolvedValue({ ok: true, data: profile });
  const friend = createProfileButton({ ...services });
  const enemy = createProfileButton({
    spec: ENEMY_BUTTON,
    isOn: (id) => services.isEnemy(id),
    add: services.actions.addEnemy,
    remove: services.actions.removeEnemy,
    players: services.players,
    toast: services.toast,
    after: () => friend.wrap,
  });
  services.store.subscribe(() => friend.refresh());
  services.enemies.subscribe(() => enemy.refresh());
  mounted.push(friend, enemy);
  return { services, friend, enemy };
}
const route = (b, path) => {
  b.friend.onRoute(path);
  b.enemy.onRoute(path);
};

describe('enemy profile button', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    for (const pb of mounted) pb.destroy();
    mounted = [];
    vi.unstubAllGlobals();
  });

  it('adds "Add Enemy" right after Add Friend, in the same outline style', () => {
    const b = setupBoth(PROFILE_OTHER_HTML);
    route(b, '/profile/42');
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Add Enemy', 'Mail']);
    const btn = document.querySelector('.zcf-profile-btn-enemy .q-btn');
    expect(btn.classList.contains('q-btn--outline')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(true);
    expect(btn.querySelector('i').classList.contains('fa-skull')).toBe(true);
  });

  it('turns red as "Enemy" once added, and removes only after a confirming click', async () => {
    const b = setupBoth(PROFILE_OTHER_HTML);
    route(b, '/profile/42');
    const btn = document.querySelector('.zcf-profile-btn-enemy .q-btn');
    btn.click();
    await flush();
    expect(b.services.enemies.get().enemies[42]).toMatchObject({ username: 'TePuu', avatar: 'a.png' });
    expect(b.services.toast).toHaveBeenCalledWith('TePuu added to enemies');
    expect(labels()[3]).toBe('Enemy');
    expect(btn.classList.contains('zcf-is-enemy')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(false);
    btn.click();
    await flush();
    expect(labels()[3]).toBe('Remove?');
    btn.click();
    await flush();
    expect(b.services.enemies.get().enemies[42]).toBeUndefined();
    expect(labels()[3]).toBe('Add Enemy');
  });

  it('follows Add Friend after Block on a blocked profile, and adds nothing on your own', () => {
    const b = setupBoth(PROFILE_BLOCKED_HTML);
    route(b, '/profile/42');
    expect(labels()).toEqual(['Unblock', 'Add Friend', 'Add Enemy']);
    const own = setupBoth(PROFILE_OWN_HTML);
    route(own, '/profile/1');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/ui/profile-button.test.js`
Expected: FAIL (`ENEMY_BUTTON` not exported).

- [ ] **Step 3: Implement**

<!-- file: src/ui/profile-button.js -->
```js
// A button on /profile/{id} for one of your lists (Add Friend, Add Enemy), cloned from the game's own
// Mail button so it matches exactly. One instance per list; `after` puts one right after another.
import { isFriend } from '../state.js';
import { safe, warnOnce } from '../util.js';

export const PROFILE_PATH = /^\/profile\/(\d+)\/?$/;
const CONFIRM_MS = 4000;

export const FRIEND_BUTTON = {
  key: 'friend',
  label: 'Add Friend',
  onLabel: 'Friends',
  icon: 'fa-user-plus',
  onIcon: 'fa-user-check',
  onClass: 'zcf-is-friend',
  addTitle: 'Add to your friends list',
  removeTitle: 'Click to remove from friends',
  added: (name) => `${name} added to friends`,
};

export const ENEMY_BUTTON = {
  key: 'enemy',
  label: 'Add Enemy',
  onLabel: 'Enemy',
  icon: 'fa-skull',
  onIcon: 'fa-skull',
  onClass: 'zcf-is-enemy',
  addTitle: 'Add to your enemies list',
  removeTitle: 'Click to remove from enemies',
  added: (name) => `${name} added to enemies`,
};

// Without `spec`, it's the friend button over `store` and `actions` (the 0.4 call shape).
export function createProfileButton({
  doc = document,
  win = window,
  spec = FRIEND_BUTTON,
  store,
  actions,
  isOn = (id) => isFriend(store.get(), id),
  add = (p) => actions.addFriend(p),
  remove = (id) => actions.removeFriend(id),
  players,
  toast,
  after = null,
}) {
  let profileId = null;
  let wrap = null;
  let button = null;
  let label = null;
  let iconEl = null;
  let confirming = false;
  let confirmTimer = null;
  let observer = null;
  let frame = 0;
  let warnTimer = null;

  function findButton(iconClass, labelRe) {
    for (const btn of doc.querySelectorAll('.q-btn.q-btn--outline')) {
      if (btn.closest('.zcf-profile-btn')) continue;
      if (btn.querySelector(`.${iconClass}`) && labelRe.test(btn.textContent.trim())) return btn;
    }
    return null;
  }

  function setIcon(name) {
    if (!iconEl) return;
    for (const c of [...iconEl.classList]) if (/^fa-/.test(c)) iconEl.classList.remove(c);
    iconEl.classList.add(name);
  }

  function refresh() {
    if (!button || !button.isConnected || profileId === null) return;
    const on = isOn(profileId);
    setIcon(on ? spec.onIcon : spec.icon);
    label.textContent = on ? (confirming ? 'Remove?' : spec.onLabel) : spec.label;
    button.classList.toggle(spec.onClass, on);
    button.classList.toggle('text-grey-4', !on);
    button.title = on ? spec.removeTitle : spec.addTitle;
  }

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = profileId;
    if (id === null) return;
    if (isOn(id)) {
      if (confirming) {
        confirming = false;
        clearTimeout(confirmTimer);
        remove(id);
      } else {
        confirming = true;
        confirmTimer = setTimeout(() => {
          confirming = false;
          refresh();
        }, CONFIRM_MS);
      }
      refresh();
      return;
    }
    const r = await players.get(id);
    const data = r.ok && r.data ? r.data : {};
    const username = typeof data.username === 'string' && data.username ? data.username : `#${id}`;
    add({ id, username, avatar: typeof data.avatar === 'string' ? data.avatar : null });
    toast(spec.added(username));
  }

  // Returns true once there is nothing left to do on this page (inserted, or it's our own profile).
  function tryInsert() {
    if (profileId === null) return true;
    if (wrap && wrap.isConnected) return true;
    if (findButton('fa-cog', /^settings$/i)) return true;
    const mail = findButton('fa-envelope', /^mail$/i);
    const trade = findButton('fa-exchange', /^trade$/i);
    const block = findButton('fa-ban', /^(un)?block$/i);
    const template = mail || block;
    if (!template || !template.parentElement) return false;
    const prev = after ? after() : null;
    if (after && !(prev && prev.isConnected)) return false; // wait for the button this one follows

    wrap = template.parentElement.cloneNode(true);
    wrap.classList.add('zcf-profile-btn', `zcf-profile-btn-${spec.key}`);
    button = wrap.querySelector('.q-btn');
    button.removeAttribute('href');
    button.removeAttribute('to');
    for (const c of [...button.classList]) if (/^text-/.test(c)) button.classList.remove(c);
    button.classList.add('text-grey-4');
    iconEl = button.querySelector('i');
    label = button.querySelector('.block') || button.querySelector('.q-btn__content span:last-child');
    if (!label) {
      label = doc.createElement('span');
      label.className = 'block';
      button.querySelector('.q-btn__content').appendChild(label);
    }
    button.addEventListener('click', safe(`profile-button-click-${spec.key}`, onClick));

    if (prev) prev.after(wrap);
    else if (mail && trade) trade.parentElement.after(wrap);
    else if (mail) mail.parentElement.before(wrap);
    else block.parentElement.after(wrap);
    confirming = false;
    refresh();
    return true;
  }

  function stopWatching() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(warnTimer);
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  }

  function onRoute(path) {
    stopWatching();
    if (wrap) wrap.remove();
    wrap = null;
    button = null;
    const m = PROFILE_PATH.exec(path);
    profileId = m ? Number(m[1]) : null;
    if (profileId === null) return;
    tryInsert();
    // The game re-renders the button row while a profile loads, so keep watching while we're on this page.
    observer = new win.MutationObserver(() => {
      if (frame || (wrap && wrap.isConnected)) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        safe('profile-button-insert', tryInsert)();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    warnTimer = setTimeout(() => {
      if (!wrap && !findButton('fa-cog', /^settings$/i)) warnOnce(`profile-buttons-not-found-${spec.key}`, path);
    }, 10000);
  }

  function destroy() {
    stopWatching();
    clearTimeout(confirmTimer);
    if (wrap) wrap.remove();
    wrap = null;
    button = null;
    profileId = null;
  }

  return {
    onRoute,
    refresh,
    tryInsert,
    destroy,
    get wrap() {
      return wrap;
    },
  };
}
```

Add to `src/ui/styles.js` after `.q-btn.zcf-is-friend{…}`:

```css
.q-btn.zcf-is-enemy{color:#ef5350!important}
```

- [ ] **Step 4: Run it again**

Run: `npx vitest run test/ui/profile-button.test.js`
Expected: PASS (old friend tests and new enemy tests).

### Task 15: Skulls in chats

**Files:**
- Create: `src/ui/enemy-marks.js`
- Modify: `src/ui/dm-window.js`, `src/ui/styles.js`
- Test: `test/ui/enemy-marks.test.js`, `test/ui/dm-window.test.js`, `test/ui/pm-window.test.js`

- [ ] **Step 1: Write the failing tests**

<!-- file: test/ui/enemy-marks.test.js -->
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEnemyMarks } from '../../src/ui/enemy-marks.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

const row = (name) => `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span>14:20</span></div><div>text</div></div></div></div></div>`;
const marked = () => [...document.querySelectorAll('.general-chat .msg-cont')]
  .filter((r) => r.querySelector('.zcf-enemy-mark'))
  .map((r) => r.querySelector('.sender-name').textContent);

let marks = null;
function setup(names) {
  document.body.innerHTML = DOCK_HTML;
  let set = new Set(names);
  marks = createEnemyMarks({ names: () => set });
  marks.start();
  return (next) => {
    set = new Set(next);
    marks.refresh();
  };
}

describe('enemy marks in the game chats', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    if (marks) marks.destroy();
    marks = null;
    vi.unstubAllGlobals();
  });

  it('marks enemy senders on screen and in new rows, case-insensitively, never twice', async () => {
    setup(['nyx']);
    expect(marked()).toEqual(['Nyx']);
    const sender = document.querySelector('.general-chat .msg-cont:nth-child(2) .sender-name');
    expect(sender.previousElementSibling.getAttribute('title')).toBe('Enemy');
    document.querySelector('.general-chat .message-panel').insertAdjacentHTML('beforeend', row('NYX') + row('Moth'));
    await flush();
    await flush();
    expect(marked()).toEqual(['Nyx', 'NYX']);
    marks.refresh();
    expect(document.querySelectorAll('.zcf-enemy-mark')).toHaveLength(2);
  });

  it('adds and removes marks when the enemies list changes', () => {
    const setNames = setup(['nyx']);
    setNames(['gravedigger']);
    expect(marked()).toEqual(['Gravedigger']);
    setNames([]);
    expect(document.querySelectorAll('.zcf-enemy-mark')).toHaveLength(0);
  });

  it("never changes the game's own nodes or their attributes", () => {
    document.body.innerHTML = DOCK_HTML;
    const attrs = (n) => [...n.attributes].map((a) => `${a.name}=${a.value}`).join();
    const before = [...document.querySelectorAll('.chat-containers *')].map((n) => [n, attrs(n)]);
    let set = new Set(['nyx', 'me']);
    marks = createEnemyMarks({ names: () => set });
    marks.start();
    set = new Set(['gravedigger']);
    marks.refresh();
    for (const [node, was] of before) {
      expect(node.isConnected).toBe(true);
      expect(attrs(node)).toBe(was);
    }
    const ours = [...document.querySelectorAll('.chat-containers *')].filter((n) => !before.some(([b]) => b === n));
    expect(ours.every((n) => n.classList.contains('zcf-enemy-mark'))).toBe(true);
  });
});
```

Append to `test/ui/dm-window.test.js` inside its `describe`:

```js
  it('shows a skull for an enemy in the header and on their messages', async () => {
    const { el, services, win } = mount({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, 'hi', '2026-09-28 14:02:00'), rawMsg(2, ME, 'yo', '2026-09-28 14:03:00')] }),
    });
    await flush();
    const headMark = el.querySelector('.chat-title .zcf-enemy-mark');
    expect(headMark.hidden).toBe(true);
    expect(el.classList.contains('zcf-enemy')).toBe(false);
    services.actions.addEnemy({ id: THEM, username: 'Spike' });
    win.update();
    expect(headMark.hidden).toBe(false);
    expect(el.classList.contains('zcf-enemy')).toBe(true);
    expect(el.querySelector('.zcf-them .zcf-enemy-mark')).not.toBeNull();
    expect(el.querySelectorAll('.zcf-sender:not(.zcf-them) .zcf-enemy-mark')).toHaveLength(0);
  });
```

Append to `test/ui/pm-window.test.js` inside its `describe`:

```js
  it('puts a skull before enemies in the Chats rows and search results', async () => {
    vi.useFakeTimers();
    const { services, el } = mount({ threads: [thread(9, { username: 'Grim' }), thread(8)], searchResults: [{ id: 9, username: 'Grim', avatar: null }] });
    services.actions.addEnemy({ id: 9, username: 'Grim' });
    current.update();
    const rows = list(el).querySelectorAll('.zcf-row');
    expect(rows[1].querySelector('.zcf-name .zcf-enemy-mark')).not.toBeNull();
    expect(rows[0].querySelector('.zcf-enemy-mark')).toBeNull();
    typeSearch(el, 'gri');
    await vi.advanceTimersByTimeAsync(300);
    expect(list(el).querySelector('.zcf-row .zcf-enemy-mark')).not.toBeNull();
  });
```

(Thread 8's `lastReply` is newer than thread 9's, so Grim is the second row.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/ui/enemy-marks.test.js test/ui/dm-window.test.js test/ui/pm-window.test.js`
Expected: FAIL (module missing; DM has no skull).

- [ ] **Step 3: Implement**

<!-- file: src/ui/enemy-marks.js -->
```js
// Red skulls before enemies' names in the game's own Global / Faction / Activity chats (spec §C.5). Rows
// carry no player ids, so senders are matched to enemies' saved usernames, case-insensitively. One
// MutationObserver on the dock looks only at added nodes, batched per frame, so the cost is O(new rows).
// We insert our own <i> next to the game's sender name and never touch the game's nodes or attributes.
import { enemyMark } from './marks.js';
import { safe } from '../util.js';

const ROW = '.msg-cont';

// names(): the Set of lower-cased enemy usernames (enemies.js enemyNames).
export function createEnemyMarks({ doc = document, win = window, keeper = null, names }) {
  let dockEl = null;
  let observer = null;
  let frame = 0;
  let pending = [];
  let handled = new WeakSet(); // rows already looked at, so a burst of mutations doesn't redo them
  let unkeep = null;

  const isGameRow = (row) => !row.closest('.zcf-root');

  function markRow(row, set) {
    const sender = row.querySelector('.sender-name');
    if (!sender || !sender.parentNode) return;
    const prev = sender.previousElementSibling;
    const has = !!(prev && prev.classList.contains('zcf-enemy-mark'));
    const want = set.has(sender.textContent.trim().toLowerCase());
    if (want && !has) sender.parentNode.insertBefore(enemyMark(), sender);
    else if (!want && has) prev.remove();
  }

  function rowsIn(node) {
    if (node.nodeType !== 1) return [];
    if (node.matches(ROW)) return [node];
    return [...node.querySelectorAll(ROW)];
  }

  function flushPending() {
    frame = 0;
    const set = names();
    const nodes = pending;
    pending = [];
    for (const node of nodes) {
      if (!node.isConnected) continue;
      for (const row of rowsIn(node)) {
        if (handled.has(row) || !isGameRow(row)) continue;
        handled.add(row);
        markRow(row, set);
      }
    }
  }

  function onMutations(records) {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && !n.classList.contains('zcf-enemy-mark')) pending.push(n);
      }
    }
    if (pending.length && !frame) frame = win.requestAnimationFrame(safe('enemy-marks', flushPending));
  }

  // Every game chat row on screen, after the enemies list changed.
  function refresh() {
    if (!dockEl) return;
    const set = names();
    for (const row of dockEl.querySelectorAll(ROW)) {
      if (!isGameRow(row)) continue;
      handled.add(row);
      markRow(row, set);
    }
  }

  function ensure() {
    const found = doc.querySelector('.chat-containers');
    if (found === dockEl) return;
    if (observer) observer.disconnect();
    observer = null;
    dockEl = found;
    handled = new WeakSet();
    if (!dockEl) return;
    observer = new win.MutationObserver(safe('enemy-marks-observer', onMutations));
    observer.observe(dockEl, { childList: true, subtree: true });
    refresh();
  }

  return {
    start() {
      ensure();
      if (keeper && !unkeep) unkeep = keeper.add({ name: 'enemy-marks', attached: () => !!(dockEl && dockEl.isConnected), ensure });
    },
    refresh,
    destroy() {
      if (unkeep) unkeep();
      unkeep = null;
      if (observer) observer.disconnect();
      observer = null;
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      dockEl = null;
    },
  };
}
```

In `src/ui/dm-window.js`:
- add `import { enemyMark } from './marks.js';`
- read `const isEnemy = services.isEnemy || (() => false);` after the services destructuring;
- build the header title with a hidden mark before the name:

```js
  const headMark = enemyMark();
  headMark.hidden = true;
  const title = h('div', { class: 'chat-title' }, avatarSlot, headMark, nameEl, statusEl, unreadBadge);
```

- in `renderItem`, give their sender span a mark (CSS shows it only on an enemy's window):

```js
      : h('span', { class: 'zcf-sender zcf-them', onclick: () => router.navigate(`/profile/${userId}`) }, enemyMark(), displayName());
```

- in `update()`, after `nameEl.title = displayName();` add:

```js
    const enemy = isEnemy(userId);
    headMark.hidden = !enemy;
    el.classList.toggle('zcf-enemy', enemy);
```

In `src/ui/styles.js` add after `.zcf-sender.zcf-them:hover{…}`:

```css
.zcf-dm:not(.zcf-enemy) .zcf-them .zcf-enemy-mark{display:none}
.zcf-dm.chat-minimized .chat-title .zcf-enemy-mark{display:none}
.msg-cont .zcf-enemy-mark{margin-right:4px}
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/ui/enemy-marks.test.js test/ui/dm-window.test.js test/ui/pm-window.test.js`
Expected: PASS.

### Task 16: Wire enemies into the app

**Files:**
- Modify: `src/app.js`
- Test: `test/app.test.js`

- [ ] **Step 1: Write the failing tests** (append inside `describe('app', …)`)

```js
  it('shows the Enemies page on /enemies and checks presence for enemies there, not friends', async () => {
    vi.useFakeTimers();
    document.body.insertAdjacentHTML('beforeend', PAGE_404_HTML);
    window.history.replaceState({}, '', '/enemies');
    const storage = storageWith({ friends: friends(5) });
    storage.setItem(`zcf:v1:${ME}:enemies`, JSON.stringify({ v: 1, enemies: { 9: { id: 9, username: 'Grim' } } }));
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage });
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('main.zcf-page .zcf-chip-name').textContent).toBe('Grim');
    expect(api.getProfile.mock.calls.map((c) => c[0])).toEqual([9]);
  });

  it("puts skulls before enemies' names in the game's chat", () => {
    const storage = memoryStorage({ [`zcf:v1:${ME}:enemies`]: JSON.stringify({ v: 1, enemies: { 9: { id: 9, username: 'nyx' } } }) });
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage });
    const marked = [...document.querySelectorAll('.general-chat .msg-cont')].filter((r) => r.querySelector('.zcf-enemy-mark'));
    expect(marked.map((r) => r.querySelector('.sender-name').textContent)).toEqual(['Nyx']);
    app.actions.removeEnemy(9);
    expect(document.querySelectorAll('.general-chat .zcf-enemy-mark')).toHaveLength(0);
  });

  it('exports and imports enemies with friends', () => {
    const storage = storageWith({ friends: friends(5) });
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage });
    app.actions.addEnemy({ id: 9, username: 'Grim' });
    const text = app.actions.exportFriends();
    expect(JSON.parse(text).enemies).toEqual([{ id: 9, username: 'Grim' }]);
    app.actions.removeEnemy(9);
    expect(app.actions.importFriends(text)).toEqual({ ok: true, added: 0, enemiesAdded: 1, notes: 0 });
  });
```

Also expose the enemies store from `createApp` for tests (`return { store, enemies, settings, … }` below).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/app.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** in `src/app.js`

Imports:

```js
import { createStore, createSettingsStore, createEnemiesStore } from './store.js';
import { exportFriends, parseImport, mergeImport, mergeEnemiesImport } from './backup.js';
import { addEnemy, removeEnemy, setEnemyNote, updateEnemyInfo, isEnemy, enemyNames } from './enemies.js';
import { createProfileButton, ENEMY_BUTTON } from './ui/profile-button.js';
import { createEnemyMarks } from './ui/enemy-marks.js';
```

(`removeFriend`, `updateFriendInfo` etc. stay imported from `./state.js`.)

After the settings store: `const enemies = createEnemiesStore({ playerId, storage, win, now });`

Replace `syncFriendInfo` with `syncPlayerInfo` (and use it in both places that called `syncFriendInfo`):

```js
  // Keeps saved names and avatars fresh from presence answers, for friends and enemies alike.
  function syncPlayerInfo(id, info) {
    if (!info) return;
    const stale = (p) => !!p && (
      (typeof info.username === 'string' && info.username && info.username !== p.username)
      || (typeof info.avatar === 'string' && info.avatar && info.avatar !== p.avatar));
    if (stale(store.get().friends[id])) store.update((s) => updateFriendInfo(s, id, info));
    if (stale(enemies.get().enemies[id])) enemies.update((d) => updateEnemyInfo(d, id, info));
  }
```

Replace the presence poller's target list:

```js
  // Whose presence a list on screen shows: friends in Private Messages or on the Friends page, enemies on the
  // Enemies page (spec §C.3).
  function presenceTargets() {
    const ids = new Set();
    const onPage = page.active ? page.kind : null;
    if (store.get().dock.friendsOpen || onPage === 'friends') for (const id of Object.keys(store.get().friends)) ids.add(Number(id));
    if (onPage === 'enemies') for (const id of Object.keys(enemies.get().enemies)) ids.add(Number(id));
    return [...ids];
  }
```

and in its `run`: `const stale = presenceTargets().filter((id) => presence.isStale(id));`

Actions (add):

```js
    addEnemy(p) {
      enemies.update((d) => addEnemy(d, p, now()));
      presence.refresh([p.id]);
    },
    removeEnemy: (id) => enemies.update((d) => removeEnemy(d, id)),
    setEnemyNote: (id, note) => enemies.update((d) => setEnemyNote(d, id, note)),
```

Replace export/import:

```js
    exportFriends: () => exportFriends(store.get(), playerId, enemies.get()),
    importFriends(text) {
      const r = parseImport(text, playerId);
      if (!r.ok) return r;
      const f = store.update((s) => mergeImport(s, r.friends, now()));
      const e = r.enemies.length ? enemies.update((d) => mergeEnemiesImport(d, r.enemies, now())) : { added: 0, notes: 0 };
      return { ok: true, added: f.added, enemiesAdded: e.added, notes: f.notes + e.notes };
    },
```

Services: add `enemies,` and `isEnemy: (id) => isEnemy(enemies.get(), id),`.

After `const profileButton = …` add:

```js
  const enemyButton = createProfileButton({
    doc,
    win,
    spec: ENEMY_BUTTON,
    isOn: (id) => isEnemy(enemies.get(), id),
    add: (p) => actions.addEnemy(p),
    remove: (id) => actions.removeEnemy(id),
    players,
    toast,
    after: () => profileButton.wrap,
  });
  const marks = createEnemyMarks({ doc, win, keeper, names: () => enemyNames(enemies.get()) });
```

Subscriptions (after the settings subscription):

```js
  enemies.subscribe(() => {
    view.render();
    enemyButton.refresh();
    page.scheduleRender();
    marks.refresh();
  });
```

In `router.onChange`, after `profileButton.onRoute(path);` add `enemyButton.onRoute(path);`. In the start-up sequence after `profileButton.onRoute(router.path);` add `enemyButton.onRoute(router.path);` and after `topbar.start();` add `marks.start();`. In `destroy()` add `enemyButton.destroy();`, `marks.destroy();` and `enemies.destroy();`. Return `enemies` and `settings` from `createApp` beside `store`.

Add `PAGE_404_HTML` is already imported in `test/app.test.js`; nothing else to import there.

- [ ] **Step 4: Run everything, update docs, commit Part C**

Run: `npx vitest run`
Expected: all pass.

Docs: in `README.md` add an "Enemies" paragraph (FRIENDS | ENEMIES tabs, Add Enemy on profiles, private notes, red skull in chats, included in Export/Import). In `docs/manual-test.md` add:

```markdown
31. **Enemies:** on another player's profile, `ADD ENEMY` sits right after `ADD FRIEND` (desktop and phone width). Click → red `ENEMY`; click → `Remove?` → click → removed. Own profile: no button.
32. `/enemies` shows the ENEMIES title tab bright and FRIENDS dim; both tabs switch without a reload. Notes, search, sort and **Add enemy** work as on Friends.
33. An enemy who posts in Global, Faction or Activity gets a red skull before their name, including on messages that arrive later and after scrolling back; removing them takes the skull away.
```

```bash
git add -A src test README.md docs/manual-test.md
git commit -m "feat: enemies list with profile button, page tab, notes and skull markers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018xFLSnTGkyRmowXEhicgAC"
```

---
# Part B + D: Per-chat customization, Chat settings, Mute, What's new

### Task 17: Geometry and the user stylesheet (pure)

**Files:**
- Create: `src/chat-custom/geometry.js`, `src/chat-custom/user-style.js`
- Test: `test/chat-custom/geometry.test.js`, `test/chat-custom/user-style.test.js`

- [ ] **Step 1: Write the failing tests**

<!-- file: test/chat-custom/geometry.test.js -->
```js
import { describe, it, expect } from 'vitest';
import { clampPosition, pastThreshold, gripsFor, resizeLimits, resizeRect, DRAG_THRESHOLD } from '../../src/chat-custom/geometry.js';

describe('chat geometry', () => {
  it('keeps a box fully on screen, pinning one that cannot fit', () => {
    expect(clampPosition({ x: 1200, y: 700, w: 350, h: 450, vw: 1280, vh: 800 })).toEqual({ x: 930, y: 350 });
    expect(clampPosition({ x: -20, y: -1, w: 350, h: 450, vw: 1280, vh: 800 })).toEqual({ x: 0, y: 0 });
    expect(clampPosition({ x: 50, y: 50, w: 2000, h: 450, vw: 1280, vh: 800 })).toEqual({ x: 0, y: 50 });
    expect(clampPosition({ x: 12.6, y: NaN, w: 10, h: 10, vw: 100, vh: 100 })).toEqual({ x: 13, y: 0 });
  });

  it('turns a press into a drag only past the threshold', () => {
    expect(DRAG_THRESHOLD).toBe(6);
    expect(pastThreshold(6, 0)).toBe(false);
    expect(pastThreshold(3, 4)).toBe(false);
    expect(pastThreshold(5, 4)).toBe(true);
  });

  it('gives docked chats the top grips, moved chats the bottom ones too, locked chats none', () => {
    expect(gripsFor({ locked: true, moved: true })).toEqual([]);
    expect(gripsFor({ locked: false, moved: false })).toEqual(['n', 'nw']);
    expect(gripsFor({ locked: false, moved: true })).toEqual(['n', 'nw', 's', 'se']);
  });

  it('resizes from each grip within the limits, anchoring the opposite edges', () => {
    const start = { left: 600, top: 300, width: 350, height: 450 };
    const docked = resizeLimits({ dir: 'nw', start, moved: false, vw: 1280, vh: 800 });
    expect(docked).toEqual({ minW: 270, maxW: 900, minH: 200, maxH: 740 });
    expect(resizeRect({ dir: 'nw', start, dx: -100, dy: -50, limits: docked, moved: false })).toEqual({ w: 450, h: 500 });
    expect(resizeRect({ dir: 'n', start, dx: -100, dy: 1000, limits: docked, moved: false })).toEqual({ h: 200 });
    const se = resizeLimits({ dir: 'se', start, moved: true, vw: 1280, vh: 800 });
    expect([se.maxW, se.maxH]).toEqual([680, 500]);
    expect(resizeRect({ dir: 'se', start, dx: 1000, dy: 1000, limits: se, moved: true })).toEqual({ w: 680, h: 500, x: 600, y: 300 });
    const nw = resizeLimits({ dir: 'nw', start, moved: true, vw: 1280, vh: 800 });
    expect(resizeRect({ dir: 'nw', start, dx: -50, dy: -40, limits: nw, moved: true })).toEqual({ w: 400, h: 490, x: 550, y: 260 });
  });
});
```

<!-- file: test/chat-custom/user-style.test.js -->
```js
import { describe, it, expect } from 'vitest';
import { buildUserCss, chatSelector } from '../../src/chat-custom/user-style.js';
import { CSS } from '../../src/ui/styles.js';
import { GAME_DOCK_CSS } from '../fixtures/game-dock-css.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { parseCss, winner } from '../ui/cascade.js';

describe('user stylesheet', () => {
  it('is empty for default settings', () => {
    expect(buildUserCss({ chats: {} })).toBe('');
  });

  it('sizes an open chat, places a moved one, and scales its messages, per chat', () => {
    const css = buildUserCss({ chats: { 'game:general': { w: 420, h: 520, x: 40, y: 120, text: 120 }, 'dm:5': { text: 90 } }, vw: 1280, vh: 800 });
    expect(css).toContain('body .chat-containers > .chat-container.general-chat:not(.chat-minimized){width:420px;min-width:0;max-width:none;height:520px;max-height:none;flex:none}');
    expect(css).toContain('body .chat-containers > .chat-container.general-chat{position:fixed;left:40px;top:120px;right:auto;bottom:auto;margin:0;transition:none}');
    expect(css).toContain('body .chat-containers > .chat-container.general-chat .chat-content{zoom:1.2}');
    expect(css).toContain('body .chat-containers .zcf[data-zcf-chat="dm:5"] .zcf-zoom{zoom:0.9}');
    expect(chatSelector('pm')).toBe('body .chat-containers .zcf[data-zcf-chat="pm"]');
  });

  it('keeps a moved chat fully on screen with its measured size', () => {
    const css = buildUserCss({ chats: { pm: { x: 1200, y: 700 } }, vw: 1280, vh: 800, sizes: { pm: { w: 350, h: 450 } } });
    expect(css).toContain('left:930px;top:350px');
  });

  it('gives an unlocked chat a containing block for its grips and a grab cursor', () => {
    const css = buildUserCss({ chats: { 'game:faction': { locked: false } } });
    expect(css).toContain('body .chat-containers > .chat-container.faction-chat{position:relative}');
    expect(css).toContain('body .chat-containers > .chat-container.faction-chat > .chat-header{cursor:grab}');
  });

  it('shows a live gesture over the saved entry', () => {
    const css = buildUserCss({ chats: { pm: { w: 380 } }, live: { key: 'pm', entry: { w: 500 } } });
    expect(css).toContain('width:500px');
    expect(css).not.toContain('width:380px');
    expect(css).toContain('transition:none');
  });

  it('applies only message size on phones', () => {
    const css = buildUserCss({ chats: { 'game:general': { w: 420, x: 1, y: 2, text: 150, locked: false } }, small: true });
    expect(css).toBe('body .chat-containers > .chat-container.general-chat .chat-content{zoom:1.5}');
  });

  it("outranks the game's dock rules and our own defaults, whichever stylesheet loads last", () => {
    document.body.innerHTML = DOCK_HTML;
    document.querySelector('.chat-containers').insertAdjacentHTML('afterbegin',
      '<div class="zcf-root"><div class="chat-container zcf zcf-dm zcf-open" data-zcf-chat="dm:5"><div class="chat-header"></div><div class="chat-content"></div></div></div>');
    const USER = parseCss(buildUserCss({ chats: { 'game:general': { w: 420, h: 520, x: 40, y: 120 }, 'dm:5': { w: 400, h: 600 } }, vw: 1280, vh: 800 }));
    const GAME = parseCss(GAME_DOCK_CSS);
    const OURS = parseCss(CSS);
    const general = document.querySelector('.general-chat');
    const dm = document.querySelector('[data-zcf-chat="dm:5"]');
    for (const width of [1280, 800]) {
      for (const sheets of [[GAME, OURS, USER], [USER, OURS, GAME], [OURS, USER, GAME]]) {
        expect(winner(general, 'width', width, sheets).value).toBe('420px');
        expect(winner(general, 'max-height', width, sheets).value).toBe('none');
        expect(winner(general, 'position', width, sheets).value).toBe('fixed');
        expect(winner(dm, 'height', width, sheets).value).toBe('600px');
      }
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/chat-custom/geometry.test.js test/chat-custom/user-style.test.js`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

<!-- file: src/chat-custom/geometry.js -->
```js
// Pure geometry for moving and resizing chats (ported from Chat+): keeping a chat on screen, the drag
// threshold, and each resize grip's math. No DOM.
import { LIMITS } from './chats.js';

// Movement must exceed this many pixels before a press becomes a drag, so a still click stays a click.
export const DRAG_THRESHOLD = 6;
// A chat may grow to the viewport's height minus this.
export const VIEWPORT_MARGIN = 60;

export const pastThreshold = (dx, dy) => Math.hypot(dx, dy) > DRAG_THRESHOLD;

// Keeps `value` in [0, limit - size]; a box that can't fit pins to 0.
export function clampAxis(value, size, limit) {
  const max = limit - size;
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

export function clampPosition({ x, y, w, h, vw, vh }) {
  return { x: Math.round(clampAxis(x, w, vw)), y: Math.round(clampAxis(y, h, vh)) };
}

// The grips an unlocked chat gets: a docked chat grows up and left (the row keeps its right and bottom
// edges), a moved one also down and right. No grip on the right edge, where the scrollbar lives.
export const gripsFor = ({ locked, moved }) => (locked ? [] : moved ? ['n', 'nw', 's', 'se'] : ['n', 'nw']);

// How far one resize may go: width 270-900, height 200 to the viewport height minus 60, and never past
// the screen edge the grip is pulling toward.
export function resizeLimits({ dir, start, moved, vw, vh }) {
  let maxW = LIMITS.maxW;
  let maxH = vh - VIEWPORT_MARGIN;
  if (dir.includes('w')) maxW = Math.min(maxW, start.left + start.width);
  if (dir.includes('e')) maxW = Math.min(maxW, vw - start.left);
  if (dir.includes('n')) maxH = Math.min(maxH, start.top + start.height);
  if (moved && dir.includes('s')) maxH = Math.min(maxH, vh - start.top);
  return { minW: LIMITS.minW, maxW: Math.max(LIMITS.minW, maxW), minH: LIMITS.minH, maxH: Math.max(LIMITS.minH, maxH) };
}

// The size a resize asks for: only the dimensions its grip pulls ('n'/'s' height, 'nw'/'se' both). A moved
// chat also gets its new top-left, since growing from the top or left edge moves that corner.
export function resizeRect({ dir, start, dx, dy, limits, moved }) {
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
  const out = {};
  if (dir.includes('e')) out.w = clamp(start.width + dx, limits.minW, limits.maxW);
  if (dir.includes('w')) out.w = clamp(start.width - dx, limits.minW, limits.maxW);
  if (dir.includes('s')) out.h = clamp(start.height + dy, limits.minH, limits.maxH);
  if (dir.includes('n')) out.h = clamp(start.height - dy, limits.minH, limits.maxH);
  if (moved) {
    out.x = Math.round(start.left + (dir.includes('w') ? Math.round(start.width) - out.w : 0));
    out.y = Math.round(start.top + (dir.includes('n') ? Math.round(start.height) - out.h : 0));
  }
  return out;
}
```

<!-- file: src/chat-custom/user-style.js -->
```js
// Builds the text of <style id="zcf-user-settings">: every chat's size, position and message size (spec
// §B.2). The game's chats are Vue-owned (it binds their class and style), so this stylesheet is the only
// way we style them. Pure: settings, the viewport and measured sizes in, CSS text out.
import { GAME_CHATS, isLocked, isMoved, textOf } from './chats.js';
import { clampPosition } from './geometry.js';

export const STYLE_ID = 'zcf-user-settings';
// For keeping a moved chat on screen when its size couldn't be measured.
const FALLBACK = { w: 350, h: 450 };

// `body .chat-containers …` so each rule outranks the game's dock rules, whichever stylesheet loads last.
export function chatSelector(key) {
  const game = GAME_CHATS.find((g) => g.key === key);
  if (game) return `body .chat-containers > .chat-container.${game.cls}`;
  return `body .chat-containers .zcf[data-zcf-chat="${key}"]`;
}

// What message size scales: a game chat's content, or our window's messages and typing box.
const zoomTargets = (key) => (key.startsWith('game:') ? ['.chat-content'] : ['.zcf-zoom']);

// chats: settings.chats. live: { key, entry } overriding one chat mid-gesture. sizes: key -> { w, h } as
// drawn now, to keep a moved chat fully on screen. small: the phone layout, where only message size applies.
export function buildUserCss({ chats = {}, live = null, small = false, vw = 1280, vh = 800, sizes = {} }) {
  const rules = [];
  const keys = new Set(Object.keys(chats));
  if (live) keys.add(live.key);
  for (const key of keys) {
    const isLive = !!(live && live.key === key);
    const entry = isLive ? { ...chats[key], ...live.entry } : chats[key];
    if (!entry) continue;
    const sel = chatSelector(key);
    const text = textOf(entry);
    if (text !== 100) rules.push(`${zoomTargets(key).map((t) => `${sel} ${t}`).join(',')}{zoom:${text / 100}}`);
    if (small) continue;
    const sized = [];
    if (entry.w) sized.push(`width:${entry.w}px`, 'min-width:0', 'max-width:none');
    if (entry.h) sized.push(`height:${entry.h}px`, 'max-height:none');
    const box = [];
    if (isMoved(entry)) {
      const size = sizes[key] || { w: entry.w || FALLBACK.w, h: entry.h || FALLBACK.h };
      const p = clampPosition({ x: entry.x, y: entry.y, w: size.w, h: size.h, vw, vh });
      box.push('position:fixed', `left:${p.x}px`, `top:${p.y}px`, 'right:auto', 'bottom:auto', 'margin:0');
    } else if (!isLocked(entry)) {
      box.push('position:relative'); // the containing block for its resize grips
    }
    if (sized.length || isMoved(entry) || isLive) box.push('transition:none');
    if (box.length) rules.push(`${sel}{${box.join(';')}}`);
    if (sized.length) rules.push(`${sel}:not(.chat-minimized){${sized.join(';')};flex:none}`);
    if (!isLocked(entry)) rules.push(`${sel} > .chat-header{cursor:grab}`);
  }
  return rules.join('\n');
}
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/chat-custom/geometry.test.js test/chat-custom/user-style.test.js`
Expected: PASS.

### Task 18: Version, What's new, sound, Mark all as read (pure-ish)

**Files:**
- Create: `src/version.js`, `src/whats-new.js`, `src/sound.js`, `src/mark-read.js`
- Modify: `build.mjs`, `vitest.config.js`
- Test: `test/version.test.js`, `test/sound.test.js`, `test/mark-read.test.js`

- [ ] **Step 1: Write the failing tests**

<!-- file: test/version.test.js -->
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/version.js';
import { WHATS_NEW } from '../src/whats-new.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('version and release notes', () => {
  it('reads the version from package.json at build time', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('lists releases newest first as plain text', () => {
    expect(WHATS_NEW[0].version).toBe('0.5.0');
    expect(WHATS_NEW.map((v) => v.version)).toEqual(['0.5.0', '0.4.x', '0.3.x', '0.2.x', '0.1.x']);
    for (const v of WHATS_NEW) {
      expect(v.features.length).toBeGreaterThan(0);
      for (const f of v.features) {
        expect(typeof f.title).toBe('string');
        for (const p of f.points) expect(p).not.toMatch(/[<>]/);
      }
    }
  });
});
```

<!-- file: test/sound.test.js -->
```js
import { describe, it, expect, vi } from 'vitest';
import { createSound, TONES } from '../src/sound.js';

function fakeAudio() {
  const made = [];
  class FakeContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 5;
      this.destination = {};
      this.oscillators = [];
      this.resume = vi.fn(() => {
        this.state = 'running';
        return Promise.resolve();
      });
      made.push(this);
    }

    createOscillator() {
      const o = { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      this.oscillators.push(o);
      return o;
    }

    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
  }
  return { win: { AudioContext: FakeContext }, made };
}

describe('sound', () => {
  it('is silent when off, and makes no AudioContext for it', () => {
    const { win, made } = fakeAudio();
    const sound = createSound({ win });
    expect(sound.play('off')).toBe(false);
    expect(made).toHaveLength(0);
  });

  it('plays each tone through one lazily created, resumed AudioContext', () => {
    const { win, made } = fakeAudio();
    const sound = createSound({ win });
    expect(sound.play('ping')).toBe(true);
    expect(sound.play('chirp')).toBe(true);
    expect(made).toHaveLength(1);
    expect(made[0].resume).toHaveBeenCalled();
    expect(made[0].oscillators).toHaveLength(TONES.ping.length + TONES.chirp.length);
    expect(made[0].oscillators[0].start).toHaveBeenCalledWith(5);
  });

  it('does nothing where WebAudio is missing', () => {
    expect(createSound({ win: {} }).play('bell')).toBe(false);
  });
});
```

<!-- file: test/mark-read.test.js -->
```js
import { describe, it, expect, vi } from 'vitest';
import { markAllRead, MARK_ALL_MAX } from '../src/mark-read.js';

describe('mark all as read', () => {
  it('reads each chat one at a time, the way opening it does, marks it seen and reports progress', async () => {
    let inFlight = 0;
    let most = 0;
    const api = {
      getChatMessages: vi.fn(async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return { ok: true, data: [] };
      }),
    };
    const markSeen = vi.fn();
    const onProgress = vi.fn();
    const toast = vi.fn();
    expect(await markAllRead({ ids: [4, 5, 6], api, markSeen, onProgress, toast })).toBe(3);
    expect(most).toBe(1);
    expect(api.getChatMessages.mock.calls).toEqual([[4, 1, 10], [5, 1, 10], [6, 1, 10]]);
    expect(markSeen.mock.calls.map((c) => c[0])).toEqual([4, 5, 6]);
    expect(onProgress.mock.calls).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
    expect(toast).toHaveBeenCalledWith('Marked 3 chats as read');
  });

  it(`does at most ${MARK_ALL_MAX} per press`, async () => {
    const api = { getChatMessages: vi.fn(async () => ({ ok: true })) };
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(await markAllRead({ ids, api, markSeen: () => {}, toast: () => {} })).toBe(MARK_ALL_MAX);
    expect(api.getChatMessages).toHaveBeenCalledTimes(MARK_ALL_MAX);
  });

  it('stops with a toast when the session ended or mail is unavailable', async () => {
    for (const kind of ['auth', 'busy']) {
      const api = { getChatMessages: vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValue({ ok: false, kind }) };
      const markSeen = vi.fn();
      const toast = vi.fn();
      expect(await markAllRead({ ids: [1, 2, 3], api, markSeen, toast })).toBe(1);
      expect(api.getChatMessages).toHaveBeenCalledTimes(2);
      expect(markSeen).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(expect.any(String), { error: true });
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/version.test.js test/sound.test.js test/mark-read.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __ZCF_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    restoreMocks: true,
  },
});
```

`build.mjs`: add `define: { __ZCF_VERSION__: JSON.stringify(pkg.version) },` to the esbuild options (after `outfile`).

<!-- file: src/version.js -->
```js
/* global __ZCF_VERSION__ */
// The script's version, put in by the build from package.json ('dev' if run unbundled).
export const VERSION = typeof __ZCF_VERSION__ === 'string' ? __ZCF_VERSION__ : 'dev';
```

<!-- file: src/whats-new.js -->
```js
// Release notes for the bottom of Chat settings (spec §D.2). Plain text, newest first. No badge or dot ever
// points at these: they're there for whoever opens settings.
export const WHATS_NEW = [
  {
    version: '0.5.0',
    date: '2026-09-29',
    features: [
      {
        title: 'Private Messages',
        points: [
          'The dock window is now Private Messages, with Chats, Friends, Faction and Blocked tabs.',
          'Search any player by name to start a chat. Older chats load as you scroll.',
        ],
      },
      {
        title: 'Enemies',
        points: [
          'An Enemies list beside Friends, with private notes, and Add Enemy on profiles.',
          "A red skull marks enemies in chats, including the game's Global, Faction and Activity.",
        ],
      },
      {
        title: 'Customize any chat',
        points: [
          'Unlock a chat with its padlock to drag it anywhere, resize it from its edges, then lock it there.',
          'Each chat keeps its own size, message size and spot. Right-click a padlock for its menu.',
        ],
      },
      {
        title: 'Chat settings and sounds',
        points: [
          'The cog in the corner: mark all as read, close all private chats, and reset any chat.',
          'An optional sound for new private messages.',
        ],
      },
      {
        title: 'Mute a conversation',
        points: ['The bell in a DM header stops its pop-ups, sound and green count.'],
      },
    ],
  },
  {
    version: '0.4.x',
    date: '2026-09-29',
    features: [
      { title: 'Friends page', points: ['A full Friends page from the top-bar icon, with level, status and faction.', 'Private notes on friends.'] },
      { title: 'Quieter dock', points: ['A plain top-bar icon, and a green unread count on the minimized window.'] },
    ],
  },
  {
    version: '0.3.x',
    date: '2026-09-28',
    features: [
      { title: 'Emoji picker', points: ['Pick emoji in DMs, Zed City ones included.'] },
      { title: 'Fixes', points: ['DM windows are no longer cut off at the bottom.'] },
    ],
  },
  {
    version: '0.2.x',
    date: '2026-09-28',
    features: [
      { title: 'GIFs', points: ['Send and see GIFs in DMs.'] },
      { title: 'Install link', points: ['One install link, with automatic updates.'] },
    ],
  },
  {
    version: '0.1.x',
    date: '2026-09-28',
    features: [
      { title: 'Friends and DMs', points: ['A friends list, DM windows in the chat dock, and Add Friend on profiles.'] },
    ],
  },
];
```

<!-- file: src/sound.js -->
```js
// The new-private-message sound (spec §B.4): short tones synthesized with WebAudio, so there are no files
// and no network requests. The AudioContext is made on first use and resumed then; browsers only let it
// start once the player has interacted with the page, so unlock() is also called from clicks.
export const TONES = {
  chirp: [{ f: 1800, to: 2700, at: 0, dur: 0.07 }, { f: 2200, to: 3100, at: 0.09, dur: 0.07 }],
  ping: [{ f: 1320, at: 0, dur: 0.28 }],
  bell: [{ f: 880, at: 0, dur: 0.7 }, { f: 1760, at: 0, dur: 0.45, gain: 0.08 }],
};

export function createSound({ win = window } = {}) {
  let ctx = null;

  function context() {
    if (!ctx) {
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume().catch(() => {});
    return ctx;
  }

  // Plays a named sound; 'off' (or any unknown name) is silent. Returns whether anything was scheduled.
  function play(name) {
    const tones = TONES[name];
    if (!tones) return false;
    const ac = context();
    if (!ac) return false;
    const t0 = ac.currentTime;
    for (const tone of tones) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const start = t0 + tone.at;
      const end = start + tone.dur;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.f, start);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.gain || 0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
    return true;
  }

  return {
    play,
    unlock() {
      context();
    },
  };
}
```

<!-- file: src/mark-read.js -->
```js
// Chat settings → Mark all as read (spec §B.4): reads each unread chat's newest page, one at a time, which
// is what marks it read on the server (the same as opening it), then marks it seen here.
export const MARK_ALL_MAX = 20;

export async function markAllRead({ ids, api, markSeen, onProgress = () => {}, toast, max = MARK_ALL_MAX }) {
  const todo = ids.slice(0, max);
  let marked = 0;
  onProgress(0, todo.length);
  for (let i = 0; i < todo.length; i += 1) {
    const r = await api.getChatMessages(todo[i], 1, 10);
    if (!r.ok && (r.kind === 'auth' || r.kind === 'busy')) {
      toast(r.kind === 'auth' ? 'Log in again to mark chats as read.' : 'Mail is unavailable right now. Try again later.', { error: true });
      return marked;
    }
    if (r.ok) {
      markSeen(todo[i]);
      marked += 1;
    }
    onProgress(i + 1, todo.length);
  }
  toast(`Marked ${marked} chat${marked === 1 ? '' : 's'} as read`);
  return marked;
}
```

- [ ] **Step 4: Run them again, plus the build test**

Run: `npx vitest run test/version.test.js test/sound.test.js test/mark-read.test.js test/build.test.js`
Expected: PASS (`VERSION` is still 0.4.1 here; it becomes 0.5.0 in Task 26).

### Task 19: Settings window state, muted unread counts, inbox mute and sound hooks

**Files:**
- Modify: `src/state.js`, `src/inbox.js`
- Test: `test/state.test.js`, `test/inbox.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/state.test.js` (add `setSettingsOpen, closeAllDms, chatsUnreadIds, setFriendsOpen` to the imports where missing):

```js
  it('keeps the Chat settings window in the dock state and the one-open rules', () => {
    const s = emptyState();
    expect(s.dock.settingsOpen).toBe(false);
    expect(normalizeState({ v: 1, dock: { settingsOpen: 1 } }).dock.settingsOpen).toBe(true);
    openDm(s, 1, { expand: true });
    setFriendsOpen(s, true);
    setSettingsOpen(s, true, { exclusive: true });
    expect([s.dock.dms[0].open, s.dock.friendsOpen, s.dock.settingsOpen]).toEqual([false, false, true]);
    setFriendsOpen(s, true, { exclusive: true });
    expect([s.dock.friendsOpen, s.dock.settingsOpen]).toEqual([true, false]);
    setSettingsOpen(s, true);
    openDm(s, 1, { expand: true, exclusive: true });
    expect([s.dock.friendsOpen, s.dock.settingsOpen]).toEqual([false, false]);
    setSettingsOpen(s, true);
    collapseAll(s);
    expect(s.dock.settingsOpen).toBe(false);
    closeAllDms(s);
    expect(s.dock.dms).toEqual([]);
  });

  it('leaves muted chats out of the unread chats', () => {
    const s = emptyState();
    addFriend(s, { id: 1, username: 'a' }, 0);
    s.threads = { 1: { unread: 2 }, 3: { unread: 5 } };
    const inbox = [{ userId: 3, isSystem: false }];
    expect(chatsUnreadIds(s, inbox)).toEqual([1, 3]);
    expect(chatsUnreadIds(s, inbox, [3])).toEqual([1]);
    expect(chatsUnreadTotal(s, inbox, [3])).toBe(2);
  });
```

In `test/inbox.test.js`, change `setup` to take extra options:

```js
function setup(rowsSequence, extra = {}) {
  const rows = [...rowsSequence];
  const api = fakeApi({ getChats: vi.fn(() => Promise.resolve({ ok: true, data: rows.shift() || [] })) });
  const store = createStore({ playerId: ME, storage: memoryStorage() });
  const onActivity = vi.fn();
  const onThreadChanged = vi.fn();
  const inbox = createInbox({ api, store, myId: ME, now: () => 1000, onActivity, onThreadChanged, ...extra });
  return { api, store, inbox, onActivity, onThreadChanged };
}
```

and append:

```js
  it('skips the pop-up for a muted friend, but still counts their unread mail', async () => {
    const { store, inbox } = setup([[rawThread(5, { newMail: 2 })]], { isMuted: (id) => id === 5 });
    store.update((s) => addFriend(s, { id: 5, username: 'Spike' }, 0));
    await inbox.poll();
    expect(store.get().dock.dms).toEqual([]);
    expect(store.get().threads[5].unread).toBe(2);
  });

  it('reports new mail from others once per poll, never on the first poll, for system threads, your own sends or muted chats', async () => {
    const onNewMail = vi.fn();
    const { inbox } = setup([
      [rawThread(5, { newMail: 1, lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { newMail: 2, lastReply: '2026-09-28 10:01:00' }), rawThread(6, { newMail: 1, lastReply: '2026-09-28 10:01:00' })],
      [rawThread(5, { newMail: 2, lastReply: '2026-09-28 10:01:00' })],
      [rawThread(7, { newMail: 1, isSystem: 1 }), rawThread(8, { newMail: 1, senderId: ME }), rawThread(9, { newMail: 1 })],
    ], { onNewMail, isMuted: (id) => id === 9 });
    await inbox.poll();
    expect(onNewMail).not.toHaveBeenCalled();
    await inbox.poll();
    expect(onNewMail).toHaveBeenCalledTimes(1);
    expect(onNewMail.mock.calls[0][0].map((t) => t.userId)).toEqual([5, 6]);
    await inbox.poll();
    await inbox.poll();
    expect(onNewMail).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/state.test.js test/inbox.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/state.js`:

```js
export function emptyState() {
  return { v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, settingsOpen: false, dms: [] } };
}
```

In `normalizeState`'s `dock`, add `settingsOpen: !!dock.settingsOpen,` after `friendsOpen`.

Replace `collapseOthers`, `setFriendsOpen`, `collapseAll` and `chatsUnreadTotal`, and add `setSettingsOpen`, `closeAllDms`, `chatsUnreadIds`:

```js
function collapseOthers(state, keep) {
  for (const d of state.dock.dms) if (d !== keep) d.open = false;
  state.dock.friendsOpen = false;
  state.dock.settingsOpen = false;
}
```

```js
export function setFriendsOpen(state, open, { exclusive = false } = {}) {
  state.dock.friendsOpen = !!open;
  if (open && exclusive) {
    for (const d of state.dock.dms) d.open = false;
    state.dock.settingsOpen = false;
  }
}

export function setSettingsOpen(state, open, { exclusive = false } = {}) {
  state.dock.settingsOpen = !!open;
  if (open && exclusive) {
    for (const d of state.dock.dms) d.open = false;
    state.dock.friendsOpen = false;
  }
}

export function collapseAll(state) {
  state.dock.friendsOpen = false;
  state.dock.settingsOpen = false;
  for (const d of state.dock.dms) d.open = false;
}

// Chat settings → Close all private chats. Their per-chat settings live elsewhere and are kept.
export function closeAllDms(state) {
  state.dock.dms = [];
}

// Chats with unread messages that the Private Messages window lists: all friends, plus the other
// (non-system) threads on the first inbox page. Muted conversations are left out (spec §D.1).
export function chatsUnreadIds(state, inboxThreads, muted = []) {
  const ids = new Set(Object.keys(state.friends).map(Number));
  for (const t of inboxThreads) if (!t.isSystem) ids.add(t.userId);
  const skip = new Set(muted);
  return [...ids].filter((id) => !skip.has(id) && state.threads[id] && state.threads[id].unread > 0);
}

export function chatsUnreadTotal(state, inboxThreads, muted = []) {
  return chatsUnreadIds(state, inboxThreads, muted).reduce((n, id) => n + state.threads[id].unread, 0);
}
```

`src/inbox.js`:
- change the signature to `export function createInbox({ api, store, myId, now = () => Date.now(), onActivity = () => {}, onThreadChanged = () => {}, isMuted = () => false, onNewMail = () => {} }) {`
- in the `changes` loop, make the pop skip muted players:

```js
      const pop = !!state.friends[t.userId] && !isMuted(t.userId) && (t.lastReply || 0) > (seen.lastNotifiedReply || 0);
```

- inside `if (prevBaseline) {`, before `let chatting = false;`, add:

```js
      // New unread mail from another player since the last poll (never on the first poll, so a reload is
      // quiet): the new-message sound, at most once per poll (spec §B.4, §D.1).
      const arrived = fresh.filter((t) => !isMuted(t.userId) && prevBaseline.get(t.userId) !== t.lastReply);
      if (arrived.length) {
        try {
          onNewMail(arrived);
        } catch (e) {
          warnOnce('inbox-callback', e);
        }
      }
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/state.test.js test/inbox.test.js`
Expected: PASS.

### Task 20: Chat registry, header controls and the chat menu

**Files:**
- Create: `src/ui/chat-custom/registry.js`, `src/ui/chat-custom/padlock.js`, `src/ui/chat-custom/menu.js`

These three are small DOM helpers; their behavior is tested through `index.js` in Task 22.

- [ ] **Step 1: Implement**

<!-- file: src/ui/chat-custom/registry.js -->
```js
// Finds every chat in the dock right now (spec §B.2): the game's by class, ours by data-zcf-chat.
import { GAME_CHATS } from '../../chat-custom/chats.js';

const info = (key, el) => ({
  key,
  el,
  header: el.querySelector(':scope > .chat-header'),
  minimized: el.classList.contains('chat-minimized'),
});

export function findChats(doc = document) {
  const dock = doc.querySelector('.chat-containers');
  if (!dock) return [];
  const out = [];
  for (const g of GAME_CHATS) {
    const el = dock.querySelector(`:scope > .chat-container.${g.cls}`);
    if (el) out.push(info(g.key, el));
  }
  for (const el of dock.querySelectorAll('.chat-container[data-zcf-chat]')) out.push(info(el.dataset.zcfChat, el));
  return out;
}
```

<!-- file: src/ui/chat-custom/padlock.js -->
```js
// The controls we insert into a chat's header (spec §B.3): message size and Reset once the chat is 400px
// wide or more, the return arrow on a moved chat, and the padlock. They're our own child nodes; a game
// header's own nodes and attributes are never touched. Clicks stop here so the game's header toggle
// doesn't fire.
import { h } from '../dom.js';
import { LIMITS, textOf, isLocked, isMoved } from '../../chat-custom/chats.js';

export const HEADER_CONTROLS_MIN_WIDTH = 400;
export const TITLE_LOCKED = 'Locked — click to unlock, right-click for options';
export const TITLE_UNLOCKED = 'Unlocked — drag to move, click to lock';

// act: { toggleLock(key), stepText(key, delta), resetSize(key), returnToRow(key), openMenu(key, anchor) }
export function createChatControls(key, act) {
  const stop = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
  const value = h('span', { class: 'zcf-cc-value' });
  const reset = h('button', { class: 'zcf-cc-btn', type: 'button', title: "Reset this chat's size", onclick: stop(() => act.resetSize(key)) }, 'Reset');
  const inline = h('span', { class: 'zcf-cc-inline' },
    h('button', { class: 'zcf-cc-step', type: 'button', 'aria-label': 'Smaller messages', onclick: stop(() => act.stepText(key, -LIMITS.textStep)) }, '−'),
    value,
    h('button', { class: 'zcf-cc-step', type: 'button', 'aria-label': 'Larger messages', onclick: stop(() => act.stepText(key, LIMITS.textStep)) }, '+'),
    reset);
  const back = h('button', { class: 'zcf-cc-icon zcf-cc-return', type: 'button', title: 'Return to the row', 'aria-label': 'Return to the row', onclick: stop(() => act.returnToRow(key)) },
    h('i', { class: 'fas fa-undo-alt', 'aria-hidden': 'true' }));
  const glyph = h('i', { class: 'fas fa-lock', 'aria-hidden': 'true' });
  const lock = h('button', { class: 'zcf-cc-icon zcf-cc-lock', type: 'button', onclick: stop(() => act.toggleLock(key)) }, glyph);
  lock.addEventListener('contextmenu', stop(() => act.openMenu(key, lock)));
  const el = h('span', { class: 'zcf-cc', dataset: { zcfCc: key } }, inline, back, lock);

  // width: the chat's width now, for the 400px header controls.
  function sync(entry, width) {
    const locked = isLocked(entry);
    lock.title = locked ? TITLE_LOCKED : TITLE_UNLOCKED;
    lock.setAttribute('aria-label', lock.title);
    lock.setAttribute('aria-pressed', String(locked));
    lock.classList.toggle('zcf-cc-unlocked', !locked);
    glyph.className = `fas ${locked ? 'fa-lock' : 'fa-lock-open'}`;
    back.hidden = !isMoved(entry);
    value.textContent = `${textOf(entry)}%`;
    inline.hidden = !(width >= HEADER_CONTROLS_MIN_WIDTH);
    reset.disabled = !(entry && (entry.w || entry.h));
  }

  return { el, sync };
}
```

<!-- file: src/ui/chat-custom/menu.js -->
```js
// The chat menu (right-click a padlock, spec §B.3): one small pop-up on <body>, below its padlock or above it
// near the bottom of the screen. Esc or a press outside closes it.
import { h, clear } from '../dom.js';

const GAP = 4;

export function createChatMenu({ doc = document, win = window } = {}) {
  const el = h('div', { class: 'zcf-cmenu', role: 'menu', hidden: true });
  let anchor = null;
  let key = null;
  let armed = false;

  const onDocDown = (e) => {
    if (el.contains(e.target) || (anchor && anchor.contains(e.target))) return;
    close();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };

  function position() {
    const r = anchor.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    const left = Math.max(GAP, Math.min(r.left, win.innerWidth - m.width - GAP));
    const below = r.bottom + GAP;
    const top = below + m.height > win.innerHeight ? r.top - GAP - m.height : below;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(Math.max(GAP, top))}px`;
  }

  // model: { title, rows: [{ label, controls: [Node] }] }
  function render(model) {
    const buttons = [...el.querySelectorAll('button')];
    const focused = buttons.indexOf(doc.activeElement);
    clear(el);
    el.appendChild(h('div', { class: 'zcf-cmenu-title' }, model.title));
    for (const row of model.rows) el.appendChild(h('div', { class: 'zcf-cmenu-row' }, h('span', { class: 'zcf-cmenu-label' }, row.label), row.controls));
    const again = el.querySelectorAll('button');
    if (focused >= 0 && again[Math.min(focused, again.length - 1)]) again[Math.min(focused, again.length - 1)].focus();
  }

  function open(anchorEl, chatKey, model) {
    anchor = anchorEl;
    key = chatKey;
    if (!el.isConnected) doc.body.appendChild(el);
    el.hidden = false;
    render(model);
    position();
    if (!armed) {
      doc.addEventListener('pointerdown', onDocDown, true);
      doc.addEventListener('keydown', onKey, true);
      armed = true;
    }
    const first = el.querySelector('button:not(:disabled)');
    if (first) first.focus();
  }

  function close() {
    if (!armed) return;
    armed = false;
    doc.removeEventListener('pointerdown', onDocDown, true);
    doc.removeEventListener('keydown', onKey, true);
    el.hidden = true;
    anchor = null;
    key = null;
  }

  return {
    el,
    open,
    close,
    // Re-draws the open menu after its chat's settings changed.
    update(chatKey, model) {
      if (armed && chatKey === key) render(model);
    },
    isOpen: () => armed,
    get key() {
      return key;
    },
    destroy() {
      close();
      el.remove();
    },
  };
}
```

### Task 21: Drag and resize gestures

**Files:**
- Create: `src/ui/chat-custom/drag.js`, `src/ui/chat-custom/resize.js`

Tested through `index.js` in Task 22.

- [ ] **Step 1: Implement**

<!-- file: src/ui/chat-custom/drag.js -->
```js
// Moving chats (spec §B.3): an unlocked, expanded chat by its header, or any minimized chat by its bubble.
// A 6px threshold keeps a still click a click; the click that ends a real drag is swallowed in the capture
// phase, before the game's header toggle sees it. Listens on the document, so a header that Vue re-renders
// mid-drag doesn't end the gesture.
import { pastThreshold, clampPosition } from '../../chat-custom/geometry.js';

// hit(target) → { key, el } for a press that may start a drag, or null.
export function createDrag({ doc = document, win = window, enabled, hit, onMove, onCommit, onCancel }) {
  let s = null;
  let swallow = false;

  function onDown(e) {
    swallow = false; // a new gesture: any click owed from an earlier drag never came
    if (s || e.button !== 0 || !enabled()) return;
    const target = hit(e.target);
    if (!target) return;
    const r = target.el.getBoundingClientRect();
    s = { key: target.key, id: e.pointerId, sx: e.clientX, sy: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, dragging: false, pos: null };
    doc.addEventListener('pointermove', onMoveEv, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onCancelEv, true);
  }

  function onMoveEv(e) {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.sx;
    const dy = e.clientY - s.sy;
    if (!s.dragging) {
      if (!pastThreshold(dx, dy)) return;
      s.dragging = true;
      doc.documentElement.classList.add('zcf-dragging');
    }
    if (e.cancelable) e.preventDefault();
    s.pos = clampPosition({ x: s.left + dx, y: s.top + dy, w: s.w, h: s.h, vw: win.innerWidth, vh: win.innerHeight });
    onMove(s.key, s.pos);
  }

  function end(commit) {
    const done = s;
    s = null;
    doc.removeEventListener('pointermove', onMoveEv, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', onCancelEv, true);
    if (!done.dragging) return;
    doc.documentElement.classList.remove('zcf-dragging');
    swallow = true;
    if (commit) onCommit(done.key, done.pos);
    else onCancel(done.key);
  }

  const onUp = (e) => {
    if (s && e.pointerId === s.id) end(true);
  };
  const onCancelEv = (e) => {
    if (s && e.pointerId === s.id) end(false);
  };

  function onClick(e) {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }

  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('click', onClick, true);

  return {
    isDragging: () => !!(s && s.dragging),
    destroy() {
      if (s) end(false);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('click', onClick, true);
    },
  };
}
```

<!-- file: src/ui/chat-custom/resize.js -->
```js
// Drag-to-resize grips on unlocked chats (spec §B.3). The grips are our own child nodes of the chat; the
// gesture listens on the document so a re-render mid-resize doesn't end it.
import { h } from '../dom.js';
import { resizeLimits, resizeRect } from '../../chat-custom/geometry.js';

// Puts exactly `dirs` grips on `el` (a no-op when they're already there). onPress(dir, event).
export function syncGrips(el, dirs, onPress) {
  const current = [...el.children].filter((c) => c.classList.contains('zcf-grip'));
  const have = current.map((g) => g.dataset.zcfGrip);
  if (have.length === dirs.length && have.every((d, i) => d === dirs[i])) return;
  for (const g of current) g.remove();
  for (const dir of dirs) {
    const grip = h('div', { class: `zcf-grip zcf-grip-${dir}`, dataset: { zcfGrip: dir }, 'aria-hidden': 'true' });
    grip.addEventListener('pointerdown', (e) => onPress(dir, e));
    el.appendChild(grip);
  }
}

export function createResize({ doc = document, win = window, onMove, onCommit, onCancel }) {
  let s = null;

  function start(key, el, dir, moved, e) {
    if (s || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    s = { key, dir, moved, id: e.pointerId, sx: e.clientX, sy: e.clientY, rect, limits: resizeLimits({ dir, start: rect, moved, vw: win.innerWidth, vh: win.innerHeight }), live: null };
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', cancel, true);
    doc.documentElement.classList.add('zcf-resizing');
  }

  function move(e) {
    if (!s || e.pointerId !== s.id) return;
    if (e.cancelable) e.preventDefault();
    s.live = resizeRect({ dir: s.dir, start: s.rect, dx: e.clientX - s.sx, dy: e.clientY - s.sy, limits: s.limits, moved: s.moved });
    onMove(s.key, s.live);
  }

  function end(commit) {
    const done = s;
    s = null;
    doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', up, true);
    doc.removeEventListener('pointercancel', cancel, true);
    doc.documentElement.classList.remove('zcf-resizing');
    if (commit && done.live) onCommit(done.key, done.live);
    else onCancel(done.key);
  }

  const up = (e) => {
    if (s && e.pointerId === s.id) end(true);
  };
  const cancel = (e) => {
    if (s && e.pointerId === s.id) end(false);
  };

  return {
    start,
    isActive: () => !!s,
    destroy() {
      if (s) end(false);
    },
  };
}
```

### Task 22: The per-chat customization controller

**Files:**
- Create: `src/ui/chat-custom/index.js`
- Test: `test/ui/chat-custom.test.js`

- [ ] **Step 1: Write the failing test**

<!-- file: test/ui/chat-custom.test.js -->
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatCustom } from '../../src/ui/chat-custom/index.js';
import { createKeeper } from '../../src/ui/keeper.js';
import { createSettingsStore } from '../../src/store.js';
import { updateChat } from '../../src/settings.js';
import { DOCK_HTML, wireGameHeaders } from '../fixtures/game-dom.js';
import { memoryStorage, flush } from '../helpers.js';

const OURS = `<div class="zcf-root">
  <div class="chat-container zcf zcf-dm zcf-open" data-zcf-chat="dm:5"><div class="chat-header"><div class="chat-title"><span>Spike</span></div><button class="zcf-hbtn" type="button">x</button></div><div class="chat-content"></div></div>
  <div class="chat-container zcf zcf-pm zcf-open" data-zcf-chat="pm"><div class="chat-header"><div class="chat-title"><span>Private Messages</span></div></div><div class="chat-content"></div></div>
</div>`;

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const ptr = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 });
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

let ctx = null;
function setup({ small = false } = {}) {
  document.body.innerHTML = DOCK_HTML;
  document.querySelector('.chat-containers').insertAdjacentHTML('afterbegin', OURS);
  wireGameHeaders();
  const settings = createSettingsStore({ playerId: 1, storage: memoryStorage(), win: new EventTarget() });
  const keeper = createKeeper();
  let isSmall = small;
  const dm = { name: vi.fn(() => 'Spike'), isMuted: vi.fn(() => false), toggleMute: vi.fn() };
  const general = document.querySelector('.general-chat');
  const faction = document.querySelector('.faction-chat');
  const pm = document.querySelector('[data-zcf-chat="pm"]');
  general.getBoundingClientRect = () => rect(600, 300, 350, 450);
  faction.getBoundingClientRect = () => rect(900, 720, 44, 40);
  const custom = createChatCustom({ settings, keeper, isSmall: () => isSmall, dm });
  custom.start();
  ctx = {
    custom,
    settings,
    keeper,
    dm,
    general,
    faction,
    pm,
    setSmall(v) {
      isSmall = v;
      custom.refresh();
    },
  };
  return ctx;
}
const chat = (key) => ctx.settings.get().chats[key];
const lockOf = (el) => el.querySelector(':scope > .chat-header .zcf-cc-lock');
const grips = (el) => [...el.querySelectorAll(':scope > .zcf-grip')].map((g) => g.dataset.zcfGrip);
const userCss = () => document.getElementById('zcf-user-settings').textContent;

describe('chat customization', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    if (ctx) {
      ctx.custom.destroy();
      ctx.keeper.destroy();
      ctx.settings.destroy();
    }
    ctx = null;
    vi.unstubAllGlobals();
  });

  it('puts a padlock in every chat header right after its title, the game chats included, and none on phones', () => {
    const { general, pm } = setup();
    for (const el of [general, pm, document.querySelector('[data-zcf-chat="dm:5"]')]) {
      const lock = lockOf(el);
      expect(lock).not.toBeNull();
      expect(lock.closest('.zcf-cc').previousElementSibling.classList.contains('chat-title')).toBe(true);
      expect(lock.title).toBe('Locked — click to unlock, right-click for options');
    }
    ctx.setSmall(true);
    expect(document.querySelectorAll('.zcf-cc')).toHaveLength(0);
  });

  it('toggles the lock without toggling the game chat, with grips only while unlocked', () => {
    const { general } = setup();
    lockOf(general).click();
    expect(chat('game:general')).toEqual({ locked: false });
    expect(general.classList.contains('chat-minimized')).toBe(false);
    expect(lockOf(general).title).toBe('Unlocked — drag to move, click to lock');
    expect(grips(general)).toEqual(['n', 'nw']);
    expect(userCss()).toContain('.general-chat{position:relative}');
    lockOf(general).click();
    expect(chat('game:general')).toBeUndefined();
    expect(grips(general)).toEqual([]);
  });

  it('moves an unlocked chat by its header past the threshold, while a still click still toggles it', () => {
    const { general } = setup();
    lockOf(general).click();
    const header = general.querySelector('.chat-header');
    header.dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointermove', 703, 312));
    expect(userCss()).not.toContain('position:fixed');
    document.dispatchEvent(ptr('pointermove', 650, 250));
    expect(userCss()).toContain('.general-chat{position:fixed;left:550px;top:240px');
    document.dispatchEvent(ptr('pointerup', 650, 250));
    click(header); // the click that ends a drag never reaches the game
    expect(general.classList.contains('chat-minimized')).toBe(false);
    expect(chat('game:general')).toEqual({ locked: false, x: 550, y: 240 });
    header.dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointerup', 700, 310));
    click(header);
    expect(general.classList.contains('chat-minimized')).toBe(true);
  });

  it('does not move a locked chat', () => {
    const { general } = setup();
    general.querySelector('.chat-header').dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointermove', 600, 200));
    document.dispatchEvent(ptr('pointerup', 600, 200));
    expect(chat('game:general')).toBeUndefined();
  });

  it('resizes from the grips within the limits, keeping a docked chat anchored', () => {
    const { general } = setup();
    lockOf(general).click();
    general.querySelector('.zcf-grip-nw').dispatchEvent(ptr('pointerdown', 600, 300));
    document.dispatchEvent(ptr('pointermove', 500, 250));
    expect(userCss()).toContain('width:450px');
    document.dispatchEvent(ptr('pointerup', 500, 250));
    expect(chat('game:general')).toEqual({ locked: false, w: 450, h: 500 });
    general.querySelector('.zcf-grip-n').dispatchEvent(ptr('pointerdown', 700, 300));
    document.dispatchEvent(ptr('pointermove', 700, -5000));
    document.dispatchEvent(ptr('pointerup', 700, -5000));
    expect(chat('game:general')).toEqual({ locked: false, w: 450, h: window.innerHeight - 60 });
  });

  it('returns a moved chat to the row with the arrow, keeping its size', () => {
    const { settings, general } = setup();
    settings.update((s) => updateChat(s, 'game:general', { x: 40, y: 50, w: 420 }));
    const back = general.querySelector('.zcf-cc-return');
    expect(back.hidden).toBe(false);
    back.click();
    expect(chat('game:general')).toEqual({ w: 420 });
    expect(general.querySelector('.zcf-cc-return').hidden).toBe(true);
  });

  it('changes message size one chat at a time from the right-click menu', () => {
    const { general } = setup();
    lockOf(general).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = document.querySelector('.zcf-cmenu');
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('Global');
    [...menu.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Larger messages').click();
    expect(chat('game:general')).toEqual({ text: 110 });
    expect(chat('pm')).toBeUndefined();
    expect(menu.textContent).toContain('110%');
    expect(userCss()).toContain('.general-chat .chat-content{zoom:1.1}');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('offers Mute in a DM chat menu', () => {
    setup();
    lockOf(document.querySelector('[data-zcf-chat="dm:5"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = document.querySelector('.zcf-cmenu');
    expect(menu.textContent).toContain('Spike');
    [...menu.querySelectorAll('button')].find((b) => b.textContent === 'Mute').click();
    expect(ctx.dm.toggleMute).toHaveBeenCalledWith(5);
  });

  it('shows message size and Reset in the header once a chat is 400px wide', () => {
    const { settings, general, pm } = setup();
    expect(general.querySelector('.zcf-cc-inline').hidden).toBe(true);
    settings.update((s) => updateChat(s, 'game:general', { w: 420 }));
    expect(general.querySelector('.zcf-cc-inline').hidden).toBe(false);
    expect(pm.querySelector('.zcf-cc-inline').hidden).toBe(true);
    general.querySelector('.zcf-cc-inline [aria-label="Smaller messages"]').click();
    expect(chat('game:general')).toEqual({ w: 420, text: 90 });
  });

  it('drags a bubble to a new spot without opening it', () => {
    const { faction } = setup();
    const header = faction.querySelector('.chat-header');
    header.dispatchEvent(ptr('pointerdown', 910, 730));
    document.dispatchEvent(ptr('pointermove', 860, 700));
    document.dispatchEvent(ptr('pointerup', 860, 700));
    click(header);
    expect(faction.classList.contains('chat-minimized')).toBe(true);
    expect(chat('game:faction')).toEqual({ x: 850, y: 690 });
  });

  it('puts the controls back after the game re-renders a header', async () => {
    const { general } = setup();
    general.querySelector('.zcf-cc').remove();
    await flush();
    await flush();
    expect(lockOf(general)).not.toBeNull();
  });

  it('never writes a class, attribute or inline style onto a game chat', async () => {
    const { general, faction, settings } = setup();
    lockOf(general).click();
    const header = general.querySelector('.chat-header');
    header.dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointermove', 650, 250));
    document.dispatchEvent(ptr('pointerup', 650, 250));
    general.querySelector('.zcf-grip-s').dispatchEvent(ptr('pointerdown', 700, 740));
    document.dispatchEvent(ptr('pointermove', 700, 700));
    document.dispatchEvent(ptr('pointerup', 700, 700));
    settings.update((s) => updateChat(s, 'game:faction', { text: 150 }));
    await flush();
    for (const [el, cls] of [[general, 'chat-container general-chat'], [faction, 'chat-container faction-chat chat-minimized']]) {
      expect(el.className).toBe(cls);
      expect([...el.attributes].map((a) => a.name)).toEqual(['class']);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/ui/chat-custom.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

<!-- file: src/ui/chat-custom/index.js -->
```js
// Per-chat customization for every chat in the dock (spec Part B, ported from Chat+): padlocks, moving,
// resize grips, message size and the chat menu, each remembered per chat in the settings document. The
// game's chats get only child nodes of ours plus rules in #zcf-user-settings, never attribute changes.
import { findChats } from './registry.js';
import { createChatControls } from './padlock.js';
import { createChatMenu } from './menu.js';
import { createDrag } from './drag.js';
import { createResize, syncGrips } from './resize.js';
import { h } from '../dom.js';
import { buildUserCss, STYLE_ID } from '../../chat-custom/user-style.js';
import { gripsFor } from '../../chat-custom/geometry.js';
import { isLocked, isMoved, textOf, clampText, dmIdOf, chatLabel, LIMITS } from '../../chat-custom/chats.js';
import { updateChat } from '../../settings.js';

// dm: { name(id), isMuted(id), toggleMute(id) } for a DM's menu.
export function createChatCustom({ doc = document, win = window, keeper = null, settings, isSmall, dm = null }) {
  const styleEl = doc.createElement('style');
  styleEl.id = STYLE_ID;
  const records = new Map(); // key -> { el, controls }
  const all = doc.getElementsByClassName('chat-container'); // live, so a chat coming or going changes its length
  let chats = [];
  let seenCount = -1;
  let live = null; // { key, entry } while a drag or resize is under way
  let unkeep = null;
  let unsubscribe = null;
  let frame = 0;

  const saved = (key) => settings.get().chats[key];
  const entryOf = (key) => (live && live.key === key ? { ...saved(key), ...live.entry } : saved(key));
  const save = (key, patch) => settings.update((s) => updateChat(s, key, patch));

  const menu = createChatMenu({ doc, win });
  const act = {
    toggleLock: (key) => save(key, { locked: isLocked(saved(key)) ? false : null }),
    stepText: (key, delta) => save(key, { text: clampText(textOf(saved(key)) + delta) }),
    resetSize: (key) => save(key, { w: null, h: null }),
    returnToRow: (key) => save(key, { x: null, y: null }),
    openMenu: (key, anchor) => menu.open(anchor, key, menuModel(key)),
  };

  function menuModel(key) {
    const entry = saved(key);
    const id = dmIdOf(key);
    const btn = (label, onclick, extra = {}) => h('button', { class: 'zcf-cc-btn', type: 'button', onclick, ...extra }, label);
    const text = textOf(entry);
    const rows = [
      {
        label: 'Message size',
        controls: [
          btn('−', () => act.stepText(key, -LIMITS.textStep), { 'aria-label': 'Smaller messages', disabled: text <= LIMITS.minText }),
          h('span', { class: 'zcf-cc-value' }, `${text}%`),
          btn('+', () => act.stepText(key, LIMITS.textStep), { 'aria-label': 'Larger messages', disabled: text >= LIMITS.maxText }),
        ],
      },
      { label: 'Chat size', controls: [btn('Reset', () => act.resetSize(key), { disabled: !(entry && (entry.w || entry.h)) })] },
    ];
    if (isMoved(entry)) rows.push({ label: 'Position', controls: [btn('Return to row', () => act.returnToRow(key))] });
    if (id && dm) rows.push({ label: 'Notifications', controls: [btn(dm.isMuted(id) ? 'Unmute' : 'Mute', () => dm.toggleMute(id))] });
    return { title: chatLabel(key, id && dm ? dm.name(id) : null), rows };
  }

  // A moved chat's size as drawn, for keeping it fully on screen.
  function measure(c) {
    const entry = entryOf(c.key);
    if (!isMoved(entry)) return null;
    const r = c.el.getBoundingClientRect();
    const open = !c.el.classList.contains('chat-minimized');
    const w = (open && entry.w) || r.width;
    const hgt = (open && entry.h) || r.height;
    return w && hgt ? { w, h: hgt } : null;
  }

  function applyStyle() {
    const sizes = {};
    for (const c of chats) {
      const m = measure(c);
      if (m) sizes[c.key] = m;
    }
    const css = buildUserCss({ chats: settings.get().chats, live, small: isSmall(), vw: win.innerWidth, vh: win.innerHeight, sizes });
    if (styleEl.textContent !== css) styleEl.textContent = css;
    if (!styleEl.isConnected) (doc.head || doc.documentElement).appendChild(styleEl);
  }

  function drop(rec) {
    rec.controls.el.remove();
    syncGrips(rec.el, [], null);
  }

  function refresh() {
    chats = findChats(doc);
    seenCount = all.length;
    const small = isSmall();
    const keep = new Set();
    for (const c of chats) {
      keep.add(c.key);
      let rec = records.get(c.key);
      if (!rec || rec.el !== c.el) {
        if (rec) drop(rec);
        rec = { el: c.el, controls: createChatControls(c.key, act) };
        records.set(c.key, rec);
      }
      if (small || !c.header) {
        drop(rec);
        continue;
      }
      if (rec.controls.el.parentNode !== c.header) {
        const title = c.header.querySelector(':scope > .chat-title');
        if (title) title.after(rec.controls.el);
        else c.header.appendChild(rec.controls.el);
      }
      const entry = entryOf(c.key);
      rec.controls.sync(entry, (!c.minimized && entry && entry.w) || c.el.getBoundingClientRect().width);
      const { key, el } = c;
      const dirs = c.minimized ? [] : gripsFor({ locked: isLocked(entry), moved: isMoved(entry) });
      syncGrips(el, dirs, (dir, e) => resize.start(key, el, dir, isMoved(saved(key)), e));
    }
    for (const [key, rec] of records) {
      if (keep.has(key)) continue;
      drop(rec);
      records.delete(key);
    }
    applyStyle();
    if (menu.isOpen()) {
      if (keep.has(menu.key) && !small) menu.update(menu.key, menuModel(menu.key));
      else menu.close();
    }
  }

  // O(chats) check for the keeper: a chat came or went, opened or closed, or lost our controls.
  function attached() {
    if (all.length !== seenCount) return false;
    const small = isSmall();
    for (const c of chats) {
      if (!c.el.isConnected || c.minimized !== c.el.classList.contains('chat-minimized')) return false;
      const rec = records.get(c.key);
      if (!small && c.header && (!rec || rec.controls.el.parentNode !== c.header)) return false;
    }
    return true;
  }

  const resize = createResize({
    doc,
    win,
    onMove(key, rect) {
      live = { key, entry: rect };
      refresh();
    },
    onCommit(key, rect) {
      live = null;
      save(key, rect);
    },
    onCancel() {
      live = null;
      refresh();
    },
  });

  const drag = createDrag({
    doc,
    win,
    enabled: () => !isSmall(),
    hit(target) {
      if (!target || !target.closest || target.closest('.zcf-grip, .zcf-cmenu')) return null;
      const c = findChats(doc).find((x) => x.el.contains(target));
      if (!c) return null;
      if (c.minimized) return { key: c.key, el: c.el };
      if (!c.header || !c.header.contains(target) || isLocked(saved(c.key))) return null;
      return { key: c.key, el: c.el };
    },
    onMove(key, pos) {
      live = { key, entry: pos };
      applyStyle();
    },
    onCommit(key, pos) {
      live = null;
      save(key, pos);
    },
    onCancel() {
      live = null;
      applyStyle();
    },
  });

  // Viewport changes re-clamp moved chats and re-check the 400px header controls, once per frame.
  function onViewport() {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  }

  return {
    start() {
      if (unsubscribe) return;
      unsubscribe = settings.subscribe(() => refresh());
      win.addEventListener('resize', onViewport);
      if (keeper) unkeep = keeper.add({ name: 'chat-custom', attached, ensure: refresh });
      refresh();
    },
    refresh,
    destroy() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      if (unkeep) unkeep();
      unkeep = null;
      win.removeEventListener('resize', onViewport);
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      drag.destroy();
      resize.destroy();
      menu.destroy();
      for (const rec of records.values()) drop(rec);
      records.clear();
      styleEl.remove();
    },
  };
}
```

- [ ] **Step 4: Run it again**

Run: `npx vitest run test/ui/chat-custom.test.js`
Expected: PASS.

### Task 23: The Chat settings window

**Files:**
- Create: `src/ui/settings-window.js`
- Modify: `test/ui/services.js`
- Test: `test/ui/settings-window.test.js`

- [ ] **Step 1: Test services for Part B/D**

In `test/ui/services.js`:
- add to the `../../src/state.js` import: `setSettingsOpen, closeAllDms`;
- add to the `../../src/settings.js` import: `setSound, setMuted, isMuted, resetChat, resetAllChats`;
- add actions:

```js
    toggleSettings: vi.fn(() => store.update((s) => setSettingsOpen(s, !s.dock.settingsOpen))),
    closeAllDms: vi.fn(() => store.update((s) => closeAllDms(s))),
    resetChat: vi.fn((key) => settings.update((s) => resetChat(s, key))),
    resetAllChats: vi.fn(() => settings.update((s) => resetAllChats(s))),
    setSound: vi.fn((name) => settings.update((s) => setSound(s, name))),
    toggleMute: vi.fn((id) => settings.update((s) => setMuted(s, id, !isMuted(s, id)))),
    markAllRead: vi.fn(async () => 0),
```

- add to the returned services: `sound: { play: vi.fn(() => true), unlock: vi.fn() },` and `isMuted: (id) => isMuted(settings.get(), id),`

- [ ] **Step 2: Write the failing test**

<!-- file: test/ui/settings-window.test.js -->
```js
import { describe, it, expect, afterEach } from 'vitest';
import { createSettingsWindow } from '../../src/ui/settings-window.js';
import { openDm } from '../../src/state.js';
import { updateChat } from '../../src/settings.js';
import { WHATS_NEW } from '../../src/whats-new.js';
import { makeServices } from './services.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

let current = null;
function mount({ open = true } = {}) {
  document.body.innerHTML = DOCK_HTML;
  const services = makeServices();
  const w = createSettingsWindow(services);
  const root = document.createElement('div');
  root.className = 'zcf-root';
  root.appendChild(w.el);
  document.querySelector('.chat-containers').prepend(root);
  services.store.subscribe(() => w.update());
  services.settings.subscribe(() => w.update());
  if (open) services.store.update((s) => { s.dock.settingsOpen = true; });
  w.update();
  current = w;
  return { services, w, el: w.el };
}
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
const chatRows = (el) => [...el.querySelectorAll('.zcf-set-chat')].map((r) => [r.querySelector('.zcf-name').textContent, r.querySelector('.zcf-status').textContent]);

describe('chat settings window', () => {
  afterEach(() => {
    if (current) current.destroy();
    current = null;
  });

  it('is a plain cog tab, never with a badge or dot', () => {
    const { el } = mount({ open: false });
    expect(el.dataset.zcfChat).toBe('settings');
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.querySelector('.chat-icon').className).toContain('fa-cog');
    expect(el.querySelector('.q-badge, .unread-badge, .zcf-badge, .zcf-pill')).toBeNull();
    expect(el.querySelector('.zcf-body').hidden).toBe(true);
  });

  it('lists every chat there is with its settings, and resets one or all', () => {
    const { services, el } = mount();
    services.store.update((s) => openDm(s, 5, { username: 'Spike', now: 1 }));
    services.settings.update((s) => {
      updateChat(s, 'game:general', { x: 1, y: 2, w: 420, h: 520, text: 120 });
      updateChat(s, 'dm:9', { text: 90 });
    });
    expect(el.querySelector('.chat-title').textContent).toContain('Chat settings');
    expect(chatRows(el)).toEqual([
      ['Faction', 'docked · default size · text 100%'],
      ['Global', 'moved · 420×520 · text 120%'],
      ['Private Messages', 'docked · default size · text 100%'],
      ['Chat settings', 'docked · default size · text 100%'],
      ['Spike', 'docked · default size · text 100%'],
      ['#9', 'docked · default size · text 90%'],
    ]);
    button(el.querySelectorAll('.zcf-set-chat')[1], 'Reset').click();
    expect(services.actions.resetChat).toHaveBeenCalledWith('game:general');
    expect(services.settings.get().chats['game:general']).toBeUndefined();
    button(el, 'Reset all chats').click();
    expect(services.settings.get().chats).toEqual({});
  });

  it('marks all as read with progress, and closes all private chats', async () => {
    const { services, el } = mount();
    let finish;
    services.actions.markAllRead.mockImplementation((onProgress) => new Promise((resolve) => {
      onProgress(0, 3);
      onProgress(1, 3);
      finish = () => {
        onProgress(3, 3);
        resolve(3);
      };
    }));
    button(el, 'Mark all as read').click();
    expect(el.textContent).toContain('Marking… 1/3');
    finish();
    await flush();
    expect(button(el, 'Mark all as read')).toBeTruthy();
    button(el, 'Close all private chats').click();
    expect(services.actions.closeAllDms).toHaveBeenCalled();
  });

  it('picks the new-message sound and plays a test', () => {
    const { services, el } = mount();
    const select = el.querySelector('select');
    const play = el.querySelector('.zcf-set-play');
    expect(select.value).toBe('off');
    expect(play.disabled).toBe(true);
    select.value = 'ping';
    select.dispatchEvent(new Event('change'));
    expect(services.settings.get().sound).toBe('ping');
    expect(play.disabled).toBe(false);
    play.click();
    expect(services.sound.play).toHaveBeenCalledWith('ping');
  });

  it("shows the version and a collapsed What's new, as text only", () => {
    const { el } = mount();
    expect(el.textContent).toContain('Zed City Friends v');
    expect(el.querySelector('.zcf-news-ver')).toBeNull();
    button(el, `What's new in v${WHATS_NEW[0].version} ▸`).click();
    const versions = () => [...el.querySelectorAll('.zcf-news-vh')].map((n) => n.firstChild.textContent);
    expect(versions()).toEqual([`v${WHATS_NEW[0].version}`]);
    expect(el.textContent).toContain(WHATS_NEW[0].features[0].title);
    button(el, 'Earlier versions ▸').click();
    expect(versions()).toEqual(WHATS_NEW.map((v) => `v${v.version}`));
    expect(el.querySelector('.zcf-news img, .zcf-news a')).toBeNull();
    button(el, `What's new in v${WHATS_NEW[0].version} ▾`).click();
    expect(el.querySelector('.zcf-news-ver')).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run test/ui/settings-window.test.js`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement**

<!-- file: src/ui/settings-window.js -->
```js
// The Chat settings window (spec §B.4, §D.2): the cog tab in the dock's corner, opening into utilities,
// every chat with its settings and a Reset, the new-message sound, the version and What's new. The cog
// never shows a badge or a dot.
import { h, clear, icon } from './dom.js';
import { findChats } from './chat-custom/registry.js';
import { chatLabel, describeChat, isLocked, dmKey, dmIdOf } from '../chat-custom/chats.js';
import { SOUNDS } from '../settings.js';
import { WHATS_NEW } from '../whats-new.js';
import { VERSION } from '../version.js';

const SOUND_LABELS = { off: 'Off', chirp: 'Chirp', ping: 'Ping', bell: 'Bell' };
const ORDER = (key) => (key.startsWith('game:') ? 0 : key === 'pm' ? 1 : key === 'settings' ? 2 : 3);

export function createSettingsWindow(services, { doc = document } = {}) {
  const { store, settings, actions, sound } = services;
  let marking = null; // { done, total } while Mark all as read runs
  let showNews = false;
  let showOlder = false;
  let lastSig = null;

  const titleText = h('span', null, 'Chat settings');
  const title = h('div', { class: 'chat-title' }, h('i', { class: 'fas fa-cog chat-icon', 'aria-hidden': 'true' }), titleText);
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleSettings() }, title, toggle);
  const content = h('div', { class: 'zcf-set zcf-zoom' });
  const body = h('div', { class: 'chat-content zcf-body' }, content);
  const el = h('div', { class: 'chat-container zcf zcf-settings', dataset: { zcfChat: 'settings' } }, header, body);

  // Built once and moved into each redraw, so the sound picker keeps its state and focus.
  const select = h('select', { class: 'zcf-set-select', 'aria-label': 'New private message sound' },
    SOUNDS.map((k) => h('option', { value: k }, SOUND_LABELS[k])));
  const play = h('button', { class: 'zcf-mini zcf-set-play', type: 'button', title: 'Play it', 'aria-label': 'Play the sound' }, '▶');
  select.addEventListener('change', () => actions.setSound(select.value));
  play.addEventListener('click', () => sound.play(select.value));

  function dmName(id) {
    const s = store.get();
    const d = s.dock.dms.find((x) => x.id === id);
    return (d && d.username) || (s.friends[id] && s.friends[id].username) || null;
  }

  // Every chat that exists now or has settings: the game's, ours, open DMs, and customized closed DMs.
  function chatRows() {
    const saved = settings.get().chats;
    const keys = new Set(['pm', 'settings']);
    for (const c of findChats(doc)) keys.add(c.key);
    for (const d of store.get().dock.dms) keys.add(dmKey(d.id));
    for (const k of Object.keys(saved)) keys.add(k);
    return [...keys]
      .sort((a, b) => ORDER(a) - ORDER(b) || a.localeCompare(b))
      .map((key) => {
        const id = dmIdOf(key);
        return { key, name: chatLabel(key, id ? dmName(id) : null), entry: saved[key] };
      });
  }

  const section = (label, ...children) => h('div', { class: 'zcf-set-sec' }, h('div', { class: 'zcf-set-h' }, label), children);
  const disclosure = (label, open, focusKey, onToggle) => h('button', {
    class: 'zcf-news-toggle',
    type: 'button',
    'aria-expanded': String(open),
    'data-zcf-focus': focusKey,
    onclick: onToggle,
  }, label, ' ', open ? '▾' : '▸');
  const versionBlock = (v) => h('div', { class: 'zcf-news-ver' },
    h('div', { class: 'zcf-news-vh' }, `v${v.version}`, h('span', { class: 'zcf-news-date' }, v.date)),
    v.features.map((f) => h('div', { class: 'zcf-news-f' }, h('div', { class: 'zcf-news-ft' }, f.title), h('ul', null, f.points.map((p) => h('li', null, p))))));

  function whatsNew() {
    const [latest, ...older] = WHATS_NEW;
    return h('div', { class: 'zcf-news' },
      disclosure(`What's new in v${latest.version}`, showNews, 'news', () => {
        showNews = !showNews;
        render();
      }),
      showNews ? versionBlock(latest) : null,
      showNews && older.length
        ? disclosure('Earlier versions', showOlder, 'older', () => {
            showOlder = !showOlder;
            render();
          })
        : null,
      showNews && showOlder ? older.map(versionBlock) : null);
  }

  async function markAll() {
    if (marking) return;
    marking = { done: 0, total: 0 };
    render();
    try {
      await actions.markAllRead((done, total) => {
        marking = { done, total };
        render();
      });
    } finally {
      marking = null;
      render();
    }
  }

  function build(rows) {
    const s = settings.get();
    return [
      section('Utilities', h('div', { class: 'zcf-set-btns' },
        h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'mark', disabled: !!marking, onclick: markAll },
          marking ? `Marking… ${marking.done}/${marking.total}` : 'Mark all as read'),
        h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'closeall', onclick: () => actions.closeAllDms() }, 'Close all private chats'))),
      section('Your chats',
        rows.map((r) => h('div', { class: 'zcf-set-chat' },
          h('i', {
            class: `fas ${isLocked(r.entry) ? 'fa-lock' : 'fa-lock-open'} zcf-set-lock`,
            role: 'img',
            title: isLocked(r.entry) ? 'Locked' : 'Unlocked',
            'aria-label': isLocked(r.entry) ? 'Locked' : 'Unlocked',
          }),
          h('div', { class: 'zcf-row-main' }, h('div', { class: 'zcf-name' }, r.name), h('div', { class: 'zcf-status' }, describeChat(r.entry))),
          h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': `reset:${r.key}`, disabled: !r.entry, onclick: () => actions.resetChat(r.key) }, 'Reset'))),
        h('button', { class: 'zcf-page-btn zcf-set-all', type: 'button', 'data-zcf-focus': 'resetall', disabled: !Object.keys(s.chats).length, onclick: () => actions.resetAllChats() }, 'Reset all chats')),
      section('Sounds', h('label', { class: 'zcf-set-sound' }, h('span', null, 'New private message'), select, play)),
      section('About', h('div', { class: 'zcf-set-about' }, `Zed City Friends v${VERSION}`), whatsNew()),
    ];
  }

  function render() {
    if (!store.get().dock.settingsOpen) return;
    const s = settings.get();
    select.value = s.sound;
    play.disabled = s.sound === 'off';
    const rows = chatRows();
    const sig = JSON.stringify([rows, marking, showNews, showOlder, Object.keys(s.chats).length]);
    if (sig === lastSig) return;
    lastSig = sig;
    const focusKey = content.contains(doc.activeElement) && doc.activeElement.dataset ? doc.activeElement.dataset.zcfFocus : undefined;
    const scrollTop = body.scrollTop;
    clear(content);
    for (const node of build(rows)) content.appendChild(node);
    body.scrollTop = scrollTop;
    if (focusKey) {
      const target = content.querySelector(`[data-zcf-focus="${focusKey}"]`);
      if (target) target.focus();
    }
  }

  function update() {
    const open = !!store.get().dock.settingsOpen;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    titleText.hidden = !open;
    toggle.hidden = !open;
    el.title = open ? '' : 'Chat settings';
    if (open) render();
    else lastSig = null;
  }

  return {
    el,
    update,
    destroy() {
      clear(content);
    },
  };
}
```

- [ ] **Step 5: Run it again**

Run: `npx vitest run test/ui/settings-window.test.js`
Expected: PASS.

### Task 24: DM window: chat key, zoom targets, mute bell; PM muted rows

**Files:**
- Modify: `src/ui/dm-window.js`
- Test: `test/ui/dm-window.test.js`, `test/ui/pm-window.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/ui/dm-window.test.js`:

```js
  it('is a customizable chat keyed by its player, with message size on its messages and typing box', () => {
    const { el } = mount();
    expect(el.dataset.zcfChat).toBe(`dm:${THEM}`);
    expect(el.querySelector('.zcf-scroll').classList.contains('zcf-zoom')).toBe(true);
    expect(el.querySelector('.zcf-composer').classList.contains('zcf-zoom')).toBe(true);
  });

  it('mutes and unmutes the conversation from the bell, without toggling the window', () => {
    const { el, services, win } = mount();
    services.settings.subscribe(() => win.update());
    const bell = el.querySelector('.zcf-bell');
    expect(bell.title).toBe('Mute Spike');
    expect(bell.querySelector('i').className).toBe('fas fa-bell');
    bell.click();
    expect(services.actions.toggleMute).toHaveBeenCalledWith(THEM);
    expect(services.settings.get().muted).toEqual([THEM]);
    expect(bell.title).toBe('Unmute Spike');
    expect(bell.querySelector('i').className).toBe('fas fa-bell-slash');
    expect(bell.getAttribute('aria-pressed')).toBe('true');
    expect(services.store.get().dock.dms[0].open).toBe(true);
  });
```

Append to `test/ui/pm-window.test.js`:

```js
  it('marks a muted chat with a bell-slash and a dimmed pill, and leaves it out of the green count', () => {
    const { services, el } = mount({ threads: [thread(9), thread(8)] }, { open: false });
    services.store.update((s) => { s.threads = { 9: { unread: 2 }, 8: { unread: 1 } }; });
    services.settings.update((s) => { s.muted = [9]; });
    expect(el.querySelector('.unread-badge').textContent).toBe('1');
    services.store.update((s) => { s.dock.friendsOpen = true; });
    const row9 = [...list(el).querySelectorAll('.zcf-row')].find((r) => r.textContent.includes('U9'));
    expect(row9.querySelector('.zcf-muted-mark')).not.toBeNull();
    expect(row9.querySelector('.zcf-pill').classList.contains('zcf-pill-dim')).toBe(true);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/ui/dm-window.test.js test/ui/pm-window.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** in `src/ui/dm-window.js`

- read `const isMuted = services.isMuted || (() => false);` next to `isEnemy`;
- add a bell button and put it first among the header buttons:

```js
  const bellIcon = h('i', { class: 'fas fa-bell', 'aria-hidden': 'true' });
  const bellBtn = h('button', { class: 'zcf-hbtn zcf-bell', type: 'button' }, bellIcon);
```

```js
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleDm(userId) }, title, bellBtn, inboxBtn, minBtn, closeBtn);
```

- listener, next to the other header buttons: `bellBtn.addEventListener('click', stop(() => actions.toggleMute(userId)));`
- zoom targets: `const scroller = h('div', { class: 'zcf-scroll zcf-zoom' }, loader, log, pendingEl);` and `const composer = h('div', { class: 'zcf-composer zcf-zoom' }, input, emojiBtn, gifBtn, sendBtn);`
- the chat key: `const el = h('div', { class: 'chat-container zcf zcf-dm', dataset: { zcfDm: String(userId), zcfChat: `dm:${userId}` } }, header, body);`
- in `update()`, after `minBtn.hidden = !open;` add `bellBtn.hidden = !open;`, and after the enemy lines add:

```js
    const muted = isMuted(userId);
    bellIcon.className = `fas ${muted ? 'fa-bell-slash' : 'fa-bell'}`;
    bellBtn.title = `${muted ? 'Unmute' : 'Mute'} ${displayName()}`;
    bellBtn.setAttribute('aria-label', bellBtn.title);
    bellBtn.setAttribute('aria-pressed', String(muted));
```

(`stop` is the helper already defined in `dm-window.js`; if `bellBtn`'s listener is added before `stop` is declared, move it after.)

- [ ] **Step 4: Run them again**

Run: `npx vitest run test/ui/dm-window.test.js test/ui/pm-window.test.js`
Expected: PASS.

### Task 25: Wire Part B + D into the app; styles

**Files:**
- Modify: `src/app.js`, `src/ui/dock-view.js`, `src/ui/styles.js`
- Test: `test/app.test.js`, `test/ui/dock-view.test.js`, `test/ui/styles.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/app.test.js` (add `INTERVALS` is already imported):

```js
  it('adds the Chat settings cog after Private Messages, and padlocks to the game chats', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    const root = document.querySelector('.zcf-root');
    expect([...root.children].map((c) => c.dataset.zcfChat)).toEqual(['pm', 'settings']);
    expect(document.querySelector('.general-chat .chat-header .zcf-cc-lock')).not.toBeNull();
    expect(document.getElementById('zcf-user-settings')).not.toBeNull();
    app.actions.toggleSettings();
    expect(root.querySelector('.zcf-settings').classList.contains('zcf-open')).toBe(true);
  });

  it('keeps one window open on phones with Chat settings in the mix', async () => {
    const mql = fakeMql(false);
    window.matchMedia = vi.fn(() => mql);
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: storageWith({ friends: friends(5) }) });
    app.actions.togglePm();
    app.actions.toggleSettings();
    mql.set(true);
    await flush();
    let d = app.store.get().dock;
    expect([d.friendsOpen, d.settingsOpen]).toEqual([true, false]);
    app.actions.toggleSettings();
    d = app.store.get().dock;
    expect([d.friendsOpen, d.settingsOpen]).toEqual([false, true]);
  });

  it('plays the new-message sound once per poll when it is on, and never for a muted chat', async () => {
    vi.useFakeTimers();
    const sound = { play: vi.fn(), unlock: vi.fn() };
    const rows = [
      [],
      [rawThread(6, { newMail: 1, lastReply: '2026-09-28 10:01:00' }), rawThread(7, { newMail: 1, lastReply: '2026-09-28 10:01:00' })],
      [rawThread(8, { newMail: 1, lastReply: '2026-09-28 10:02:00' })],
    ];
    const api = fakeApi({ getChats: vi.fn(async () => ({ ok: true, data: rows.shift() || [] })) });
    const storage = memoryStorage({ [`zcf:v1:${ME}:settings`]: JSON.stringify({ v: 1, sound: 'chirp', muted: [8] }) });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage, sound });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledWith('chirp');
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it('mutes a chat out of the green count and marks the rest read one at a time', async () => {
    const storage = storageWith({ friends: friends(5, 6), threads: { 5: { unread: 2 }, 6: { unread: 1 } } });
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage });
    app.actions.toggleMute(6);
    expect(app.settings.get().muted).toEqual([6]);
    expect(document.querySelector('.zcf-pm .unread-badge').textContent).toBe('2');
    await app.actions.markAllRead();
    expect(api.getChatMessages.mock.calls.map((c) => c[0])).toEqual([5]);
    expect(app.store.get().threads[5].unread).toBe(0);
  });
```

In `test/ui/dock-view.test.js`, change the two expected lists to end in `'pm', 'settings'` (`['dm:7', 'dm:8', 'pm', 'settings']` and `['dm:8', 'pm', 'settings']`), rename the test to mention Chat settings, and add to the CSS test: `expect(CSS).toContain('.chat-containers .zcf-settings{order:4}');`.

In `test/ui/styles.test.js`:
- imports: add `import { createChatCustom } from '../../src/ui/chat-custom/index.js';`, `import { createSettingsStore } from '../../src/store.js';`, `import { updateChat } from '../../src/settings.js';`, `import { memoryStorage } from '../helpers.js';`
- `STATES` become:

```js
const STATES = [
  { friendsOpen: true, settingsOpen: true, dms: [[5, true], [6, false]] },
  { friendsOpen: false, settingsOpen: false, dms: [[5, false], [6, true]] },
];
```

- in `renderDock`, destructure `settingsOpen` and add `s.dock.settingsOpen = !!settingsOpen;` after `setFriendsOpen(s, friendsOpen);`
- in the flex-column test, `checked` gains `'settings'`: use `body.parentElement.dataset.zcfChat.split(':')[0]` as the label and expect `['dm', 'pm', 'settings']`;
- add:

```js
  it('keeps the chat controls and grips we put in the game chats order-independent', () => {
    renderDock(STATES[0]);
    const settings = createSettingsStore({ playerId: 1, storage: memoryStorage(), win: new EventTarget() });
    settings.update((s) => updateChat(s, 'game:general', { locked: false, x: 5, y: 5 }));
    const custom = createChatCustom({ settings, isSmall: () => false });
    custom.start();
    const general = document.querySelector('.general-chat');
    const ours = [general.querySelector('.zcf-cc'), ...general.querySelectorAll(':scope > .zcf-grip')];
    expect(ours).toHaveLength(5);
    expect(ours.flatMap((n) => orderProblems(n))).toEqual([]);
    custom.destroy();
    settings.destroy();
  });

  it('colors the Private Messages envelope green over the game rule that forces icons to currentColor', () => {
    renderDock(STATES[0]);
    const icon = document.querySelector('.zcf-pm .chat-icon');
    for (const sheets of [OURS_LAST, OURS_FIRST]) expect(winner(icon, 'color', 1280, sheets).value).toBe('#3d8b40');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/app.test.js test/ui/dock-view.test.js test/ui/styles.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/ui/dock-view.js`:

```js
// Reconciles our windows inside the dock root: [DM windows in store order], [Private Messages], [Chat
// settings]. CSS `order` puts the last two right of the game's chats, the cog in the corner.
import { createPmWindow } from './pm-window.js';
import { createDmWindow } from './dm-window.js';
import { createSettingsWindow } from './settings-window.js';
```

In `createDockView`: `const settingsWin = createSettingsWindow(services);`, `const desired = [...entries.map((e) => dms.get(e.id).el), pm.el, settingsWin.el];`, call `settingsWin.update();` after `pm.update();`, and return `{ render, pm, settings: settingsWin, dmWindow: (id) => dms.get(id) || null }`.

`src/app.js`:
- imports:

```js
import { setPmTab, setSound, setMuted, isMuted, resetChat, resetAllChats } from './settings.js';
import { createSound } from './sound.js';
import { markAllRead } from './mark-read.js';
import { createChatCustom } from './ui/chat-custom/index.js';
```

  and add `setSettingsOpen, closeAllDms, chatsUnreadIds` to the `./state.js` import.
- signature: `export function createApp({ api, playerId, playerName, doc = document, win = window, storage = win.localStorage, now = () => Date.now(), sound = createSound({ win }) }) {`
- `createInbox({ … })` gains:

```js
    isMuted: (id) => isMuted(settings.get(), id),
    // New mail from another player, at most once per poll; silent unless a sound is chosen in Chat settings.
    onNewMail: () => {
      const name = settings.get().sound;
      if (name !== 'off') sound.play(name);
    },
```

- actions (add):

```js
    toggleSettings() {
      const open = !store.get().dock.settingsOpen;
      const small = dock.isSmall();
      store.update((s) => setSettingsOpen(s, open, { exclusive: small }));
      if (open && small) dock.minimizeGameChats();
    },
    closeAllDms() {
      store.update((s) => closeAllDms(s));
      activeDmId = null;
    },
    toggleMute: (id) => settings.update((s) => setMuted(s, id, !isMuted(s, id))),
    setSound(name) {
      settings.update((s) => setSound(s, name));
      sound.unlock(); // a change event is a user gesture, so the browser lets audio start now
    },
    resetChat: (key) => settings.update((s) => resetChat(s, key)),
    resetAllChats: () => settings.update((s) => resetAllChats(s)),
    markAllRead: (onProgress) => markAllRead({
      ids: chatsUnreadIds(store.get(), inbox.threads(), settings.get().muted),
      api,
      markSeen: (id) => store.update((s) => markSeen(s, id, inbox.lastReply(id))),
      onProgress,
      toast,
    }),
```

- services: add `sound,` and `isMuted: (id) => isMuted(settings.get(), id),`
- after `const view = createDockView(…)`:

```js
  const custom = createChatCustom({
    doc,
    win,
    keeper,
    settings,
    isSmall: dock.isSmall,
    dm: {
      name(id) {
        const s = store.get();
        const d = s.dock.dms.find((x) => x.id === id);
        return (d && d.username) || (s.friends[id] && s.friends[id].username) || null;
      },
      isMuted: (id) => isMuted(settings.get(), id),
      toggleMute: (id) => actions.toggleMute(id),
    },
  });
  // Our windows come and go with the store; the controls follow at once rather than a frame later.
  const renderDock = () => {
    view.render();
    custom.refresh();
  };
```

- replace `view.render()` with `renderDock()` in the store subscription, the settings subscription, the enemies subscription, the `dock.onSmallChange` handler and the start-up sequence;
- in `enforcePhoneRule`, count and close the settings window too:

```js
    const openCount = openDms + (s.dock.friendsOpen ? 1 : 0) + (s.dock.settingsOpen ? 1 : 0);
```

```js
      store.update((st) => {
        for (const d of st.dock.dms) d.open = d.id === keepId;
        if (keepId !== null) {
          st.dock.friendsOpen = false;
          st.dock.settingsOpen = false;
        } else if (st.dock.friendsOpen) st.dock.settingsOpen = false;
      });
```

- start-up: after `marks.start();` add `custom.start();`; register the first-gesture sound unlock:

```js
  // Browsers only start audio after the player has interacted with the page (spec §B.4).
  const unlockSound = () => {
    if (settings.get().sound !== 'off') sound.unlock();
  };
  doc.addEventListener('pointerdown', unlockSound, { capture: true, once: true });
```

- `destroy()`: add `custom.destroy();` and `doc.removeEventListener('pointerdown', unlockSound, true);`

`src/ui/styles.js`:
- replace `.zcf-pm .chat-title .chat-icon{color:#3d8b40}` with (the game forces dock icons to `currentColor!important` at (0,4,0)):

```css
.chat-container.zcf-pm .chat-header .chat-title .chat-icon{color:#3d8b40!important}
```

- add after the PM rules:

```css
.chat-containers .zcf-settings{order:4}
.zcf-settings:not(.chat-minimized) .chat-content{overflow-y:auto}
.zcf-set{padding:2px 0 8px}
.zcf-set-sec{padding:8px 12px;border-bottom:1px solid #ffffff0d}
.zcf-set-sec:last-child{border-bottom:0}
.zcf-set-h{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff59;margin-bottom:6px}
.zcf-set-btns{display:flex;flex-wrap:wrap;gap:6px}
.zcf-set-chat{display:flex;align-items:center;gap:8px;padding:4px 0}
.zcf-set-lock{width:14px;flex:none;text-align:center;color:#9e9e9e;font-size:11px}
.zcf-set-all{margin-top:6px}
.zcf-set-sound{display:flex;align-items:center;gap:8px;font-size:12.5px}
.zcf-set-sound span{flex:1}
.zcf-set-select{background:#14171a;border:1px solid #ffffff14;border-radius:3px;color:#d9d9d9;font:inherit;font-size:12px;padding:3px 6px}
.zcf-set-play:disabled{opacity:.4;cursor:default}
.zcf-set-about{font-size:12px;opacity:.6}
.zcf-news-toggle{display:block;background:none;border:0;padding:6px 0 0;color:#6fb3c8;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.zcf-news-toggle:hover{text-decoration:underline}
.zcf-news-ver{margin-top:8px}
.zcf-news-vh{display:flex;gap:8px;align-items:baseline;font-size:12px;font-weight:700}
.zcf-news-date{font-size:11px;font-weight:400;opacity:.45}
.zcf-news-f{margin-top:5px}
.zcf-news-ft{font-size:12px;color:#e0e0e0}
.zcf-news-f ul{margin:2px 0 0;padding-left:16px;font-size:11.5px;opacity:.75}
.zcf-cc{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:6px;text-transform:none;letter-spacing:0;font-weight:400}
.chat-container.chat-minimized .zcf-cc{display:none}
.zcf-cc [hidden]{display:none!important}
.zcf-cc-icon{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;padding:0;background:none;border:0;color:#ffffff4d;font-size:11px;cursor:pointer}
.zcf-cc-icon:hover{color:#ffffffb3}
.zcf-cc-lock.zcf-cc-unlocked{color:#f2c037}
.zcf-cc-inline{display:inline-flex;align-items:center;gap:3px;margin-right:4px;color:#d9d9d9;font-size:11px}
.zcf-cc-step,.zcf-cc-btn{height:18px;min-width:18px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font:inherit;font-size:11px;line-height:1;cursor:pointer}
.zcf-cc-step:hover,.zcf-cc-btn:hover{background:#ffffff1f;color:#fff}
.zcf-cc-btn:disabled,.zcf-cc-step:disabled{opacity:.4;cursor:default}
.zcf-cc-value{min-width:34px;text-align:center;font-variant-numeric:tabular-nums}
.zcf-grip{position:absolute;z-index:10;background:transparent;touch-action:none;user-select:none}
.zcf-grip:hover{background:#0a748f59}
.zcf-grip-n{top:0;left:0;right:0;height:6px;cursor:ns-resize}
.zcf-grip-s{bottom:0;left:0;right:0;height:6px;cursor:ns-resize}
.zcf-grip-nw{top:0;left:0;width:12px;height:12px;cursor:nwse-resize;z-index:11}
.zcf-grip-se{right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize;z-index:11}
html.zcf-dragging,html.zcf-dragging *{cursor:grabbing!important;user-select:none!important}
html.zcf-resizing,html.zcf-resizing *{user-select:none!important}
.zcf-cmenu{position:fixed;z-index:4000;min-width:210px;padding:6px 0;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;color:#d9d9d9;font-size:12.5px}
.zcf-cmenu[hidden]{display:none}
.zcf-cmenu-title{padding:2px 12px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff66}
.zcf-cmenu-row{display:flex;align-items:center;gap:6px;padding:4px 12px}
.zcf-cmenu-label{flex:1}
```

- in the `@media (max-width:599.98px){…}` block add: `  .zcf-cc,.zcf-grip{display:none!important}`

- [ ] **Step 4: Run everything**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 5: Docs and commit Part B + D**

README: a "Customize any chat" section (padlock, drag, grips, right-click menu with message size, return arrow, remembered per chat and across tabs, desktop only) and a "Chat settings" section (cog: mark all read, close all PMs, per-chat list with Reset, new-message sound, version and What's new), plus "Mute" (bell in a DM header).

`docs/manual-test.md` additions:

```markdown
34. **Padlocks:** every expanded chat, Global/Faction/Activity included, has a padlock in its header. Click → unlocked (gold); drag the header → the chat moves and the others close the gap; click → locked. A still click on the header still opens/closes the chat.
35. **Grips:** unlocked, drag the top edge and the top-left corner (docked), plus the bottom edge and bottom-right corner (moved). Limits: 270-900px wide, 200px to the screen height minus 60.
36. **Menu:** right-click a padlock → message size −/+ (80-200%) changes only that chat; Reset; Return to row on a moved chat; Mute on a DM. Esc closes it.
37. At 400px or wider a chat shows −/NN%/+ and Reset in its header.
38. A moved chat's bubble stays where the chat was; any bubble can be dragged; a click after a drag doesn't open it.
39. Reload, and open a second game tab: sizes, spots and message sizes come back, and change live in the other tab.
40. **Game chats under customization:** a moved and resized Global chat still scrolls, loads history on scroll-up, sends, and opens its emoji/GIF pickers in the right place; zoomed text still auto-scrolls.
41. **Chat settings:** the cog sits in the bottom-right corner with no badge. Mark all as read shows "Marking… n/N" then a toast; Close all private chats empties the DM tabs; the chat list shows moved/docked, size and text size, and Reset / Reset all work.
42. **Sound:** choose Chirp/Ping/Bell, press ▶; with a second account, send a DM: one sound per poll, none for your own messages, none for a muted chat.
43. **Mute:** the bell in a DM header mutes: no pop-up tab, no green count, no sound; the Chats row shows a bell-slash and a dim pill.
44. **What's new** at the bottom of Chat settings expands and collapses; nothing anywhere draws attention to it.
45. **Phones:** no padlocks or grips; saved sizes and spots are ignored; message size still applies; the cog stays in the corner or hides while a window is open.
```

```bash
git add -A src test README.md docs/manual-test.md build.mjs vitest.config.js
git commit -m "feat: customize any chat (padlock, drag, grips, message size), Chat settings cog, mute, What's new

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018xFLSnTGkyRmowXEhicgAC"
```

---

# Finish

### Task 26: Version 0.5.0 and the bundle

**Files:** `package.json`, `dist/zed-city-friends.user.js`, `test/build.test.js`

- [ ] **Step 1:** In `test/build.test.js`, add to the build test: `expect(text).toContain('Zed City Friends v');` and `expect(text).not.toContain('__ZCF_VERSION__');`.
- [ ] **Step 2:** Set `"version": "0.5.0"` in `package.json`.
- [ ] **Step 3:** Run `npx vitest run` (all pass; `test/version.test.js` now sees 0.5.0) and `npm run build` (prints `Built dist/zed-city-friends.user.js`). Check the header: `head -5 dist/zed-city-friends.user.js` shows `@version      0.5.0`. The size stays under the 256 KB cap checked by `test/build.test.js`; if it doesn't, raise the cap with a comment saying why (readable code, Greasy Fork forbids minifying).
- [ ] **Step 4:** Commit: `release: 0.5.0` with the trailer.

### Task 27: One review at the end

- [ ] Dispatch one reviewer agent (superpowers:code-reviewer) over `git diff main...pm-and-settings`, with the spec path, this plan's path and the rules: game chats are Vue-owned (no attributes), stylesheet order independence, privacy (no real name anywhere), text-only rendering of player strings.
- [ ] Fix only Critical and Important findings (tests first where it makes sense), run `npx vitest run` and `npm run build` again, and commit `fix: review findings` with the trailer.
- [ ] Log Minor findings in the morning summary, not in code.

### Task 28: Visual check under the game's real CSS

**Files:**
- Create: `tools/preview/fetch-css.mjs`, `tools/preview/harness.js`, `tools/preview/build.mjs`, `tools/preview/shoot.mjs`, `tools/preview/phone.html`
- Modify: `.gitignore` (add `tools/preview/game-css/` and `tools/preview/out/`)

- [ ] **Step 1:** `fetch-css.mjs` downloads `index.html` from `https://www.zed.city/`, finds `assets/index-*.css` there and `assets/LoggedIn-*.css` / `assets/load-components-*.css` in `assets/index-*.js`, and saves them as `game-css/index.css`, `game-css/LoggedIn.css`, `game-css/load-components.css`.
- [ ] **Step 2:** `harness.js` (bundled by `build.mjs` with esbuild into `out/harness.js`) builds a page body like the game's: `#q-app` with a `.q-page-container` and a `.chat-containers` dock holding Faction (minimized), Global (open, a few `.msg-cont` rows with an enemy among the senders) and Activity (minimized). It then calls `createApp` with a fake api (threads with previews and unread counts, faction members, a blocked list, chat messages, profiles), an in-memory storage seeded per scene, and a `sound` stub. The scene comes from `location.hash`:
  - `#pm-chats`, `#pm-friends`, `#pm-faction`, `#pm-blocked`: the PM window open on that tab, one DM open beside it;
  - `#settings`: the Chat settings window open with a few customized chats and What's new expanded;
  - `#custom`: Global unlocked, moved and resized to 460×520 with text 120%, the chat menu open on it, a DM moved elsewhere;
  - `#enemies`: the `/enemies` page (history.replaceState before `createApp`) with a few enemies.
- [ ] **Step 3:** `phone.html` holds a 375×740 `<iframe>` of the harness page (headless Edge won't size a window below ~480px), with a query param telling the harness to use the phone layout.
- [ ] **Step 4:** `shoot.mjs` runs `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --virtual-time-budget=3000 --screenshot=<out>.png file:///…/harness.html#<scene>` for every scene at 1280px, and `phone.html` for `#pm-chats` and `#settings` at 375px. Font Awesome comes from `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css` (the game's own copy is Pro and not public); the game CSS from `game-css/`, then our `CSS`.
- [ ] **Step 5:** Look at every screenshot. Fix real layout bugs (overlaps, cut-off text, wrong order, unreadable contrast) in `src/`, re-run the tests, rebuild `dist/`, and commit. Keep the tool files; commit them (`chore: headless-Edge preview harness`); the downloaded CSS and screenshots stay out of git (copy the screenshots to the scratchpad for the summary).

### Task 29: Morning summary

The session's final message: what was built (per part), test count, screenshots taken, review findings and what was fixed, Minor findings logged, and the open questions (§B.7, §C.8, Shared 3), plus anything that differed from the spec and why.

---

## Self-review notes

- **Spec coverage:** A.1–A.6 → Tasks 5–10; B.1–B.6 → Tasks 17–25; B.7 is a morning question; C.1–C.8 → Tasks 11–16 (C.8 is live verification); D.1 → Tasks 19, 24, 25; D.2 → Tasks 18, 23; D.3 → Tasks 1–4; Shared 1 (safe(), text-only, inline retry) → PM window, enemy marks, settings window; Shared 2 → tests per task and Task 28; Shared 4 → conventions, Tasks 26–29.
- **Deviations, on purpose:** the settings document's top level lives in `src/settings.js` (chat entries stay in `chat-custom/chats.js`); enemy marks use one observer on the dock instead of one per panel (still O(new rows), and it sees panels come and go); Mark all as read lives in `src/mark-read.js` so it's testable alone; zoom targets for our windows use a `.zcf-zoom` class (DM messages + composer, the PM tabs/list, the settings body).
