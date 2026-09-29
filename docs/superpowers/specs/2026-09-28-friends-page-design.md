# Zed City Friends: Friends Page Design

**Date:** 2026-09-28
**Status:** Approved in brainstorming; awaiting spec review
**Builds on:** [2026-09-28-zed-city-friends-design.md](2026-09-28-zed-city-friends-design.md) (the dock, DMs, storage and polling it describes stay as they are unless this spec says otherwise)
**Ships as:** the next minor release (0.4.0) of `dist/zed-city-friends.user.js`

## 1. Summary

A full-page friends list, opened from a new **Friends** button in the game's top bar. It's modelled on Torn's Friends List and drawn in Zed City's own page style.

- **Top-bar button:** a friends icon left of the mail envelope. (0.4.1: no badge. The user preferred a plain icon; the unread count moved to the Friends & Chats tab.)
- **Page at `/friends`:** a game-style table with the columns **Name, Level, Status, Faction and Note**, plus **Message, Edit note and Remove** on each row.
  - Status shows injured and traveling icons.
  - All / Online / Offline tabs, a search over names and notes, and sortable columns.
  - An **Add friend** button opens the existing search pop-out.
- **Notes:** a private note per friend, like Torn's description, saved with the friends list and included in Export/Import.

The chat dock's Friends window stays as the quick view. The page is the full view.

Choices made with the user in brainstorming:
- **Layout:** option A, the game table.
- **Extra row info:** the injured/traveling icons and the Faction column.
- **Badge:** the number of friends online. Dropped in 0.4.1 at the user's request: the Friends & Chats dock tab now shows a green count of unread chats (friends and Recent) instead.

### Non-goals

- No friend groups or custom sorting (drag order), and no notes in the dock window.
- No new server endpoints or data leaving `www.zed.city` / `api.zed.city`.
- No change to the dock, DM windows or profile button beyond what's listed in §7.

## 2. Environment facts (from the live bundle, build `1.4.4-live-cfe496c521c3-125`)

**Routing:**
- Game pages are children of the logged-in layout (`LoggedIn-*.js`, path `/`, `meta.auth`).
- That layout's last child is a catch-all, `/:catchAll(.*)*` → `Error404`. It renders `<div class="fixed-center text-center"><p class="text-faded">Sorry, nothing here...</p><q-btn …>Go back</q-btn></div>` directly inside `.q-page-container`, with no `main.q-page`.
- So `/friends` renders the full game layout (header, drawer, chat dock) with the 404 block where the page goes.
- The only `beforeEach` guard sends logged-out users to `/`. Nothing redirects unknown paths.

**Top bar:** the header is `header.q-header > .q-toolbar`. The right-hand icon group is `div.full-width.q-gutter-xs.row.items-center.justify-end` and contains, in order:
- **Mail:** `<div>` wrapping `a.q-btn.q-btn--flat.q-btn--round[href="/mail"]` with `i.q-icon.fal.fa-envelope`. The game colors it `text-grey-4` when there's new mail, otherwise `text-grey-7`, and gives it a `q-badge.bg-red-5.text-white.q-badge--floating.q-badge--rounded` count.
- **Notifications:** the same markup, with `fal fa-bell`.
- **Profile menu:** a dropdown.

We find the group from the mail link: `a.q-btn[href="/mail"]` → wrapper `div` → group. On phones the group is about 120px wide (`col-xs-4`), so a fourth 30px button may wrap below about 400px width.

**Page style:**
- Route pages are `main.q-page.q-layout-padding`: 8/16/24px padding by breakpoint, `max-width:1000px` centered from 1024px.
- Titles use `text-h4 text-uppercase` (Oswald, 1.5rem).
- Player lists are dark `q-table`s:
  - header cells: uppercase, 11px bold, letter-spacing .05em, on `#090a0b`
  - body: `#202327`
  - cell borders: `#2b3035 #090a0b #090a0b #2b3035`
- Status text is `Online` in `#69f0ae`, or `Active 3 hr ago` in `#ef5350`. The avatar dot is `#3d8b40` online and `#ef5350` offline.
- Player chips are `#151619` with a 6px radius and 24px rounded-square avatars.
- Submenu tabs: `#121417f5`, Oswald 12px uppercase; the active tab is `#0f1114` with a 2px `#0a748f` top bar.
- Status icons are Font Awesome in `#90a4ae` (`text-blue-grey-4`): `fas fa-skull-crossbones` for Injured, `fas fa-directions` for Travelling, `fas fa-campground` for Faction.

**`getProfile?user=ID`** fields used here:
- `rank` is the player's level; the profile page labels it "Level".
- `faction{id, name, role}`, or null.
- `is_injured`.
- `traveling`.
- `online`, `active` (seconds since last active).

**No batch lookup by ID list:** `getUsers` only searches and pages. `getChatInfo` returns a map keyed by user ID, but the client only ever calls it with one `user_id` (§10 item 3).

## 3. Top-bar button

> **0.4.1:** the badge, its color rule and the background presence sweep (§5.3) were removed. The button is a plain `text-grey-7` icon titled "Friends" that opens the page.

- **Placement:** a new `<div>` wrapper inserted before the mail button's wrapper, so the order is `[Friends][Mail][Notifications][Profile]`.
- **Markup:** a clone of the mail `a.q-btn` (`cloneNode(true)`), the same approach as the profile button.
  - The icon class is swapped to `fa-user-friends` (still `fal`), and `href="/friends"`.
  - The game's `q-badge` is removed from the clone and replaced by our own badge with the same Quasar classes, `bg-positive` (`#3d8b40`).
  - The badge shows the count of friends currently known to be online and is hidden at 0. The button is `text-grey-4` when the count is ≥ 1, otherwise `text-grey-7`, the same rule as mail.
  - It gets a plain `title` and `aria-label` of `Friends (N online)`. The game's tooltips are Quasar components we can't create.
- **Click:** `preventDefault()`, then `router.navigate('/friends')`. The clone has no Vue handler, and a plain `<a href>` click would reload the whole page. Middle-click or Ctrl-click keeps the browser default (a new tab).
- **Keeping it mounted:** the header is Vue-rendered and can be rebuilt. The button is re-inserted by the shared mount keeper (§6.1). Finding it still attached is an O(1) check.
- **Phones:** if the four icons don't fit on one line at 360px, our wrapper's own spacing shrinks under `@media (max-width:599.98px)`, using only our class. Verify on a narrow phone layout (§10).

## 4. The page

### 4.1 Routing and mounting (`/friends`)

- **Entering `/friends`:** when `router.js` reports a path of `/friends` (also on first boot):
  1. Add `zcf-on-friends` to `<html>`. Vue doesn't own that element.
  2. Our CSS hides the 404 while that class is set: `html.zcf-on-friends .q-page-container > .fixed-center{display:none!important}`.
  3. Append our `main.q-page.q-layout-padding.zcf-page` into `.q-page-container`.
- **Leaving:** on the next path change away from `/friends`, remove the class and our node.
- **No flash of the 404 on a direct load or refresh:** `main.js` adds the `<html>` class and a one-rule hide style synchronously at script start, before waiting for login, when the path is `/friends`.
  - If the first login check fails, `main.js` removes the class again. The game sends logged-out players to `/` anyway.
  - Once the app starts, the page module takes over and sets the class from the current path straight away.
- **Re-mounting:** the mount keeper re-appends our node if Vue replaces `.q-page-container`'s children while we're still on `/friends`.
- **The tab title** stays the game's (`Zed City`), because the layout rewrites it on mail/notification changes. No menu tab is highlighted.

### 4.2 Layout (desktop and tablet, 600px and up)

**Title row:** the game's title pattern.
- Left: a flat `‹ City` button that navigates to `/city`.
- Center: `FRIENDS` in `text-h4 text-uppercase`, with the subtitle `n of N online`.
- Right: an outlined **+ Add friend** button in `grey-4`.

**Toolbar:**
- **Tabs:** `All N`, `Online n`, `Offline m`, in the submenu tab look.
- **Search box** (right): "Search names and notes…". It filters live with a case-insensitive substring match on username or note.

**Table panel.** Columns:

| Column | Content | Sortable |
|---|---|---|
| Name | Player chip: 24px rounded-square avatar, status dot, username. Click → `/profile/{id}` | yes, A–Z |
| Level | `rank` from their profile; `—` until known | yes |
| Status | `Online` (`#69f0ae`) or `Active 18 min ago` (`#ef5350`), plus the icons, with the game's tooltip wording: skull-crossbones "Injured", directions "Travelling" | yes (default) |
| Faction | Campground icon + faction name, link to `/faction/{id}`; `—` if none or unknown | yes, A–Z, none last |
| Note | Italic `#9e9e9e`; a faint "Add a note" when empty; click to edit | no |
| (actions) | **Message** (primary teal, with a red unread pill from `threads[id].unread`), **Edit note** (pencil), **Remove** (×) | — |

- **Sorting:** clicking a sortable header sorts by it. Clicking it again reverses the order. The active column shows an arrow.
- **Default sort:** Status, meaning online first (A–Z), then offline by most recently active, with unknown status last.
- **Tie-breaks:** the username.
- **Unknown values** (no profile yet) sort last in both directions.
- The sort and tab are kept in memory only and reset on reload.
- The Status wording follows the game's player lists, using a new long-form formatter `longAgo` next to the dock's short `timeAgo`:

  | Time since last active | Shows |
  |---|---|
  | under 1 minute | `Active just now` |
  | under 1 hour | `Active N min ago` |
  | under 1 day | `Active N hr ago` |
  | under 30 days | `Active N day ago` / `N days ago` |
  | under 365 days | `Active N month ago` / `N months ago` (30-day months) |
  | 365 days or more | `Active N year ago` / `N years ago` |

### 4.3 Row actions

- **Message:** `actions.openDm(id, {expand: true, username, avatar})`, which opens the DM window in the dock. That keeps the phone rule of one open window at a time.
- **Edit note:** the Note cell becomes a text input (max 200 characters) with the hint "Enter to save · Esc to cancel · only you can see notes".
  - **Saving:** Enter and blur both save. The note is trimmed, and an empty note is removed.
  - **Esc** cancels. Focus goes back to the pencil button.
  - **Only one note is edited at a time.** Opening another note's editor saves the current one first.
- **Remove:** the row turns into an inline confirm, the same pattern as the dock: "Remove {name} from your friends?" with **Remove** and **Cancel**.
  - Cancel keeps focus on the row. After a Remove, focus moves to the next row.
  - Removing a friend keeps any DM entry with them (the base spec §7 rule).
- **Add friend:** opens the existing `createAddFriendPopover` under the button. That's the same search, results and **Add / ✓ Friend** states as the dock. New friends appear in the table at once, with presence fetched straight away (`actions.addFriend` already does this).

### 4.4 Empty and loading states

- **No friends:** "No friends yet. Use **Add friend** above, or **Add Friend** on a player's profile." shown in the panel, with the table header hidden.
- **Search with no match:** "No friends match "{query}"."
- **Empty tab:** "No friends online right now." or "No offline friends."
- **Profile not loaded yet:** the Level and Faction cells show `—` and there are no icons. Status shows `…` until presence arrives.

### 4.5 Phones (under 600px, `@media (max-width:599.98px)`)

- **Columns:** Name, Status and actions.
  - **Name** also shows `Lv N · Faction` and the note, as two small lines under the chip.
  - **Actions:** Message, plus a `⋯` menu with Profile, Edit note and Remove.
- The tabs wrap, and the search box goes full width on its own line.
- The title-row button reads **+ Add**. `‹ City` is hidden, because the game's own phone footer menu covers navigation.

### 4.6 Rendering

- `ui/friends-page.js` builds the page with the `h()` helper and plain text nodes, never `innerHTML` (base spec §9). Notes are user input and are rendered as text.
- **Redraws:** like the Friends window, the table redraws only when a signature of what it shows changes. Presence and inbox bursts are merged into one redraw per animation frame. Focus and the open note editor survive redraws.
- **Pure logic in `friends-table.js`:** tabs, search, sorting and counts live in a pure function with no DOM, like `friends-view.js` is for the dock window. Input: friends, presence, threads, tab, query and sort. Output: rows and counts.
- **Styling:** our own `zcf-page-*` CSS copies the values in §2. The only game classes we reuse are Quasar's plain global layout and typography classes (`q-page`, `q-layout-padding`, `text-h4`, `text-uppercase`). We never override a game rule, so stylesheet load order can't matter (§8).

## 5. Data

### 5.1 Notes (storage)

- A friend record gets an optional `note` (string, 1–200 characters after trimming): `friends["123"] = {id, username, avatar, addedAt, note?}`.
- **The document stays `v: 1`.** The field is additive, and `normalizeState` already passes friend records through untouched, so tabs running 0.3.x keep notes intact.
- **New state mutator:** `setFriendNote(state, id, note)` trims and caps the note, and deletes the field when it's empty. It does nothing for non-friends.
- **Export:** each friend entry includes `note` when set. The format stays `{v:1, playerId, friends:[{id, username, note?}]}`.
- **Import:** accepts `note` when it's a string, trimmed and capped at 200.
  - New friends get their note.
  - Existing friends get the imported note only if they don't have one. Import never overwrites.
  - The toast reports added friends as today, plus "and N notes" when notes were filled in.

### 5.2 Profile details (presence cache)

`presence.js` keeps its in-memory, never-saved cache.
- **What's stored:** each entry gains an optional `profile: {level, faction, injured, traveling}`.
  - It's taken only from `getProfile` responses: `level = rank`, `faction = {id, name}` or null, `injured = !!is_injured`, `traveling = !!traveling`.
  - `getChatInfo` updates (`presence.set`) change only `online`/`active` and keep any existing `profile`.
- **Missing profile counts as stale:** an entry without `profile` is stale regardless of `fetchedAt`. A friend whose only data came from a DM header therefore still gets a `getProfile` on the next sweep.

### 5.3 Presence sweeps and cost

> **0.4.1:** with the top-bar badge gone, the background mode was removed. Presence runs only while a friends list is open (list-open budget), and idle traffic is back to 4 requests a minute.

Today the presence poller only runs while the dock Friends window is open. It now runs whenever the tab is visible and the player is logged in, with two budgets:

| Mode | When | Each 60s sweep refreshes |
|---|---|---|
| **List open** | Dock Friends window open, or on `/friends` | Up to 20 friends older than 60s, stalest first. This is today's rule. |
| **Background** (for the top-bar badge) | Otherwise | Up to 5 friends older than **5 minutes**, stalest first |

- **At startup:** the first background sweep uses the list-open budget, so the badge fills in quickly. Friends never fetched count as stalest.
- **Cost when idle:**
  - Before: 4 requests a minute (threads).
  - Now: at most 9 (4 threads + 5 presence).
  - For comparison, the game's `/mail/{id}` view makes 60.
- **Hidden tab:** the pollers stop, as today.

**Badge freshness:** with 25 or fewer friends, every friend is re-checked at least every 5 minutes. With more, every friend is still checked, just less often: at 50 friends, each one's status is up to about 10 minutes old.

The badge counts friends whose cached presence says online. Friends with unknown presence aren't counted.

## 6. Architecture

### 6.1 New and changed modules

```
src/
  friends-table.js         NEW  pure: tab/search/sort/count rows for the page (like friends-view.js)
  time.js                  + longAgo(ts, now): "just now", "18 min ago", "3 hr ago", "2 days ago", "1 month ago" (§4.2)
  state.js                 + setFriendNote
  backup.js                export/import notes (§5.1)
  presence.js              + profile details and "no profile = stale" (§5.2)
  app.js                   presence budgets (§5.3); page + top-bar wiring; badge count
  main.js                  early /friends 404-hide at script start (§4.1)
  ui/keeper.js             NEW  one body MutationObserver; each registered mount gets an O(1)
                                "still attached?" check, re-mounts batched per animation frame
  ui/dock.js               uses keeper.js instead of its own body observer (same behavior)
  ui/topbar-button.js      NEW  the Friends button + badge (§3)
  ui/friends-page.js       NEW  the page (§4); mounts/unmounts on route
  ui/styles.js             + zcf-page-* and top-bar rules
```

- **Why a shared keeper:** the dock already has a body observer. The button and page need the same "re-attach if Vue rebuilt my parent" behavior, and one observer is cheaper than three.
- **Module rules stay as they are:** only `api.js` does network I/O and only `store.js` touches storage. UI modules get the `services` object.
- The page gets the same `services` as the dock windows, plus `presence.subscribe` / `inbox.subscribe` for redraws. It unsubscribes on unmount.

### 6.2 Data flow

- `store` (friends, notes, threads) + `presence` (online, active, profile) + `inbox` (unread) → `friends-table.js` → `friends-page.js` renders rows.
- `presence` → the online count → `topbar-button.update(count)`.
- Row actions go through `services.actions`:
  - `openDm`, `removeFriend`, `addFriend` already exist.
  - `setFriendNote` is new and calls `store.update((s) => setFriendNote(s, id, note))`.

## 7. Changes to existing behavior

- The presence poller runs in the background at the low budget (§5.3). Before, it ran only while the Friends window was open.
- Export files may now contain `note`. Older script versions' import drops unknown fields, so they still read these files.
- Nothing else changes in the dock, DM windows or profile button.

## 8. Error handling

- **Missing mail button or icon group:** no top-bar button, and one `[ZCF]` warning. Everything else works.
- **Missing `.q-page-container` on `/friends`:** the page isn't shown, the `<html>` class is removed so the game's 404 is visible again, and one warning is logged.
- **Profile fetch failures:** cells keep `—`. A `rate`/`auth` pause works as today (presence pauses for 5 minutes).
- **Every entry point is wrapped** in `safe()` / `try-catch`, as in the base spec §7.
- **CSS:** every new rule uses our own `zcf-` classes, or `html.zcf-on-friends` for the one hide rule. None of them ties with or overrides a game rule, and `test/ui/styles.test.js` keeps checking the dock rules.

## 9. Testing

**Unit tests** (Vitest + jsdom):
- `friends-table.js`:
  - tab counts
  - search over name and note
  - each sort key in both directions
  - unknown values sorting last
  - username tie-breaks
  - the default Status order
- `time.js` `longAgo`: every boundary in the §4.2 table, and singular vs plural.
- `main.js`: the early `/friends` class is set before login, and removed when the first login check fails.
- `state.js` `setFriendNote`: trims, caps at 200, deletes when empty, ignores non-friends.
- `backup.js`:
  - notes exported
  - imported onto new friends
  - fill-only-if-empty on existing ones
  - non-string or overlong notes handled
- `presence.js`:
  - `profile` taken from `getProfile` and kept across `set()`
  - a missing profile counts as stale
- `app.js`:
  - background vs list-open budgets
  - the startup sweep
  - the badge count
  - pollers stop when the tab is hidden
- `ui/keeper.js`: a re-mount after the parent is replaced; no work when everything is attached.
- `ui/topbar-button.js`, using live header markup in `test/fixtures/game-dom.js`:
  - inserted before mail
  - badge hidden at 0
  - color class
  - click navigates without a reload
  - modified click keeps the default
  - re-inserted after the header is rebuilt
- `ui/friends-page.js`:
  - mounts only on `/friends` and unmounts on leave
  - the `<html>` class
  - rows, icons, faction link, unread pill
  - Message opens the DM
  - note edit (Enter / Esc / blur / one at a time)
  - remove confirm and focus
  - empty states
  - the phone layout class
  - notes containing HTML show as text
- `test/ui/styles.test.js`: also renders the page and top-bar button, so the load-order check covers them.

**Manual checklist** additions to `docs/manual-test.md`:
1. The top-bar button sits left of mail, the badge matches the online friends, and the button fits on a narrow phone.
2. Clicking goes to `/friends` with no page reload, and there's no 404 flash. Refreshing `/friends` directly also works.
3. Sorting, tabs and search; editing, cancelling and saving a note; a note survives a reload and shows up in a second tab.
4. Message opens the DM in the dock; Remove confirms; Add friend adds, and the new friend appears.
5. Injured and traveling icons match those players' profiles.
6. Export/Import round-trips notes.
7. The Network panel shows at most about 9 requests a minute when idle, and 0 while the tab is hidden.

## 10. Verify during implementation (defaults already set above)

1. `/friends` shows the logged-in layout with the 404 block inside `.q-page-container`, both through client navigation and on a direct load or refresh. The server must serve the app for that path.
   - **If a direct load fails:** navigation from the button still works (it's client-side). Ask the user whether that's acceptable before looking for another path.
2. `getProfile` field names and types: `rank`, `faction{id,name}`, `is_injured`, and `traveling`, which may be a boolean or an object. Treat it as truthy either way.
3. **Optional saving:** does `getChatInfo?user_id=1,2,3` return several entries?
   - Check with the user's session using one console `fetch`.
   - If it does, background sweeps use one `getChatInfo` call per sweep for online/active, and `getProfile` stays for level, faction and the icons.
   - If it doesn't, keep §5.3 as written.
4. Whether the top bar's icon group fits a fourth button at 360px, and how much spacing to trim if not.
5. The `‹ City` target: use the path the Players page's back button navigates to, if it isn't `/city`.
