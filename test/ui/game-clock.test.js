import { describe, it, expect } from 'vitest';
import { createGameClock, clockOfStamp } from '../../src/ui/game-clock.js';
import { memoryStorage, flush } from '../helpers.js';

// Tests run in America/New_York (vitest.config.js): 2026-09-29 is daylight time, UTC-4.
const NOW = Date.UTC(2026, 8, 29, 18, 30); // 18:30 ZCT, 14:30 in New York
const KEY = 'zcf:v1:1:gameClock';

const row = (time) => `<div class="msg-cont"><span class="sender-name">A</span><span class="msg-time">${time}</span></div>`;
const chat = (...times) => `<div class="chat-container general-chat">${times.map(row).join('')}</div>`;
const times = () => [...document.querySelectorAll('.msg-time')].map((n) => n.textContent);

// The game's Vue app on #q-app, with its Pinia chat store holding `stamps`.
function withStore(stamps) {
  const root = document.createElement('div');
  root.id = 'q-app';
  const messages = new Map([['global', stamps.map((timestamp, id) => ({ id, room: 'global', timestamp }))]]);
  root.__vue_app__ = { config: { globalProperties: { $pinia: { _s: new Map([['chat', { messages }]]) } } } };
  document.body.appendChild(root);
}

function setup(html, { storage = memoryStorage(), onChange } = {}) {
  document.body.innerHTML = html;
  return createGameClock({ doc: document, storage, key: KEY, now: () => NOW, onChange });
}
const rewriteAll = (gc, want) => document.querySelectorAll('.msg-cont').forEach((r) => gc.rewrite(r, want));

describe('game clock', () => {
  it('tells a stamp that names a moment from bare UTC digits', () => {
    expect(clockOfStamp('2026-09-29T18:29:00.000Z')).toBe('local');
    expect(clockOfStamp('2026-09-29T14:29:00-04:00')).toBe('local');
    expect(clockOfStamp(1790706540000)).toBe('local');
    expect(clockOfStamp('2026-09-29 18:29:00')).toBe('game');
    expect(clockOfStamp('')).toBeNull();
  });

  it("reads the game's chat store: zone-stamped messages print your time, so they're rewritten to ZCT and back", () => {
    const gc = setup(chat('13:59', '14:29'));
    withStore(['2026-09-29T17:59:00.000Z']);
    expect(gc.printed()).toBe('local');
    rewriteAll(gc, 'game');
    expect(times()).toEqual(['17:59', '18:29']);
    rewriteAll(gc, 'local');
    expect(times()).toEqual(['13:59', '14:29']);
  });

  it('leaves times alone when the game already prints the clock wanted', () => {
    const gc = setup(chat('17:59', '18:29'));
    withStore(['2026-09-29 17:59:00']);
    rewriteAll(gc, 'game');
    expect(times()).toEqual(['17:59', '18:29']);
    rewriteAll(gc, 'local');
    expect(times()).toEqual(['13:59', '14:29']);
    expect(gc.momentOf(document.querySelector('.msg-time'))).toBe(Date.UTC(2026, 8, 29, 17, 59));
  });

  it("without the store, learns from the chats and remembers a sure answer", async () => {
    const storage = memoryStorage();
    let changes = 0;
    const gc = setup(chat('13:00', '18:29'), { storage, onChange: () => changes++ });
    expect(gc.printed()).toBe('game');
    await flush();
    expect(storage.getItem(KEY)).toBe('game');
    expect(changes).toBe(1);
    // A guess (the newest message is 4½ hours old in your time, 8½ in game time) isn't remembered.
    const guessed = setup(chat('09:00', '10:00'));
    expect(guessed.printed()).toBe('local');
    // And with no messages at all: your time, what the game prints for zone-stamped messages.
    expect(setup('<div class="chat-container general-chat"></div>').printed()).toBe('local');
  });

  it('keeps the moment of a rewritten time, and redoes a row the game wrote again', () => {
    const gc = setup(chat('13:59'));
    withStore(['2026-09-29T17:59:00.000Z']);
    const el = document.querySelector('.msg-time');
    rewriteAll(gc, 'game');
    expect(el.textContent).toBe('17:59');
    expect(gc.momentOf(el)).toBe(Date.UTC(2026, 8, 29, 17, 59));
    el.textContent = '14:05'; // Vue wrote a new time into the same span
    rewriteAll(gc, 'game');
    expect(el.textContent).toBe('18:05');
  });
});
