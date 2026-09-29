# Zed City Friends: Private Messages Window and Chat Settings Design

**Date:** 2026-09-29
**Ships as:** 0.5.0 (one release covering both parts)
**Builds on:**
- [2026-09-28-zed-city-friends-design.md](2026-09-28-zed-city-friends-design.md): the dock, DMs, mail API, storage and polling.
- [2026-09-28-friends-page-design.md](2026-09-28-friends-page-design.md): the Friends page, notes, presence details and the mount keeper.

**Status:**
- **Part A** (Private Messages window) was designed with the user and approved.
- **Part B** (chat settings cog) was designed by Claude after the user went to bed. The user asked for it ("add a cog bubble for chat settings like Torn; apply my Chat+ plugin logically") and said to proceed without them. Every Part B choice is listed in §B.7 so the user can review it in the morning.

## 0. Background

The user's reference is Torn City's Chat 3.0. From their screenshot:
- **Button bar:** square buttons sit flush in the bottom-right corner, ending with People (private chats) and a Settings cog.
- **Private chats panel:** opens above the bar. It has tabs across the top, a "Search by player name to start a new chat" box, then conversations newest first. Each conversation shows an avatar ringed by online status, the name, "10 hours ago", and a "Name : last message" preview.
- **Settings panel:** includes Mark all as read, Close all private chats, Height % and Width % sliders, Room and Private sounds, "Decline chats from people you don't know", message styling (Bubbles, Avatars), and a version line.

The user also wrote **Chat+** for Torn, in `D:\dev\Torn City Scripts\ChatPlus` (read its README). On each chat it provides:
- a padlock to unlock the chat, drag it anywhere by its header, and lock it there;
- a return arrow that sends it back to the row, with the remaining chats sliding over to close the gap;
- resize by dragging;
- message size from 80% to 200%, one chat at a time.

Everything is remembered and synced across tabs.

**Privacy:** Chat+ carries the user's real name in `@author`. Never copy that header or name into this repo; see the memory file `zed-friends-privacy`.

---

# Part A: Private Messages window (approved)

## A.1 Summary

The dock's "Friends & Chats" window becomes **Private Messages**, a Torn-style list of your conversations in Zed's own look.
- **Layout:** it opens like the game's own chats, as a window in the dock row (the user picked option A over a Torn-style panel above the bar).
- **Placement:** on desktop, the whole dock row sits flush against the right edge of the screen.

## A.2 Dock row

- **Order, left to right:** `[DM tabs/windows][game chats][Private Messages][Settings cog]`.
  - Today the Friends window is rightmost through `.chat-containers .zcf-friends{order:2}`, and the cog (Part B) goes after it.
  - Watch the existing phone rule, which gives the one open window `order:3`: the cog must still end up in the corner, or be hidden while a window is open on phones.
- **Flush right on desktop:** at `min-width:600px`, `body .chat-containers{right:0}`. The game sets `right:20px` with `.chat-containers` at specificity (0,1,0); ours is (0,1,1), so it wins whichever stylesheet loads last (see `test/ui/styles.test.js` and the CSS load-order note at the top of `src/ui/styles.js`).
- **Phones are unchanged:** the game's `right:10px` and bottom offset for its phone menu stay.

## A.3 The window

- **Header:** `PRIVATE MESSAGES` with a green envelope icon (`fas fa-envelope`, `#3d8b40`), then the existing `⋯` menu (Export / Import friends) and the collapse chevron.
- **Minimized tab:** the same envelope, with the **green unread count** introduced in 0.4.1: every unread chat, from friends and from anyone in the Chats list; see `chatsUnreadTotal` in `src/state.js`. It is shown only while minimized, like the game's chat tabs.
- **Tabs:** `Chats | Friends | Faction | Blocked`, as an equal-width row styled like the game's submenu tabs (Oswald, uppercase, active tab with a `#0a748f` top bar). The selected tab is remembered in the settings document (§B.5, `pmTab`).
- **Search box**, on every tab: "Search by player name to start a new chat".
  - After 300ms with 2+ characters, or any all-digit string, it calls `players.search` (`findPlayer`) and shows up to 8 results in place of the tab's list.
  - **Each result:** avatar, name, `#id`, and a **+ Friend** button (or **✓ Friend**).
  - **Clicking a result** opens a DM with that player, expanded.
  - **Esc** or clearing the box returns to the tab. This replaces the old person-plus pop-out; reuse its search and debounce code from `src/ui/add-friend-popover.js`.
- **Removed from the window:** the Online / Offline / Recent sections, the friends filter, and the person-plus pop-out. Managing friends now happens on the Friends page (`/friends`).

## A.4 Tabs

**Chats**
- **Contents:** every non-system mail thread, newest `lastReply` first. System threads stay in the game's inbox.
- **Row layout:**
  - a 30px round avatar, with a status dot when presence is known (friends and open DMs; others have no dot)
  - the name, in bold
  - a green unread pill when `threads[id].unread > 0`
  - the time on the right, from `longAgo` (`src/time.js`)
  - a one-line preview below: `You: …` when `senderId === myId`, otherwise `Name: …`. This uses the existing `previewText`, which already turns invites and GIFs into text.
- **Unread rows** show the preview in white at weight 500.
- **Page 1** comes from the existing inbox poll (`inbox.threads()`), so it costs nothing extra.
- **Older conversations:** scrolling within 80px of the bottom loads the next page with `getChats?page=N`, one page at a time, and stops when a page comes back empty. Loaded pages are kept in memory for the session, and page 1 always comes fresh from the poll. Duplicate user IDs across pages are removed, keeping the newest.
- **Clicking a row** calls `actions.openDm(id, {expand:true, username, avatar})`.

**Friends**
- **Contents:** all friends, online first (A–Z), then offline by most recently active, then unknown; reuse `buildFriendsTable` or `sortRows` from `src/friends-table.js`.
- **Row layout:** avatar and dot, name, status (`Online` or `Active 18 min ago`, via `longStatusText`), and an unread pill.
- **Clicking a row** opens the DM.
- **Footer link:** "Manage friends →", which runs `router.navigate('/friends')`.
- **Presence** refreshes while the PM window is open (the existing list-open presence poller, §A.6).

**Faction**
- **Data:** `GET getFactionMembers` → `{faction, members:[{id, username, avatar?, online, active, level, role, …}], roles, role}`.
  - It loads when the tab is shown, then every 60s while the tab is showing and the window is expanded, with a poller that stops otherwise.
  - Leave yourself out of the list.
- **Order:** online first (A–Z), then by last active.
- **Row layout:** avatar and dot, name, `Lv N`, and status. Clicking a row opens the DM.
- **Not in a faction** (an error or no `faction`): show "You're not in a faction."
- `active` is seconds since last active, as elsewhere; use `lastActive` from `src/presence.js`.

**Blocked**
- **Data:** `GET blockList?page=N` → `{list:[users], total}`. The game's own `/settings/blocked` page uses the same call, and renders each user with `zed-user`, so expect `{id, username, avatar, …}`. Load page 1 when the tab is shown, and later pages on scroll until `list.length` reaches `total`.
- **Row layout:** avatar, name, and an **Unblock** button that turns into an inline confirm: "Unblock {name}?" with **Unblock** and **Cancel**.
- **Unblocking:** confirm → `POST unblockUser {user_id}` → `{success}`. On success, reload the list and show a toast "{name} unblocked". On failure, show a toast "Failed to unblock {name}".
- **Empty:** "No blocked players."
- Blocking still happens only on profiles, with the game's own Block button.

## A.5 Architecture (Part A)

- **`src/ui/pm-window.js`** replaces `src/ui/friends-window.js`. Delete the old file and its test, porting any test that still applies.
  - Keep its public shape (`{ el, update, scheduleList, syncBadge, destroy }`) so `dock-view.js` and `app.js` change little.
  - Keep `data-zcf-focus` focus restoration, signature-skipped redraws, and the pointer-down redraw guard used on the Friends page (`holdRender` in `src/ui/friends-page.js`).
- **`src/pm-view.js`** (new, pure): chat rows (merge inbox page 1 with extra pages, drop system threads, sort, build previews), faction rows, and blocked rows, each sorted. Unit-tested with no DOM.
- **`src/api.js`** gains `getFactionMembers()`, `blockList(page)` and `unblockUser(userId)` (a CSRF-protected POST, like `sendMail`), all returning the usual `{ok, data} | {ok:false, kind…}`.
- **`src/state.js`:**
  - Keep `dock.friendsOpen` as the PM window's open flag. The name is historical; renaming it would need a storage migration for no gain.
  - Add `dock.settingsOpen` (Part B), and have `normalizeState` keep it.
  - Include the settings window in `collapseOthers` / `collapseAll` and in the phone one-open rule in `app.js`.
- **`src/ui/styles.js`:** the new window's CSS, the flush-right rule, and the removal of the old Friends-window-only rules.
  - Every rule that overrides a game rule must outrank it, and `test/ui/styles.test.js` must stay green.
  - Extend its `STATES` / render helpers so the new windows are covered.
- **Rename in the UI only** (title, README, manual checklist). The script name, storage keys and exports stay the same.

## A.6 Traffic

- **Chats:** page 1 comes from the existing thread poll. Each further page is one request when you scroll to it.
- **Friends:** presence works as today, capped at 20 `getProfile` a minute while the PM window or the Friends page is open.
- **Faction:** one request when the tab opens, then one a minute while it's shown.
- **Blocked:** one request when the tab opens, plus one per scrolled page and after each unblock.
- **Minimized window, or hidden browser tab:** nothing extra.

---

# Part B: Chat settings cog (designed on the user's behalf, to review)

## B.1 Summary

A **cog tab** sits in the bottom-right corner, right of Private Messages, and opens a **Chat settings** window in the row, like the other windows. Its contents follow Torn's settings panel, plus the Chat+ features that make sense in Zed.

## B.2 The cog tab and window

- **Tab:** a 44×40 minimized tab with `fas fa-cog` in the game's grey `#a6a6a6`. It is rightmost in the row (corner) and has no badge.
- **Window:** `CHAT SETTINGS` with the cog icon and a collapse chevron. It is as tall as the other windows and scrolls inside when needed.
- **Open state** is `dock.settingsOpen`, which comes back after a reload like the other windows.

## B.3 Sections

1. **Utilities**
   - **Mark all as read:** for each chat counted by `chatsUnreadTotal`, one at a time with at most 20 per press, call `getChatMessages(id, 1, 10)`. That's what marks a thread read on the server, the same as opening it. Then `markSeen` it locally.
     - While it runs, the button reads "Marking… 3/7".
     - When it finishes, show a toast "Marked N chats as read".
     - It stops on an `auth` or `busy` result, with a toast explaining why.
   - **Close all private chats:** removes every DM tab and window from the dock (`closeDm` for each). It does nothing to the mail itself.
2. **Window size**, for Zed City Friends windows only (Private Messages, DMs and Chat settings):
   - **Width:** 80%–150% in steps of 10, relative to the game's 350px chat width.
   - **Height:** 80%–150% in steps of 10, relative to 450px.
   - **Reset** returns both to 100%.
   - Both are applied through CSS variables on our own elements, so there are no Vue-owned nodes to fight.
   - The game's chats keep their own size: they're Vue-owned, and resizing them is out of scope.
   - Phones ignore these values (the phone layout already sizes windows to the screen).
3. **Message size** (Chat+):
   - **Slider:** 80%–200% in steps of 10.
   - **Scope:** the messages and typing box in every DM window.
   - **Checkbox "Also Global, Faction and Activity chat"** (default **on**): applies the same size to the game's chats.
   - **How:** one `<style id="zcf-user-settings">` that we rewrite. It sets CSS `zoom` on our `.zcf-scroll` / `.zcf-composer`, and on the game's `.chat-container:not(.zcf) .chat-content` when the checkbox is on. We never touch Vue-owned elements' attributes.
   - **At 100%**, the style is empty, so the game is untouched (as in Chat+).
4. **Sounds**
   - **"New private message":** Off (default) / Chirp / Ping / Bell, with a ▶ test button.
   - **Tones** are synthesized with WebAudio (short envelopes), so there are no files and no network requests.
   - **When it plays:** when a thread poll finds new unread mail from another player, friend or not, at most once per poll. It never plays for your own sends or for system threads.
   - Create the AudioContext lazily and `resume()` it on first use. Browsers allow that after any click on the page.
5. **Move windows** (Chat+), desktop only:
   - **Setting:** a checkbox "Show move controls on windows" (default **off**, to keep headers uncluttered).
   - **When on:** every expanded Zed City Friends window (Private Messages, DMs, Chat settings) gets a **padlock** in its header, left of its other buttons.
   - **Padlock:** click to **unlock**, then drag the window by its header anywhere on screen; click again to **lock** it there.
   - **Return arrow:** a window that has been moved gets a **return arrow**, which sends it back into the dock row. The row closes the gap on its own, since it's a flex row.
   - **Positions:** saved per window (`pm`, `settings`, `dm:{id}`) and restored after a reload.
     - They're clamped fully on-screen after drags and browser resizes, and synced across open tabs.
     - A moved window stays `position:fixed` at its spot while minimized too, like Chat+.
   - **Scope:** only our windows. The game's chats are Vue-owned, and moving them risks Vue re-renders undoing it.
   - **Porting:** port the geometry, drag-threshold and clamping logic from Chat+ (`src/features/movable/geometry.js`, `dragController.js`, `floating.js`). Its reflow is unnecessary here, because our windows sit in a flex row that closes gaps by itself.
6. **About:** "Zed City Friends v{version}". `build.mjs` injects the `package.json` version as a constant through esbuild `define`.

## B.4 Not included (Torn has these; they don't fit Zed)

- **Hide chats with TornTools, Chat version, Rejoin rooms:** Torn-specific.
- **Decline chats from people you don't know:** a script can't refuse mail on the server. It could hide pop-ups from non-friends, but pop-ups already only happen for friends.
- **Message styling (Bubbles, Avatars):** a bigger visual change to the DM rendering. Revisit if the user asks.
- **Per-window drag-resize grips** (Chat+): the global Width/Height sliders cover sizing more simply. Revisit if the user asks.

## B.5 Settings storage

- **Where:** a separate document, `localStorage['zcf:v1:{playerId}:settings']`, read and written only by `store.js`. A new small `createSettingsStore` there has the same `get / update / subscribe` shape and a `storage`-event cross-tab reload.
- **Why separate:** older script versions normalize the main document and would drop unknown fields when writing it back.
- **Shape:**
  ```json
  { "v": 1, "pmTab": "chats", "width": 100, "height": 100, "textScale": 100, "textScaleGameChats": true,
    "sound": "off", "moveControls": false, "positions": { "pm": { "x": 900, "y": 300 }, "dm:123": { "x": 40, "y": 120 } } }
  ```
- **Validation:** clamp every number to its range, fall back to defaults for unknown or invalid values, and drop positions whose key isn't `pm`, `settings` or `dm:<positive int>`.
- A corrupt document falls back to defaults. Unlike the main document, there's nothing here worth backing up.

## B.6 Architecture (Part B)

| Module | Status | Contents |
|---|---|---|
| `src/settings.js` | new, pure | defaults, `normalizeSettings`, clamps, position keys |
| `src/store.js` | changed | `createSettingsStore` |
| `src/sound.js` | new | `createSound({ win })` → `play(name)`; WebAudio tones |
| `src/ui/settings-window.js` | new | the window and its controls, wired to `services.settings` and `actions` |
| `src/ui/window-mover.js` | new | padlock, return arrow, drag, clamping; applies positions |
| `src/ui/user-style.js` | new | writes the `zcf-user-settings` style (sizes, zoom) |
| `src/inbox.js` | changed | reports "new unread mail from someone else" to a callback so `app.js` can play the sound |
| `src/app.js` | changed | wiring, `actions.markAllRead`, `actions.closeAllDms`, `actions.toggleSettings` |

`window-mover.js` is used by the PM window, the DM windows and the settings window alike. Each passes its header element and position key.

## B.7 Choices made without the user (for the morning review)

1. **Settings list:**
   - utilities (Mark all as read, Close all private chats)
   - window width and height sliders (our windows only)
   - message size with an "also game chats" checkbox, default on
   - new-PM sound, default **off**
   - move controls, default **off**
   - the version line
2. **Sounds are synthesized.** Torn uses recorded sounds such as Chirp 1; ours are simple generated tones.
3. **Move controls are off by default**, and only our windows can move.
4. **The game's own chats can't be resized** (only their text size changes).
5. **Left out:** decline strangers, bubbles/avatars styling, and per-window resize grips.

---

## C. Error handling (both parts)

- **Every new entry point is wrapped** (`safe()`, try/catch), and failures log once with `[ZCF]`.
- **API failures:** Faction and Blocked show an inline "Couldn't load. Retry" line. Mark all as read stops with a toast. Search keeps the existing "Search failed. Try again." message.
- **All player strings are text only** (names, previews, faction and blocked usernames), never `innerHTML`. Avatars use `avatarUrl()` as before.

## D. Testing

**Unit tests** (Vitest + jsdom):
- `pm-view.js`: merging page 1 with extra pages, dropping system threads, dedupe, newest first, the `You:` / `Name:` preview, and faction/blocked row sorting.
- `settings.js`: defaults, clamps, position-key validation, corrupt input.
- `createSettingsStore`: a separate key, and a `storage` event reloading it.
- `pm-window.js`:
  - tabs switch and are remembered
  - the search replaces the list and Esc restores it
  - clicking a row or result opens a DM
  - the green badge
  - older pages load on scroll
  - Faction loads when its tab opens and shows "not in a faction"
  - Blocked's inline confirm leads to `unblockUser` and a reload
- `settings-window.js`:
  - each control updates the settings store
  - Mark all as read runs one thread at a time, capped at 20, stops on `auth`, and marks threads seen
  - Close all removes every DM entry
- `window-mover.js`:
  - padlock toggling, dragging with a threshold, clamping on resize, and the return arrow
  - positions persist and restore
  - disabled on phones
- `user-style.js`: an empty style at 100%/100%/100%, and the zoom/size rules otherwise.
- `sound.js`: calls `AudioContext` with a fake; "off" is silent.
- `inbox.js`: the new-mail callback fires once per poll for other players' new unread mail, and not for system threads or your own sends.
- `styles.test.js`: order independence still holds with the new windows, the cog tab and the flush-right rule.

**Visual check:** render the real modules under the game's real CSS in headless Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).
- Download `index-*.css`, `LoggedIn-*.css` and `load-components-*.css` from `https://www.zed.city/` (find the hashed names in `index.html` and `index-*.js`).
- Build a tiny harness that mounts the dock with fake services.
- Screenshot at 1280px, and at 375px inside an `<iframe>`, because headless Edge won't go below about 480px wide.
- Keep the harness under `tools/preview/`, with the downloaded CSS gitignored.

**Manual checklist:** add the new items to `docs/manual-test.md`.

## E. Verify live (needs the user logged in; defaults already set above)

1. The `getFactionMembers` shape, and what it returns when you're not in a faction.
2. `blockList` row fields and `total`; the `unblockUser` response.
3. The `getChats` page size, and that an empty page means the end.
4. CSS `zoom` on the game's `.chat-content` doesn't break its auto-scroll or input.
5. The flush-right row doesn't collide with anything the game draws in the corner.

## F. Overnight build instructions (for the next session)

- **Branch:** work on a new branch `pm-and-settings` from `main`. Commit as the repo-local identity "Zed City Friends" (`git config user.name` must say so).
- **Don't push or merge.** The user reviews in the morning.
- **Process:**
  1. Use superpowers:writing-plans to turn this spec into a plan at `docs/superpowers/plans/2026-09-29-private-messages-and-chat-settings.md`.
  2. Execute it: TDD per task, batched commits.
  3. Run one code review at the end (a reviewer agent), fixing only Critical/Important issues and logging Minor ones.
  4. Set the version to 0.5.0 and build `dist/`.
  5. Run the visual check (§D).
- **Morning summary:** leave a short summary as the session's final message: what was built, the screenshots taken, the review findings and what was fixed, and the open questions (§B.7, §E).
