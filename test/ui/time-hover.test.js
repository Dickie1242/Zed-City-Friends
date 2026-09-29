import { describe, it, expect, afterEach } from 'vitest';
import { createTimeHover } from '../../src/ui/time-hover.js';
import { memoryStorage } from '../helpers.js';

// Tests run in America/New_York (vitest.config.js): 2026-09-29 is daylight time, UTC-4.
const NOW = Date.UTC(2026, 8, 29, 18, 30); // 18:30 ZCT, 14:30 in New York
const KEY = 'zcf:v1:1:gameClock';
let hover = null;

const gameChat = (...times) =>
  `<div class="chat-container general-chat">${times.map((t) => `<div class="msg-cont"><span class="sender-name">A</span><span class="msg-time">${t}</span></div>`).join('')}</div>`;
const over = (el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
const tip = () => document.querySelector('.zcf-tip');

function mount(html, storage = memoryStorage()) {
  document.body.innerHTML = html;
  hover = createTimeHover({ doc: document, win: window, storage, key: KEY, now: () => NOW });
  return storage;
}

describe('time hover', () => {
  afterEach(() => {
    if (hover) hover.destroy();
    hover = null;
  });

  it('shows your own time over a DM time, and both over a grouped message', () => {
    const ts = Date.UTC(2026, 8, 29, 16, 2);
    mount(`<div class="zcf-msg"><span class="zcf-time" data-zcf-ts="${ts}">16:02</span></div><div class="zcf-msg zcf-grouped" data-zcf-ts="${ts}">hi</div>`);
    over(document.querySelector('.zcf-time'));
    expect(tip().textContent).toBe('12:02 your time');
    over(document.querySelector('.zcf-grouped'));
    expect(tip().textContent).toBe('16:02 ZCT · 12:02 your time');
    over(document.body);
    expect(tip().hidden).toBe(true);
  });

  it("learns that the game's chats print game time, and shows your time over them", () => {
    const storage = mount(gameChat('13:00', '18:29'));
    over(document.querySelectorAll('.msg-time')[0]);
    expect(tip().textContent).toBe('09:00 your time');
    expect(storage.getItem(KEY)).toBe('game');
  });

  it("learns that the game's chats print your time, and shows game time over them", () => {
    const storage = mount(gameChat('23:50', '14:30'));
    over(document.querySelectorAll('.msg-time')[0]);
    expect(tip().textContent).toBe('03:50 ZCT'); // 23:50 yesterday in New York
    expect(storage.getItem(KEY)).toBe('local');
  });

  it('stays quiet over a game time until it knows the clock, then remembers it', () => {
    mount(gameChat('09:00', '10:00'));
    over(document.querySelectorAll('.msg-time')[0]);
    expect(tip() === null || tip().hidden).toBe(true);
    hover.destroy();
    mount(gameChat('09:00', '10:00'), memoryStorage({ [KEY]: 'game' }));
    over(document.querySelectorAll('.msg-time')[0]);
    expect(tip().textContent).toBe('05:00 your time');
  });
});
