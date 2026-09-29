// "Add Friend" / "Friends" button on /profile/{id}, cloned from the game's own Mail button so it matches exactly.
import { isFriend } from '../state.js';
import { safe, warnOnce } from '../util.js';

export const PROFILE_PATH = /^\/profile\/(\d+)\/?$/;
const CONFIRM_MS = 4000;

export function createProfileButton({ doc = document, win = window, store, actions, players, toast }) {
  let profileId = null;
  let wrap = null;
  let button = null;
  let label = null;
  let iconEl = null;
  let confirming = false;
  let confirmTimer = null;
  let observer = null;
  let frame = 0;
  let warnTimer = null;

  function findButton(iconClass, labelRe) {
    for (const btn of doc.querySelectorAll('.q-btn.q-btn--outline')) {
      if (btn.closest('.zcf-profile-btn')) continue;
      if (btn.querySelector(`.${iconClass}`) && labelRe.test(btn.textContent.trim())) return btn;
    }
    return null;
  }

  function setIcon(name) {
    if (!iconEl) return;
    for (const c of [...iconEl.classList]) if (/^fa-/.test(c)) iconEl.classList.remove(c);
    iconEl.classList.add(name);
  }

  function refresh() {
    if (!button || !button.isConnected || profileId === null) return;
    const friend = isFriend(store.get(), profileId);
    setIcon(friend ? 'fa-user-check' : 'fa-user-plus');
    label.textContent = friend ? (confirming ? 'Remove?' : 'Friends') : 'Add Friend';
    button.classList.toggle('zcf-is-friend', friend);
    button.classList.toggle('text-grey-4', !friend);
    button.title = friend ? 'Click to remove from friends' : 'Add to your friends list';
  }

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = profileId;
    if (id === null) return;
    if (isFriend(store.get(), id)) {
      if (confirming) {
        confirming = false;
        clearTimeout(confirmTimer);
        actions.removeFriend(id);
      } else {
        confirming = true;
        confirmTimer = setTimeout(() => {
          confirming = false;
          refresh();
        }, CONFIRM_MS);
      }
      refresh();
      return;
    }
    const r = await players.get(id);
    const data = r.ok && r.data ? r.data : {};
    const username = typeof data.username === 'string' && data.username ? data.username : `#${id}`;
    actions.addFriend({ id, username, avatar: typeof data.avatar === 'string' ? data.avatar : null });
    toast(`${username} added to friends`);
  }

  // Returns true once there is nothing left to do on this page (inserted, or it's our own profile).
  function tryInsert() {
    if (profileId === null) return true;
    if (wrap && wrap.isConnected) return true;
    if (findButton('fa-cog', /^settings$/i)) return true;
    const mail = findButton('fa-envelope', /^mail$/i);
    const trade = findButton('fa-exchange', /^trade$/i);
    const block = findButton('fa-ban', /^(un)?block$/i);
    const template = mail || block;
    if (!template || !template.parentElement) return false;

    wrap = template.parentElement.cloneNode(true);
    wrap.classList.add('zcf-profile-btn');
    button = wrap.querySelector('.q-btn');
    button.removeAttribute('href');
    button.removeAttribute('to');
    for (const c of [...button.classList]) if (/^text-/.test(c)) button.classList.remove(c);
    button.classList.add('text-grey-4');
    iconEl = button.querySelector('i');
    label = button.querySelector('.block') || button.querySelector('.q-btn__content span:last-child');
    if (!label) {
      label = doc.createElement('span');
      label.className = 'block';
      button.querySelector('.q-btn__content').appendChild(label);
    }
    button.addEventListener('click', safe('profile-button-click', onClick));

    if (mail && trade) trade.parentElement.after(wrap);
    else if (mail) mail.parentElement.before(wrap);
    else block.parentElement.after(wrap);
    confirming = false;
    refresh();
    return true;
  }

  function stopWatching() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(warnTimer);
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  }

  function onRoute(path) {
    stopWatching();
    if (wrap) wrap.remove();
    wrap = null;
    button = null;
    const m = PROFILE_PATH.exec(path);
    profileId = m ? Number(m[1]) : null;
    if (profileId === null) return;
    tryInsert();
    // The game re-renders the button row while a profile loads, so keep watching while we're on this page.
    observer = new win.MutationObserver(() => {
      if (frame || (wrap && wrap.isConnected)) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        safe('profile-button-insert', tryInsert)();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    warnTimer = setTimeout(() => {
      if (!wrap && !findButton('fa-cog', /^settings$/i)) warnOnce('profile-buttons-not-found', path);
    }, 10000);
  }

  function destroy() {
    stopWatching();
    clearTimeout(confirmTimer);
    if (wrap) wrap.remove();
    wrap = null;
    button = null;
    profileId = null;
  }

  return { onRoute, refresh, tryInsert, destroy };
}
