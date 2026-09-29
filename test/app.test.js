import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, INTERVALS } from '../src/app.js';
import { storageKey } from '../src/store.js';
import { DOCK_HTML, wireGameHeaders } from './fixtures/game-dom.js';
import { fakeApi, memoryStorage, rawThread, rawMsg, flush } from './helpers.js';

const ME = 1;
const SPIKE = 5;

function withFriend() {
  return memoryStorage({ [storageKey(ME)]: JSON.stringify({ v: 1, friends: { [SPIKE]: { id: SPIKE, username: 'Spike' } } }) });
}

describe('app', () => {
  let app;
  beforeEach(() => {
    document.body.innerHTML = DOCK_HTML;
    wireGameHeaders();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  });
  afterEach(() => {
    if (app) app.destroy();
    app = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('puts the Friends tab into the game dock, left of the game chats', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    const dock = document.querySelector('.chat-containers');
    const first = dock.firstElementChild;
    expect(first.className).toBe('zcf-root');
    expect(first.querySelector('.zcf-friends.chat-container.chat-minimized')).not.toBeNull();
    expect(first.nextElementSibling.classList.contains('faction-chat')).toBe(true);
  });

  it('pops up a friend DM from the thread poll, then loads it and clears the badge when expanded', async () => {
    const api = fakeApi({
      getChats: vi.fn().mockResolvedValue({ ok: true, data: [rawThread(SPIKE, { username: 'Spike', newMail: 1, lastReply: '2026-09-28 14:02:00' })] }),
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, SPIKE, 'you still need those nails?', '2026-09-28 14:02:00')] }),
    });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    await flush();
    const tab = document.querySelector('.zcf-dm');
    expect(tab.classList.contains('chat-minimized')).toBe(true);
    expect(tab.querySelector('.unread-badge').textContent).toBe('1');
    expect(document.querySelector('.zcf-friends .unread-badge').textContent).toBe('1');
    expect(api.getChatMessages).not.toHaveBeenCalled();

    tab.querySelector('.chat-header').click();
    await flush();
    await flush();
    expect(api.getChatMessages).toHaveBeenCalledWith(SPIKE, 1, 10);
    expect(tab.querySelector('.zcf-log').textContent).toContain('you still need those nails?');
    expect(app.store.get().threads[SPIKE].unread).toBe(0);
  });

  it('polls threads every 15s when idle and every 5s after DM activity', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getChats).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
    expect(api.getChats).toHaveBeenCalledTimes(2);
    app.actions.openDm(SPIKE, { expand: true });
    await vi.advanceTimersByTimeAsync(0);
    await app.conversations.acquire(SPIKE).send('hi');
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsChatting);
    expect(api.getChats).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsChatting);
    expect(api.getChats).toHaveBeenCalledTimes(4);
  });

  it('polls only the active expanded DM every 2s', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    app.actions.openDm(SPIKE, { expand: true });
    await vi.advanceTimersByTimeAsync(0);
    const before = api.getNewMessages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVALS.activeDm * 3);
    expect(api.getNewMessages.mock.calls.length - before).toBe(3);
    app.actions.minimizeDm(SPIKE);
    await vi.advanceTimersByTimeAsync(INTERVALS.activeDm * 3);
    expect(api.getNewMessages.mock.calls.length - before).toBe(3);
  });

  it('stops polling when the session ends', async () => {
    vi.useFakeTimers();
    const api = fakeApi({ getChats: vi.fn().mockResolvedValue({ ok: false, kind: 'auth' }) });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: memoryStorage() });
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.getChats).toHaveBeenCalledTimes(1);
  });

  it('on phones, opening a DM minimizes the open game chat', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {} }));
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: withFriend() });
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(false);
    app.actions.openDm(SPIKE, { expand: true });
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(true);
    document.querySelector('.general-chat .chat-header').click();
    await flush();
    expect(app.store.get().dock.dms[0].open).toBe(false);
    delete window.matchMedia;
  });
});
