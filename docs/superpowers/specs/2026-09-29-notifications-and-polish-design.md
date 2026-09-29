# Zed City Friends 0.6.0 Design: Never Miss a Message, Polish and Phones

**Date:** 2026-09-29
**Ships as:** 0.6.0
**Builds on:** [2026-09-29-private-messages-and-chat-settings-design.md](2026-09-29-private-messages-and-chat-settings-design.md) (0.5.x).
**Status:** designed with the user and approved (the user picked the two directions, phone layout B, notification content, who notifies, pinning from the row, a Friends-only switch, and the skull fix).

---

# Part 1: Never miss a message

## 1.1 Desktop notifications

- **Off by default.** Chat settings gets a **Desktop notifications** toggle.
  - Turning it on calls `Notification.requestPermission()` (the click is the user gesture browsers require).
  - If permission is `denied`, the toggle turns back off and a note reads "Notifications are blocked for zed.city in your browser's site settings."
  - If the browser has no `Notification` API, the toggle is disabled with "Not supported in this browser."
- **Friends only:** a second toggle under it, off by default and disabled while notifications are off. When on, only friends' messages notify.
- **When one fires:** a thread poll finds new unread mail from another player (the same `onNewMail` signal as the sound, at most once per poll), notifications are on, permission is `granted`, and the game doesn't have focus (`!document.hasFocus()`, which covers a hidden tab, a minimized window and another app in front).
  - Never for muted chats or your own sends (the inbox already leaves those out of `onNewMail`).
  - At most 3 notifications per poll, newest first.
- **What it shows:** title = the sender's name, body = the message preview (`previewText`, cut to 120 characters), icon = their avatar (`avatarUrl`). Tag `zcf-dm-{userId}`, so a newer message from the same player replaces the older notification, and a second game tab's copy replaces the first instead of doubling up.
- **Clicking it:** `window.focus()`, then `actions.openDm(id, { expand: true })`, then close the notification.

## 1.2 Background checks for notifications

- Today every poller stops while the tab is hidden.
- `makePoller` gets an optional `hiddenInterval` (a function returning ms, or null). While the document is hidden and it returns a number, the poller keeps running at that interval; otherwise it stops as today.
- Only the thread poller uses it: `hiddenInterval = notifications on and permission granted ? 60000 : null`. That's the pace of the game's own envelope badge; with notifications off nothing changes.
- Browsers throttle hidden timers to about once a minute anyway, so 60s is honest.

## 1.3 Unread count in the browser tab title

- The tab title becomes `(N) <game title>`, where N is the same number as the Private Messages green count (`chatsUnreadTotal`, muted chats left out). No prefix when N is 0.
- **On by default**, with a Chat settings toggle **Unread count in the browser tab**.
- The game rewrites `document.title` on route changes (Quasar meta), so a `MutationObserver` on the `<title>` element re-applies our prefix. We strip only our own `^\(\d+\) ` prefix and never touch the rest of the title; writes that don't change the title are skipped so the observer can't loop.

## 1.4 Pinned chats

- **Pin from the row:** a pin button (`fas fa-thumbtack`) on each Chats row, shown on hover and keyboard focus, always shown on touch devices (`hover:none`) and on pinned rows. Click to pin or unpin; the click never opens the chat.
- **Order:** pinned chats first (newest `lastReply` first among themselves), then the rest as today. Pinned rows show the pin highlighted.
- **Always listed:** a pinned player whose thread isn't loaded (older than the loaded pages) still gets a row, named from friends, open DMs or enemies (else `#id`), with no preview or time. Clicking it opens the DM as usual.
- **Storage:** `pinned: [userId, …]` in the settings document (positive integers, no duplicates, at most 20). Pinning a 21st shows a toast "You can pin up to 20 chats." Other tabs follow along live.

---

# Part 2: Polish and phones

## 2.1 Phone dock: the open window gets its own row (option B)

- On phones (`max-width: 599.98px`), when one of our windows is open, the dock wraps: the open window takes a full-width row, and every bubble (ours and the game's) stays on a row underneath.
- CSS only, keyed with `:has()` so nothing is written to the Vue-owned `.chat-containers`:
  - `.chat-containers:has(> .zcf-root > .zcf.zcf-open)` gets `flex-wrap: wrap-reverse; left: 10px` (with the game's `right: 10px`, the dock spans the screen minus 20px).
  - Under the same `:has()` condition, the open window gets `flex: 0 0 100%; width: 100%; max-width: none`.
  - Where `:has()` isn't supported, both rules are ignored and the 0.5 layout remains.
- The game's own open chat (phones allow one open window) keeps the game's layout.
- The Private Messages window on phones uses `height: min(450px, 60vh)` like DMs.

## 2.2 Local time option

- Chat settings: **Message times:** `Game time (ZCT)` (default, matches the game) or `Your local time`. Stored as `localTime: true|false`.
- Applies to DM message times (`formatMessageTime`), day dividers and grouping by day (`buildLog`). Relative times ("4 min ago") don't change.
- Changing it redraws open DM windows.

## 2.3 Fixes from the 0.5.0 review (all logged as Minor)

1. **Unblock while more blocked players are loading:** the reload after an unblock waits for the running load instead of being dropped.
2. **Faction tab errors:** an `auth` error shows the inline "Couldn't load. Retry"; `busy`, `rate` and `network` keep loaded members (or show the retry line before any loaded); only other errors mean "You're not in a faction."
3. **No sound burst:** a poll-triggered sound plays only when the AudioContext is already running; the ▶ test button (a click) resumes it first and then plays.
4. **Touch dragging on tablets (≥600px):** unlocked headers and all bubbles get `touch-action: none` through `#zcf-user-settings`/our stylesheet, so a touch drag isn't taken over by scrolling.
5. **Chat menu focus:** closing it returns focus to its padlock; a redraw restores focus to the same button, or the nearest enabled one; it repositions after its chat moves.
6. **Lost row clicks:** the Private Messages list redraws triggered by the store also respect the pointer-down guard (a redraw between pointerdown and click is held until after the click).
7. **Destroy:** the dock view gets `destroy()`, which destroys the PM window (faction poller, document listeners), the DM windows and the settings window; `app.destroy()` calls it.
8. **Own profile:** once the profile is known to be yours (the Settings button is there), both profile buttons stop watching the page.
9. **Skull queue:** the game-chat marker queue is capped (500 nodes); past the cap it drops the queue and rescans the visible rows on the next frame instead.
10. **Resize cost:** each pointer move during a resize updates only the stylesheet and that chat's header controls, not a full refresh.
11. **Empty Chats tab:** shows "No conversations yet." when page 1 has no conversations.
12. **Sound picker focus:** the Chat settings redraw keeps focus on the sound picker and ▶ button.
13. **Enemies list skull alignment:** the skull and the name chip sit in one inline flex row (`align-items: center`), so the skull is centred against the chip.

---

# Part 3: Settings and storage

- **Chat settings sections** (new rows in bold):
  1. Utilities (unchanged)
  2. Your chats (unchanged)
  3. **Notifications:** Desktop notifications, Friends only, Unread count in the browser tab
  4. Sounds (unchanged)
  5. **Display:** Message times
  6. About (unchanged, What's new gets a 0.6.0 entry)
- **Settings document** (`zcf:v1:{id}:settings`) gains `notify` (false), `notifyFriendsOnly` (false), `titleCount` (true), `pinned` ([]), `localTime` (false). `normalizeSettings` validates each (booleans, pinned as in §1.4). Older versions don't read this document, so no migration.
- **Actions:** `setNotify(on)` (asks for permission when turning on), `setNotifyFriendsOnly(on)`, `setTitleCount(on)`, `togglePin(id)`, `setLocalTime(on)`.

# Part 4: Modules

| Module | Status | Contents |
|---|---|---|
| `src/notify.js` | new | `createNotifier({ win, onOpen })`: `supported`, `permission()`, `request()`, `show({ id, title, body, icon })` |
| `src/ui/title-count.js` | new | `createTitleCount({ doc })`: `set(n, enabled)`, `destroy()` |
| `src/poller.js` | changed | `hiddenInterval` |
| `src/settings.js` | changed | new fields, `setPinned`/`togglePinned`, `MAX_PINNED` |
| `src/pm-view.js` | changed | pinned-first rows and stub rows for unloaded pins |
| `src/ui/pm-window.js` | changed | pin buttons; the fixes in §2.3 (1, 2, 6, 11) |
| `src/time.js`, `src/mail.js` | changed | `local` option for message times, dividers and day grouping |
| `src/ui/dm-window.js` | changed | local time, redraw on change |
| `src/ui/settings-window.js` | changed | Notifications and Display sections, focus fix |
| `src/sound.js` | changed | `play(name, { fromUser })` |
| `src/ui/chat-custom/*`, `src/ui/enemy-marks.js`, `src/ui/profile-button.js`, `src/ui/dock-view.js`, `src/ui/friends-page.js` | changed | fixes in §2.3 |
| `src/ui/styles.js` | changed | phone dock, pin buttons, settings rows, skull row, touch-action |
| `src/app.js` | changed | wiring: notifier, background interval, title count, actions |
| `src/whats-new.js` | changed | 0.6.0 entry |

# Part 5: Testing

- **Unit:** notifier with a fake `Notification` (permission states, tag, click opens the DM); poller `hiddenInterval` (runs while hidden only when set, stops otherwise); title count (prefix, zero, game rewrites, no loops); settings normalization of the new fields and the pin cap; pinned ordering and stub rows; local-time formatting and day grouping.
- **App:** a new message notifies only when unfocused and notifications are on and permitted; Friends only skips non-friends; muted never notifies; the thread poll keeps going while hidden only with notifications on.
- **UI:** pin buttons (pin, unpin, cap toast, never opens the chat); settings toggles; each §2.3 fix gets a regression test.
- **Styles:** order independence still holds; the phone dock rule is present and gated by `:has()`.
- **Visual check:** re-run `tools/preview` (desktop and phone), plus a phone scene with an open window to confirm layout B.

# Out of scope

Player cards, ignore lists and keyword alerts (the other two directions offered) are left for later.
