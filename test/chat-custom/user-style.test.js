import { describe, it, expect } from 'vitest';
import { buildUserCss, chatSelector } from '../../src/chat-custom/user-style.js';
import { CSS } from '../../src/ui/styles.js';
import { GAME_DOCK_CSS } from '../fixtures/game-dock-css.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { parseCss, winner } from '../ui/cascade.js';

describe('user stylesheet', () => {
  it('is empty for default settings', () => {
    expect(buildUserCss({ chats: {} })).toBe('');
  });

  it('sizes an open chat, places a moved one, and scales its messages, per chat', () => {
    const css = buildUserCss({ chats: { 'game:general': { w: 420, h: 520, x: 40, y: 120, text: 120 }, 'dm:5': { text: 90 } }, vw: 1280, vh: 800 });
    expect(css).toContain('body .chat-containers > .chat-container.general-chat:not(.chat-minimized){width:420px;min-width:0;max-width:none;height:520px;max-height:none;flex:none}');
    expect(css).toContain('body .chat-containers > .chat-container.general-chat{position:fixed;left:40px;top:120px;right:auto;bottom:auto;margin:0;transition:none}');
    expect(css).toContain('body .chat-containers > .chat-container.general-chat .chat-content{zoom:1.2}');
    expect(css).toContain('body .chat-containers .zcf[data-zcf-chat="dm:5"] .zcf-zoom{zoom:0.9}');
    expect(chatSelector('pm')).toBe('body .chat-containers .zcf[data-zcf-chat="pm"]');
  });

  it('keeps a moved chat fully on screen with its measured size', () => {
    const css = buildUserCss({ chats: { pm: { x: 1200, y: 700 } }, vw: 1280, vh: 800, sizes: { pm: { w: 350, h: 450 } } });
    expect(css).toContain('left:930px;top:350px');
  });

  it('gives an unlocked chat a containing block for its grips and a grab cursor', () => {
    const css = buildUserCss({ chats: { 'game:faction': { locked: false } } });
    expect(css).toContain('body .chat-containers > .chat-container.faction-chat{position:relative}');
    expect(css).toContain('body .chat-containers > .chat-container.faction-chat > .chat-header{cursor:grab}');
  });

  it('shows a live gesture over the saved entry', () => {
    const css = buildUserCss({ chats: { pm: { w: 380 } }, live: { key: 'pm', entry: { w: 500 } } });
    expect(css).toContain('width:500px');
    expect(css).not.toContain('width:380px');
    expect(css).toContain('transition:none');
  });

  it('applies only message size on phones', () => {
    const css = buildUserCss({ chats: { 'game:general': { w: 420, x: 1, y: 2, text: 150, locked: false } }, small: true });
    expect(css).toBe('body .chat-containers > .chat-container.general-chat .chat-content{zoom:1.5}');
  });

  it("outranks the game's dock rules and our own defaults, whichever stylesheet loads last", () => {
    document.body.innerHTML = DOCK_HTML;
    document.querySelector('.chat-containers').insertAdjacentHTML('afterbegin',
      '<div class="zcf-root"><div class="chat-container zcf zcf-dm zcf-open" data-zcf-chat="dm:5"><div class="chat-header"></div><div class="chat-content"></div></div></div>');
    const USER = parseCss(buildUserCss({ chats: { 'game:general': { w: 420, h: 520, x: 40, y: 120 }, 'dm:5': { w: 400, h: 600 } }, vw: 1280, vh: 800 }));
    const GAME = parseCss(GAME_DOCK_CSS);
    const OURS = parseCss(CSS);
    const general = document.querySelector('.general-chat');
    const dm = document.querySelector('[data-zcf-chat="dm:5"]');
    for (const width of [1280, 800]) {
      for (const sheets of [[GAME, OURS, USER], [USER, OURS, GAME], [OURS, USER, GAME]]) {
        expect(winner(general, 'width', width, sheets).value).toBe('420px');
        expect(winner(general, 'max-height', width, sheets).value).toBe('none');
        expect(winner(general, 'position', width, sheets).value).toBe('fixed');
        expect(winner(dm, 'height', width, sheets).value).toBe('600px');
      }
    }
  });
});
