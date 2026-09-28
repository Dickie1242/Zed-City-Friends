import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDock } from '../../src/ui/dock.js';
import { DOCK_HTML, wireGameHeaders } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

const setSmall = (small) => {
  window.matchMedia = vi.fn(() => ({ matches: small, addEventListener() {} }));
};

describe('dock', () => {
  let dock;
  beforeEach(() => {
    document.body.innerHTML = DOCK_HTML;
    wireGameHeaders();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    setSmall(false);
  });
  afterEach(() => {
    if (dock) dock.destroy();
    vi.unstubAllGlobals();
    delete window.matchMedia;
  });

  it('prepends its root into the game dock', () => {
    dock = createDock();
    dock.start();
    const containers = document.querySelector('.chat-containers');
    expect(containers.firstChild).toBe(dock.root);
    expect(dock.root.className).toBe('zcf-root');
  });

  it('re-mounts when the game rebuilds the dock', async () => {
    dock = createDock();
    dock.start();
    document.querySelector('.chat-containers').remove();
    await flush();
    expect(dock.root.isConnected).toBe(false);
    document.body.insertAdjacentHTML('beforeend', DOCK_HTML);
    await flush();
    await flush();
    expect(document.querySelector('.chat-containers').firstChild).toBe(dock.root);
  });

  it('waits quietly when there is no dock', () => {
    document.body.innerHTML = '<div id="q-app"></div>';
    dock = createDock();
    expect(() => dock.start()).not.toThrow();
    expect(dock.root.isConnected).toBe(false);
  });

  it('minimizes open game chats by clicking their headers', () => {
    dock = createDock();
    dock.start();
    dock.minimizeGameChats();
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(true);
    expect(document.querySelector('.faction-chat').classList.contains('chat-minimized')).toBe(true);
  });

  it('on phones, reports when the player opens a game chat', async () => {
    setSmall(true);
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    onGameChatOpened.mockClear(); // mount-time reconciliation reports the fixture's already-open general chat once
    const ours = document.createElement('div');
    ours.className = 'chat-container zcf chat-minimized';
    dock.root.appendChild(ours);
    ours.classList.remove('chat-minimized');
    await flush();
    expect(onGameChatOpened).not.toHaveBeenCalled();
    document.querySelector('.faction-chat .chat-header').click();
    await flush();
    expect(onGameChatOpened).toHaveBeenCalledTimes(1);
  });

  it('on desktop, ignores game chats opening', async () => {
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    document.querySelector('.faction-chat .chat-header').click();
    await flush();
    expect(onGameChatOpened).not.toHaveBeenCalled();
  });

  it('on phones, minimizeGameChats() does not trigger onGameChatOpened (anti-loop)', async () => {
    setSmall(true);
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    onGameChatOpened.mockClear(); // mount-time reconciliation already reported the open general chat
    dock.minimizeGameChats();
    await flush();
    expect(onGameChatOpened).not.toHaveBeenCalled();
  });

  it('mount-time reconciliation: mounting into a dock with an open game chat reports it once, while small', () => {
    setSmall(true);
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    expect(onGameChatOpened).toHaveBeenCalledTimes(1);
  });

  it('mount-time reconciliation does nothing while not small', () => {
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    expect(onGameChatOpened).not.toHaveBeenCalled();
  });

  it('destroy() stops re-mounting and reporting', async () => {
    setSmall(true);
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    dock.destroy();
    onGameChatOpened.mockClear();
    document.querySelector('.faction-chat .chat-header').click();
    document.querySelector('.chat-containers').remove();
    document.body.insertAdjacentHTML('beforeend', DOCK_HTML);
    wireGameHeaders();
    await flush();
    await flush();
    expect(onGameChatOpened).not.toHaveBeenCalled();
    expect(dock.root.isConnected).toBe(false);
  });

  it('a destroy()/start() cycle re-mounts after a dock rebuild', async () => {
    dock = createDock();
    dock.start();
    // detach -> the body observer schedules a pending frame
    document.querySelector('.chat-containers').remove();
    await Promise.resolve();
    await Promise.resolve();
    dock.destroy();
    document.body.insertAdjacentHTML('beforeend', DOCK_HTML);
    wireGameHeaders();
    dock.start();
    expect(dock.root.isConnected).toBe(true);
    // rebuild again, relying purely on the async body-observer -> rAF -> ensure() path
    document.querySelector('.chat-containers').remove();
    document.body.insertAdjacentHTML('beforeend', DOCK_HTML);
    wireGameHeaders();
    await flush();
    await flush();
    expect(document.querySelector('.chat-containers').firstChild).toBe(dock.root);
  });

  it('phone detection still works after a destroy()/start() cycle on the same dock element', async () => {
    setSmall(true);
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    dock.destroy();
    dock.start();
    onGameChatOpened.mockClear();
    document.querySelector('.faction-chat .chat-header').click();
    await flush();
    expect(onGameChatOpened).toHaveBeenCalledTimes(1);
  });

  it('onSmallChange fires on a breakpoint change, and unsubscribe stops it', () => {
    const listeners = new Set();
    const mql = {
      matches: false,
      addEventListener: (type, fn) => listeners.add(fn),
      removeEventListener: (type, fn) => listeners.delete(fn),
    };
    window.matchMedia = vi.fn(() => mql);
    dock = createDock();
    const onChange = vi.fn();
    const unsubscribe = dock.onSmallChange(onChange);
    mql.matches = true;
    for (const fn of listeners) fn({ matches: true });
    expect(onChange).toHaveBeenCalledWith(true);
    unsubscribe();
    mql.matches = false;
    for (const fn of listeners) fn({ matches: false });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not re-open a game chat when minimizeGameChats() is called twice in one tick', async () => {
    // Real Vue applies the class change in a microtask; simulate that instead of the fixture's synchronous toggle.
    document.body.innerHTML = DOCK_HTML;
    for (const header of document.querySelectorAll('.chat-containers > .chat-container > .chat-header')) {
      header.addEventListener('click', () => {
        queueMicrotask(() => header.parentElement.classList.toggle('chat-minimized'));
      });
    }
    dock = createDock();
    dock.start();
    dock.minimizeGameChats();
    dock.minimizeGameChats();
    await flush();
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(true);
  });

  it('treats "chat-minimized-x" as a different class than "chat-minimized" (exact token match)', async () => {
    setSmall(true);
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    const container = document.querySelector('.faction-chat'); // starts real chat-minimized in the fixture
    container.className = 'chat-container faction-chat chat-minimized-x'; // swap to an unrelated, similarly-named class
    await flush();
    onGameChatOpened.mockClear(); // ignore the genuine un-minimize transition above
    container.className = 'chat-container faction-chat'; // drop the fake class; never carried the real one
    await flush();
    expect(onGameChatOpened).not.toHaveBeenCalled();
  });
});
