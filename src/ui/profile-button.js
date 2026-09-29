// A button on /profile/{id} for one of your lists (Add Friend, Add Enemy), cloned from the game's own
// Mail button so it matches exactly. One instance per list; `after` puts one right after another.
import { isFriend } from '../state.js';
import { safe, warnOnce } from '../util.js';

export const PROFILE_PATH = /^\/profile\/(\d+)\/?$/;
const CONFIRM_MS = 4000;

export const FRIEND_BUTTON = {
  key: 'friend',
  label: 'Add Friend',
  onLabel: 'Friends',
  icon: 'fa-user-plus',
  onIcon: 'fa-user-check',
  onClass: 'zcf-is-friend',
  addTitle: 'Add to your friends list',
  removeTitle: 'Click to remove from friends',
  added: (name) => `${name} added to friends`,
};

export const ENEMY_BUTTON = {
  key: 'enemy',
  label: 'Add Enemy',
  onLabel: 'Enemy',
  icon: 'fa-skull',
  onIcon: 'fa-skull',
  onClass: 'zcf-is-enemy',
  addTitle: 'Add to your enemies list',
  removeTitle: 'Click to remove from enemies',
  added: (name) => `${name} added to enemies`,
};

// Without `spec`, it's the friend button over `store` and `actions` (the 0.4 call shape).
export function createProfileButton({
  doc = document,
  win = window,
  spec = FRIEND_BUTTON,
  store,
  actions,
  isOn = (id) => isFriend(store.get(), id),
  add = (p) => actions.addFriend(p),
  remove = (id) => actions.removeFriend(id),
  players,
  toast,
  after = null,
}) {
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
    const on = isOn(profileId);
    setIcon(on ? spec.onIcon : spec.icon);
    label.textContent = on ? (confirming ? 'Remove?' : spec.onLabel) : spec.label;
    button.classList.toggle(spec.onClass, on);
    button.classList.toggle('text-grey-4', !on);
    button.title = on ? spec.removeTitle : spec.addTitle;
  }

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = profileId;
    if (id === null) return;
    if (isOn(id)) {
      if (confirming) {
        confirming = false;
        clearTimeout(confirmTimer);
        remove(id);
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
    add({ id, username, avatar: typeof data.avatar === 'string' ? data.avatar : null });
    toast(spec.added(username));
  }

  // Returns true once there is nothing left to do on this page (inserted), or 'own' on your own profile.
  function tryInsert() {
    if (profileId === null) return true;
    if (wrap && wrap.isConnected) return true;
    if (findButton('fa-cog', /^settings$/i)) return 'own';
    const mail = findButton('fa-envelope', /^mail$/i);
    const trade = findButton('fa-exchange', /^trade$/i);
    const block = findButton('fa-ban', /^(un)?block$/i);
    const template = mail || block;
    if (!template || !template.parentElement) return false;
    const prev = after ? after() : null;
    if (after && !(prev && prev.isConnected)) return false; // wait for the button this one follows

    wrap = template.parentElement.cloneNode(true);
    wrap.classList.add('zcf-profile-btn', `zcf-profile-btn-${spec.key}`);
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
    button.addEventListener('click', safe(`profile-button-click-${spec.key}`, onClick));

    if (prev) prev.after(wrap);
    else if (mail && trade) trade.parentElement.after(wrap);
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
    if (tryInsert() === 'own') return;
    // The game re-renders the button row while a profile loads, so keep watching while we're on this page
    // (but not on your own profile, where there's never a button to add).
    observer = new win.MutationObserver(() => {
      if (frame || (wrap && wrap.isConnected)) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        if (safe('profile-button-insert', tryInsert)() === 'own') stopWatching();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    warnTimer = setTimeout(() => {
      if (!wrap && !findButton('fa-cog', /^settings$/i)) warnOnce(`profile-buttons-not-found-${spec.key}`, path);
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

  return {
    onRoute,
    refresh,
    tryInsert,
    destroy,
    get wrap() {
      return wrap;
    },
  };
}
