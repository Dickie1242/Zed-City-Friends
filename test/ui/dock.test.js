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
});
