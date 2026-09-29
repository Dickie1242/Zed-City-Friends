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

  it('tells onRow which rows arrive while you watch: few at a time, never a refresh or a history load', async () => {
    document.body.innerHTML = DOCK_HTML;
    const seen = [];
    marks = createEnemyMarks({ names: () => new Set(), onRow: (r, info) => seen.push([r.querySelector('.sender-name').textContent, info.fresh]) });
    marks.start();
    expect(seen.every(([, fresh]) => fresh === false)).toBe(true);
    seen.length = 0;
    const panel = document.querySelector('.general-chat .message-panel');
    panel.insertAdjacentHTML('beforeend', row('Nyx'));
    await flush();
    await flush();
    expect(seen).toEqual([['Nyx', true]]);
    seen.length = 0;
    panel.insertAdjacentHTML('beforeend', Array.from({ length: 6 }, (_, i) => row(`P${i}`)).join(''));
    await flush();
    await flush();
    expect(seen).toHaveLength(6);
    expect(seen.every(([, fresh]) => fresh === false)).toBe(true);
    seen.length = 0;
    marks.refresh();
    expect(seen.every(([, fresh]) => fresh === false)).toBe(true);
  });

  it('never calls rows fresh when a chat draws them again, puts older ones above, or had none before', async () => {
    document.body.innerHTML = DOCK_HTML;
    const seen = [];
    marks = createEnemyMarks({ names: () => new Set(), onRow: (r, info) => seen.push([r.querySelector('.sender-name').textContent, info.fresh]) });
    marks.start();
    const panel = document.querySelector('.general-chat .message-panel');
    const pass = async (fn) => {
      seen.length = 0;
      fn();
      await flush();
      await flush();
      return seen.map(([name, fresh]) => `${name}:${fresh}`);
    };
    expect(await pass(() => panel.insertAdjacentHTML('afterbegin', row('Old')))).toEqual(['Old:false']);
    const html = panel.innerHTML;
    expect(await pass(() => { panel.innerHTML = ''; })).toEqual([]);
    expect(await pass(() => { panel.innerHTML = html; }))
      .toEqual([...panel.querySelectorAll('.sender-name')].map((n) => `${n.textContent}:false`));
    const faction = document.querySelector('.faction-chat .chat-content');
    expect(await pass(() => faction.insertAdjacentHTML('beforeend', row('Nyx') + row('Grim')))).toEqual(['Nyx:false', 'Grim:false']);
    expect(await pass(() => faction.insertAdjacentHTML('beforeend', row('Rust')))).toEqual(['Rust:true']);
  });
});
