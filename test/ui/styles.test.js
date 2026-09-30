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

  it('colors the Private Messages icon a soft green over the game rule that forces icons to currentColor', () => {
    renderDock(STATES[0]);
    const icon = document.querySelector('.zcf-pm .chat-icon');
    for (const sheets of [OURS_LAST, OURS_FIRST]) expect(winner(icon, 'color', 1280, sheets).value).toBe('#629464');
  });

  it('gives an open window its own full-width row on phones, with every bubble (the cog too) underneath', () => {
    renderDock({ friendsOpen: true, settingsOpen: false, dms: [[5, false]] });
    const dock = document.querySelector('.chat-containers');
    const pm = document.querySelector('.zcf-pm');
    const cog = document.querySelector('.zcf-settings');
    for (const sheets of [OURS_LAST, OURS_FIRST]) {
      expect(winner(dock, 'flex-wrap', 400, sheets).value).toBe('wrap-reverse');
      expect(winner(dock, 'left', 400, sheets).value).toBe('10px');
      expect(winner(pm, 'flex', 400, sheets).value).toBe('0 0 100%');
      expect(winner(pm, 'max-width', 400, sheets).value).toBe('none');
      // wrap-reverse stacks lines upwards, so the open window must come last or the cog gets a row above it.
      expect(Number(winner(pm, 'order', 400, sheets).value)).toBeGreaterThan(Number(winner(cog, 'order', 400, sheets).value));
      expect(winner(cog, 'display', 400, sheets).value).not.toBe('none');
      expect(winner(dock, 'flex-wrap', 1280, sheets).value).toBe('wrap-reverse'); // the desktop bar (0.8 spec)
    }
    renderDock({ friendsOpen: false, settingsOpen: false, dms: [[5, false]] });
    expect(winner(document.querySelector('.chat-containers'), 'flex-wrap', 400, OURS_LAST)).toBeNull();
  });

  it('lays the desktop dock out like Torn: icons in a bar along the bottom, open windows in a row above in the same order', () => {
    renderDock({ friendsOpen: true, settingsOpen: true, dms: [[5, true], [6, false]] });
    const q = (sel) => document.querySelector(sel);
    const dock = q('.chat-containers');
    const lineBreak = OURS.find((r) => r.selector === 'body .chat-containers::after' && mediaApplies(r.media, 1280));
    expect(Object.fromEntries(lineBreak.decls.map((d) => [d.prop, d.value]))).toMatchObject({ order: '10', flex: '0 0 100%' });
    expect(OURS.some((r) => r.selector === 'body .chat-containers::after' && mediaApplies(r.media, 400))).toBe(false);
    for (const sheets of [OURS_LAST, OURS_FIRST]) {
      const order = (el) => Number(winner(el, 'order', 1280, sheets).value);
      expect(winner(dock, 'flex-wrap', 1280, sheets).value).toBe('wrap-reverse');
      expect(winner(dock, 'justify-content', 1280, sheets).value).toBe('flex-end');
      // The bar, left to right: DM 6 (minimized), DM 5's stand-in, Faction (minimized), Global's stand-in, then Private Messages' and the cog's.
      const bar = [q('[data-zcf-chat="dm:6"]'), q('[data-zcf-stand="dm:5"]'), q('.faction-chat'), q('[data-zcf-stand="game:general"]'), q('[data-zcf-stand="pm"]'), q('[data-zcf-stand="settings"]')];
      expect(bar.map(order)).toEqual([1, 1, 3, 4, 5, 6]);
      // Above the line break (order 10): the open windows, in the bar's order.
      const windows = [q('[data-zcf-chat="dm:5"]'), q('.general-chat'), q('[data-zcf-chat="pm"]'), q('[data-zcf-chat="settings"]')];
      expect(windows.map(order)).toEqual([11, 14, 15, 16]);
    }
  });

  it('never lets a chat walk through the bar when it opens, and drops it straight back when it closes', () => {
    // The game animates every property of a chat (transition:all .3s), order included: a chat opening would
    // step through every slot between the bar and the window row, and one closing would keep its window size
    // in the bar for .3s, throwing the window row up and down. Opening still grows the window in place.
    renderDock({ friendsOpen: true, settingsOpen: false, dms: [[5, false]] });
    const pm = document.querySelector('.zcf-pm');
    const general = document.querySelector('.general-chat');
    const faction = document.querySelector('.faction-chat');
    const cog = document.querySelector('.zcf-settings');
    for (const sheets of [OURS_LAST, OURS_FIRST]) {
      for (const open of [pm, general]) expect(winner(open, 'transition', 1280, sheets).value).toBe('all .3s,order 0s');
      for (const closed of [faction, cog]) expect(winner(closed, 'transition', 1280, sheets).value).toBe('none');
      expect(winner(pm, 'transition', 400, sheets).value).toBe('none'); // phones: the game's own rule
    }
  });

  it("shows an open chat's icon in the bar, highlighted in teal, on desktop only", () => {
    renderDock({ friendsOpen: true, settingsOpen: false, dms: [[5, false]] });
    const stand = (key) => document.querySelector(`[data-zcf-stand="${key}"]`);
    for (const sheets of [OURS_LAST, OURS_FIRST]) {
      const display = (key, width = 1280) => winner(stand(key), 'display', width, sheets).value;
      expect([display('pm'), display('settings'), display('game:general'), display('game:faction')]).toEqual(['flex', 'none', 'flex', 'none']);
      expect([display('pm', 400), display('game:general', 400)]).toEqual(['none', 'none']);
      expect(winner(stand('pm').querySelector('.chat-header'), 'box-shadow', 1280, sheets).value).toBe('inset 0 2px 0 #0a748f');
      expect(winner(stand('pm').querySelector('.chat-icon'), 'color', 1280, sheets).value).toBe('#629464');
    }
  });

  it("gives the game's Faction chat the campground, the icon Faction has everywhere else in the game", () => {
    // Only the glyph changes, from our stylesheet: fa-users is \f0c0, fa-campground \f6bb in its Font Awesome.
    expect(CSS).toContain('body .chat-containers > .chat-container.faction-chat > .chat-header .chat-icon.fa-users:before{content:"\\f6bb"}');
    expect(CSS).not.toContain('\f');
  });

  it('draws a small speech bubble by one head of the friends icon, for Private Messages', () => {
    // \f075 is fa-comment. The dark outline separates it from the head it comes out of.
    expect(CSS).toContain('.zcf .zcf-pm-icon{position:relative}');
    expect(CSS).toContain('.zcf .zcf-pm-icon:after{content:"\\f075";position:absolute;top:-.34em;right:-.42em;font-size:.5em;line-height:1;text-shadow:1px 0 0 #040505,-1px 0 0 #040505,0 1px 0 #040505,0 -1px 0 #040505}');
  });

  it("gives the game's Global chat a globe, in the dock and on its icon in the bar", () => {
    // fa-comments is \f086, fa-globe \f0ac.
    expect(CSS).toContain('body .chat-containers > .chat-container.general-chat > .chat-header .chat-icon.fa-comments:before{content:"\\f0ac"}');
    expect(CSS).toContain('body .chat-containers .zcf-stand[data-zcf-stand="game:general"] .chat-icon.fa-comments:before{content:"\\f0ac"}');
  });

  it('parses specificity the way browsers count it', () => {
    expect(specificity('.chat-container .chat-content')).toEqual([0, 2, 0]);
    expect(specificity('.zcf-dm:not(.chat-minimized)')).toEqual([0, 2, 0]);
    expect(specificity('html.chat-fullscreen-lock')).toEqual([0, 1, 1]);
    expect(specificity('.zcf-row:hover .zcf-row-actions')).toEqual([0, 3, 0]);
    expect(specificity('.zcf-gifbtn[aria-expanded="true"]')).toEqual([0, 2, 0]);
  });
});
