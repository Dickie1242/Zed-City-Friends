import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter } from '../src/router.js';
import { resetWarnings } from '../src/util.js';
import { flush } from './helpers.js';

describe('router', () => {
  // Real-window routers leak listeners onto the shared jsdom window unless destroyed;
  // route creation through here so one test's router can't notify another test's subscribers.
  const created = [];
  function makeRouter(opts) {
    const router = createRouter(opts);
    created.push(router);
    return router;
  }

  // A fresh history object per fake win: sharing window.history here would let the patch
  // (closed over that fake win) permanently hijack the real window's dispatch target.
  function fakeHistory() {
    return { pushState() {}, replaceState() {} };
  }

  beforeEach(() => resetWarnings());

  afterEach(() => {
    while (created.length) created.pop().destroy();
  });

  it('reports path changes from pushState, replaceState and popstate', async () => {
    const router = makeRouter();
    const fn = vi.fn();
    router.onChange(fn);
    history.pushState({}, '', '/profile/5');
    await Promise.resolve();
    history.replaceState({}, '', '/profile/5');
    await Promise.resolve();
    history.replaceState({}, '', '/mail');
    await Promise.resolve();
    // Change the URL without going through our wrapper, so this only passes if the
    // popstate listener itself (not the patched pushState) reports the change.
    History.prototype.pushState.call(history, {}, '', '/profile/6');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await Promise.resolve();
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['/profile/5', '/mail', '/profile/6']);
    expect(router.path).toBe('/profile/6');
  });

  it('navigates through the game router when it is available', () => {
    const push = vi.fn();
    const app = document.createElement('div');
    app.id = 'q-app';
    app.__vue_app__ = { config: { globalProperties: { $router: { push } } } };
    document.body.appendChild(app);
    makeRouter().navigate('/profile/9');
    expect(push).toHaveBeenCalledWith('/profile/9');
    app.remove();
  });

  it('falls back to location.assign when there is no game router', () => {
    const assign = vi.fn();
    const fakeWin = { location: { pathname: '/', assign }, history: fakeHistory(), addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    const fakeDoc = { querySelector: () => null };
    makeRouter({ win: fakeWin, doc: fakeDoc }).navigate('/profile/3');
    expect(assign).toHaveBeenCalledWith('/profile/3');
  });

  it('warns and falls back to location.assign when router.push() rejects', async () => {
    const push = vi.fn(() => Promise.reject(new Error('failed to load chunk')));
    const assign = vi.fn();
    const fakeWin = { location: { pathname: '/', assign }, history: fakeHistory(), addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    const fakeDoc = { querySelector: () => ({ __vue_app__: { config: { globalProperties: { $router: { push } } } } }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeRouter({ win: fakeWin, doc: fakeDoc }).navigate('/profile/1');
    expect(push).toHaveBeenCalledWith('/profile/1');
    expect(assign).not.toHaveBeenCalled(); // rejection hasn't settled yet
    await flush();
    expect(warn).toHaveBeenCalledWith('[ZCF]', 'navigate', expect.any(Error));
    expect(assign).toHaveBeenCalledWith('/profile/1');
  });

  it('rejects unsafe navigate paths without calling push or assign', () => {
    const push = vi.fn();
    const assign = vi.fn();
    const fakeWin = { location: { pathname: '/', assign }, history: fakeHistory(), addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    const fakeDoc = { querySelector: () => ({ __vue_app__: { config: { globalProperties: { $router: { push } } } } }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = makeRouter({ win: fakeWin, doc: fakeDoc });
    router.navigate('javascript:alert(1)');
    router.navigate('//evil.example/x');
    // URL parsing strips tabs/newlines, so these resolve to //evil.example/... too.
    router.navigate('/\t/evil.example/x');
    router.navigate('/\n/evil.example/y');
    expect(push).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('does not reload when the target page was already reached before push() rejects', async () => {
    const push = vi.fn(() => Promise.reject(new Error('navigation cancelled')));
    const assign = vi.fn();
    const fakeWin = { location: { pathname: '/profile/1', assign }, history: fakeHistory(), addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    const fakeDoc = { querySelector: () => ({ __vue_app__: { config: { globalProperties: { $router: { push } } } } }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeRouter({ win: fakeWin, doc: fakeDoc }).navigate('/profile/1');
    await flush();
    expect(warn).toHaveBeenCalledWith('[ZCF]', 'navigate', expect.any(Error));
    expect(assign).not.toHaveBeenCalled();
  });

  it('destroy() stops notifications', async () => {
    // subs.clear() alone would already make the notification assertion pass, so also prove
    // destroy() removes the exact listeners it added.
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const router = makeRouter();
    const fn = vi.fn();
    router.onChange(fn);
    const added = addSpy.mock.calls.filter(([type]) => type === 'zcf:locationchange' || type === 'popstate');
    router.destroy();
    const removed = removeSpy.mock.calls.filter(([type]) => type === 'zcf:locationchange' || type === 'popstate');
    expect(removed).toEqual(added);
    history.pushState({}, '', '/destroy-target');
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
  });

  it('the unsubscribe function returned by onChange stops that subscriber only', async () => {
    const router = makeRouter();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const off1 = router.onChange(fn1);
    router.onChange(fn2);
    off1();
    history.pushState({}, '', '/unsub-target');
    await Promise.resolve();
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledWith('/unsub-target');
  });

  it('the patched pushState preserves this, arguments and the return value', () => {
    makeRouter();
    const ret = history.pushState({ a: 1 }, '', '/preserve-this');
    expect(ret).toBe(undefined);
    expect(history.state).toEqual({ a: 1 });
    expect(location.pathname).toBe('/preserve-this');
  });

  it('an exception from the original pushState propagates to the caller and skips the dispatch', () => {
    makeRouter();
    const seen = vi.fn();
    window.addEventListener('zcf:locationchange', seen);
    // A cross-origin URL makes the real pushState throw a SecurityError.
    expect(() => history.pushState(null, '', 'https://evil.example/x')).toThrow();
    expect(seen).not.toHaveBeenCalled();
    window.removeEventListener('zcf:locationchange', seen);
  });

  it('patches history methods once: two routers share the wrapper and each hears one notification per pushState', async () => {
    const a = makeRouter();
    const wrapped = history.pushState;
    const b = makeRouter();
    expect(history.pushState).toBe(wrapped);
    const fa = vi.fn();
    const fb = vi.fn();
    a.onChange(fa);
    b.onChange(fb);
    history.pushState(null, '', '/double-wrap-target');
    await Promise.resolve();
    expect(fa).toHaveBeenCalledTimes(1);
    expect(fb).toHaveBeenCalledTimes(1);
    expect(fa).toHaveBeenCalledWith('/double-wrap-target');
    expect(fb).toHaveBeenCalledWith('/double-wrap-target');
  });

  it('a throwing dispatchEvent inside the patched pushState does not propagate to the caller', () => {
    const original = vi.fn(() => 'native-return');
    const stubHistory = { pushState: original, replaceState: vi.fn() };
    const dispatchEvent = vi.fn(() => { throw new Error('listener exploded'); });
    const fakeWin = { location: { pathname: '/' }, history: stubHistory, addEventListener() {}, removeEventListener() {}, dispatchEvent };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeRouter({ win: fakeWin, doc: { querySelector: () => null } });
    let ret;
    expect(() => { ret = stubHistory.pushState({}, '', '/x'); }).not.toThrow();
    expect(ret).toBe('native-return');
    expect(original).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[ZCF]', 'router-dispatch', expect.any(Error));
  });

  it('a failed history patch does not crash createRouter, and popstate still notifies', () => {
    const lockedHistory = {};
    Object.defineProperty(lockedHistory, 'pushState', { value: () => {}, writable: false, configurable: true });
    Object.defineProperty(lockedHistory, 'replaceState', { value: () => {}, writable: false, configurable: true });
    const listeners = {};
    const fakeWin = {
      location: { pathname: '/start' },
      history: lockedHistory,
      addEventListener(type, fn) { listeners[type] = fn; },
      removeEventListener() {},
      dispatchEvent() {},
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let router;
    expect(() => { router = makeRouter({ win: fakeWin, doc: { querySelector: () => null } }); }).not.toThrow();
    expect(warn).toHaveBeenCalledWith('[ZCF]', 'history-patch', expect.any(Error));
    expect(lockedHistory[Symbol.for('zcf.historyPatched')]).toBe(true);

    const fn = vi.fn();
    router.onChange(fn);
    fakeWin.location.pathname = '/moved';
    listeners.popstate();
    expect(fn).toHaveBeenCalledWith('/moved');
  });
});
