# Manual test checklist (live game)

Run these on www.zed.city, logged in, with the built `dist/zed-city-friends.user.js` installed. Keep DevTools open, with the Network tab filtered to `api.zed.city` and the Console filtered to `[ZCF]`.

## A. Verify the API assumptions (spec §12)

Record the answers in this file under "Findings", and fix the code only if an answer differs from the assumption.

1. **`getChats` → `new_mail`:** is it a count or a boolean? (Look at the Response for `getChats?page=1` with an unread thread.) Either works; note which.
2. **`getChats` → `other_user.avatar`:** is it present? If not, Recent rows show the default avatar until a DM is opened. That's acceptable.
3. **`getChatMessages` order:** is each page oldest → newest? The code sorts by `id`, so it works either way; note it.
4. **`getNewMessages`:** does calling it mark the thread read in the game's inbox?
5. **`sent_at` / `last_reply` format:** an ISO string, `YYYY-MM-DD HH:mm:ss`, or unix time? All three are parsed as UTC.
6. **`getChatMessages?offset=1`:** does it mark the thread read? Open a DM from the dock, then check the game's envelope badge after its next 60s refresh.
7. **Navigation:** in the Console, `document.querySelector('#q-app').__vue_app__.config.globalProperties.$router` should be defined. Clicking "Profile" in the Friends list should change page without a full reload.
8. **`getStats`:** is the player flat (`{id, username}`) or nested under `user` (`{user: {id, username}}`)? Either works; the Console should show no `[ZCF] stats-shape` warning.
9. **`active`** (in `getProfile` / `getChatInfo`): confirmed live to be seconds since last active. Offline friends should show a sensible "Active 5m ago" / "Active 3d ago", never thousands of days.
10. **`is_system`:** is it `0`/`1`, a boolean, or something else? (Also confirms `new_mail`'s type, per #1.)
11. While traveling, does `getChatInfo` fail the same way `getChatMessages`/`getNewMessages` do?

## B. Feature checks

1. The dock shows Private Messages (green envelope) right of the game's chats, in the bottom-right corner (flush against the screen edge on desktop). Minimizing and expanding looks like the game's chats; its tabs are Chats, Friends, Faction and Blocked.
2. **Profile page of another player:** `ADD FRIEND` sits between `TRADE` and `MAIL`, with the same outline style. Click it → it becomes a green `FRIENDS`. Click → `Remove?` → click again → removed.
3. **Own profile:** no button. A blocked player (Trade/Mail hidden): the button sits after Block.
4. **Private Messages search:** typing a name or an ID shows players; **+ Friend** adds one (it becomes **✓ Friend**); clicking a player opens a DM; Esc returns to the tab. Scrolling the Chats tab to the bottom loads older conversations. Faction shows your members (online first, with level); Blocked unblocks after a confirm.
5. **With a second account:** send a DM to the first account. Within ~15s, a minimized avatar tab with a badge appears on the first account. The game's inbox still shows the thread as unread until the DM is expanded.
6. Expand the DM: the history loads, and scrolling up loads older messages. Replies from the second account show within ~2s. Enter sends; Shift+Enter adds a new line.
7. Go offline (DevTools → Network → Offline) and send a message: it shows "Failed to send · Retry". Go back online → Retry works.
8. **Reload the page:** the friends list and open or minimized DM tabs come back.
9. **Responsive mode (375px wide):** only one window is open at a time. Opening a DM minimizes Global chat, and opening Global minimizes the DM.
10. **Traveling or exploring:** an open DM shows "Mail is unavailable while you are traveling/exploring."
11. **Switch to another browser tab for a minute:** the Network tab shows no `api.zed.city` requests from the script until you return.
12. **Export**, then remove a friend, then **Import**: the friend is back. Importing a file from another account is rejected.
13. A game system-thread (`is_system` truthy) never pops up as a DM tab and never appears in the Private Messages Chats tab.
14. Get into a fight (or start a trip), then let it end: the "Mail is unavailable while..." notice clears within about 10s of it ending, not up to a minute later.
15. Navigate through a few different pages: our windows still match the game's chat look (same fonts/colors/spacing) — the game's own stylesheet order didn't push ours out of the cascade.
16. With our windows present in the dock, the game's own Global/Faction chat still auto-scrolls on new messages, and the spacing between our last window and the first game chat looks right. (Global/Faction message rows use `.msg-cont`.)
17. **Phone width, rotation:** with 2 of our windows open, rotate landscape → portrait (or resize past 600px): exactly one stays open.
18. **Phone width, incoming DMs:** with a DM open, have two other friends message you: the open DM is not hidden by the pop-ups.
19. **Phone width, page change:** with a DM and the game's General chat both open, navigate to another page: does the dock rebuild, and does it collapse the DM the way it should?
20. **Presence volume:** with the Private Messages window open for about 2 minutes, the Network tab shows at most ~20 `getProfile` calls a minute, regardless of friend-list size.
21. **Profile navigation:** go from another player's profile to your own, then between two different players' profiles: `ADD FRIEND` never appears on your own profile, and on a player's profile it always matches the player currently shown (never a stale button left over from the previous page).
22. **Re-expanding a DM:** minimize then re-expand a DM that has unread messages — does the game's own unread/envelope count clear? (`getNewMessages` may not mark it read; if it doesn't, note that as a known gap.)
23. **Routes without the dock:** browse to a few different pages/routes and note any where the dock (Friends tab, Global/Faction chat) is missing entirely.
24. **Top bar:** a plain friends icon (no number) sits left of the mail envelope. On a 360px-wide phone layout the icons stay on one line. **Private Messages tab (minimized):** a green number counts unread chats from friends and from the Chats list, and clears as they're read.
25. **Friends page:** click the icon: `/friends` opens with no page reload and no "Sorry, nothing here" flash. Refresh `/friends` directly: the same page loads.
26. Sort by Name, Level, Status and Faction (click twice to reverse). Tabs and search (names and notes) narrow the list.
27. **Notes:** edit (Enter saves, Esc cancels, clicking away saves), reload, then open a second game tab: the note is there in both.
28. **Message** opens the DM in the dock. **Remove** asks first. **Add friend** finds and adds a player, who appears in the table.
29. Injured and traveling icons and the faction match those players' profiles.
30. **Export → Import** round-trips notes. When idle with no friends list open, the Network tab shows about 4 requests a minute (no `getProfile`).
31. **Enemies:** on another player's profile, `ADD ENEMY` sits right after `ADD FRIEND` (desktop and phone width). Click → red `ENEMY`; click → `Remove?` → click → removed. Own profile: no button.
32. `/enemies` shows the ENEMIES title tab bright and FRIENDS dim; both tabs switch without a reload. Notes, search, sort and **Add enemy** work as on Friends.
33. An enemy who posts in Global, Faction or Activity gets a red skull before their name, including on messages that arrive later and after scrolling back; removing them takes the skull away.
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

## Findings

_(fill in during the run)_
