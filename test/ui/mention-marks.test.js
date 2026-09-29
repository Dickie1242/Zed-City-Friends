import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMentionMarks, FLAG, HIGHLIGHT } from '../../src/ui/mention-marks.js';

const msg = (name, text) => `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span class="msg-time">14:20</span></div><div>${text}</div></div></div></div></div>`;
const html = `<div class="chat-containers">
  <div class="chat-container general-chat"><div class="chat-content"><div class="message-panel">
    ${msg('Nyx', 'hey @moth, bunker?')}${msg('Moth', 'moth here')}${msg('Rust', 'mothball time')}${msg('Grim', 'DWR raid at 8')}
  </div></div></div>
  <div class="chat-container activity-chat"><div class="chat-content">${msg('Nyx', 'moth did a thing')}</div></div>
  <div class="zcf-root"><div class="chat-container zcf">${msg('Nyx', 'moth in a DM')}</div></div>
</div>`;

const rows = () => [...document.querySelectorAll('.msg-cont')];
const flagged = () => rows().filter((r) => r.querySelector(`.${FLAG}`)).map((r) => r.querySelector('.sender-name').textContent + ':' + r.textContent.includes('DWR'));

let mm = null;
function setup({ words = ['Moth'], enabled = true, win = window, onMention = vi.fn() } = {}) {
  document.body.innerHTML = html;
  let list = words;
  let on = enabled;
  mm = createMentionMarks({ doc: document, win, words: () => list, enabled: () => on, myName: 'Moth', onMention });
  return { onMention, setWords: (w) => { list = w; }, setEnabled: (v) => { on = v; } };
}

describe('mention marks', () => {
  afterEach(() => {
    if (mm) mm.destroy();
    mm = null;
  });

  it('flags messages that mention you in Global and Faction only, never your own, with a hidden marker', () => {
    setup({ words: ['Moth', 'DWR'] });
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(flagged()).toEqual(['Nyx:false', 'Grim:true']);
    const flag = document.querySelector(`.${FLAG}`);
    expect(flag.hidden).toBe(true);
    expect(flag.parentElement.querySelector('.sender-name')).not.toBeNull();
  });

  it('calls onMention only for fresh rows', () => {
    const { onMention } = setup();
    const nyx = rows()[0];
    mm.mark(nyx, { fresh: false });
    expect(onMention).not.toHaveBeenCalled();
    mm.mark(nyx, { fresh: true });
    expect(onMention).toHaveBeenCalledWith(nyx);
  });

  it('takes flags away when switched off or when the words change, without duplicating them', () => {
    const { setWords, setEnabled } = setup({ words: ['Moth'] });
    for (const r of rows()) mm.mark(r, { fresh: false });
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(document.querySelectorAll(`.${FLAG}`)).toHaveLength(1);
    setWords(['DWR']);
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(flagged()).toEqual(['Grim:true']);
    setEnabled(false);
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(document.querySelectorAll(`.${FLAG}`)).toHaveLength(0);
  });

  it('colours the matched words through the highlight registry when the browser has one', () => {
    const registry = new Map();
    class FakeHighlight extends Set {}
    const win = { CSS: { highlights: registry }, Highlight: FakeHighlight };
    setup({ words: ['Moth', 'DWR'], win });
    for (const r of rows()) mm.mark(r, { fresh: false });
    const hl = registry.get(HIGHLIGHT);
    expect([...hl].map((r) => r.toString())).toEqual(['moth', 'DWR']);
    mm.destroy();
    mm = null;
    expect(registry.has(HIGHLIGHT)).toBe(false);
  });
});
