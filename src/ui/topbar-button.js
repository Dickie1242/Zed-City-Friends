// The Friends button in the game's top bar: a clone of the game's own mail button (so it matches
// exactly), left of mail, opening the Friends page (spec §3).
import { h } from './dom.js';
import { safe, warnOnce } from '../util.js';
import { FRIENDS_PATH } from './friends-page.js';

const MAIL_SELECTOR = 'header a.q-btn[href="/mail"]';
const WARN_MS = 10000;

export function createTopbarButton({ doc = document, keeper = null, router }) {
  let wrap = null;
  let button = null;
  let unkeep = null;
  let warnTimer = null;

  function onClick(e) {
    // Middle and modified clicks keep the browser default (open /friends in a new tab), like any link.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.navigate(FRIENDS_PATH);
  }

  function build(mail) {
    button = mail.cloneNode(true);
    for (const b of button.querySelectorAll('.q-badge')) b.remove();
    button.setAttribute('href', FRIENDS_PATH);
    const i = button.querySelector('i');
    if (i) {
      for (const c of [...i.classList]) if (/^fa-/.test(c)) i.classList.remove(c);
      i.classList.add('fa-user-friends');
    }
    // Always the idle grey: the clone may have copied mail's brighter "you have mail" color.
    button.classList.remove('text-grey-4');
    button.classList.add('text-grey-7');
    button.setAttribute('title', 'Friends');
    button.setAttribute('aria-label', 'Friends');
    button.addEventListener('click', safe('topbar-click', onClick));
    wrap = h('div', { class: 'zcf-topbar' }, button);
  }

  function ensure() {
    if (wrap && wrap.isConnected) return;
    const mail = doc.querySelector(MAIL_SELECTOR);
    const mailWrap = mail && mail.parentElement;
    if (!mailWrap || !mailWrap.parentElement) return;
    if (!wrap) build(mail);
    mailWrap.before(wrap);
  }

  return {
    start() {
      ensure();
      if (!unkeep && keeper) unkeep = keeper.add({ name: 'topbar', attached: () => !!(wrap && wrap.isConnected), ensure });
      clearTimeout(warnTimer);
      warnTimer = setTimeout(() => {
        if (!wrap || !wrap.isConnected) warnOnce('topbar-mail-button-not-found');
      }, WARN_MS);
    },
    destroy() {
      clearTimeout(warnTimer);
      if (unkeep) unkeep();
      unkeep = null;
      if (wrap) wrap.remove();
    },
  };
}
