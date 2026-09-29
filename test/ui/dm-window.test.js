import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDmWindow } from '../../src/ui/dm-window.js';
import { openDm, addFriend } from '../../src/state.js';
import { makeServices, ME } from './services.js';
import { fakeApi, rawMsg, flush } from '../helpers.js';

const THEM = 5;

function mount(apiOverrides = {}, { open = true } = {}) {
  const api = fakeApi(apiOverrides);
  const services = makeServices({ api });
  services.store.update((s) => {
    addFriend(s, { id: THEM, username: 'Spike' }, 0);
    openDm(s, THEM, { expand: open, now: 1 });
  });
  const win = createDmWindow(services, THEM);
  document.body.appendChild(win.el);
  services.store.subscribe(() => win.update());
  win.update();
  return { services, win, el: win.el, api };
}

const texts = (el) => [...el.querySelectorAll('.zcf-log .zcf-text')].map((n) => n.textContent);

describe('dm window', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('loads the conversation when expanded and renders it like game chat', async () => {
    const { el, api } = mount({
      getChatMessages: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          rawMsg(1, THEM, 'you still need those nails?', '2026-09-28 14:02:00'),
          rawMsg(2, THEM, 'got 60 spare', '2026-09-28 14:02:30'),
          rawMsg(3, ME, 'yeah like 40', '2026-09-28 14:03:00'),
        ],
      }),
      getChatInfo: vi.fn().mockResolvedValue({ ok: true, data: { [THEM]: { username: 'Spike', online: true } } }),
    });
    await flush();
    expect(api.getChatMessages).toHaveBeenCalledWith(THEM, 1, 10);
    expect(api.getChatInfo).toHaveBeenCalledWith(THEM);
    expect(texts(el)).toEqual(['you still need those nails?', 'got 60 spare', 'yeah like 40']);
    expect([...el.querySelectorAll('.zcf-sender')].map((n) => n.textContent)).toEqual(['Spike', 'Me']);
    expect(el.querySelectorAll('.zcf-grouped')).toHaveLength(1);
    expect(el.querySelector('.zcf-divider').textContent).toBe('September 28, 2026');
    expect(el.querySelector('.zcf-dm-name').textContent).toBe('Spike');
  });

  it('does not load anything while minimized, and shows the unread badge', async () => {
    const { el, api, services } = mount({}, { open: false });
    services.store.update((s) => { s.threads[THEM] = { unread: 3 }; });
    await flush();
    expect(api.getChatMessages).not.toHaveBeenCalled();
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.querySelector('.unread-badge').textContent).toBe('3');
    expect(el.querySelector('.unread-badge').hidden).toBe(false);
  });

  it('sends on Enter, shows the message right away, and keeps Shift+Enter for new lines', async () => {
    const { el, api } = mount({ sendMail: vi.fn(() => new Promise(() => {})) });
    await flush();
    const input = el.querySelector('textarea');
    input.value = 'line';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(api.sendMail).not.toHaveBeenCalled();
    input.value = 'bet, send a trade';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(api.sendMail).toHaveBeenCalledWith(THEM, 'bet, send a trade');
    expect(input.value).toBe('');
    expect(el.querySelector('.zcf-pending-msg').textContent).toBe('bet, send a trade');
  });

  it('shows a Retry link when sending fails', async () => {
    const { el, api } = mount({ sendMail: vi.fn().mockResolvedValue({ ok: false, kind: 'network' }) });
    await flush();
    el.querySelector('textarea').value = 'hello';
    el.querySelector('.zcf-send').click();
    await flush();
    expect(el.querySelector('.zcf-failed .zcf-error').textContent).toContain('Failed to send');
    api.sendMail.mockResolvedValue({ ok: true, data: { message_id: 9 } });
    el.querySelector('.zcf-link').click();
    await flush();
    expect(api.sendMail).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.zcf-failed')).toBeNull();
  });

  it('disables the composer for players you cannot message', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'access' }) });
    await flush();
    expect(el.querySelector('.zcf-notice').textContent).toBe("You can't message this player.");
    expect(el.querySelector('textarea').disabled).toBe(true);
  });

  it('shows the travel notice while mail is unavailable', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'busy', busy: 'traveling' }) });
    await flush();
    expect(el.querySelector('.zcf-notice').textContent).toBe('Mail is unavailable while you are traveling.');
  });

  it('renders message text literally', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, '<img src=x onerror=alert(1)>', '2026-09-28 14:02:00')] }) });
    await flush();
    expect(el.querySelector('.zcf-log img')).toBeNull();
    expect(texts(el)).toEqual(['<img src=x onerror=alert(1)>']);
  });

  it('header buttons minimize, close and open the inbox', async () => {
    const { el, services } = mount();
    await flush();
    el.querySelector('[title="Open in inbox"]').click();
    expect(services.router.navigate).toHaveBeenCalledWith(`/mail/${THEM}`);
    el.querySelector('[title="Minimize"]').click();
    expect(services.store.get().dock.dms[0].open).toBe(false);
    el.querySelector('[title="Close"]').click();
    expect(services.store.get().dock.dms).toEqual([]);
  });
});
