import { describe, it, expect } from 'vitest';
import { createDockView, visibleDms, SMALL_MAX_DMS } from '../../src/ui/dock-view.js';
import { openDm } from '../../src/state.js';
import { makeServices } from './services.js';
import { CSS } from '../../src/ui/styles.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';

describe('dock view', () => {
  it(`shows every DM on desktop but only the ${SMALL_MAX_DMS} most recent on phones`, () => {
    const dms = [{ id: 1, lastUsed: 3 }, { id: 2, lastUsed: 1 }, { id: 3, lastUsed: 2 }];
    expect(visibleDms(dms, false)).toBe(dms);
    expect(visibleDms(dms, true).map((d) => d.id)).toEqual([1, 3]);
  });

  it('keeps an open DM visible on phones even after two newer pop-ups would otherwise evict it', () => {
    // id 1 is open (the person is reading it) despite being the least recently used; ids 2 and 3
    // pop up afterward and would fill both SMALL_MAX_DMS slots on their own.
    const dms = [{ id: 1, lastUsed: 1, open: true }, { id: 2, lastUsed: 5 }, { id: 3, lastUsed: 4 }];
    expect(visibleDms(dms, true).map((d) => d.id).sort()).toEqual([1, 2]);
  });

  it('orders DM windows (store order) before Private Messages and Chat settings, and removes closed ones', () => {
    const services = makeServices();
    const root = document.createElement('div');
    const view = createDockView({ root, services });
    services.store.update((s) => {
      openDm(s, 7, { now: 1 });
      openDm(s, 8, { now: 2 });
    });
    view.render();
    expect([...root.children].filter((c) => c.dataset.zcfChat).map((c) => c.dataset.zcfChat)).toEqual(['dm:7', 'dm:8', 'pm', 'settings']);
    services.store.update((s) => { s.dock.dms = s.dock.dms.filter((d) => d.id !== 7); });
    view.render();
    expect([...root.children].filter((c) => c.dataset.zcfChat).map((c) => c.dataset.zcfChat)).toEqual(['dm:8', 'pm', 'settings']);
    expect(services.conversations.get(7)).toBeNull();
  });

  it('tucks Private Messages into the corner with CSS order, beyond an open window on phones', () => {
    expect(CSS).toContain('.chat-containers .zcf-pm{order:2}');
    expect(CSS).toContain('.chat-containers .zcf-settings{order:4}');
    expect(CSS).toContain('.chat-containers .zcf.zcf-open{order:3');
  });

  describe('stand-in icons', () => {
    function mount() {
      document.body.innerHTML = DOCK_HTML;
      const services = makeServices();
      const root = document.createElement('div');
      root.className = 'zcf-root';
      document.querySelector('.chat-containers').prepend(root);
      const view = createDockView({ root, services });
      return { services, root, view, stand: (key) => root.querySelector(`[data-zcf-stand="${key}"]`) };
    }

    it('puts one right after each of our windows, and one for each game chat, all outside the chat list', () => {
      const { services, root, view } = mount();
      services.store.update((s) => openDm(s, 7, { now: 1 }));
      view.render();
      expect([...root.children].map((c) => c.dataset.zcfChat || `stand:${c.dataset.zcfStand}`)).toEqual([
        'dm:7', 'stand:dm:7', 'pm', 'stand:pm', 'settings', 'stand:settings', 'stand:game:general', 'stand:game:faction', 'stand:game:activity',
      ]);
      for (const stand of root.querySelectorAll('.zcf-stand')) {
        expect(stand.classList.contains('chat-minimized')).toBe(true);
        expect(stand.hasAttribute('data-zcf-chat')).toBe(false);
      }
    });

    it('shows ours only while their window is open, and a click closes that window', () => {
      const { services, view, stand } = mount();
      services.store.update((s) => {
        openDm(s, 7, { now: 1, expand: true, username: 'Spike' });
        s.dock.friendsOpen = true;
      });
      view.render();
      expect([stand('dm:7').hidden, stand('pm').hidden, stand('settings').hidden]).toEqual([false, false, true]);
      expect(stand('dm:7').querySelector('.zcf-dm-name').textContent).toBe('Spike');
      expect(stand('pm').querySelector('.chat-icon').className).toContain('fa-user-friends zcf-pm-icon');
      expect(stand('settings').querySelector('.chat-icon').className).toContain('fa-cog');
      stand('dm:7').click();
      expect(services.actions.minimizeDm).toHaveBeenCalledWith(7);
      view.render();
      expect(stand('dm:7').hidden).toBe(true);
      stand('pm').click();
      expect(services.actions.togglePm).toHaveBeenCalled();
      services.store.update((s) => { s.dock.settingsOpen = true; });
      view.render();
      expect(stand('settings').hidden).toBe(false);
      stand('settings').click();
      expect(services.actions.toggleSettings).toHaveBeenCalled();
    });

    it("has the game's icon even for a chat the game adds later", () => {
      const { view, stand } = mount(); // the fixture has no Activity chat
      view.render();
      expect(stand('game:activity').querySelector('.chat-icon').className).toContain('fa-radar');
      expect(stand('game:faction').querySelector('.chat-icon').className).toContain('fa-users');
    });

    it("gives each game chat one with the game chat's icon, closing the chat through the game's own header", () => {
      const { view, stand } = mount();
      view.render();
      expect(stand('game:general').querySelector('.chat-icon').className).toContain('fa-comments');
      let clicks = 0;
      document.querySelector('.chat-containers > .general-chat > .chat-header').addEventListener('click', () => { clicks += 1; });
      stand('game:general').click();
      expect(clicks).toBe(1);
    });
  });
});
