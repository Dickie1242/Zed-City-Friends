import { describe, it, expect, beforeEach } from 'vitest';
import { CSS } from '../../src/ui/styles.js';
import { createDockView } from '../../src/ui/dock-view.js';
import { addFriend, openDm, setDmOpen, setFriendsOpen } from '../../src/state.js';
import { makeServices } from './services.js';
import { DOCK_HTML, HEADER_HTML, PAGE_404_HTML } from '../fixtures/game-dom.js';
import { createFriendsPage } from '../../src/ui/friends-page.js';
import { createTopbarButton } from '../../src/ui/topbar-button.js';
import { GAME_DOCK_CSS } from '../fixtures/game-dock-css.js';
import { specificity, parseCss, mediaApplies, matches, winner } from './cascade.js';
import { createChatCustom } from '../../src/ui/chat-custom/index.js';
import { createSettingsStore } from '../../src/store.js';
import { updateChat } from '../../src/settings.js';
import { memoryStorage } from '../helpers.js';

const GAME = parseCss(GAME_DOCK_CSS);
const OURS = parseCss(CSS);
const OURS_LAST = [GAME, OURS];
const OURS_FIRST = [OURS, GAME];
const WIDTHS = [1280, 800, 400];

// Every window state we draw: open and minimized DMs, and the Friends window both ways.
const STATES = [
  { friendsOpen: true, settingsOpen: true, dms: [[5, true], [6, false]] },
  { friendsOpen: false, settingsOpen: false, dms: [[5, false], [6, true]] },
];

function renderDock({ friendsOpen, settingsOpen, dms }) {
  document.body.innerHTML = DOCK_HTML;
  const root = document.createElement('div');
  root.className = 'zcf-root';
  document.querySelector('.chat-containers').prepend(root);
  const services = makeServices();
  services.store.update((s) => {
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    for (const [id, open] of dms) {
      openDm(s, id, { expand: open, now: id, username: `P${id}` });
      setDmOpen(s, id, open);
    }
    setFriendsOpen(s, friendsOpen);
    s.dock.settingsOpen = !!settingsOpen;
  });
  createDockView({ root, services }).render();
  return root;
}

const describeEl = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
const hasOurRule = (selector) => OURS.some((r) => r.selector === selector);

// Every computed value of ours under `root` that would change if the game's stylesheet loaded after ours.
function orderProblems(root) {
  const problems = [];
  for (const width of WIDTHS) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const props = new Set(OURS.filter((r) => mediaApplies(r.media, width) && matches(el, r.selector)).flatMap((r) => r.decls.map((d) => d.prop)));
      for (const prop of props) {
        const last = winner(el, prop, width, OURS_LAST);
        const first = winner(el, prop, width, OURS_FIRST);
        if (last.value !== first.value) {
          problems.push(`${width}px ${describeEl(el)} ${prop}: "${last.value}" (${last.selector}) if ours loads last, "${first.value}" (${first.selector}) if ours loads first`);
        }
      }
    }
  }
  return problems;
}

describe('styles against the game dock CSS', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('never depends on whether the game stylesheet or ours loaded last', () => {
    const problems = new Set();
    for (const state of STATES) for (const p of orderProblems(renderDock(state))) problems.add(p);
    expect([...problems]).toEqual([]);
  });

  it('keeps the page and top-bar rules order-independent too', () => {
    document.body.innerHTML = HEADER_HTML + PAGE_404_HTML;
    const services = makeServices({ presence: { 5: { online: true, active: 0, profile: { level: 3, faction: { id: 2, name: 'F' }, injured: true, traveling: true } } } });
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      addFriend(s, { id: 6, username: 'Nyx' }, 0);
    });
    const page = createFriendsPage(services);
    page.onRoute('/friends');
    const topbar = createTopbarButton({ router: services.router });
    topbar.start();
    expect(document.querySelector('.zcf-page-table th').textContent).toBe('Name');
    expect(hasOurRule('.zcf-page-table th')).toBe(true);
    // The add-friend pop-out sits in a button-sized positioned box; a % max-width would squash it.
    document.querySelector('.zcf-page-add').click();
    expect(winner(document.querySelector('.zcf-page .zcf-pop'), 'max-width', 400, OURS_LAST).value).toBe('calc(100vw - 32px)');
    expect([...orderProblems(document.querySelector('main.zcf-page')), ...orderProblems(document.querySelector('.zcf-topbar'))]).toEqual([]);
    page.destroy();
    topbar.destroy();
  });

  it('lays out every open window body as a flex column, so the DM composer and the Friends list scroll fit', () => {
    const checked = new Set();
    for (const state of STATES) {
      const root = renderDock(state);
      for (const body of root.querySelectorAll('.zcf.chat-container:not(.chat-minimized) > .chat-content')) {
        checked.add(body.parentElement.dataset.zcfChat.split(':')[0]);
        for (const width of WIDTHS) {
          for (const sheets of [OURS_LAST, OURS_FIRST]) {
            expect(winner(body, 'display', width, sheets).value, `${describeEl(body.parentElement)} at ${width}px`).toBe('flex');
            expect(winner(body, 'flex-direction', width, sheets).value).toBe('column');
          }
        }
      }
    }
    expect([...checked].sort()).toEqual(['dm', 'pm', 'settings']);
  });

  it('sits the dock flush against the right edge on desktop only', () => {
    renderDock(STATES[0]);
    const dock = document.querySelector('.chat-containers');
    for (const sheets of [OURS_LAST, OURS_FIRST]) {
      expect(winner(dock, 'right', 1280, sheets).value).toBe('0');
      expect(winner(dock, 'right', 400, sheets).value).toBe('10px');
    }
  });

  it('keeps the chat controls and grips we put in the game chats order-independent', () => {
    renderDock(STATES[0]);
    const settings = createSettingsStore({ playerId: 1, storage: memoryStorage(), win: new EventTarget() });
    settings.update((s) => updateChat(s, 'game:general', { locked: false, x: 5, y: 5 }));
    const custom = createChatCustom({ settings, isSmall: () => false });
    custom.start();
    const general = document.querySelector('.general-chat');
    const ours = [general.querySelector('.zcf-cc'), ...general.querySelectorAll(':scope > .zcf-grip')];
    expect(ours).toHaveLength(5);
    expect(ours.flatMap((n) => orderProblems(n))).toEqual([]);
    custom.destroy();
    settings.destroy();
  });

  it('colors the Private Messages envelope green over the game rule that forces icons to currentColor', () => {
    renderDock(STATES[0]);
    const icon = document.querySelector('.zcf-pm .chat-icon');
    for (const sheets of [OURS_LAST, OURS_FIRST]) expect(winner(icon, 'color', 1280, sheets).value).toBe('#3d8b40');
  });

  it('parses specificity the way browsers count it', () => {
    expect(specificity('.chat-container .chat-content')).toEqual([0, 2, 0]);
    expect(specificity('.zcf-dm:not(.chat-minimized)')).toEqual([0, 2, 0]);
    expect(specificity('html.chat-fullscreen-lock')).toEqual([0, 1, 1]);
    expect(specificity('.zcf-row:hover .zcf-row-actions')).toEqual([0, 3, 0]);
    expect(specificity('.zcf-gifbtn[aria-expanded="true"]')).toEqual([0, 2, 0]);
  });
});
