import { describe, it, expect, afterEach } from 'vitest';
import { createSettingsWindow } from '../../src/ui/settings-window.js';
import { openDm } from '../../src/state.js';
import { updateChat } from '../../src/settings.js';
import { WHATS_NEW } from '../../src/whats-new.js';
import { makeServices } from './services.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

let current = null;
function mount({ open = true } = {}) {
  document.body.innerHTML = DOCK_HTML;
  const services = makeServices();
  const w = createSettingsWindow(services);
  const root = document.createElement('div');
  root.className = 'zcf-root';
  root.appendChild(w.el);
  document.querySelector('.chat-containers').prepend(root);
  services.store.subscribe(() => w.update());
  services.settings.subscribe(() => w.update());
  if (open) services.store.update((s) => { s.dock.settingsOpen = true; });
  w.update();
  current = w;
  return { services, w, el: w.el };
}
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
const chatRows = (el) => [...el.querySelectorAll('.zcf-set-chat')].map((r) => [r.querySelector('.zcf-name').textContent, r.querySelector('.zcf-status').textContent]);

describe('chat settings window', () => {
  afterEach(() => {
    if (current) current.destroy();
    current = null;
  });

  it('is a plain cog tab, never with a badge or dot', () => {
    const { el } = mount({ open: false });
    expect(el.dataset.zcfChat).toBe('settings');
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.querySelector('.chat-icon').className).toContain('fa-cog');
    expect(el.querySelector('.q-badge, .unread-badge, .zcf-badge, .zcf-pill')).toBeNull();
    expect(el.querySelector('.zcf-body').hidden).toBe(true);
  });

  it('lists every chat there is with its settings, and resets one or all', () => {
    const { services, el } = mount();
    services.store.update((s) => openDm(s, 5, { username: 'Spike', now: 1 }));
    services.settings.update((s) => {
      updateChat(s, 'game:general', { x: 1, y: 2, w: 420, h: 520, text: 120 });
      updateChat(s, 'dm:9', { text: 90 });
    });
    expect(el.querySelector('.chat-title').textContent).toContain('Chat settings');
    expect(chatRows(el)).toEqual([
      ['Faction', 'docked · default size · text 100%'],
      ['Global', 'moved · 420×520 · text 120%'],
      ['Private Messages', 'docked · default size · text 100%'],
      ['Chat settings', 'docked · default size · text 100%'],
      ['Spike', 'docked · default size · text 100%'],
      ['#9', 'docked · default size · text 90%'],
    ]);
    button(el.querySelectorAll('.zcf-set-chat')[1], 'Reset').click();
    expect(services.actions.resetChat).toHaveBeenCalledWith('game:general');
    expect(services.settings.get().chats['game:general']).toBeUndefined();
    button(el, 'Reset all chats').click();
    expect(services.settings.get().chats).toEqual({});
  });

  it('marks all as read with progress, and closes all private chats', async () => {
    const { services, el } = mount();
    let finish;
    services.actions.markAllRead.mockImplementation((onProgress) => new Promise((resolve) => {
      onProgress(0, 3);
      onProgress(1, 3);
      finish = () => {
        onProgress(3, 3);
        resolve(3);
      };
    }));
    button(el, 'Mark all as read').click();
    expect(el.textContent).toContain('Marking… 1/3');
    finish();
    await flush();
    expect(button(el, 'Mark all as read')).toBeTruthy();
    button(el, 'Close all private chats').click();
    expect(services.actions.closeAllDms).toHaveBeenCalled();
  });

  it('picks the new-message sound and plays a test', () => {
    const { services, el } = mount();
    const select = el.querySelector('select');
    const play = el.querySelector('.zcf-set-play');
    expect(select.value).toBe('off');
    expect(play.disabled).toBe(true);
    select.value = 'ping';
    select.dispatchEvent(new Event('change'));
    expect(services.settings.get().sound).toBe('ping');
    expect(play.disabled).toBe(false);
    play.click();
    expect(services.sound.play).toHaveBeenCalledWith('ping');
  });

  it("shows the version and a collapsed What's new, as text only", () => {
    const { el } = mount();
    expect(el.textContent).toContain('Zed City Friends v');
    expect(el.querySelector('.zcf-news-ver')).toBeNull();
    button(el, `What's new in v${WHATS_NEW[0].version} ▸`).click();
    const versions = () => [...el.querySelectorAll('.zcf-news-vh')].map((n) => n.firstChild.textContent);
    expect(versions()).toEqual([`v${WHATS_NEW[0].version}`]);
    expect(el.textContent).toContain(WHATS_NEW[0].features[0].title);
    button(el, 'Earlier versions ▸').click();
    expect(versions()).toEqual(WHATS_NEW.map((v) => `v${v.version}`));
    expect(el.querySelector('.zcf-news img, .zcf-news a')).toBeNull();
    button(el, `What's new in v${WHATS_NEW[0].version} ▾`).click();
    expect(el.querySelector('.zcf-news-ver')).toBeNull();
  });
});
