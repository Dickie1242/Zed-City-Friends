import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatCustom } from '../../src/ui/chat-custom/index.js';
import { createKeeper } from '../../src/ui/keeper.js';
import { createSettingsStore } from '../../src/store.js';
import { updateChat } from '../../src/settings.js';
import { DOCK_HTML, wireGameHeaders } from '../fixtures/game-dom.js';
import { memoryStorage, flush } from '../helpers.js';

const OURS = `<div class="zcf-root">
  <div class="chat-container zcf zcf-dm zcf-open" data-zcf-chat="dm:5"><div class="chat-header"><div class="chat-title"><span>Spike</span></div><button class="zcf-hbtn" type="button">x</button></div><div class="chat-content"></div></div>
  <div class="chat-container zcf zcf-pm zcf-open" data-zcf-chat="pm"><div class="chat-header"><div class="chat-title"><span>Private Messages</span></div></div><div class="chat-content"></div></div>
</div>`;

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const ptr = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 });
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

let ctx = null;
function setup({ small = false } = {}) {
  document.body.innerHTML = DOCK_HTML;
  document.querySelector('.chat-containers').insertAdjacentHTML('afterbegin', OURS);
  wireGameHeaders();
  const settings = createSettingsStore({ playerId: 1, storage: memoryStorage(), win: new EventTarget() });
  const keeper = createKeeper();
  let isSmall = small;
  const dm = { name: vi.fn(() => 'Spike'), isMuted: vi.fn(() => false), toggleMute: vi.fn() };
  const general = document.querySelector('.general-chat');
  const faction = document.querySelector('.faction-chat');
  const pm = document.querySelector('[data-zcf-chat="pm"]');
  general.getBoundingClientRect = () => rect(600, 300, 350, 450);
  faction.getBoundingClientRect = () => rect(900, 720, 44, 40);
  const custom = createChatCustom({ settings, keeper, isSmall: () => isSmall, dm });
  custom.start();
  ctx = {
    custom,
    settings,
    keeper,
    dm,
    general,
    faction,
    pm,
    setSmall(v) {
      isSmall = v;
      custom.refresh();
    },
  };
  return ctx;
}
const chat = (key) => ctx.settings.get().chats[key];
const lockOf = (el) => el.querySelector(':scope > .chat-header .zcf-cc-lock');
const grips = (el) => [...el.querySelectorAll(':scope > .zcf-grip')].map((g) => g.dataset.zcfGrip);
const userCss = () => document.getElementById('zcf-user-settings').textContent;

describe('chat customization', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    if (ctx) {
      ctx.custom.destroy();
      ctx.keeper.destroy();
      ctx.settings.destroy();
    }
    ctx = null;
    vi.unstubAllGlobals();
  });

  it('puts a padlock in every chat header right after its title, the game chats included, and none on phones', () => {
    const { general, pm } = setup();
    for (const el of [general, pm, document.querySelector('[data-zcf-chat="dm:5"]')]) {
      const lock = lockOf(el);
      expect(lock).not.toBeNull();
      expect(lock.closest('.zcf-cc').previousElementSibling.classList.contains('chat-title')).toBe(true);
      expect(lock.title).toBe('Locked — click to unlock, right-click for options');
    }
    ctx.setSmall(true);
    expect(document.querySelectorAll('.zcf-cc')).toHaveLength(0);
  });

  it('toggles the lock without toggling the game chat, with grips only while unlocked', () => {
    const { general } = setup();
    lockOf(general).click();
    expect(chat('game:general')).toEqual({ locked: false });
    expect(general.classList.contains('chat-minimized')).toBe(false);
    expect(lockOf(general).title).toBe('Unlocked — drag to move, click to lock');
    expect(grips(general)).toEqual(['n', 'nw']);
    expect(userCss()).toContain('.general-chat{position:relative}');
    lockOf(general).click();
    expect(chat('game:general')).toBeUndefined();
    expect(grips(general)).toEqual([]);
  });

  it('moves an unlocked chat by its header past the threshold, while a still click still toggles it', () => {
    const { general } = setup();
    lockOf(general).click();
    const header = general.querySelector('.chat-header');
    header.dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointermove', 703, 312));
    expect(userCss()).not.toContain('position:fixed');
    document.dispatchEvent(ptr('pointermove', 650, 250));
    expect(userCss()).toContain('.general-chat{position:fixed;left:550px;top:240px');
    document.dispatchEvent(ptr('pointerup', 650, 250));
    click(header); // the click that ends a drag never reaches the game
    expect(general.classList.contains('chat-minimized')).toBe(false);
    expect(chat('game:general')).toEqual({ locked: false, x: 550, y: 240 });
    header.dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointerup', 700, 310));
    click(header);
    expect(general.classList.contains('chat-minimized')).toBe(true);
  });

  it('does not move a locked chat', () => {
    const { general } = setup();
    general.querySelector('.chat-header').dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointermove', 600, 200));
    document.dispatchEvent(ptr('pointerup', 600, 200));
    expect(chat('game:general')).toBeUndefined();
  });

  it('resizes from the grips within the limits, keeping a docked chat anchored', () => {
    const { general } = setup();
    lockOf(general).click();
    general.querySelector('.zcf-grip-nw').dispatchEvent(ptr('pointerdown', 600, 300));
    document.dispatchEvent(ptr('pointermove', 500, 250));
    expect(userCss()).toContain('width:450px');
    document.dispatchEvent(ptr('pointerup', 500, 250));
    expect(chat('game:general')).toEqual({ locked: false, w: 450, h: 500 });
    general.querySelector('.zcf-grip-n').dispatchEvent(ptr('pointerdown', 700, 300));
    document.dispatchEvent(ptr('pointermove', 700, -5000));
    document.dispatchEvent(ptr('pointerup', 700, -5000));
    expect(chat('game:general')).toEqual({ locked: false, w: 450, h: window.innerHeight - 60 });
  });

  it('returns a moved chat to the row with the arrow, keeping its size', () => {
    const { settings, general } = setup();
    settings.update((s) => updateChat(s, 'game:general', { x: 40, y: 50, w: 420 }));
    const back = general.querySelector('.zcf-cc-return');
    expect(back.hidden).toBe(false);
    back.click();
    expect(chat('game:general')).toEqual({ w: 420 });
    expect(general.querySelector('.zcf-cc-return').hidden).toBe(true);
  });

  it('changes message size one chat at a time from the right-click menu', () => {
    const { general } = setup();
    lockOf(general).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = document.querySelector('.zcf-cmenu');
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('Global');
    [...menu.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Larger messages').click();
    expect(chat('game:general')).toEqual({ text: 110 });
    expect(chat('pm')).toBeUndefined();
    expect(menu.textContent).toContain('110%');
    expect(userCss()).toContain('.general-chat .chat-content{zoom:1.1}');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('offers Mute in a DM chat menu', () => {
    setup();
    lockOf(document.querySelector('[data-zcf-chat="dm:5"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = document.querySelector('.zcf-cmenu');
    expect(menu.textContent).toContain('Spike');
    [...menu.querySelectorAll('button')].find((b) => b.textContent === 'Mute').click();
    expect(ctx.dm.toggleMute).toHaveBeenCalledWith(5);
  });

  it('shows message size and Reset in the header once a chat is 400px wide', () => {
    const { settings, general, pm } = setup();
    expect(general.querySelector('.zcf-cc-inline').hidden).toBe(true);
    settings.update((s) => updateChat(s, 'game:general', { w: 420 }));
    expect(general.querySelector('.zcf-cc-inline').hidden).toBe(false);
    expect(pm.querySelector('.zcf-cc-inline').hidden).toBe(true);
    general.querySelector('.zcf-cc-inline [aria-label="Smaller messages"]').click();
    expect(chat('game:general')).toEqual({ w: 420, text: 90 });
  });

  it('drags a bubble to a new spot without opening it', () => {
    const { faction } = setup();
    const header = faction.querySelector('.chat-header');
    header.dispatchEvent(ptr('pointerdown', 910, 730));
    document.dispatchEvent(ptr('pointermove', 860, 700));
    document.dispatchEvent(ptr('pointerup', 860, 700));
    click(header);
    expect(faction.classList.contains('chat-minimized')).toBe(true);
    expect(chat('game:faction')).toEqual({ x: 850, y: 690 });
  });

  it('puts the controls back after the game re-renders a header', async () => {
    const { general } = setup();
    general.querySelector('.zcf-cc').remove();
    await flush();
    await flush();
    expect(lockOf(general)).not.toBeNull();
  });

  it('never writes a class, attribute or inline style onto a game chat', async () => {
    const { general, faction, settings } = setup();
    lockOf(general).click();
    const header = general.querySelector('.chat-header');
    header.dispatchEvent(ptr('pointerdown', 700, 310));
    document.dispatchEvent(ptr('pointermove', 650, 250));
    document.dispatchEvent(ptr('pointerup', 650, 250));
    general.querySelector('.zcf-grip-s').dispatchEvent(ptr('pointerdown', 700, 740));
    document.dispatchEvent(ptr('pointermove', 700, 700));
    document.dispatchEvent(ptr('pointerup', 700, 700));
    settings.update((s) => updateChat(s, 'game:faction', { text: 150 }));
    await flush();
    for (const [el, cls] of [[general, 'chat-container general-chat'], [faction, 'chat-container faction-chat chat-minimized']]) {
      expect(el.className).toBe(cls);
      expect([...el.attributes].map((a) => a.name)).toEqual(['class']);
    }
  });
});
