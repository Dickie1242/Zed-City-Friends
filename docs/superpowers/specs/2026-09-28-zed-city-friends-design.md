# Zed City Friends & DMs: Design

**Date:** 2026-09-28
**Status:** Approved in brainstorming; awaiting spec review
**Deliverable:** A single userscript, `dist/zed-city-friends.user.js`, for Tampermonkey, Violentmonkey and similar managers.

## 1. Summary

Zed City (www.zed.city) has global, faction and activity chat in a bottom-right dock, and a per-player Mail inbox, but no friends list and no way to chat with one person from the dock. This script adds:

1. A **Friends** tab in the game's chat dock. It holds your friends list, with online status, filtering, an add-friend search, and a "Recent" section for mail threads with people who aren't friends.
2. **Torn-style DM windows**, one dock window per conversation. They run entirely on the game's existing Mail system, so the other person gets the messages in their normal inbox whether or not they have the script.
3. **Add Friend** entry points: a button on profile pages and a hover action on chat names.

It should look like it shipped with the game. It reuses the game's own CSS classes, and it should be easy for the Zed City devs to adopt natively.

### Non-goals

- No external server, no second socket connection, no data leaving `www.zed.city` / `api.zed.city`.
- No mutual friendships or friend requests. The list is one-way, like a bookmark, the same as Torn's friends list.
- No sound or desktop notifications in v1.
- No importing referrals or faction members in v1.

## 2. Environment facts (verified from the live client bundle, 2026-09-26 build)

**Stack:** Vue 3 + Quasar, built with Vite. Chunk filenames are hashed and change every deploy. Font Awesome 5 Pro and Roboto/Oswald are already loaded on the page.

**API:** `https://api.zed.city`, called with `credentials: 'include'`.
- **Login:** `PHPSESSID` cookie, `SameSite=Strict`. That's fine because `www.zed.city` → `api.zed.city` counts as the same site.
- **CSRF:** POST/PUT/PATCH/DELETE need an `X-CSRF-Token` header, taken from `GET /csrfToken` → `{token}`. On a 403 the game refreshes the token and retries once.
- **Error shape:** `{error: string, errorCode?: number}`.
  - `1` means not logged in.
  - `3` / `5` / `6` / `7` mean the player is in a fight, traveling, exploring, or the game is offline. The game redirects the page on these; we won't.
- **`getStats`** → `user.id`, `user.username`, `user.new_mail`, …
- **`getChats?page=N`** → thread rows: `other_user_id`, `other_user{username, avatar?}`, `message` (either a string or an object with `cmd`), `sender_id`, `last_reply`, `new_mail`, `is_system`.
- **`getChatInfo?user_id=`** → a map keyed by user ID, each entry `{username, avatar, online, active, …}`.
- **`getChatMessages?user_id=&offset=P&limit=10`** → one page of messages. `P` is a **page number starting at 1**, not an item offset. Page 1 is the newest. Fields: `id`, `sender_id`, `message`, `sent_at` (UTC), `is_system`.
- **`getNewMessages?user_id=&last_message_id=`** → messages newer than that ID.
- **`POST sendMail {message, user_id}`** → `{message_id}`.
- **`getProfile?user=ID`** → `{id, username, avatar, online (bool), active, faction, …}`.
- **`findPlayer?q=`** → `[{id, username, avatar}]`. Accepts a name fragment or an ID.
- **Mail access error:** the message string `"You cannot access messages with this user!"`.

**Avatars:** `https://daz02uqlb9gre.cloudfront.net/` + `avatar`. The fallback is `https://daz02uqlb9gre.cloudfront.net/default.png`.

**Chat dock DOM:**
- The dock is `div.chat-containers` (a fixed-position flex row at the bottom right). It exists only while the game's `displayChat()` is true, which excludes `/create-player` and chat bans.
- Each child is a `div.chat-container.{general|faction|activity}-chat`. Minimized chats have `.chat-minimized` (44×40 tab). Children are `.chat-header > .chat-title > i.chat-icon`, with `.unread-badge` when minimized, plus `.chat-content`.
- The dock CSS is **global, not scoped**. Any element with these classes gets the game's look.
- **Small layout (under 600px):** the game adds `.single-chat-mode` to the dock when one of *its* chats is open. It also gives the open chat `order:1` and the rest `order:0`.

**Chat messages:** `.message-panel .msg-cont` contains `.sender-name` (clickable, no link and no user ID in the DOM), `.msg-time` and `.msg`.

**Mail rendering rules to copy:**
- Messages from the same sender are grouped if they're within 15 minutes of each other (`groupWindowMs = 900000`) and on the same UTC day.
- Date dividers mark day changes.
- Times are shown in UTC: `HH:mm`, `Yesterday at HH:mm`, or `DD/MM/YYYY at HH:mm`.
- Object messages: `{cmd:'tradeInvite'}` → "Sent a trade invite", `{cmd:'activityInvite'}` → "Sent an activity invite".

**Profile buttons:** Quasar `q-btn` elements with `outline`, `size="sm"`, `color="grey-4"`, each wrapped in a `div`. The order is `[Ban?] Block, Trade?, Mail?, …job actions`. Trade and Mail only render when the game's `canMailUser` is true. Your own profile shows only `Settings`.

**Existing Zed City scripts** use `@grant none` and page-context `fetch`. We do the same.

## 3. Architecture

- **Userscript header:** `@match https://www.zed.city/*`, `@grant none`, `@run-at document-idle`.
- **Why `@grant none`:** the script runs in the page's own context, so `fetch` behaves exactly like the game's own requests in every browser and userscript manager, including mobile ones. It also means the code only uses standard web APIs the devs could keep unchanged.

**Source:** plain ES modules with no framework. esbuild bundles them into one IIFE with the userscript metadata header on top.

```
src/
  main.js              boot: wait for login, get player ID, create modules, wire them together
  api.js               the only module that calls the server (see §6)
  store.js             the only module that touches storage (see §5)
  mail.js              message normalization, grouping, time formatting, unread diffing, optimistic sends
  poller.js            makePoller({fn, interval, maxBackoff}): pauses when the tab is hidden, backs off on errors
  presence.js          online-status cache, fetched 2 at a time, 60s staleness
  players.js           player lookups for the UI: search(q), resolveExact(name), get(id) (over api.js, short cache)
  router.js            page-change events (wraps history.pushState/replaceState, listens to popstate) and navigate(path)
  ui/dom.js            h() element helper, text-only rendering, avatar/status-dot components
  ui/dock.js           mounts our containers into .chat-containers, re-mounts them, one-open-chat rule on mobile
  ui/friends-window.js Friends tab/window: filter, sections, add-friend pop-out, ⋯ menu
  ui/dm-window.js      one DM window/tab per conversation
  ui/profile-button.js Add Friend / Friends button on /profile/{id}
  ui/chat-names.js     "+ friend" hover action in Global/Faction chat
  ui/styles.css        only what the game's CSS doesn't cover; imported as text and added once
test/                  Vitest + jsdom
build.mjs              esbuild → dist/zed-city-friends.user.js
```

**Module rules:**
- Only `api.js` does network I/O. Only `store.js` does storage I/O.
- UI modules get a `services` object (`store`, `mail`, `presence`, `players`, `router`) from `main.js` and never import `api.js` directly.
- **Navigation:** `router.navigate(path)` uses the game's own Vue Router, reached through `document.querySelector('#q-app').__vue_app__.config.globalProperties.$router.push(path)`, so there's no page reload. Vue sets `__vue_app__` in production builds too. If the router isn't found, it falls back to `location.assign(path)`. This is the only place we touch Vue internals, and only to read.
- The store is a small observable: `get()`, `update(fn)`, `subscribe(fn)`. UI modules re-render only their own subtree when the part of the state they use changes.

## 4. UI

### 4.1 Dock placement

- Our elements are ordinary `div.chat-container` nodes with an extra `zcf` class. They're **prepended** into `.chat-containers`, so they sit to the left of the game's chats: `[DM tabs/windows…][Friends][game chats…]`.
- When Vue later inserts one of its own chats, it anchors on its own sibling nodes, so our prepended nodes stay put.
- **Re-mounting:** a single `MutationObserver` on `document.body` (`childList`, `subtree`) checks two O(1) conditions, batched per animation frame: whether our root is still attached, and whether a dock exists. If the game rebuilt the dock, our nodes are re-prepended. All UI is drawn from store state, so re-mounting loses nothing.
- **When no dock exists** (`/create-player`, chat-banned), nothing is shown and the feature waits quietly.

### 4.2 Friends tab and window

- **Minimized tab:** 44×40, the game's minimized style, with `<i class="fas fa-user-friends chat-icon">` in `#3d8b40`. The `.unread-badge` shows the total unread across friends' threads.
- **Open window:**
  - **Header:** `FRIENDS` + `n / N online` + a `⋯` menu (Export friends / Import friends) + a minimize control.
  - **Toolbar:** a **filter input** ("Search friends…") that filters locally, case-insensitive substring on username, matches highlighted, applied to every section. Next to it, a **person-plus icon button** (`fas fa-user-plus`).
  - **Sections:**
    1. **Online** (A–Z)
    2. **Offline** (most recently active first; "Active 12m ago")
    3. **Recent, not friends:** non-system threads from `getChats` page 1 whose other user isn't a friend, newest first, with a message preview and a `+ Friend` action
  - Each section header shows a count. Empty sections show a one-line empty state.
  - **Row:** avatar (26px) with status dot (`#3d8b40` online, `#ef5350` offline), username, status text, and an unread pill if the thread has unread mail.
    - Clicking a row opens that person's DM window.
    - Hovering a row shows **Profile** (`router.navigate('/profile/{id}')`) and **Remove**, which asks "Remove {name} from friends?" in an inline confirm row, not `window.confirm`.
- **Add-friend pop-out:** opens under the person-plus button, overlaying the list.
  - It has an auto-focused search input. After 300ms without typing and 2+ characters (or any all-digits string), it calls `findPlayer`.
  - Up to 8 results: avatar, username, `#id`, and **Add**, or **✓ Friend** if already added.
  - It stays open after an add so you can add several. Esc, clicking outside, or pressing the button again closes it.
- **⋯ Export** copies/downloads JSON: `{v:1, playerId, friends:[{id, username}]}`.
- **⋯ Import** accepts that JSON. It merges by `id`, never removes, and rejects the file if `playerId` doesn't match.

### 4.3 DM windows

- **One per other player**, keyed by user ID. The dock holds at most **4** DM entries (open or minimized). Opening a fifth evicts the one used longest ago, skipping entries with an unread badge unless every entry has one.
- **Header:**
  - avatar + username + `Online` / `Active 5m ago` (from `getChatInfo`, refreshed every 60s while expanded)
  - minimize `—`, close `✕`, and an "open in inbox" link to `/mail/{id}`
  - clicking the name goes to their profile
- **Body:** the game's chat look.
  - `.msg-cont` rows: sender name (the other user's name tinted `#6fb3c8`; yours plain), then `.msg-time`, then `.msg`.
  - Grouping, date dividers and UTC time format as in §2.
  - Scrolling to the top loads the next older page. The view stays pinned to the bottom when you're already at the bottom; otherwise a "New messages ↓" chip appears.
  - At most 200 messages are kept in the DOM per window. Older ones are dropped and reloaded if you scroll up.
- **Input:**
  - Enter sends, Shift+Enter adds a newline, and there's a Send button in the game's `primary` teal.
  - The message appears immediately as pending. When `sendMail` returns, it's matched to the real `message_id`, so it isn't shown twice when the next poll brings it back.
  - If sending fails, the message goes dim (opacity .5) with a red "Failed to send · Retry" line, the same as the game's inbox.
  - Empty and whitespace-only messages are ignored.
- **Minimized:** a 44×40 tab showing their avatar (24px) with a status dot, plus an `.unread-badge`.
- **Close** removes the entry from the dock. **Minimize** keeps it.
- Open and minimized DM entries are saved and come back after a reload.

### 4.4 Incoming messages

- When a `getChats` poll shows a thread with new mail from someone else, what happens depends on who sent it:
  - **A friend:** their DM entry is added to the dock **minimized**, with a badge, or the badge on their existing entry is updated. It never opens on its own.
  - **Anyone else:** the thread just shows in Recent.
  - **System threads** (`is_system`) are ignored. They stay in the game's inbox.
- **Badge number:** `new_mail` if it's a number ≥ 1, otherwise `1` for a thread that is unread.
- **Read status stays in sync with the game.** Minimized tabs never fetch messages. Expanding a DM calls `getChatMessages` page 1, which marks the thread read the same way `/mail/{id}` does. After that, the local badge clears.

### 4.5 Mobile (layout width under 600px, via `matchMedia('(max-width: 599.98px)')`)

- Only one of our windows can be open at a time. Opening one minimizes our others.
- **Opening one of our windows** minimizes any open game chat by calling `.click()` on that chat's `.chat-header`, the game's own toggle.
- **Opening a game chat** minimizes ours. We detect it with a `MutationObserver` on the dock subtree, filtered to `class` attribute changes.
- **We never add or remove classes on `.chat-containers`,** because Vue owns that element and would overwrite the change. Our stylesheet copies the game's `single-chat-mode` rules using `.chat-containers:has(> .zcf.zcf-open)`. Our open window gets `order:1`; our minimized entries get `order:0`.

### 4.6 Profile button (`/profile/{id}`)

- Once the button row has rendered, we find the game's Mail button by its `fa-envelope` icon and **clone its wrapper `div`** (`cloneNode(true)`). We swap the icon to `fa-user-plus` and the label to `Add Friend`, and insert it right after the Trade wrapper, i.e. between Trade and Mail.
- **If Trade and Mail aren't rendered,** we clone the Block button and insert after it, re-coloring the clone to `text-grey-4`.
- **If the only button is Settings (your own profile),** nothing is added.
- **Friend state:** the label becomes `Friends` and the icon `fa-user-check`. Our own class `zcf-is-friend` sets the outline and text to `#81c784`, so we don't depend on Quasar's palette classes. Clicking shows an inline confirm to remove.
- **Click handling:** the clone doesn't carry the game's Vue handlers. We attach our own click listener and strip any `href` or `to` attributes.
- Username and avatar for a new friend come from a `getProfile` call (cached briefly). If that fails, the name comes from the page's username heading.
- **Page changes:** `router.js` triggers this on every change to a `/profile/{id}` route. A short-lived `MutationObserver` watches for the button row and disconnects once the button is inserted or after 10s.

### 4.7 Chat-name action

- **One delegated `mouseover` listener** on `document`. There are no per-message observers. When the pointer enters a `.msg-cont` inside a non-`zcf` `.chat-container`, a single shared `+ friend` element is moved in right after that message's `.sender-name`.
- **Hidden** for your own messages and for names that are already friends (matched case-insensitively on the list's usernames).
- On touch devices, the first tap on a message gives it hover, which reveals the action.
- **Clicking `+ friend`** calls `findPlayer?q={name}` and adds only if there's an exact case-insensitive match. Otherwise it shows "Couldn't find {name}" in a toast.
- **Toasts** are our own minimal toast in the game's colors. We don't reach into Quasar's `Notify`.

## 5. Storage

- **Where:** `localStorage` key `zcf:v1:{playerId}`, one JSON document per player, so alt accounts keep separate lists.
- **Why localStorage:** we run with `@grant none` (§3). The game never calls `localStorage.clear()` (verified in the bundle).
- **Schema:**
  ```json
  {
    "v": 1,
    "friends": { "123": { "id": 123, "username": "Spike", "avatar": "avatars/…png", "addedAt": 1790620900000 } },
    "threads": { "123": { "lastSeenReply": "2026-09-28 14:03:11", "unread": 2 } },
    "dock": { "friendsOpen": false, "dms": [ { "id": 123, "open": false, "lastUsed": 1790620900000 } ] }
  }
  ```
- **Cross-tab sync:** listen for the `storage` event on our key and reload the store, so two game tabs never overwrite each other's friend edits. Every write re-reads the key and applies the change on top, so the last write wins per change, not per whole document.
- **Only in memory, never saved:** presence (online/active), message lists, and the CSRF token.
- **Versioning:** `v` gates migrations. An unknown or corrupt document is backed up to `zcf:v1:{playerId}:corrupt:{ts}`, and the script starts empty rather than crashing.

## 6. Networking

`api.js` exports one function per endpoint in §2. Shared behavior:

- `fetch('https://api.zed.city/' + path, {credentials: 'include'})` with JSON bodies.
- **CSRF:** the token is fetched lazily and cached. On a 403 / `errorCode 403`, it's fetched again and the request retried once.
- **Results:** every call resolves to `{ok: true, data}` or `{ok: false, kind, code, message}`, where `kind` is one of:
  - `auth` — code 1
  - `busy` — codes 3, 5, 6, 7
  - `access` — the mail access message
  - `rate` — HTTP 429
  - `network` — fetch threw, or 5xx
  - `other`
- `api.js` **never redirects the page**, unlike the game's own error handling.

**Polling (via `makePoller`):**

| Poller | Call | Interval | Runs when |
|---|---|---|---|
| threads | `getChats?page=1` | 20s | tab visible and logged in |
| dm:{id} | `getNewMessages` | 3s | that DM is expanded and the tab is visible |
| dmInfo:{id} | `getChatInfo` | 60s | that DM is expanded and the tab is visible |
| presence | `getProfile` for stale friends | 60s | Friends window expanded and tab visible |

- **Hidden tab:** every poller stops on `visibilitychange` → hidden. On → visible, each runs once immediately and then resumes its interval.
- **Backoff:** on `network` or `rate`, the interval doubles up to 5 minutes, and resets after a success.
  - `busy` → the threads poller slows to 60s, and open DMs show "Mail unavailable while {traveling|exploring|in a fight}" and pause sending.
  - `auth` → every poller stops until the next page change, when login is checked again.
- **Presence fetches:** at most 2 `getProfile` requests in flight, 250ms apart. Each friend is refreshed at most once every 60s.
  - Presence also comes for free from `getChatInfo` responses.
  - A friend's saved `username` and `avatar` are updated whenever a response differs, which catches name changes.

**Cost:** with the tab visible and nothing open, the script makes 3 requests a minute. With one DM expanded, it makes 24 a minute. The game's own `/mail/{id}` view makes 60 a minute.

## 7. Error handling and resilience

- **Every entry point is wrapped:** observer callbacks, event handlers, and poller ticks run inside `try/catch`. Errors log once per message key with the prefix `[ZCF]`, and nothing is thrown into the game's code.
- **Missing DOM:** if a selector we rely on (`.chat-containers`, the profile Mail button, `.msg-cont .sender-name`) isn't found where we expect it, that feature quietly does nothing and a single warning is logged. The rest keeps working.
- **Blocked or unmessageable user:** the DM shows "You can't message this player." and the input is disabled.
- **Player not found / invalid ID** (profile or add-friend): a toast says so. The list is unchanged.
- **Removing a friend** doesn't close an existing DM entry with them. The conversation just stops popping up for new mail.

## 8. Performance budget

- **No framework.** The bundle should be under 40 KB unminified.
- **One stylesheet** injected once.
- **DOM observers:**
  - one body-level `childList` observer whose callback does only O(1) checks, batched per animation frame
  - one dock-scoped `class` attribute observer, only on mobile
  - a short-lived profile observer
- **No per-message work in the game's chat.** The chat-name action uses a single delegated listener.
- **Minimal redraws.** DM windows add new messages instead of redrawing the whole list, and the Friends window redraws only when its part of the state changes.
- **Request volume** follows §6: nothing while the tab is hidden, and never more than the game's own inbox view.

## 9. Security

- **Everything from the server or other players is rendered as text,** using `textContent` or DOM text nodes and never `innerHTML`. That covers message bodies, usernames and previews. Newlines are kept with `white-space: pre-wrap`.
- **No links are auto-detected in v1.**
- **Avatar URLs are only ever built from the fixed CloudFront base in §2,** and the avatar path must match `^[\w\-./]+$`. Anything else falls back to the default avatar.
- **Imported JSON is checked strictly:** IDs must be positive integers, usernames are strings of at most 32 characters, and unknown fields are dropped.

## 10. Testing

**Unit tests** (Vitest + jsdom, `npm test`):
- **`api.js`:** CSRF fetched once and reused; 403 → refresh + one retry; error-code → `kind` mapping; never redirects. Uses a mocked `fetch`.
- **`store.js`:** separate keys per player; the `storage` event reloads; migrations; corrupt documents backed up; import merge and validation.
- **`mail.js`:** normalizing object messages; 15-minute same-day grouping; date dividers; UTC formatting (today, yesterday, older); unread diffing from `getChats` rows (friend vs non-friend vs system); optimistic send matched to `message_id`.
- **`poller.js`:** stops when hidden, runs immediately when visible again, backoff doubling and reset, `busy` / `auth` handling. Uses fake timers.
- **`ui/*`:** fixture HTML copied from the live DOM for the dock, profile button row and chat message rows.
  - Our nodes are prepended and re-mount after the dock is replaced.
  - The profile button lands between Trade and Mail, falls back to after Block, and doesn't appear on your own profile.
  - The chat action is hidden for self and existing friends.
  - The mobile one-open rule works.
  - Message text containing HTML shows up as literal text.

**Manual checklist** (on the live game, logged in; recorded in `docs/manual-test.md`):
1. The dock shows the Friends tab; minimizing and expanding matches the game chats' look.
2. Add from a profile, from chat, and from the pop-out search; remove from a profile and from the list.
3. Send and receive DMs with a second account; a minimized friend tab pops up with a badge; the game's inbox badge clears only after expanding.
4. Reload: open DMs and the friends list come back.
5. Phone-width responsive mode: one window at a time, handing off correctly with the game's chats.
6. Traveling or exploring state shows the unavailable notice.
7. The Network panel shows no requests while the tab is hidden.

## 11. Dev adoption notes (for the README)

The README has a "For the Zed City devs" section that maps this design onto the game's own code:

- Each window becomes a Vue SFC.
- `store.js` becomes a Pinia store.
- The dock logic merges into the game's layout component, with no re-mounting hacks needed.

It will also suggest the server-side upgrades that would replace the client-side workarounds:
- a `friends` table with requests and approval
- a batched presence endpoint
- pushing new mail over the existing socket.io connection instead of polling

## 12. Verify during implementation (defaults already specified above)

These points can't be confirmed without a logged-in session. For each, the spec already sets a default, and the implementation must check it against the live API and adjust only these points:

1. Is `getChats[].new_mail` a count or a boolean? The badge rule in §4.4 handles either.
2. Does `getChats[].other_user` include `avatar`? If not, use the default avatar until `getProfile` / `getChatInfo` fills it in.
3. Does `getChatMessages` return each page oldest-first? The game prepends pages, so we assume yes, and we also sort by `id` to be safe.
4. Does `getNewMessages` mark the thread read? It only runs on expanded windows, so this is harmless either way.
5. `sent_at` format: parse both ISO and `YYYY-MM-DD HH:mm:ss` as UTC.
6. Does `getChatMessages` page 1 mark the thread read on the server? §4.4 assumes it does, because the game calls `getStats` right after it to refresh the mail count. If it doesn't, our badge still clears locally, and the game's inbox keeps showing the thread as unread until it's opened there.
7. `__vue_app__.config.globalProperties.$router` is available on `#q-app`. If not, `router.navigate` uses its `location.assign` fallback.
