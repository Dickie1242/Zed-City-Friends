import { describe, it, expect, afterEach } from 'vitest';
import { createTimeHover } from '../../src/ui/time-hover.js';
import { createGameClock } from '../../src/ui/game-clock.js';
import { memoryStorage } from '../helpers.js';

// Tests run in America/New_York (vitest.config.js): 2026-09-29 is daylight time, UTC-4.
const NOW = Date.UTC(2026, 8, 29, 18, 30); // 18:30 ZCT, 14:30 in New York
let hover = null;

const over = (el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
const tip = () => document.querySelector('.zcf-tip');

function mount(html, { local = false } = {}) {
  document.body.innerHTML = html;
  const gameClock = createGameClock({ doc: document, storage: memoryStorage({ 'zcf:v1:1:gameClock': 'local' }), key: 'zcf:v1:1:gameClock', now: () => NOW });
  hover = createTimeHover({ doc: document, win: window, now: () => NOW, isLocal: () => local, gameClock });
  return gameClock;
}

describe('time hover', () => {
  afterEach(() => {
    if (hover) hover.destroy();
    hover = null;
  });

  const ts = Date.UTC(2026, 8, 29, 16, 2);
  const dm = `<div class="zcf-msg"><span class="zcf-time" data-zcf-ts="${ts}">16:02</span></div><div class="zcf-msg zcf-grouped" data-zcf-ts="${ts}">hi</div>`;

  it('shows your time with its day and zone over a DM time in ZCT, and both clocks over a grouped message', () => {
    mount(dm);
    over(document.querySelector('.zcf-time'));
    expect(tip().textContent).toBe('Tue, Sep 29, 12:02 EDT');
    over(document.querySelector('.zcf-grouped'));
    expect(tip().textContent).toBe('Tue, Sep 29, 16:02 ZCT · 12:02 EDT');
    over(document.body);
    expect(tip().hidden).toBe(true);
  });

  it('flips with the Time setting: your time shown, ZCT on hover', () => {
    mount(dm, { local: true });
    over(document.querySelector('.zcf-time'));
    expect(tip().textContent).toBe('Tue, Sep 29, 16:02 ZCT');
    over(document.querySelector('.zcf-grouped'));
    expect(tip().textContent).toBe('Tue, Sep 29, 12:02 EDT · 16:02 ZCT');
  });

  it('names the other day when the two clocks are on different days', () => {
    const late = Date.UTC(2026, 8, 29, 2, 15); // 02:15 ZCT on the 29th is 22:15 on the 28th in New York
    mount(`<div class="zcf-msg zcf-grouped" data-zcf-ts="${late}">hi</div><span class="zcf-time" data-zcf-ts="${late}">02:15</span>`);
    over(document.querySelector('.zcf-grouped'));
    expect(tip().textContent).toBe('Tue, Sep 29, 02:15 ZCT · Mon, Sep 28, 22:15 EDT');
    over(document.querySelector('.zcf-time'));
    expect(tip().textContent).toBe('Mon, Sep 28, 22:15 EDT');
  });

  it("does the same over the game's Global and Faction times", () => {
    const gc = mount('<div class="chat-container faction-chat"><div class="msg-cont"><span class="msg-time">13:59</span></div></div>');
    const el = document.querySelector('.msg-time');
    gc.rewrite(el.parentNode, 'game');
    expect(el.textContent).toBe('17:59');
    over(el);
    expect(tip().textContent).toBe('Tue, Sep 29, 13:59 EDT');
  });
});
