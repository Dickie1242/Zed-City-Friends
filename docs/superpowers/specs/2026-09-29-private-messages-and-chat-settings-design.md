# Zed City Friends 0.5.0 Design: Private Messages, Chat Settings, Enemies, Mute

**Date:** 2026-09-29
**Ships as:** 0.5.0 (one release covering all four parts)
**Builds on:**
- [2026-09-28-zed-city-friends-design.md](2026-09-28-zed-city-friends-design.md): the dock, DMs, mail API, storage and polling.
- [2026-09-28-friends-page-design.md](2026-09-28-friends-page-design.md): the Friends page, notes, presence details and the mount keeper.

**Status:**
- **Part A** (Private Messages window) was designed with the user and approved.
- **Part C** (Enemies list) and **Part D** (Mute, What's new, four fixes) were designed with the user and approved.
- **Part B** (per-chat customization and the settings cog): the user set its requirements (Chat+ drag-to-resize grips, movable bubbles, and a size, message size and location for each chat). Claude filled in the details after the user went to bed. The remaining judgment calls are listed in §B.7 for the morning review.

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

# Part B: Per-chat customization (Chat+) and the settings cog

## B.1 Summary

Every chat can be customized on its own, the way the user's Chat+ plugin works in Torn. That covers the game's **Global, Faction and Activity** chats as well as ours (**Private Messages**, each **DM**, and **Chat settings**). Each chat can be:
- unlocked with a padlock, dragged anywhere and locked there, or sent back to the row;
- resized with drag grips;
- given its own **message size**.

Size, message size and location are remembered **per chat**. A chat's bubble (its minimized tab) stays where the chat was moved, and bubbles can be dragged directly.

A **cog tab** in the bottom-right corner opens a **Chat settings** window with the utilities, a list of every customized chat with Reset buttons, sounds and the version.

**User requirements** (2026-09-29): "I want the chat+'s drag-to-resize grips and movable chat bubbles. I also want … unique settings per chat where each chat can have its own size and font size and location."

## B.2 Which chats, and how each is identified

| Chat | Key | Found by |
|---|---|---|
| Global | `game:general` | `.chat-containers > .chat-container.general-chat` |
| Faction | `game:faction` | `.chat-container.faction-chat` |
| Activity | `game:activity` | `.chat-container.activity-chat` |
| Private Messages | `pm` | our window, `data-zcf-chat="pm"` |
| Chat settings | `settings` | our window, `data-zcf-chat="settings"` |
| A DM | `dm:{userId}` | our window, `data-zcf-chat="dm:{id}"` |

A new DM starts with default settings. Settings for a closed DM are kept, so reopening it restores its size and place.

**The game's chats are Vue-owned, and Vue binds both `class` and `style` on them** (see `LoggedIn-*.js`: `class: o([\`chat-container general-chat\`, {...}])`, `style: b(x.smallLayoutOrderStyle(...))`). So:
- **Never** add classes, attributes or inline styles to a game `.chat-container` or its children's existing nodes.
- Apply **all** per-chat size, zoom and position through our own stylesheet, `<style id="zcf-user-settings">`, which is rebuilt whenever settings change. It is keyed by `.general-chat` / `.faction-chat` / `.activity-chat` and by `[data-zcf-chat="…"]` for our windows.
- Our selectors must outrank the game's; see the load-order rule at the top of `src/ui/styles.js`. Use `body .chat-containers …` prefixes.
- Our **padlock, return arrow, grips and header controls** are *child nodes we insert* into each game chat's header and container.
  - Vue leaves foreign children alone in normal patches. If a re-render drops them, the shared **mount keeper** (`src/ui/keeper.js`) puts them back.
  - Their pointer and click handlers call `stopPropagation` so the game's header click (toggle) doesn't fire.
- **Sizing** works because the game's chat body fills its container: `.chat-content{flex:auto;min-height:0}`, `.live-chat{height:100%}`, `.message-panel{flex:auto;min-height:0}`. Setting the container's `width`/`height` (and `max-height:none`) is enough, just as Chat+ credits "Better Chat 3.0" for in Torn.
- **Floating** a chat is `position:fixed; left; top` on the container. `.chat-containers` has no transform, so fixed means relative to the viewport. Taking a chat out of the flex row closes the gap by itself.

## B.3 Per-chat controls (ported from Chat+, desktop ≥600px only)

**Padlock**
- Every **expanded** chat gets a padlock in its header, just left of its own header buttons.
- **Closed (default) = locked:** the chat stays where it is, docked in the row or where it was moved to.
- **Click** to unlock, and click again to lock. The tooltip reads "Locked — click to unlock, right-click for options" or "Unlocked — drag to move, click to lock".
- The lock state is remembered per chat.

**Moving an unlocked chat**
- Drag it by its header, from anywhere on the header bar including its title.
- A 6px threshold means a still click is still a click: it toggles the chat as usual.
- Moving it makes it **moved** (floating).
- It is clamped fully on screen after each drag and whenever the browser resizes.

**Return arrow**
- Shown left of the padlock on a moved chat. It sends the chat back to the dock row.
- It clears the position only; size and message size stay.

**Resize grips** (only while unlocked)
- **Docked chats:**
  - a strip along the top edge (drag up to make it taller);
  - a corner grip at the top-left (width and height together; the right edge stays put, and the row makes room).
- **Moved chats** also get a bottom strip and a bottom-right corner.
- **Limits:** width 270 to 900px, height 200px to (viewport height − 60px).
- **Defaults:** our windows are 350 × 450 (DMs and Private Messages) and 350 × auto (Chat settings). Game chats get the game's own size (350px wide; max-height 500).
- Locking hides the grips and keeps the size.

**Chat menu** (right-click a padlock)
- It opens a small menu below the padlock, or above it for a chat near the bottom. The menu has:
  - **Message size:** − / NN% / +, from 80% to 200% in steps of 10.
    - At 100% nothing is applied, so the game's own sizing stays untouched.
    - It scales the messages and typing box of that chat only, using CSS `zoom` on that chat's `.chat-content` (game chats) or `.zcf-scroll` and `.zcf-composer` (ours).
  - **Chat size:** Reset.
  - **Position:** Return to row, shown only when moved.
- Esc or an outside click closes it.

**Header controls:** once a chat is at least **400px** wide, the Message size −/NN%/+ and a Reset button also appear inline in its header, left of the padlock. They disappear again below 400px.

**Bubbles (minimized chats)**
- A **moved** chat's bubble stays at the chat's saved spot, anchored at its top-left, instead of going back to the row.
- Any bubble, docked or moved, can be **dragged directly**: press and move more than 6px to move it. That makes the chat "moved", and it opens at that spot, clamped.
- A plain click still opens the chat. The click after a drag is suppressed with a capture-phase listener, so the game's toggle doesn't fire.

**Phones (<600px):** no padlocks, grips or moving. Saved positions and sizes are ignored there, and message size still applies.

## B.4 The cog tab and Chat settings window

- **Cog tab:** a 44×40 bubble with `fas fa-cog` in `#a6a6a6`, in the corner, right of Private Messages. It has no badge.
- **Window:** `CHAT SETTINGS` in the dock row, like the others. Its open state is `dock.settingsOpen`. It has these sections:
  1. **Utilities**
     - **Mark all as read:** for each chat counted by `chatsUnreadTotal`, one at a time with at most 20 per press, calls `getChatMessages(id, 1, 10)`. That's what marks it read on the server, the same as opening it. Then `markSeen` it.
       - While running, the button reads "Marking… 3/7".
       - When done, a toast says "Marked N chats as read".
       - It stops, with a toast, on `auth` or `busy`.
     - **Close all private chats:** removes every DM tab and window from the dock. Their per-chat settings are kept.
  2. **Your chats:** one row per chat that exists now or has customizations.
     - Each row shows the name (Global, Faction, Activity, Private Messages, Chat settings, or the DM partner's name), then "moved" or "docked", "W×H" or "default size", "text NN%", and a padlock state icon.
     - Each row has **Reset** (clears size, message size, position and lock for that chat).
     - Below the list is **Reset all chats**.
  3. **Sounds**
     - **"New private message":** Off (default) / Chirp / Ping / Bell, with a ▶ test button.
     - The tones are synthesized with WebAudio, so there are no files and no network requests.
     - It plays when a thread poll finds new unread mail from another player, at most once per poll. It never plays for your own sends or for system threads.
     - The AudioContext is created lazily and resumed on first use.
  4. **About:** "Zed City Friends v{version}". `build.mjs` injects the `package.json` version through esbuild `define`.
- **Also a chat:** the Chat settings window is itself a chat (`settings`), so it can be moved, resized and zoomed too.

## B.5 Settings storage

- **Where:** a separate document, `localStorage['zcf:v1:{playerId}:settings']`, read and written only by `store.js`. A new `createSettingsStore` there has the same `get / update / subscribe` shape and a `storage`-event cross-tab reload.
- **Why separate:** older script versions normalize the main document and would drop unknown fields.
- **Shape:**
  ```json
  { "v": 1, "pmTab": "chats", "sound": "off",
    "chats": {
      "game:general": { "locked": true, "x": 40, "y": 120, "w": 420, "h": 520, "text": 120 },
      "pm": { "locked": false, "w": 380 },
      "dm:123": { "text": 90 }
    } }
  ```
  - **In each chat entry, every field is optional**, and a missing field means the default.
  - **Position:** `x`/`y` are present only when the chat is moved. They are the viewport coordinates of the top-left.
  - **Validation:** numbers are clamped to their ranges (w 270–900, h 200–2000, text 80–200 in steps of 10, x/y ≥ 0). Keys must be `game:general|faction|activity`, `pm`, `settings` or `dm:<positive int>`, and anything else is dropped. An entry that ends up equal to the defaults is deleted.
  - **Corrupt documents** fall back to defaults.
  - **Part D adds** `muted: [userId…]` (§D.1) to this document.
- **Other tabs:** open tabs follow along live, as in Chat+.

## B.6 Architecture (Part B)

`src/chat-custom/` holds the pure parts, ported from Chat+ `src/features/*` (the user wrote Chat+ and it's MIT-licensed; port the logic, never its `@author` header).

| Module | Contents |
|---|---|
| `geometry.js` | clamp a rect on screen; resize math for each grip (anchor edges); the drag threshold |
| `chats.js` | chat keys, defaults, `normalizeSettings`, labels for the settings list |
| `user-style.js` | builds the `#zcf-user-settings` CSS text from settings, the current viewport and phone/desktop (pure string builder, unit-tested) |

`src/ui/chat-custom/` holds the DOM parts.

| Module | Contents |
|---|---|
| `registry.js` | finds every chat element now (game containers by class, ours by `data-zcf-chat`) and its header; registers keeper mounts that (re-)insert controls |
| `padlock.js` | the padlock, return arrow and header controls in each chat header, plus the right-click menu |
| `drag.js` | pointer-driven move for headers and bubbles, with threshold, click suppression and clamping |
| `resize.js` | grips and pointer-driven resize |
| `index.js` | wires settings, registry, style and controls; listens for viewport resize (re-clamps) and settings changes (rebuilds the style) |

Other modules:
- `src/sound.js`: `createSound({ win })` → `play(name)`.
- `src/ui/settings-window.js`: the cog window.
- `src/store.js`: `createSettingsStore`.
- `src/inbox.js`: an `onNewMail` callback for the sound.
- `src/app.js`: wiring, plus `actions.markAllRead`, `actions.closeAllDms`, `actions.toggleSettings`.
- **Our windows** (`pm-window.js`, `dm-window.js`, `settings-window.js`): add `data-zcf-chat` and nothing else. The controls come from `chat-custom`.

## B.7 Choices made without the user (for the morning review)

1. **The settings window contains:** utilities, the per-chat list with Reset / Reset all, the new-PM sound (default **off**), and the version.
2. **Sounds** are simple synthesized tones, not recorded sounds like Torn's "Chirp 1".
3. **Padlocks** show on every expanded chat on desktop (as in Chat+), including the game's chats.
4. **Resizing one chat's height** changes only that chat. Other docked chats stay bottom-aligned in the row, as they do today.
5. **Left out** (Torn-only, or not possible for a script): "Hide chats with TornTools", "Chat version", "Rejoin rooms", "Decline chats from people you don't know", and message styling (Bubbles, Avatars).

---

# Part C: Enemies list (approved)

## C.1 Summary

**The request** came from the user's players: an enemies list you can view on the Friends page, and a way to add enemies from player profiles.

**The user's answers** (2026-09-29):
- **Two independent lists:** a player can be both a friend and an enemy.
- **Extras:** a red skull marks enemies in chats, and each enemy gets a private note (a reason).
- **Page layout:** the page title becomes two big tabs, **FRIENDS | ENEMIES**.

The user didn't want online alerts for enemies, because they would need background checks.

## C.2 Data and storage

- **Where:** a separate document, `localStorage['zcf:v1:{playerId}:enemies']` = `{ "v": 1, "enemies": { "123": { "id", "username", "avatar", "addedAt", "note?" } } }`, read and written only by `store.js`.
  - It is separate for the same reason as the settings document (§B.5): older script versions normalize the main document and would drop an unknown `enemies` field.
  - Use the same small document-store helper as `createSettingsStore` (get / update / subscribe / `storage`-event reload), so both share one implementation.
- **Mutators** (pure, next to the friend ones in `state.js` or in a new `enemies.js`):
  - `addEnemy`
  - `removeEnemy`
  - `setEnemyNote`, which reuses `normalizeNote` / `MAX_NOTE`
  - `updateEnemyInfo`, which keeps usernames and avatars fresh from presence, like `updateFriendInfo`
- **Export / Import** (the Private Messages window's `⋯` menu):
  - The export file gains an optional `enemies: [{id, username, note?}]` array next to `friends`.
  - Import merges it with the same rules as friends: add new ones, fill in a note only where there is none, never remove.
  - The toast mentions enemies: "Imported 2 new friends, 1 new enemy and 3 notes."
  - Older script versions ignore the extra array.

## C.3 The page: FRIENDS | ENEMIES

- **Routes:** the page handles `/friends` and **`/enemies`**; extend `isFriendsPath`.
- **Title tabs:** the title becomes two big title tabs, `FRIENDS` and `ENEMIES`, in the same `text-h4 text-uppercase text-no-bg` style.
  - The active tab is bright, and the other dims with a hover highlight.
  - They are links to `/friends` and `/enemies`: a plain click calls `router.navigate`, and a modified click opens a new tab.
- **The rest of the page** works the same on both tabs: the subtitle (`n of N online`), All / Online / Offline tabs, search over names and notes, sortable columns, and the Message / Edit note / Remove actions.
- **The right-hand button** reads **+ Add enemy** on the Enemies tab. It uses the same search pop-out, where **Add** adds an enemy and shows **✓ Enemy** for existing ones.
- **Remove on the Enemies tab** asks "Remove {name} from your enemies?".
- **Enemy rows** show the red skull (§C.5) before the name chip.
- **Empty state:** "No enemies yet. Use **Add enemy** above, or **Add Enemy** on a player's profile."
- **Switching tabs:** search and the confirm/edit state reset, while sort and the All/Online/Offline tab carry over.
- **Presence:** while `/enemies` is showing, the presence poller refreshes **enemies** instead of friends, with the same list-open budget (20 a minute, stalest first). Responses update enemies' saved usernames and avatars.
- **Top-bar button:** stays the plain friends icon and opens `/friends`.

## C.4 Profile button: Add Enemy

- **Placement:** on another player's profile, a second cloned button sits **right after our Add Friend button**: `[Trade][Add Friend][Add Enemy][Mail]`.
  - When Trade and Mail are hidden (a blocked player), it follows Add Friend after Block.
  - There's no button on your own profile.
- **Look:** icon `fas fa-skull`, label `Add Enemy`, in the same outline style as Add Friend.
- **When they're already an enemy:** the label reads `Enemy`, and our own class sets the outline and text to `#ef5350`, like `zcf-is-friend` does for friends.
  - Clicking it shows `Remove?` for 4s, and a second click removes them, the same as the friend button.
- **Implementation:** generalize `src/ui/profile-button.js` into one component, created once per list (`friend`, `enemy`), with the label, icon, color class, `isOn`, add and remove passed in. Keep the existing friend-button tests passing, and add enemy ones.
- **Username and avatar** for a new enemy come from `players.get(id)`, the same as for friends.

## C.5 Enemy markers in chats

A small red skull (`fas fa-skull`, `#ef5350`, about 0.85em, `title="Enemy"`, `aria-label="Enemy"`) goes before an enemy's name:
- **Private Messages window:** rows in the Chats, Friends and Faction tabs, and search results.
- **DM window:** the header name, and the sender name on their messages.
- **The game's Global, Faction and Activity chats:** before `.sender-name` in `.msg-cont` rows.
  - Rows don't carry user IDs, so match the sender name to enemies' saved usernames, case-insensitively.
  - Watch each chat's `.message-panel` for new rows with one `MutationObserver` per panel, handling only added nodes, batched per frame, so the cost is O(new rows).
  - Insert our own `<i class="fas fa-skull zcf-enemy-mark">` as a sibling just before the name span. Never change the game's own nodes or attributes.
  - Re-scan the visible rows when the enemies list changes.
  - Mark each row we've handled with a `WeakSet`, not a DOM attribute.
- **Friends and enemies at once:** a player who is both gets the skull too. Nothing is shown for friends.

## C.6 Architecture (Part C)

| Module | Status | Contents |
|---|---|---|
| `src/store.js` | changed | the generic document store; `createEnemiesStore` (and `createSettingsStore` from Part B on top of it) |
| `src/enemies.js` | new, pure | mutators and normalization |
| `src/backup.js` | changed | enemies in export/import; the new toast wording |
| `src/ui/friends-page.js` | changed | title tabs, `/enemies`, the enemies data source, Add enemy, the skull |
| `src/friends-table.js` | changed | takes the list to show (friends or enemies) instead of assuming friends |
| `src/ui/profile-button.js` | changed | generalized, with two instances |
| `src/ui/enemy-marks.js` | new | the game-chat sender marker (observer per message panel), plus a `markEnemy(el, name/id)` helper used by the PM and DM windows |
| `src/app.js` | changed | enemies store, actions (`addEnemy`, `removeEnemy`, `setEnemyNote`), presence targets by route, wiring |

## C.7 Tests

- **`enemies.js`:** add, remove, note, info-update and normalization.
- **The generic document store:** separate keys, cross-tab reload, corrupt input falling back to empty.
- **`backup.js`:**
  - enemies round-trip
  - import merge and the notes rule
  - an old-format file without `enemies` still imports
  - the toast text
- **`friends-page.js`:**
  - `/enemies` shows the Enemies tab with enemy rows and skulls
  - the title tabs navigate
  - Add enemy uses the search, and shows ✓ Enemy
  - the remove confirm wording
  - the empty state
  - presence targets enemies while on `/enemies`
- **`profile-button.js`:**
  - Add Enemy lands right after Add Friend
  - the Enemy state, color class, and remove confirm
  - the blocked-profile and own-profile cases
  - the existing friend tests stay green
- **`enemy-marks.js`:**
  - a new game chat row from an enemy (case-insensitive) gets the skull, and a non-enemy's row doesn't
  - no duplicates on re-scan
  - marks appear and disappear when the enemies list changes
  - game nodes' attributes are never changed
- **The PM and DM windows:** skulls on enemy rows and headers.
- **Load-order test** (`styles.test.js`): the new rules hold whichever stylesheet loads last.

## C.8 Verify live

1. `.msg-cont` / `.sender-name` is still the game's chat row markup, and our inserted skull survives new messages and scrolling. If the game re-renders rows, re-marking catches it.
2. Where the Add Enemy button looks best in the profile's button row on desktop and on phones. The default is right after Add Friend.

---

# Part D: Mute, What's new, and four fixes (approved)

## D.1 Mute a conversation

- **Where:**
  - a bell button in each DM window's header (`fas fa-bell`, or `fas fa-bell-slash` when muted), with the title "Mute {name}" / "Unmute {name}";
  - a **Mute / Unmute** item in the chat menu (§B.3), for DM chats.
  - A muted conversation's row in the Private Messages **Chats** tab shows a small `fa-bell-slash` after the name.
- **Effect:** new mail from a muted player:
  - doesn't pop up a DM tab (in `inbox.js`, skip the pop for muted ids, even friends);
  - isn't counted in the Private Messages tab's green unread number (`chatsUnreadTotal` leaves muted ids out);
  - plays no sound.
- **Still shown:** their Chats row keeps a (dimmed) unread pill. A DM tab you already have open for them keeps its own badge. Their mail arrives normally, and they're not told.
- **Storage:** `muted: [userId, …]` in the settings document (§B.5). It is validated to positive integers, deduped and capped at 500. Other tabs follow along live.

## D.2 What's new (in Chat settings)

- **Where:** the bottom of the Chat settings window. A row reads **What's new in v{version} ▸**, and clicking it expands:
  - that version's **major features**, each with a line or two of **sub-features**;
  - an **Earlier versions ▸** row that expands to the older ones.
- **Content:** a data module, `src/whats-new.js`, holding `[{ version, date, features: [{ title, points: [...] }] }]`, rendered as text only. Write the 0.5.0 entry from this spec (Private Messages, Enemies, customize any chat, chat settings and sounds, mute) and short entries for earlier versions:
  - **0.4.x:** the Friends page, notes, the plain top-bar icon and the green unread count
  - **0.3.x:** emoji picker; DM windows no longer cut off
  - **0.2.x:** GIFs and the install link
  - **0.1.x:** friends, DM windows, Add Friend on profiles
- **No nudge.** The user doesn't want dots or badges pulling attention to release notes ("no dot pulling attention for dev stuff"). What's new is only there for whoever opens settings, so `seenVersion` isn't needed.

## D.3 Four fixes (logged by the 0.4.0 review)

1. **Back from `/friends` flashes the game's 404.**
   - **Cause:** `router.js` handles `popstate` synchronously, so the page hides before Vue has switched routes.
   - **Fix:** when leaving the page, keep the `<html>` class and our page until the next route has replaced the 404, i.e. `.q-page-container > .fixed-center` is gone, capped at 1s. Only then remove them.
2. **The note editor or remove confirm closes when a friend's status flips while you're on the Online/Offline tab.**
   - **Fix:** keep the row being edited or confirmed in the list until the action ends, even if it no longer matches the tab. Pass pinned ids into `buildFriendsTable`.
3. **The ⋯ menu on phones can't be used from the keyboard.**
   - **Fix:** on open, focus its first item; Up/Down move between items; Esc closes it and focuses the ⋯ button again.
4. **Level, faction and status icons go stale for a friend you have an open DM with.**
   - **Cause:** `getChatInfo` refreshes `fetchedAt` every 60s, so `getProfile` never runs again.
   - **Fix:** track `profileAt` separately in the presence cache. An entry whose profile details are older than 5 minutes counts as stale for the sweeps, even when its online status is fresh.

## D.4 Tests

- **Mute:**
  - no pop-up for a muted friend
  - `chatsUnreadTotal` leaves muted ids out
  - no sound for muted mail
  - the bell toggles and persists across tabs
  - the Chats row shows its icon
- **What's new:**
  - renders from the data module, and expands and collapses
  - the cog tab never shows a dot or badge
  - text only
- **Fixes:** one regression test each. Leaving `/friends` keeps the page until `.fixed-center` is gone (or 1s passes); a pinned row survives a tab filter change; the ⋯ menu keyboard behavior; a stale `profileAt` triggers `getProfile` while `set()` keeps status fresh.

---

## Shared 1. Error handling (all parts)

- **Every new entry point is wrapped** (`safe()`, try/catch), and failures log once with `[ZCF]`.
- **API failures:** Faction and Blocked show an inline "Couldn't load. Retry" line. Mark all as read stops with a toast. Search keeps the existing "Search failed. Try again." message.
- **All player strings are text only** (names, previews, faction and blocked usernames), never `innerHTML`. Avatars use `avatarUrl()` as before.

## Shared 2. Testing

**Unit tests** (Vitest + jsdom). For Part C's tests see §C.7, and for Part D's see §D.4.
- `pm-view.js`: merging page 1 with extra pages, dropping system threads, dedupe, newest first, the `You:` / `Name:` preview, and faction/blocked row sorting.
- `chat-custom/chats.js`: defaults, clamps, key validation, removal of entries equal to the defaults, corrupt input.
- `chat-custom/geometry.js`: on-screen clamping; each grip's resize math and fixed edges; limits; the drag threshold.
- `chat-custom/user-style.js`:
  - empty CSS for default settings
  - size, `max-height:none`, zoom and `position:fixed` rules per chat key
  - game selectors outrank the game's rules (reuse the cascade helper in `test/ui/styles.test.js`)
  - nothing but zoom on phones
- `createSettingsStore`: a separate key, and a `storage` event reloading it.
- `ui/chat-custom`, against the live-DOM fixtures in `test/fixtures/game-dom.js` (the dock with game chats) plus our windows:
  - a padlock appears on every expanded chat, game ones included, and none on phones
  - clicking it toggles lock and doesn't toggle the game chat
  - a header drag past the threshold moves the chat and saves x/y, while a still click still toggles
  - grips resize and respect limits and anchors
  - the return arrow clears the position
  - the right-click menu changes message size one chat at a time
  - header controls appear at 400px or wider
  - dragging a bubble moves it and suppresses the click
  - controls are re-inserted after the game re-renders a header (keeper)
  - no attribute/class/style is ever written to a game `.chat-container`; assert its `className` and `style` are unchanged
- `settings-window.js`:
  - the per-chat list and Reset / Reset all
  - Mark all as read runs one thread at a time, capped at 20, stops on `auth`, and marks threads seen
  - Close all removes every DM entry and keeps its settings
  - sound select and test
- `sound.js`: calls `AudioContext` with a fake; "off" is silent.
- `inbox.js`: `onNewMail` fires once per poll for other players' new unread mail, and not for system threads or your own sends.
- `styles.test.js`: order independence still holds with the new windows, the cog tab and the flush-right rule.

**Visual check:** render the real modules under the game's real CSS in headless Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).
- Download `index-*.css`, `LoggedIn-*.css` and `load-components-*.css` from `https://www.zed.city/` (find the hashed names in `index.html` and `index-*.js`).
- Build a tiny harness that mounts the dock with fake services.
- Screenshot at 1280px, and at 375px inside an `<iframe>`, because headless Edge won't go below about 480px wide.
- Keep the harness under `tools/preview/`, with the downloaded CSS gitignored.

**Manual checklist:** add the new items to `docs/manual-test.md`.

## Shared 3. Verify live (needs the user logged in; defaults already set above)

1. The `getFactionMembers` shape, and what it returns when you're not in a faction.
2. `blockList` row fields and `total`; the `unblockUser` response.
3. The `getChats` page size, and that an empty page means the end.
4. CSS `zoom` on the game's `.chat-content` doesn't break its auto-scroll or input.
5. The flush-right row doesn't collide with anything the game draws in the corner.
6. Our padlock and grips inside the game's chat headers survive the game's re-renders (opening and closing, switching rooms, new messages), or the keeper puts them back without flicker.
7. A game chat set to `position:fixed` and a custom size still scrolls, loads history and sends normally; its GIF and emoji pickers still open in the right place.

## Shared 4. Overnight build instructions (for the next session)

- **Branch:** work on a new branch `pm-and-settings` from `main`. Commit as the repo-local identity "Zed City Friends" (`git config user.name` must say so).
- **Don't push or merge.** The user reviews in the morning.
- **Process:**
  1. Use superpowers:writing-plans to turn this spec into a plan at `docs/superpowers/plans/2026-09-29-private-messages-and-chat-settings.md`.
  2. Execute it: TDD per task, batched commits.
  3. Run one code review at the end (a reviewer agent), fixing only Critical/Important issues and logging Minor ones.
  4. Set the version to 0.5.0 and build `dist/`.
  5. Run the visual check (Shared 2).
- **Build order:** Part D.3's four fixes first (they're small and in code the other parts touch), then Part A (Private Messages), then Part C (Enemies), then Part B (per-chat customization and the settings cog, because it carries the most risk). The rest of Part D (mute, What's new) goes with Part B, since both live in the settings window and the chat menu. Commit each part in a working, fully tested state. If something blocks a later part, stop there, keep what's done, and explain it in the morning summary rather than leaving a half-built part.
- **Morning summary:** leave a short summary as the session's final message: what was built, the screenshots taken, the review findings and what was fixed, and the open questions (§B.7, §C.8, Shared 3).
