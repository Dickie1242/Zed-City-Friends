# Zed City Friends 0.7.0 Design: Chat settings, redone

**Date:** 2026-09-29
**Ships as:** 0.7.0
**Builds on:** [2026-09-29-notifications-and-polish-design.md](2026-09-29-notifications-and-polish-design.md) (0.6.0) and [2026-09-29-private-messages-and-chat-settings-design.md](2026-09-29-private-messages-and-chat-settings-design.md) (§B.4 settings window, §D.2 What's new).
**Status:** designed with the user and approved from mockups (`.superpowers/brainstorm/`, screens `current`, `layout`, `controls`, `chats-tab`, `full-design`).

## Why

The user found Chat settings lackluster, and agreed with all five problems found:

1. The chat list takes over: rows of "docked · default size · text 100%" at the top, and the only thing you can do there is Reset.
2. The real settings (notifications, sound, time) are buried below the fold.
3. It doesn't look like the game: browser checkboxes, a browser dropdown, tiny grey headings, no icons.
4. There isn't much to set.
5. What's new is a wall of text.

## What the user picked

- **Layout A: tabs.** General · Chats · About, the same tab strip as Private Messages.
- **Controls B: checkboxes and dropdowns**, restyled as the game's own (Quasar) controls, not switches. ("maybe I'm old school")
- **Chats tab B: tap a row to open its controls**, one row at a time.
- **All eight extras:** sound volume, test notification, mentions in game chats, 12-hour clock, backup & restore (with settings), text size for every chat, check for updates, restore defaults.
- **Mentions:** your name plus words you add; a highlight plus an optional mention sound (off by default). No desktop notification for mentions.

---

# Part 1: The window

## 1.1 Tabs

- The window body becomes a tab strip plus one panel. Tabs: **General**, **Chats**, **About**, styled exactly like `.zcf-pm-tabs` / `.zcf-pm-tab` (Oswald, uppercase, a 2px teal top line on the active tab). Share the CSS rather than copy it.
- The last tab is remembered in the settings document (`settingsTab`, default `general`), like `pmTab`.
- Each tab scrolls on its own; switching tabs starts at the top. The header (cog, title, padlock, chevron) is unchanged.
- Keyboard: tabs are buttons with `role="tab"` / `aria-selected`, the panel is `role="tabpanel"`. Arrow keys aren't needed.

## 1.2 Look

- **Section headings:** Oswald 11.5px uppercase, `#9e9e9e`, each with a small teal (`#6fb3c8`) Font Awesome icon: bell (Notifications), volume-up (Sounds), at (Mentions), clock (Time), bolt (Quick actions), comments (Game chats), envelope (Private chats), bell-slash (Muted), star (What's new), save (Your data).
- **Checkboxes:** a real `<input type="checkbox">` with `appearance:none`, drawn like Quasar's dark checkbox: 16px square, 2px `#ffffffb3` border, radius 2px; checked = `#0a748f` fill with a white check (Font Awesome `\f00c` in `:checked::after`, or an inline SVG background). Disabled = 45% opacity. Focus ring visible (`:focus-visible` outline in teal).
- **Dropdowns:** a real `<select>` restyled as Quasar's underlined field: no box, a 1px `#ffffff4d` bottom border, `#e6e6e6` text, a small caret; the option list stays the browser's.
- **Volume:** a real `<input type="range">` with `accent-color:#0a748f`, 120px wide.
- **Text fields:** underlined like the select.
- **Descriptions:** every setting that needs it gets a grey line under its label (11px, `#ffffff66`). Wording is in the tab sections below.
- Buttons keep `.zcf-page-btn` (quick actions, backup) and `.zcf-mini` (Test, Unmute, row controls); the danger style `.zcf-page-danger` for Restore default settings.

## 1.3 Phones

Same three tabs. The window already takes the full-width row on phones (0.6.0 layout B); nothing else changes.

---

# Part 2: General tab

In order:

### Notifications
- ☐ **Desktop notifications**: "Pop up outside the game when a PM arrives". Behaviour unchanged (0.6 §1.1). A **Test** button (`.zcf-mini`) sits on the right of this row.
  - Test is enabled only while notifications are on. It shows `notifier.show({ id: 0, title: 'Zed City Friends', body: 'This is how a new private message will show up.' })`. If it returns null, toast "Your browser didn't show it. Check its notification settings."
  - The blocked / unsupported note (existing `permissionNote()`) stays under this row.
- ☐ **Friends only** (indented under it, disabled while notifications are off). Unchanged.
- ☑ **Unread count in the browser tab**: "Like (2) Zed City". Unchanged.

### Sounds
- **New private message** [Off / Chirp / Ping / Bell ▾] [▶]: unchanged.
- **Mention** [Off / Chirp / Ping / Bell ▾] [▶]: new `mentionSound`, default `off`.
- **Volume** [slider 0–100, step 5]: new `volume`, default 100. 100 is today's loudness; it scales every tone's peak gain linearly (`peak × volume / 100`, 0 = silent). On `change` (release), it plays the private-message sound, or the mention sound if that one is off, so you hear the new level. If both are off, it stays silent.
- ▶ buttons are disabled when their sound is Off.

### Mentions
- ☑ **Highlight messages that mention you**: "In Global and Faction: your name, {playerName}". New `mentions`, default **on**. The highlight is quiet, so on by default fits the "quiet UI" rule; the sound stays off by default.
- **Also:** [text field]: "Words or names, separated by commas". New `mentionWords`, default `[]`. Saved on `change` (blur or Enter). Split on commas, trim, drop empties and duplicates (case-insensitive), keep words of 2–30 characters, at most 10. The field then shows the cleaned list joined by ", ". Disabled while highlighting is off.

### Time
- ☐ **12-hour clock**: "2:27 PM instead of 14:27". New `clock12`, default off.
- ☑ **Your own time in the time hover**: "Under ZCT, when you rest on a chat time". Unchanged (`hoverLocal`).

### Quick actions
- [Mark all as read] [Close all private chats]: unchanged, moved to the bottom of General.

---

# Part 3: Chats tab

## 3.1 Text size for every chat

- Top row: **Text size for every chat**: "Sets them all; change one below" [− 100% +].
- New setting `textAll`, default 100, same range and step as a chat's text size (80–200%, step 10).
- Pressing − or + sets `textAll` **and clears every chat's own `text`**, so every chat follows it.
- A chat's text size is now `entry.text ?? textAll`. `textOf(entry)` becomes `textOf(entry, textAll)`. Everything that applies text size (user-style.js, the chat header's −/+ controls) passes `textAll`.
- A chat's own text is stored only when it differs from `textAll`. `updateChat` drops a `text` equal to `textAll`. `normalizeChatEntry` keeps any valid `text`, including 100, since 100 is an override when `textAll` isn't 100. `normalizeSettings` then drops entries' `text` equal to the document's `textAll`, so old documents (where 100 was never stored) keep working.

## 3.2 Chat rows

- Two groups:
  - **Game chats:** Global, Faction, Activity.
  - **Private chats:** Private Messages, then open DMs and closed DMs that still have settings (by name), then Chat settings itself last.
- Which chats are listed is unchanged from today (`chatRows()`): everything that exists now or has settings.
- **A row:** a status padlock icon (yellow `fa-lock-open` when unlocked, grey `fa-lock` when locked; status only), the name, one plain-words line, and a chevron (right when closed, down when open).
  - The line is teal when anything is changed, grey otherwise.
  - Plain words: the parts that differ from default, joined by " · ": "Moved", "Resized" (any saved width or height; the panel shows the numbers), "Text 120%" (own text only), "Unlocked". Nothing changed = "As the game made it" for game chats, "As it came" for ours.
  - `describeChat` is replaced by this; it stays pure and tested.
- **Tapping a row** opens its panel under it and closes any other; tapping it again closes it. The open row survives redraws (it's view state, like `showNews`). Panel lines:
  - **Locked** / **Unlocked: drag it anywhere** [Unlock / Lock]: `updateChat(key, { locked: false | null })`, the same state the chat's own padlock sets.
  - **Text size** [− 120% +]: this chat's own size, stepping from what it shows now.
  - **In the dock** / **Moved** [Back to the dock]: clears `x` and `y`. The button is only there when moved.
  - **Default size** / **460 × 520** (or "420 × auto") [Default size]: clears `w` and `h`. Only when resized.
  - [Reset everything]: `resetChat(key)`. Only when anything is changed.
- **Reset all chats** stays under the Private chats group (disabled when nothing is customized). It also resets `textAll` to 100.

## 3.3 Muted

- Section **Muted** with a count on the right, listing `settings.muted`, newest first.
- Each row: a small avatar (when known), the name, and [Unmute] (`actions.toggleMute(id)`). Clicking the name opens the DM (`actions.openDm(id, { expand: true })`).
- Names come from what we already know: open DMs, friends, enemies, then the inbox threads. Unknown ids show `#12345`. No extra API calls.
- Empty: "No muted chats. Mute one with the bell in its header."

---

# Part 4: About tab

## 4.1 Version and updates

- **Zed City Friends v0.7.0**, then [Check for updates].
- Clicking it fetches the `@updateURL` (the raw GitHub `dist/zed-city-friends.user.js`; raw.githubusercontent.com sends `Access-Control-Allow-Origin: *`, and zed.city has no CSP), with `cache: 'no-store'`. It reads `// @version x.y.z` from the header and compares it numerically with `VERSION`.
  - While checking: "Checking…".
  - Same or older: green "✓ You're up to date".
  - Newer: yellow "v0.7.1 is out", and an **Update now** link that opens the same URL in a new tab, where Tampermonkey offers the update.
  - Failure (network, no version found): "Couldn't check. Try again later." with the button active again.
- The result lasts until the window closes. There's no automatic checking; Tampermonkey already does that.
- The update URL becomes a constant in `src/version.js` (`UPDATE_URL`), and `build.mjs` uses the same value for `@updateURL` / `@downloadURL`. A test checks they match.

## 4.2 What's new, short

- **What's new in 0.7.0:** one row per feature title with a chevron; tapping a title shows its points under it (several can be open).
- **Earlier versions ▸** reveals each older version as a small heading (`v0.6.0 · 2026-09-29`) followed by its feature title rows, which open the same way.
- Nothing is open by default, so the section is a handful of lines. No badge or dot, ever (user veto, 0.5 §D.2).
- `WHATS_NEW` gets a 0.7.0 entry (below). The data shape is unchanged.

## 4.3 Your data

- "Friends, enemies, notes and these settings, in one file."
- [Save backup]: downloads `zed-city-friends-{playerId}.json`, holding `{ v: 1, playerId, friends, enemies?, settings }`. `settings` is the whole settings document.
- [Load backup]: a file picker. Friends and enemies merge exactly as Import does today. If the file has `settings`:
  - It's normalized (`normalizeSettings`; an invalid one is ignored with a note in the toast).
  - It replaces the current settings, except `muted` and `pinned`, which are merged: the backup's first, then ours, deduplicated and capped at `MAX_MUTED` / `MAX_PINNED`.
  - The toast adds "Settings restored."
  - Files without `settings` (every export before 0.7.0) load as before.
- The Private Messages ⋯ menu's **Export friends / Import friends** become **Save backup / Load backup** and do the same thing. One file format, two places.
- [Restore default settings] (danger style): asks inline, "Put every setting back to how it came? [Restore] [Cancel]". Restore resets the settings document to `defaultSettings()` but keeps `muted`, `pinned`, `pmTab` and `settingsTab` (so the window doesn't jump to General). Friends, enemies and notes live in other documents and are untouched.
  - The note under the button: "Keeps your friends, enemies, pins and mutes."
  - Desktop notifications go back to off, like every other default.

## 4.4 Dev link

"Become friends or enemies with the dev!" stays, as the last line of About.

---

# Part 5: Mentions in game chats

## 5.1 What counts

- The words: your own username (`playerName`) and `mentionWords`.
- A match is case-insensitive and whole-word. The character before and after must not be a letter, digit or underscore (Unicode-aware: `(?<![\p{L}\p{N}_])word(?![\p{L}\p{N}_])` with the `iu` flags, word regex-escaped). So "@Moth", "moth," and "MOTH!" match, and "mothball" doesn't.
- Only the message text is searched, never the sender name or the time.
- Only rows in `.general-chat` and `.faction-chat`. Never Activity, never our own windows.
- Never your own messages (sender name equals `playerName`, case-insensitive).
- The matcher is pure (`src/mentions.js`: `makeMatcher(words) → { test(text), ranges(text) }`), rebuilt only when the words change.

## 5.2 How it looks

- **The message:** a soft yellow tint and a 3px yellow left bar on the whole message (`background:#f2c03714; box-shadow: inset 3px 0 #f2c037`).
  - The game's row is Vue-owned, so we never touch its attributes. We insert our own hidden marker `<i class="zcf-mention-flag" hidden>` into the row, like the enemy skull, and style the row with `.msg-cont:has(.zcf-mention-flag)` in our stylesheet.
- **The matched words:** yellow (`#f2c037`) through the CSS Custom Highlight API (`CSS.highlights.set('zcf-mention', highlight)` plus `::highlight(zcf-mention){color:#f2c037}`). This changes no DOM at all.
  - We keep the ranges in one `Highlight` and prune ranges whose text node is no longer connected on each pass. At most 300 ranges; the oldest go first.
  - Browsers without `CSS.highlights` just get the row tint.
- Turning highlighting off, or changing the words, removes every flag and clears the highlight, then re-scans the chats on screen.

## 5.3 The mention sound

- Plays `mentionSound` (when not off) for a mention in a row that **arrives while you're here**. All three must hold:
  - The row came from the mutation observer, never from the first scan or a refresh.
  - That observer pass added at most 5 rows to that chat. A chat rendering its history adds many rows at once.
  - Its time (`gameClock.momentOf`) is within the last 2 minutes.

  So opening a chat full of old history stays silent, even when an old message's HH:MM happens to look recent.
- At most one mention sound every 5 seconds.
- Same rule as the private-message sound: stays quiet when another game tab has focus (`tabFocus.elsewhere()`).
- Uses the shared volume.

## 5.4 Wiring

- `createEnemyMarks`' `onRow(row)` becomes `onRow(row, { fresh })`. `fresh` is true for rows from the observer when that pass added at most 5 rows to the row's chat container, and false otherwise (bigger batches, `refresh()`).
- The app passes one `onRow` that calls `gameClock.rewrite(row, 'game')` and then `mentionMarks.mark(row, { fresh })`.
- New `src/ui/mention-marks.js`: `createMentionMarks({ doc, win, words, enabled, myName, onMention })`, with `mark(row, { fresh })` and `destroy()`. `mark` first clears what it did to that row before, so re-marking is safe. `onMention` is the app's sound call (throttle, tab focus, 2-minute check).
- A settings change to `mentions` or `mentionWords` calls `marks.refresh()`, which re-runs `onRow` on every row with `fresh:false`.

---

# Part 6: 12-hour clock

- `formatClock(ts, local, h12 = false)`: 24-hour "14:27", or with `h12` "2:27 PM" (no leading zero, space, uppercase AM/PM; 00:05 is "12:05 AM").
- `formatMessageTime`, `formatStamp` and friends take the same flag and pass it down.
- The flag comes from `settings.get().clock12`:
  - `dm-window` reads it through services.
  - `time-hover` gets a `clock12()` getter like `showLocal()`.
  - `game-clock`'s `rewrite(row, want, { h12 })` rewrites the game's time span whenever the shown text differs, which now includes a 12-hour format even when the game already prints the right clock. `printedOf` already remembers the game's own "HH:MM", so parsing stays on the original.
- Toggling it redraws the open DMs and calls `marks.refresh()` for the game chats.
- Relative times ("50 min ago") are unchanged.

---

# Part 7: Settings document

New fields in `defaultSettings()` / `normalizeSettings()` (still `v: 1`, and every field optional in older documents):

| Field | Type | Default | Normalized |
|---|---|---|---|
| `settingsTab` | `'general' \| 'chats' \| 'about'` | `'general'` | unknown → `'general'` |
| `mentionSound` | one of `SOUNDS` | `'off'` | unknown → `'off'` |
| `volume` | integer 0–100, step 5 | `100` | clamped, rounded to 5; non-number → 100 |
| `mentions` | boolean | `true` | `!== false` |
| `mentionWords` | string[] | `[]` | trimmed, 2–30 chars, deduped (case-insensitive), max 10 |
| `clock12` | boolean | `false` | `=== true` |
| `textAll` | 80–200, step 10 | `100` | `clampText`; non-number → 100 |

`FLAGS` gains `mentions` and `clock12`. New pure helpers: `setSettingsTab`, `setMentionSound` (or a generalized `setSound(s, which, name)`), `setVolume`, `setMentionWords` (returns the cleaned list), `setTextAll` (sets it and clears every chat's own `text`), `restoreDefaults(s)` (keeps `muted`, `pinned`, `pmTab` and `settingsTab`), and `applyBackupSettings(s, incoming)`. `resetAllChats` also sets `textAll` back to 100.

---

# Part 8: What's new 0.7.0

```
0.7.0 · (date = the day the release commit is made)
- Chat settings, reorganised: General, Chats and About tabs. Change a chat's lock, text size, spot and size right from its row, or the text size of every chat at once. Unmute chats from the Muted list.
- Mentions: messages in Global and Faction that say your name (or words you add) are highlighted, with an optional mention sound.
- Sounds and time: a volume slider, a test button for desktop notifications, and a 12-hour clock.
- Backup: one file now holds your friends, enemies, notes and settings. Check for updates and restore default settings in About.
```

---

# Part 9: Tests and checks

- **Pure:**
  - `settings.test.js`: new fields, normalization, `setTextAll` clears overrides, `restoreDefaults` keeps muted/pinned/pmTab/settingsTab, `mergeBackupSettings`.
  - `chats.test.js`: `textOf` with `textAll`, the plain-words description, `updateChat` dropping a `text` equal to `textAll`.
  - New `mentions.test.js`: whole-word, case, `@`, punctuation, Unicode names, regex characters in words, ranges.
  - `time.test.js`: 12-hour formatting incl. midnight and noon.
  - `backup.test.js`: round trip with settings, old files without settings.
  - `sound.test.js`: volume scaling and 0 = silent.
  - `version.test.js`: `UPDATE_URL` matches build.mjs; the version comparison.
- **UI (jsdom):**
  - `settings-window.test.js`: tabs and the remembered tab, each control writes its setting, Test enabled only when notifications are on, row expand/collapse and its buttons, Muted list and Unmute, restore-defaults confirm, the update check states (fetch stubbed), backup buttons.
  - New `mention-marks.test.js`: flag inserted and removed, own messages and Activity ignored, sound only for fresh recent rows plus the throttle, refresh on word change, and no highlight API → no throw.
  - `game-clock.test.js`: the 12-hour rewrite.
  - `styles.test.js`: new overrides still out-specify the game.
- **Preview harness:**
  - New scenes `settings-general`, `settings-chats` (with Global's row open), `settings-about` and `mention` (a Global chat with two mentions), desktop and phone.
  - The existing `settings` scene becomes `settings-general`.
  - Check them visually against the approved mockups before the review.
- **Pace** (user preference): build task by task with tests, one review at the end, fix only Critical/Important, log Minors.

## Out of scope

- Mentions as desktop notifications (the user picked highlight + sound).
- Mentions in DMs (every DM is to you) or in Activity.
- Automatic update checks (Tampermonkey does them).
- Per-chat sounds, compact mode, and hiding game chats.
