import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEnemyMarks } from '../../src/ui/enemy-marks.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

const row = (name) => `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span>14:20</span></div><div>text</div></div></div></div></div>`;
const marked = () => [...document.querySelectorAll('.general-chat .msg-cont')]
  .filter((r) => r.querySelector('.zcf-enemy-mark'))
  .map((r) => r.querySelector('.sender-name').textContent);

let marks = null;
function setup(names) {
  document.body.innerHTML = DOCK_HTML;
  let set = new Set(names);
  marks = createEnemyMarks({ names: () => set });
  marks.start();
  return (next) => {
    set = new Set(next);
    marks.refresh();
  };
}

describe('enemy marks in the game chats', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    if (marks) marks.destroy();
    marks = null;
    vi.unstubAllGlobals();
  });

  it('marks enemy senders on screen and in new rows, case-insensitively, never twice', async () => {
    setup(['nyx']);
    expect(marked()).toEqual(['Nyx']);
    const sender = document.querySelector('.general-chat .msg-cont:nth-child(2) .sender-name');
    expect(sender.previousElementSibling.getAttribute('title')).toBe('Enemy');
    document.querySelector('.general-chat .message-panel').insertAdjacentHTML('beforeend', row('NYX') + row('Moth'));
    await flush();
    await flush();
    expect(marked()).toEqual(['Nyx', 'NYX']);
    marks.refresh();
    expect(document.querySelectorAll('.zcf-enemy-mark')).toHaveLength(2);
  });

  it('adds and removes marks when the enemies list changes', () => {
    const setNames = setup(['nyx']);
    setNames(['gravedigger']);
    expect(marked()).toEqual(['Gravedigger']);
    setNames([]);
    expect(document.querySelectorAll('.zcf-enemy-mark')).toHaveLength(0);
  });

  it("never changes the game's own nodes or their attributes", () => {
    document.body.innerHTML = DOCK_HTML;
    const attrs = (n) => [...n.attributes].map((a) => `${a.name}=${a.value}`).join();
    const before = [...document.querySelectorAll('.chat-containers *')].map((n) => [n, attrs(n)]);
    let set = new Set(['nyx', 'me']);
    marks = createEnemyMarks({ names: () => set });
    marks.start();
    set = new Set(['gravedigger']);
    marks.refresh();
    for (const [node, was] of before) {
      expect(node.isConnected).toBe(true);
      expect(attrs(node)).toBe(was);
    }
    const ours = [...document.querySelectorAll('.chat-containers *')].filter((n) => !before.some(([b]) => b === n));
    expect(ours.every((n) => n.classList.contains('zcf-enemy-mark'))).toBe(true);
  });

  it('still marks every row after a flood of new ones', async () => {
    setup(['nyx']);
    const panel = document.querySelector('.general-chat .message-panel');
    for (let i = 0; i < 600; i += 1) panel.insertAdjacentHTML('beforeend', row('Nyx'));
    await flush();
    await flush();
    expect(document.querySelectorAll('.general-chat .zcf-enemy-mark')).toHaveLength(601);
  });
});
