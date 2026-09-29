import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTopbarButton } from '../../src/ui/topbar-button.js';
import { createKeeper } from '../../src/ui/keeper.js';
import { HEADER_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

describe('top-bar Friends button', () => {
  let btn;
  let keeper;
  let router;
  beforeEach(() => {
    document.body.innerHTML = HEADER_HTML;
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    keeper = createKeeper();
    router = { navigate: vi.fn() };
  });
  afterEach(() => {
    btn.destroy();
    keeper.destroy();
    vi.unstubAllGlobals();
  });

  const mount = () => {
    btn = createTopbarButton({ keeper, router });
    btn.start();
    return document.querySelector('.zcf-topbar');
  };
  // Reads defaultPrevented after our handler ran, then stops jsdom from trying to follow the link.
  const clickAndCheck = (target, init) => {
    let prevented;
    document.addEventListener('click', (e) => {
      prevented = e.defaultPrevented;
      e.preventDefault();
    }, { once: true });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    return prevented;
  };

  it('sits just left of mail, cloned from it, without the mail count', () => {
    const wrap = mount();
    expect(wrap.nextElementSibling).toBe(document.querySelector('a[href="/mail"]').parentElement);
    const a = wrap.querySelector('a.q-btn');
    expect(a.getAttribute('href')).toBe('/friends');
    expect(a.classList.contains('q-btn--round')).toBe(true);
    expect(a.querySelector('i').className).toBe('q-icon fal fa-user-friends');
    expect(a.querySelector('.bg-red-5')).toBeNull();
  });

  it('is a plain icon: no count, and the idle grey even when mail is unread', () => {
    const a = mount().querySelector('a');
    expect(a.querySelector('.q-badge')).toBeNull();
    expect(a.classList.contains('text-grey-7')).toBe(true);
    expect(a.classList.contains('text-grey-4')).toBe(false);
    expect(a.getAttribute('aria-label')).toBe('Friends');
  });

  it('navigates in-app on a plain click and leaves modified clicks to the browser', () => {
    const a = mount().querySelector('a');
    expect(clickAndCheck(a)).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith('/friends');
    expect(clickAndCheck(a, { ctrlKey: true })).toBe(false);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('comes back after the game rebuilds its header', async () => {
    mount();
    document.body.innerHTML = HEADER_HTML;
    await flush();
    await flush();
    const wrap = document.querySelector('.zcf-topbar');
    expect(wrap).not.toBeNull();
    expect(wrap.nextElementSibling.querySelector('a').getAttribute('href')).toBe('/mail');
  });

  it('does nothing when the page has no top bar', () => {
    document.body.innerHTML = '<div id="q-app"></div>';
    expect(() => mount()).not.toThrow();
    expect(document.querySelector('.zcf-topbar')).toBeNull();
  });
});
