# Zed City Friends 0.8.0 Design: Torn-style dock (windows above the bar)

**Date:** 2026-09-30
**Ships as:** 0.8.0
**Status:** approved in chat, from the user's Torn screenshots: "mimics torns a lot plus my custom decisions".

## Why

In Torn, the chat icons stay in a bar along the bottom, and an open chat's window sits above the bar, right-aligned. Open "Your private chats" and it fills in above the cog. Then open Settings, and Settings takes the corner while the private chats window moves left. Zed City (and so far our script) opens a chat in the row itself: its bubble turns into the window and the other bubbles shift. The user wants Torn's layout.

## Decisions (user)

- Every chat works this way, including the game's Global, Faction and Activity.
- While a chat is open, its icon **stays** in the bar with a **teal highlight**. Clicking the icon closes the window.
- Phones stay as they are (they already put the open window above the bubbles).

## Design (desktop, min-width 600px)

### 1. Two rows, CSS only (`src/ui/styles.js`)

- `.chat-containers` wraps upward (`flex-wrap: wrap-reverse`), right-aligned (`justify-content: flex-end`). A zero-height `::after` item with `flex-basis: 100%` breaks the line between the bar and the windows. The game already sets `pointer-events: none` on the dock (its chats set `auto`), so a wider dock blocks no clicks.
- Fixed `order` values, bar first (with wrap-reverse, the first line is the bottom one):
  - Bar: DM tabs and their stand-ins 1, Activity 2, Faction 3, Global 4, Private Messages 5, cog 6.
  - Line break (`::after`): 10.
  - Windows (open, docked): DMs 11, Activity 12, Faction 13, Global 14, Private Messages 15, Chat settings 16.
- DMs share order 1 or 11, so among them the DOM order (the store order, as today) decides. Each DM's stand-in sits right after its window in the DOM, and only one of the pair is in the bar at a time.
- Game chats get their order from our stylesheet only (`body .chat-containers > .chat-container.general-chat{order:4}`, plus `:not(.chat-minimized){order:14}`). The game sets no `order` itself; we never touch its attributes.
- Moved chats (unlocked and dragged) are `position: fixed`, so they're out of this flow and stay where they were put. "Return to row" puts them back in the window row.
- The gap between the bar and the windows stays the game's 5px (the break line's extra row gap is cancelled).

### 2. Stand-in icons

- **A stand-in:** our own element, `chat-container zcf chat-minimized zcf-stand`, with `data-zcf-stand="<chat key>"` and never `data-zcf-chat`. It has the same bubble look as a minimized chat (the game's minimized-header rules apply), plus the highlight: a teal inset top line and a teal tint (`box-shadow: inset 0 2px 0 #0a748f`, like the active Private Messages tab).
  - **Private Messages:** the envelope.
  - **Chat settings:** the cog.
  - **A DM:** its avatar and name, like the DM's own minimized tab (`zcf-stand-dm` shares the tab's desktop rules).
  - **Game chats:** the game chat's own icon, copied from its header, with the Faction campground rule repeated for its stand-in.
- **Shown:**
  - For our windows, while the window is open: each window's `update()` toggles its stand-in's `hidden`.
  - For game chats, while the chat is open: pure CSS, `.chat-containers:has(> .general-chat:not(.chat-minimized)) .zcf-stand[data-zcf-stand="game:general"]`. Without `:has()` support, the stand-in simply isn't shown (today's behaviour).
- **Click:** closes that window.
  - DM: `actions.minimizeDm(id)`.
  - Private Messages: `actions.togglePm()`.
  - Settings: `actions.toggleSettings()`.
  - Game chat: clicks the game chat's own `.chat-header`, the game's toggle, the same way `dock.minimizeGameChats` does.
- **Where:**
  - Each window module (`dm-window.js`, `pm-window.js`, `settings-window.js`) returns `stand` next to `el`.
  - `dock-view.js` places each stand-in right after its window, then the three game stand-ins last.
  - `findChats` only reads `[data-zcf-chat]`, so the stand-ins stay invisible to chat customization, marks and the phone rule.
- **Phones:** stand-ins are hidden (`display: none` under 600px), and every phone rule stays as it is.

## Tests

- `styles.test.js`, using the cascade helper, at 1280px and in both stylesheet orders:
  - The dock wraps upward and aligns right.
  - The break item's order and basis.
  - The bar and window orders for game chats and ours.
  - Stand-ins hidden on phones.
- `dock-view.test.js`:
  - A stand-in follows each window.
  - Our stand-ins show only while their window is open.
  - Clicks close the right window.
  - The game stand-in clicks the game chat's header.
- Existing tests that list `root.children` count only `[data-zcf-chat]` children.
- Preview harness: a `pm-settings` desktop scene (Private Messages and Chat settings open, like the Torn screenshot), checked with the scenes that already exist.

## Release

0.8.0. `WHATS_NEW` gets a `0.8.0` entry: "Chats open above their icons, like Torn: the icons stay along the bottom (the open ones in teal), and windows line up above them from the right."

## Plan

1. Stand-ins in the three window modules and dock-view, plus the game stand-ins (tests first).
2. The desktop two-row CSS and stand-in CSS (cascade tests first).
3. The harness scene, a visual check against the Torn screenshots, and tweaks.
4. 0.8.0: What's new, README line, version, build. Then one review, and fix only Critical/Important findings.
