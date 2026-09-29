import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDmWindow } from '../../src/ui/dm-window.js';
import { openDm, addFriend } from '../../src/state.js';
import { makeServices, ME } from './services.js';
import { fakeApi, rawMsg, flush } from '../helpers.js';
import { CSS } from '../../src/ui/styles.js';

const THEM = 5;

function mount(apiOverrides = {}, { open = true, fetchImpl } = {}) {
  const api = fakeApi(apiOverrides);
  const services = makeServices({ api, fetchImpl });
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

  it('keeps the name on a minimized tab, like Torn, with the username as its title', async () => {
    const { el } = mount({}, { open: false });
    await flush();
    const name = el.querySelector('.zcf-dm-name');
    expect(name).not.toBeNull();
    expect(name.textContent).toBe('Spike');
    expect(name.title).toBe('Spike');
    // The desktop rule must out-specificity the game's 2-class `.chat-container.chat-minimized` selectors.
    expect(CSS).toContain('@media (min-width:600px){');
    expect(CSS).toContain('.chat-containers .zcf-dm.chat-minimized{width:auto;max-width:150px}');
  });

  it('clicking the name while minimized expands the window instead of opening the profile', async () => {
    const { el, services } = mount({}, { open: false });
    await flush();
    el.querySelector('.zcf-dm-name').click();
    expect(services.store.get().dock.dms[0].open).toBe(true);
    expect(services.router.navigate).not.toHaveBeenCalled();
  });

  it('clicking the name while open still navigates to the profile', async () => {
    const { el, services } = mount();
    await flush();
    el.querySelector('.zcf-dm-name').click();
    expect(services.router.navigate).toHaveBeenCalledWith(`/profile/${THEM}`);
    expect(services.store.get().dock.dms[0].open).toBe(true);
  });

  it('gives every window header a solid background, at a specificity the game hover/minimized rules still beat', () => {
    expect(CSS).toContain('.zcf .chat-header{background:#090a0b}');
  });

  it('lays the DM body out as a flex column with a definite height, so the composer is never clipped', () => {
    expect(CSS).toContain('.zcf.chat-container .chat-content{display:flex;flex-direction:column}');
    expect(CSS).toContain('.zcf-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 8px}');
    expect(CSS).toContain('.zcf-notice{background:#f2c0371a;color:#f2c037;font-size:11.5px;padding:6px 12px;border-bottom:1px solid #f2c03733;flex:none}');
    expect(CSS).toContain('.zcf-composer{display:flex;gap:6px;align-items:flex-end;border-top:1px solid #ffffff14;padding:8px;flex:none}');
    expect(CSS).toContain('.zcf-dm:not(.chat-minimized){height:450px}');
    expect(CSS).toContain('.zcf-dm:not(.chat-minimized){height:min(450px,60vh)}');
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

  it('renders an allowed GIF embed as an image, not raw markdown text', async () => {
    const gif = 'https://cdn.zed.city/?url=' + encodeURIComponent('https://static.klipy.com/ii/x/a.gif');
    const { el } = mount({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, `brooo\n![Bibi Impressed](${gif})`, '2026-09-28 14:02:00')] }),
    });
    await flush();
    const imgs = el.querySelectorAll('.zcf-log img.zcf-gif');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe(gif);
    expect(imgs[0].getAttribute('alt')).toBe('Bibi Impressed');
    expect(el.querySelector('.zcf-log').textContent).not.toContain('![');
  });

  it('leaves a non-proxy image embed as literal text', async () => {
    const { el } = mount({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, '![x](https://evil.example/a.gif)', '2026-09-28 14:02:00')] }),
    });
    await flush();
    expect(el.querySelector('.zcf-log img.zcf-gif')).toBeNull();
    expect(texts(el)).toEqual(['![x](https://evil.example/a.gif)']);
  });

  it('replaces a GIF with its alt text if it fails to load', async () => {
    const gif = 'https://cdn.zed.city/?url=' + encodeURIComponent('https://static.klipy.com/a.gif');
    const { el } = mount({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, `![oops](${gif})`, '2026-09-28 14:02:00')] }),
    });
    await flush();
    const img = el.querySelector('.zcf-gif');
    img.dispatchEvent(new Event('error'));
    expect(el.querySelector('.zcf-gif')).toBeNull();
    expect(texts(el)).toEqual(['oops']);
  });

  it('scrolls the log back to the bottom when a pinned GIF finishes loading', async () => {
    const gif = 'https://cdn.zed.city/?url=' + encodeURIComponent('https://static.klipy.com/a.gif');
    const { el } = mount({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, `![hi](${gif})`, '2026-09-28 14:02:00')] }),
    });
    await flush();
    const scroller = el.querySelector('.zcf-scroll');
    Object.defineProperty(scroller, 'scrollHeight', { value: 500, configurable: true });
    scroller.scrollTop = 100; // simulate the GIF having grown the log below the visible area
    el.querySelector('.zcf-gif').dispatchEvent(new Event('load'));
    expect(scroller.scrollTop).toBe(500);
  });

  it('renders GIFs in pending and failed optimistic messages too', async () => {
    const gif = 'https://cdn.zed.city/?url=' + encodeURIComponent('https://static.klipy.com/a.gif');
    const { el, api } = mount({ sendMail: vi.fn().mockResolvedValue({ ok: false, kind: 'network' }) });
    await flush();
    el.querySelector('textarea').value = `check this ![hi](${gif})`;
    el.querySelector('.zcf-send').click();
    await flush();
    expect(el.querySelector('.zcf-failed img.zcf-gif')).not.toBeNull();
    expect(api.sendMail).toHaveBeenCalled();
  });

  it('opens the GIF picker from the composer and sends a picked GIF like a normal message', async () => {
    const rawGifUrl = 'https://static.klipy.com/ii/x/a.gif';
    const proxied = 'https://cdn.zed.city/?url=' + encodeURIComponent(rawGifUrl);
    const fetchImpl = vi.fn().mockResolvedValue({
      json: async () => ({
        results: [{
          content_description: 'Bibi Impressed',
          media_formats: {
            tinygif: { url: 'https://static.klipy.com/ii/x/a-tiny.gif' },
            gif: { url: rawGifUrl },
          },
        }],
      }),
    });
    const { el, api } = mount({}, { fetchImpl });
    await flush();
    const gifBtn = el.querySelector('.zcf-gifbtn');
    expect(gifBtn).not.toBeNull();
    expect(el.querySelector('.zcf-gifpanel').hidden).toBe(true);
    gifBtn.click();
    expect(el.querySelector('.zcf-gifpanel').hidden).toBe(false);
    expect(gifBtn.getAttribute('aria-expanded')).toBe('true');
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('https://api.klipy.com/v2/featured?'), expect.any(Object));
    await flush();
    const thumb = el.querySelector('.zcf-gif-thumb');
    expect(thumb).not.toBeNull();
    thumb.click();
    expect(api.sendMail).toHaveBeenCalledWith(THEM, `![Bibi Impressed](${proxied})`);
    expect(el.querySelector('.zcf-gifpanel').hidden).toBe(true);
    expect(gifBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('disables the GIF button whenever sending is disabled', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'access' }) });
    await flush();
    expect(el.querySelector('.zcf-gifbtn').disabled).toBe(true);
  });

  it('closes the GIF picker when the window minimizes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ results: [] }) });
    const { el, services } = mount({}, { fetchImpl });
    await flush();
    el.querySelector('.zcf-gifbtn').click();
    expect(el.querySelector('.zcf-gifpanel').hidden).toBe(false);
    el.querySelector('[title="Minimize"]').click();
    expect(el.querySelector('.zcf-gifpanel').hidden).toBe(true);
    expect(el.querySelector('.zcf-gifbtn').getAttribute('aria-expanded')).toBe('false');
    expect(services.store.get().dock.dms[0].open).toBe(false);
  });

  it('opens the emoji picker from the composer', async () => {
    const { el } = mount();
    await flush();
    const emojiBtn = el.querySelector('.zcf-emojibtn');
    expect(emojiBtn).not.toBeNull();
    expect(el.querySelector('.zcf-empanel').hidden).toBe(true);
    emojiBtn.click();
    expect(el.querySelector('.zcf-empanel').hidden).toBe(false);
    expect(emojiBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('picking a standard emoji inserts the unicode character at the caret', async () => {
    const { el } = mount();
    await flush();
    const input = el.querySelector('textarea');
    input.value = 'hi ';
    input.selectionStart = input.selectionEnd = 3;
    el.querySelector('.zcf-emojibtn').click();
    const search = el.querySelector('.zcf-em-search');
    search.value = 'joy';
    search.dispatchEvent(new Event('input'));
    el.querySelector('.zcf-em-grid .zcf-em-btn').click();
    expect(input.value).toBe('hi 😂');
    expect(input.selectionStart).toBe(input.value.length);
    expect(document.activeElement).toBe(input);
    expect(el.querySelector('.zcf-empanel').hidden).toBe(true);
  });

  it('picking a Zed City emoji inserts its :name: shortcode', async () => {
    const { el } = mount();
    await flush();
    const input = el.querySelector('textarea');
    el.querySelector('.zcf-emojibtn').click();
    el.querySelector('[title="Zed City"]').click();
    el.querySelector('.zcf-em-grid .zcf-em-btn').click();
    expect(input.value).toMatch(/^:[a-z0-9_]+:$/);
  });

  it('opening the emoji picker closes the GIF picker', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ results: [] }) });
    const { el } = mount({}, { fetchImpl });
    await flush();
    el.querySelector('.zcf-gifbtn').click();
    expect(el.querySelector('.zcf-gifpanel').hidden).toBe(false);
    el.querySelector('.zcf-emojibtn').click();
    expect(el.querySelector('.zcf-gifpanel').hidden).toBe(true);
    expect(el.querySelector('.zcf-gifbtn').getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.zcf-empanel').hidden).toBe(false);
  });

  it('disables the emoji button whenever sending is disabled', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'access' }) });
    await flush();
    expect(el.querySelector('.zcf-emojibtn').disabled).toBe(true);
  });

  it('renders a received Zed City emoji shortcode as its item image', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, 'nice :zed_pack:', '2026-09-28 14:02:00')] }) });
    await flush();
    const img = el.querySelector('.zcf-log img.zcf-emoji');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/items/zed_pack.webp');
    expect(img.getAttribute('alt')).toBe(':zed_pack:');
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

  it('shows a skull for an enemy in the header and on their messages', async () => {
    const { el, services, win } = mount({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, 'hi', '2026-09-28 14:02:00'), rawMsg(2, ME, 'yo', '2026-09-28 14:03:00')] }),
    });
    await flush();
    const headMark = el.querySelector('.chat-title .zcf-enemy-mark');
    expect(headMark.hidden).toBe(true);
    expect(el.classList.contains('zcf-enemy')).toBe(false);
    services.actions.addEnemy({ id: THEM, username: 'Spike' });
    win.update();
    expect(headMark.hidden).toBe(false);
    expect(el.classList.contains('zcf-enemy')).toBe(true);
    expect(el.querySelector('.zcf-them .zcf-enemy-mark')).not.toBeNull();
    expect(el.querySelectorAll('.zcf-sender:not(.zcf-them) .zcf-enemy-mark')).toHaveLength(0);
  });

  it('is a customizable chat keyed by its player, with message size on its messages and typing box', () => {
    const { el } = mount();
    expect(el.dataset.zcfChat).toBe(`dm:${THEM}`);
    expect(el.querySelector('.zcf-scroll').classList.contains('zcf-zoom')).toBe(true);
    expect(el.querySelector('.zcf-composer').classList.contains('zcf-zoom')).toBe(true);
  });

  it('mutes and unmutes the conversation from the bell, without toggling the window', () => {
    const { el, services, win } = mount();
    services.settings.subscribe(() => win.update());
    const bell = el.querySelector('.zcf-bell');
    expect(bell.title).toBe('Mute Spike');
    expect(bell.querySelector('i').className).toBe('fas fa-bell');
    bell.click();
    expect(services.actions.toggleMute).toHaveBeenCalledWith(THEM);
    expect(services.settings.get().muted).toEqual([THEM]);
    expect(bell.title).toBe('Unmute Spike');
    expect(bell.querySelector('i').className).toBe('fas fa-bell-slash');
    expect(bell.getAttribute('aria-pressed')).toBe('true');
    expect(services.store.get().dock.dms[0].open).toBe(true);
  });

  it('switches message times to local time when that option changes', async () => {
    const sent = '2026-09-28 14:02:00';
    const { el, services, win } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, 'hi', sent)] }) });
    await flush();
    const ts = Date.UTC(2026, 8, 28, 14, 2);
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    expect(el.querySelector('.zcf-time').textContent).toContain('14:02');
    services.settings.update((s) => { s.localTime = true; });
    win.update();
    expect(el.querySelector('.zcf-time').textContent).toContain(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  });
});
