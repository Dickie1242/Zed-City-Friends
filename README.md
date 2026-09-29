# Zed City Friends

A userscript that adds a **friends list** and **Torn-style DM chat windows** to [Zed City](https://www.zed.city)'s bottom-right chat dock, next to the Global and Faction chats.

- **Private Messages.** A window in the dock with **Chats** (every conversation, newest first, with previews), **Friends** (online first), **Faction** (your faction members) and **Blocked** (unblock in place) tabs. Search any player by name to start a chat. When it's minimized, a green number shows your unread chats.
- **DM windows.** One window per conversation, styled like the game's chat. Minimized DMs become avatar tabs with unread badges, and a friend's new message pops up as a tab.
- **GIFs and emoji.** Pick a GIF or an emoji right from the composer, rendered the same way the game's own chat does, including its custom Zed City emojis.
- **Add Friend button** on player profiles, between Trade and Mail.
- **Friends page.** A friends icon in the top bar opens a full Friends page at `zed.city/friends`. It's a sortable table with level, online status, injured/traveling icons and faction, plus private notes that only you can see.
- **Enemies.** A second list beside Friends: the page title switches between **FRIENDS | ENEMIES** (`zed.city/enemies`), and profiles get an **Add Enemy** button right after Add Friend. Enemies get private notes too, and a red skull marks them in chats, including the game's Global, Faction and Activity chats. A player can be on both lists.

- **Customize any chat.** Every chat in the dock, the game's Global, Faction and Activity included, gets a padlock. Unlock it to drag the chat anywhere by its header, resize it from its edges, and lock it there; the return arrow sends it back to the row. Right-click a padlock for its menu: message size (80–200%, one chat at a time), size reset, return to row, and mute for a DM. Each chat remembers its own size, spot and message size, and your other game tabs follow along. Desktop only; on phones only message size applies.
- **Chat settings.** The cog in the bottom-right corner: mark all chats read, close all private chats, every chat's settings with a Reset, an optional sound for new private messages, the version, and what's new.
- **Mute.** The bell in a DM header mutes that conversation: no pop-up tab, no sound, and it's left out of the green count.

DMs are sent through the game's own **Mail** system. The other player gets your messages in their normal inbox, whether or not they have the script. Nothing leaves `zed.city`: there's no external server, and your friends list is stored in your browser, separately for each player account.

## Install

1. Install a userscript manager, such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the install link and click **Install**:
   https://raw.githubusercontent.com/Dickie1242/Zed-City-Friends/main/dist/zed-city-friends.user.js
   Your userscript manager checks this link for updates, so new versions arrive automatically.
3. Reload www.zed.city.

## How often it checks for messages

Zed City doesn't push new mail to the browser, so the script checks on a timer:

| What you're doing | New messages appear within | Requests / minute |
|---|---|---|
| In a DM conversation | ~2s in that window, ~5s elsewhere | ~43 (the game's own inbox page: 60) |
| Chatted in the last 5 minutes | ~5s | 12 |
| Idle | ~15s (the game's envelope badge: 60s) | 4 |
| Game tab in the background | checked the moment you return | 0 |

While the Private Messages window or Friends page is open, it also refreshes online/last-active status for your friends list, capped at 20 `getProfile` calls a minute (stalest friends first) no matter how many friends you have.

## Backup

In the Private Messages window, **⋯ → Export friends** downloads your list as JSON. **Import friends** merges a file back in; it only adds friends and never removes any. Enemies and notes travel in the same file.

## Development

```bash
npm install
npm test          # Vitest + jsdom unit tests
npm run build     # writes dist/zed-city-friends.user.js
```

`src/` is plain ES modules with no framework. `build.mjs` bundles it with esbuild into one readable userscript.

| Path | Responsibility |
|---|---|
| `src/api.js` | The only code that talks to `api.zed.city` (CSRF, error kinds; never redirects) |
| `src/store.js`, `src/state.js` | The only code that touches storage, plus pure state mutators |
| `src/mail.js`, `src/time.js` | Message/thread normalization, grouping, UTC time formatting |
| `src/conversation.js` | One DM thread: paging, new messages, optimistic sends |
| `src/inbox.js` | Thread-list polling, unread badges, friend pop-ups |
| `src/poller.js` | Visibility-aware timers with backoff |
| `src/presence.js`, `src/players.js` | Online status cache, player search/lookup |
| `src/router.js` | Page-change events and navigation via the game's router |
| `src/settings.js`, `src/enemies.js` | The settings and enemies documents (kept beside the main one) |
| `src/chat-custom/*` | Pure per-chat customization: keys and limits, geometry, the user stylesheet |
| `src/ui/chat-custom/*` | Padlocks, grips, drags and the chat menu in every chat |
| `src/app.js` | Wiring and polling policy |
| `src/ui/*` | Dock mounting, Private Messages window, DM windows, profile button |

Design specs: `docs/superpowers/specs/` (0.5.0: `2026-09-29-private-messages-and-chat-settings-design.md`)

## For the Zed City devs

Everything here maps onto the game's own code:

- Each window (`ui/pm-window.js`, `ui/dm-window.js`) is a Vue SFC waiting to happen. The markup already uses the dock's `.chat-container` / `.chat-header` / `.chat-content` classes.
- `store.js` / `state.js` become a Pinia store. The dock logic in `ui/dock.js` goes away once the windows render inside the layout component.
- Only the existing endpoints are used: `getChats`, `getChatInfo`, `getChatMessages`, `getNewMessages`, `sendMail`, `getProfile`, `findPlayer`, `getFactionMembers`, `blockList`, `unblockUser`.

Server-side changes that would remove the client-side workarounds:

1. **Push new mail over the existing socket.io connection** (for example a `new-mail` event), instead of the client polling `getChats` and `getNewMessages`.
2. **A `friends` table** with requests and approval, synced across devices, instead of per-browser storage.
3. **A batched presence endpoint** (online / last active for a list of ids), instead of one `getProfile` per friend.
