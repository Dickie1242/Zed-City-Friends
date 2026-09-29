import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTimeHover } from '../../src/ui/time-hover.js';
import { createGameClock } from '../../src/ui/game-clock.js';
import { memoryStorage } from '../helpers.js';

// Tests run in America/New_York (vitest.config.js): 2026-09-29 is daylight time, UTC-4.
const NOW = Date.UTC(2026, 8, 29, 18, 30); // 18:30 ZCT, 14:30 in New York
let hover = null;

const over = (el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
const tip = () => document.querySelector('.zcf-tip');
const lines = () => [...tip().children].map((n) => n.textContent);

function mount(html, { showLocal = true, clock12 = false } = {}) {
  vi.useFakeTimers();
  document.body.innerHTML = html;
  const gameClock = createGameClock({ doc: document, storage: memoryStorage({ 'zcf:v1:1:gameClock': 'local' }), key: 'zcf:v1:1:gameClock', now: () => NOW });
  hover = createTimeHover({ doc: document, win: window, now: () => NOW, gameClock, showLocal: () => showLocal, clock12: () => clock12 });
  return gameClock;
}

describe('time hover', () => {
  afterEach(() => {
    if (hover) hover.destroy();
    hover = null;
    vi.useRealTimers();
  });

  const ts = Date.UTC(2026, 8, 29, 18, 18);
  const dm = `<div class="zcf-msg"><span class="zcf-time" data-zcf-ts="${ts}">18:18</span></div><div class="zcf-msg zcf-grouped" data-zcf-ts="${ts}">hi</div>`;

  it('shows the full timestamp in ZCT and in your time, and how long ago, after a moment', () => {
    mount(dm);
    over(document.querySelector('.zcf-time'));
    expect(tip()).toBeNull();
    vi.advanceTimersByTime(500);
    expect(lines()).toEqual(['Tue, Sep 29, 18:18 ZCT', 'Tue, Sep 29, 14:18 EDT', '12 min ago']);
    over(document.querySelector('.zcf-grouped')); // the next time switches straight away
    expect(tip().hidden).toBe(false);
    over(document.body);
    expect(tip().hidden).toBe(true);
  });

  it('leaves your time out when that is switched off', () => {
    mount(dm, { showLocal: false });
    over(document.querySelector('.zcf-time'));
    vi.advanceTimersByTime(500);
    expect(lines()).toEqual(['Tue, Sep 29, 18:18 ZCT', '12 min ago']);
  });

  it("doesn't show for a pointer just passing over", () => {
    mount(dm);
    over(document.querySelector('.zcf-time'));
    vi.advanceTimersByTime(300);
    over(document.body);
    vi.advanceTimersByTime(1000);
    expect(tip()).toBeNull();
  });

  it('names each day in its own clock', () => {
    const late = Date.UTC(2026, 8, 29, 2, 15); // 02:15 ZCT on the 29th is 22:15 on the 28th in New York
    mount(`<span class="zcf-time" data-zcf-ts="${late}">02:15</span>`);
    over(document.querySelector('.zcf-time'));
    vi.advanceTimersByTime(500);
    expect(lines()).toEqual(['Tue, Sep 29, 02:15 ZCT', 'Mon, Sep 28, 22:15 EDT', '16 hr ago']);
  });

  it("does the same over the game's Global and Faction times, rewritten to ZCT", () => {
    const gc = mount('<div class="chat-container faction-chat"><div class="msg-cont"><span class="msg-time">13:59</span></div></div>');
    const el = document.querySelector('.msg-time');
    gc.rewrite(el.parentNode, 'game');
    expect(el.textContent).toBe('17:59');
    over(el);
    vi.advanceTimersByTime(500);
    expect(lines()).toEqual(['Tue, Sep 29, 17:59 ZCT', 'Tue, Sep 29, 13:59 EDT', '31 min ago']);
  });
  it('uses the 12-hour clock when it is on', () => {
    mount(dm, { clock12: true });
    over(document.querySelector('.zcf-time'));
    vi.advanceTimersByTime(500);
    expect(lines()).toEqual(['Tue, Sep 29, 6:18 PM ZCT', 'Tue, Sep 29, 2:18 PM EDT', '12 min ago']);
  });
});
