import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSettingsWindow } from '../../src/ui/settings-window.js';
import { openDm } from '../../src/state.js';
import { updateChat, setMuted } from '../../src/settings.js';
import { WHATS_NEW } from '../../src/whats-new.js';
import { DEV_PROFILE_ID, UPDATE_URL } from '../../src/version.js';
import { makeServices } from './services.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

let current = null;
function mount({ open = true, fetchImpl } = {}) {
  document.body.innerHTML = DOCK_HTML;
  const services = makeServices({ fetchImpl });
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
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const tab = (el, name) => button(el.querySelector('[role="tablist"]'), name);
const box = (el, label) => [...el.querySelectorAll('.zcf-set-toggle')].find((l) => l.querySelector('.zcf-set-label').textContent === label).querySelector('input');
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

  it('opens on General with three tabs, and remembers the tab', () => {
    const { services, el } = mount();
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['General', 'Chats', 'About']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(el.textContent).toContain('Desktop notifications');
    tab(el, 'About').click();
    expect(services.settings.get().settingsTab).toBe('about');
    expect(el.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('About');
    expect(el.textContent).not.toContain('Desktop notifications');
  });

  describe('General', () => {
    it('has the notification boxes, with Friends only and Test waiting on notifications', () => {
      const { services, el } = mount();
      expect(box(el, 'Desktop notifications').checked).toBe(false);
      expect(box(el, 'Friends only').disabled).toBe(true);
      expect(button(el, 'Test').disabled).toBe(true);
      expect(box(el, 'Unread count in the browser tab').checked).toBe(true);
      box(el, 'Desktop notifications').click();
      expect(services.actions.setNotify).toHaveBeenCalledWith(true);
      expect(box(el, 'Friends only').disabled).toBe(false);
      button(el, 'Test').click();
      expect(services.notifier.show).toHaveBeenCalledWith(expect.objectContaining({ id: 0, title: 'Zed City Friends' }));
      expect(services.toast).toHaveBeenCalledWith("Your browser didn't show it. Check its notification settings.", { error: true });
      box(el, 'Unread count in the browser tab').click();
      expect(services.actions.setTitleCount).toHaveBeenCalledWith(false);
    });

    it('explains when the browser blocks notifications or has none', () => {
      const { services, el, w } = mount();
      services.notifier.permission.mockReturnValue('denied');
      w.update();
      expect(el.querySelector('.zcf-set-note').textContent).toContain('blocked');
      services.notifier.supported = false;
      w.update();
      expect(el.querySelector('.zcf-set-note').textContent).toContain('Not supported');
      expect(box(el, 'Desktop notifications').disabled).toBe(true);
    });

    it('picks both sounds, plays them at the volume, and saves the volume', () => {
      const { services, el } = mount();
      const pm = el.querySelector('select[aria-label="New private message sound"]');
      const mention = el.querySelector('select[aria-label="Mention sound"]');
      pm.value = 'ping';
      pm.dispatchEvent(new Event('change'));
      mention.value = 'bell';
      mention.dispatchEvent(new Event('change'));
      expect(services.settings.get()).toMatchObject({ sound: 'ping', mentionSound: 'bell' });
      const volume = el.querySelector('input[type="range"]');
      volume.value = '40';
      volume.dispatchEvent(new Event('change'));
      expect(services.settings.get().volume).toBe(40);
      expect(services.sound.play).toHaveBeenLastCalledWith('ping', { fromUser: true, volume: 40 });
      el.querySelectorAll('.zcf-set-play')[1].click();
      expect(services.sound.play).toHaveBeenLastCalledWith('bell', { fromUser: true, volume: 40 });
    });

    it('takes mention words and tidies them, and turns highlights off', () => {
      const { services, el } = mount();
      expect(box(el, 'Highlight messages that mention you').checked).toBe(true);
      expect(el.textContent).toContain('your name, Me');
      const words = el.querySelector('input[aria-label="Also highlight these words"]');
      words.value = ' DWR, dwr , mothy,x';
      words.dispatchEvent(new Event('change'));
      expect(services.settings.get().mentionWords).toEqual(['DWR', 'mothy']);
      expect(words.value).toBe('DWR, mothy');
      box(el, 'Highlight messages that mention you').click();
      expect(services.settings.get().mentions).toBe(false);
      expect(words.disabled).toBe(true);
    });

    it('has the 12-hour clock and the time hover boxes', () => {
      const { services, el } = mount();
      box(el, '12-hour clock').click();
      expect(services.settings.get().clock12).toBe(true);
      box(el, 'Your own time in the time hover').click();
      expect(services.actions.setHoverLocal).toHaveBeenCalledWith(false);
    });

    it('marks all as read with progress, and closes all private chats', async () => {
      const { services, el } = mount();
      let finish;
      services.actions.markAllRead.mockImplementation((onProgress) => new Promise((resolve) => {
        onProgress(1, 3);
        finish = () => resolve(3);
      }));
      button(el, 'Mark all as read').click();
      expect(el.textContent).toContain('Marking… 1/3');
      finish();
      await flush();
      expect(button(el, 'Mark all as read')).toBeTruthy();
      button(el, 'Close all private chats').click();
      expect(services.actions.closeAllDms).toHaveBeenCalled();
    });

    it('keeps focus on the sound picker when the window redraws', () => {
      const { services, el } = mount();
      const select = el.querySelector('select[aria-label="New private message sound"]');
      select.focus();
      services.settings.update((s) => updateChat(s, 'pm', { text: 120 }));
      expect(document.activeElement).toBe(select);
    });
  });

  describe('Chats', () => {
    it('lists game chats, then private chats, in plain words, and opens one row at a time', () => {
      const { services, el } = mount();
      services.store.update((s) => openDm(s, 5, { username: 'Spike', now: 1 }));
      services.settings.update((s) => {
        updateChat(s, 'game:general', { x: 1, y: 2, w: 420, h: 520, text: 120 });
        updateChat(s, 'dm:9', { text: 90 });
      });
      tab(el, 'Chats').click();
      expect(chatRows(el)).toEqual([
        ['Global', 'Moved · Resized · Text 120%'],
        ['Faction', 'As the game made it'],
        ['Private Messages', 'As it came'],
        ['#9', 'Text 90%'],
        ['Spike', 'As it came'],
        ['Chat settings', 'As it came'],
      ]);
      const global = el.querySelectorAll('.zcf-set-chat')[0];
      global.click();
      expect(el.querySelectorAll('.zcf-set-panel')).toHaveLength(1);
      const panel = el.querySelector('.zcf-set-panel');
      expect(panel.textContent).toContain('Moved');
      expect(panel.textContent).toContain('420 × 520');
      button(panel, 'Back to the dock').click();
      expect(services.settings.get().chats['game:general']).toEqual({ w: 420, h: 520, text: 120 });
      button(el.querySelector('.zcf-set-panel'), 'Default size').click();
      button(el.querySelector('.zcf-set-panel'), 'Unlock').click();
      expect(services.settings.get().chats['game:general']).toEqual({ text: 120, locked: false });
      el.querySelector('.zcf-set-panel [aria-label="Larger text"]').click();
      expect(services.settings.get().chats['game:general'].text).toBe(130);
      button(el.querySelector('.zcf-set-panel'), 'Reset everything').click();
      expect(services.settings.get().chats['game:general']).toBeUndefined();
      el.querySelectorAll('.zcf-set-chat')[1].click();
      expect(el.querySelector('.zcf-set-chat[aria-expanded="true"] .zcf-name').textContent).toBe('Faction');
    });

    it('sets the text size for every chat, and resets all chats', () => {
      const { services, el } = mount();
      services.settings.update((s) => updateChat(s, 'pm', { w: 400 }));
      tab(el, 'Chats').click();
      el.querySelector('[aria-label="Larger text in every chat"]').click();
      expect(services.settings.get().textAll).toBe(110);
      expect(el.querySelector('.zcf-set-value').textContent).toBe('110%');
      button(el, 'Reset all chats').click();
      expect(services.settings.get()).toMatchObject({ chats: {}, textAll: 100 });
    });

    it('lists muted chats to unmute or open', () => {
      const { services, el } = mount();
      services.store.update((s) => openDm(s, 5, { username: 'Spike', now: 1 }));
      tab(el, 'Chats').click();
      expect(el.textContent).toContain('No muted chats.');
      services.settings.update((s) => {
        setMuted(s, 5, true);
        setMuted(s, 77, true);
      });
      const names = [...el.querySelectorAll('.zcf-set-mname')].map((b) => b.textContent);
      expect(names).toEqual(['#77', 'Spike']);
      button(el, 'Spike').click();
      expect(services.actions.openDm).toHaveBeenCalledWith(5, expect.objectContaining({ expand: true }));
      el.querySelectorAll('.zcf-set-mrow')[1].querySelector('.zcf-mini').click();
      expect(services.settings.get().muted).toEqual([77]);
    });
  });

  describe('About', () => {
    it('checks for updates on a click and offers the newer version', async () => {
      const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('// @version      99.0.0\n') }));
      const { el } = mount({ fetchImpl });
      tab(el, 'About').click();
      expect(el.textContent).toContain('Zed City Friends v');
      expect(fetchImpl).not.toHaveBeenCalled();
      button(el, 'Check for updates').click();
      expect(el.textContent).toContain('Checking…');
      await flush();
      await flush();
      expect(el.textContent).toContain('v99.0.0 is out');
      const link = [...el.querySelectorAll('a')].find((a) => a.textContent === 'Update now');
      expect(link.getAttribute('href')).toBe(UPDATE_URL);
      expect(link.getAttribute('target')).toBe('_blank');
    });

    it("shows What's new as titles to open, with earlier versions behind a toggle", () => {
      const { el } = mount();
      tab(el, 'About').click();
      const titles = () => [...el.querySelectorAll('.zcf-set-feat')].map((b) => b.textContent.trim());
      expect(titles()).toEqual(WHATS_NEW[0].features.map((f) => f.title));
      expect(el.querySelector('.zcf-set-points')).toBeNull();
      el.querySelector('.zcf-set-feat').click();
      expect(el.querySelector('.zcf-set-points').textContent).toContain(WHATS_NEW[0].features[0].points[0]);
      button(el, 'Earlier versions ▸').click();
      expect([...el.querySelectorAll('.zcf-news-vh')].map((n) => n.firstChild.textContent)).toEqual(WHATS_NEW.slice(1).map((v) => `v${v.version}`));
      expect(el.querySelector('.zcf-set-feat img, .zcf-set-points a')).toBeNull();
    });

    it('saves and loads a backup, and restores defaults after asking', () => {
      const { services, el } = mount();
      tab(el, 'About').click();
      const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      button(el, 'Load backup').click();
      expect(click).toHaveBeenCalled();
      click.mockRestore();
      services.settings.update((s) => { s.sound = 'bell'; });
      button(el, 'Restore default settings').click();
      expect(el.textContent).toContain('Put every setting back to how it came?');
      button(el, 'Cancel').click();
      expect(services.settings.get().sound).toBe('bell');
      button(el, 'Restore default settings').click();
      button(el, 'Restore').click();
      expect(services.actions.restoreDefaults).toHaveBeenCalled();
      expect(services.settings.get().sound).toBe('off');
      expect(button(el, 'Restore default settings')).toBeTruthy();
    });

    it("ends with a small link to the dev's profile, opened in-app", () => {
      const { services, el } = mount();
      tab(el, 'About').click();
      const link = el.querySelector('.zcf-set-dev');
      expect(link.textContent.trim()).toBe('Become friends or enemies with the dev!');
      expect(link.getAttribute('href')).toBe(`/profile/${DEV_PROFILE_ID}`);
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(services.router.navigate).toHaveBeenCalledWith(`/profile/${DEV_PROFILE_ID}`);
      expect(el.querySelector('.zcf-set-sec:last-child').lastElementChild).toBe(link);
    });
  });
});
