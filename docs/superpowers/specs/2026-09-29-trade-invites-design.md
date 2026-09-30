# Zed City Friends 0.7.2 Design: View trade from a DM

**Date:** 2026-09-29
**Ships as:** 0.7.2
**Status:** approved in chat (layout: compact, one line).

## Why

The game's Mail page shows a trade invite as "Spike invited you to trade!" with a green **View Trade** button (and an activity invite with **View Activity**). Our DM windows get the same message from the API but only show "Sent a trade invite", with nothing to click.

## What the game does (live bundle, MailView-ia98xS25.js, unchanged 2026-09-28 → 2026-09-29)

- A message whose `is_system` is set carries `message` as an object: `{ cmd: 'tradeInvite', data: { trade_id } }` or `{ cmd: 'activityInvite', data: { activity_id } }`.
- It renders "{sender} invited you to trade!" / "… to an activity!" and a green full-width `q-btn` (size sm) that does `$router.push('/trade/' + trade_id)` / `'/activity/' + activity_id`. Both routes exist in the logged-in layout (`trade/:id`, `activity/:id`).
- Any other cmd renders "Cmd not found!".

## Design

### Data (`src/mail.js`)
- `normalizeMessage` adds `invite: { kind: 'trade' | 'activity', id }` when `raw.message` is an object with `cmd` `tradeInvite` (id from `data.trade_id`) or `activityInvite` (id from `data.activity_id`), and the id is a positive integer (`toId`). Otherwise there's no `invite` key at all (messages without one normalize exactly as before).
- `text` stays `messageText(...)` ("Sent a trade invite"), so chat-list previews, notifications and anything else reading `text` are unchanged.

### DM window (`src/ui/dm-window.js`)
- A message with `invite` shows, in place of its text, one line (grouped or not):
  - From them: "Spike invited you to trade!" / "Spike invited you to an activity!" (their display name).
  - From you: "You invited Spike to trade!" / "You invited Spike to an activity!".
  - Then a small green button, **View Trade** / **View Activity** (uppercase through CSS, like the game's q-btn).
- The button navigates in-app with `router.navigate('/trade/{id}')` / `'/activity/{id}'`, like the sender name's profile link. On phones (`services.isSmall()`), it also minimizes the DM (`actions.minimizeDm`), so the page isn't behind the open window.
- A message without a usable id keeps today's look: the italic "Sent a trade invite" line.

### Look (`src/ui/styles.js`)
- `.zcf-invite`: the line, not italic, full opacity (the `.zcf-system` dimming doesn't apply to it).
- `.zcf-invite-btn`: the game's green (Quasar `bg-green`, `#4caf50`), white, uppercase, 10.5px, 2px 8px padding, 3px radius, inline next to the line (wraps under it on a narrow window); hover a little darker. Specific enough to beat the game's button rules in any load order.

## Tests
- `mail.test.js`: trade and activity invites parsed; missing, zero or non-numeric ids and unknown cmds give no `invite`; plain messages unchanged.
- `dm-window.test.js`: their invite (line + button + navigate), your own invite's wording, activity invite, grouped invite, phone minimizes, no id keeps the italic text.
- Preview harness: the `dm` scene gets a trade invite from Spike.

## Release
- 0.7.2. `WHATS_NEW`'s top entry becomes `0.7.x` (like `0.5.x`) with an "Invites" feature: "Trade and activity invites in a DM have a View Trade / View Activity button, like the game's Mail page."
