// The Friends button in the game's top bar: a clone of the game's own mail button (so it matches
// exactly), left of mail, with a green count of friends online (spec §3).
import { h } from './dom.js';
import { safe, warnOnce } from '../util.js';
import { FRIENDS_PATH } from './friends-page.js';

const MAIL_SELECTOR = 'header a.q-btn[href="/mail"]';
const WARN_MS = 10000;

export function createTopbarButton({ doc = document, keeper = null, router }) {
  let wrap = null;
  let button = null;
  let badgeEl = null;
  let count = 0;
  let unkeep = null;
  let warnTimer = null;

  function render() {
    if (!button) return;
    badgeEl.textContent = String(count);
    badgeEl.hidden = count < 1;
    // Same rule as the game's mail button: brighter when there's something to see.
    button.classList.toggle('text-grey-4', count >= 1);
    button.classList.toggle('text-grey-7', count < 1);
    const label = `Friends (${count} online)`;
    button.setAttribute('title', label);
    button.setAttribute('aria-label', label);
  }

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
    badgeEl = h('div', {
      class: 'q-badge flex inline items-center no-wrap q-badge--single-line q-badge--floating q-badge--rounded bg-positive text-white zcf-topbar-badge',
      hidden: true,
    });
    (button.querySelector('.q-btn__content') || button).appendChild(badgeEl);
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
    render();
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
    setCount(n) {
      if (n === count) return;
      count = n;
      render();
    },
    destroy() {
      clearTimeout(warnTimer);
      if (unkeep) unkeep();
      unkeep = null;
      if (wrap) wrap.remove();
    },
  };
}
