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

## B. Feature checks

1. The dock shows the Friends tab (green two-person icon) to the left of Faction/Global. Minimizing and expanding looks like the game's chats.
2. **Profile page of another player:** `ADD FRIEND` sits between `TRADE` and `MAIL`, with the same outline style. Click it → it becomes a green `FRIENDS`. Click → `Remove?` → click again → removed.
3. **Own profile:** no button. A blocked player (Trade/Mail hidden): the button sits after Block.
4. **Global chat:** hovering a message shows `+ friend` after the name. It's hidden for your own messages and for existing friends. Click it → toast "X added to friends".
5. **Friends window:** the filter narrows the list with highlights. The person-plus pop-out finds players by name and by ID. **Add** changes to **✓ Friend**. Esc closes it.
6. **With a second account:** send a DM to the first account. Within ~15s, a minimized avatar tab with a badge appears on the first account. The game's inbox still shows the thread as unread until the DM is expanded.
7. Expand the DM: the history loads, and scrolling up loads older messages. Replies from the second account show within ~2s. Enter sends; Shift+Enter adds a new line.
8. Go offline (DevTools → Network → Offline) and send a message: it shows "Failed to send · Retry". Go back online → Retry works.
9. **Reload the page:** the friends list and open or minimized DM tabs come back.
10. **Responsive mode (375px wide):** only one window is open at a time. Opening a DM minimizes Global chat, and opening Global minimizes the DM.
11. **Traveling or exploring:** an open DM shows "Mail is unavailable while you are traveling/exploring."
12. **Switch to another browser tab for a minute:** the Network tab shows no `api.zed.city` requests from the script until you return.
13. **Export**, then remove a friend, then **Import**: the friend is back. Importing a file from another account is rejected.

## Findings

_(fill in during the run)_
