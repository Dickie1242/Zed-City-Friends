import { describe, it, expect, vi } from 'vitest';
import { createEmojiPicker } from '../../src/ui/emoji-picker.js';
import { memoryStorage } from '../helpers.js';

const RECENT_KEY = 'zed-ui.recent-emojis';

// jsdom's querySelector mishandles an unescaped '&' inside an attribute-value selector, so tabs
// whose label contains one (e.g. "Smileys & people") must be found this way instead.
function tabByTitle(root, title) {
  return [...root.querySelectorAll('.zcf-em-tab')].find((b) => b.getAttribute('title') === title);
}

describe('emoji picker', () => {
  it('defaults to Smileys & people when there are no recents', () => {
    const picker = createEmojiPicker({ doc: document, storage: memoryStorage(), onPick: vi.fn() });
    picker.open();
    expect(picker.el.hidden).toBe(false);
    expect(tabByTitle(picker.el, 'Smileys & people').classList.contains('zcf-active')).toBe(true);
    expect(picker.el.querySelectorAll('.zcf-em-grid .zcf-em-btn').length).toBeGreaterThan(0);
  });

  it('defaults to Recently used when recents are shared from the game', () => {
    const storage = memoryStorage({ [RECENT_KEY]: JSON.stringify(['joy', 'zed_pack']) });
    const picker = createEmojiPicker({ doc: document, storage, onPick: vi.fn() });
    picker.open();
    expect(picker.el.querySelector('[title="Recently used"]').classList.contains('zcf-active')).toBe(true);
    const titles = [...picker.el.querySelectorAll('.zcf-em-grid .zcf-em-btn')].map((b) => b.title);
    expect(titles).toEqual([':joy:', ':zed_pack:']);
  });

  it('switches categories when a tab is clicked', () => {
    const picker = createEmojiPicker({ doc: document, storage: memoryStorage(), onPick: vi.fn() });
    picker.open();
    picker.el.querySelector('[title="Flags"]').click();
    expect(picker.el.querySelector('[title="Flags"]').classList.contains('zcf-active')).toBe(true);
    expect(tabByTitle(picker.el, 'Smileys & people').classList.contains('zcf-active')).toBe(false);
    const btns = [...picker.el.querySelectorAll('.zcf-em-grid .zcf-em-btn')];
    expect(btns.length).toBeGreaterThan(0);
    expect(btns.every((b) => b.querySelector('img.zcf-em-img'))).toBe(true); // flags render as images
  });

  it('shows the Zed City tab using its own icon image', () => {
    const picker = createEmojiPicker({ doc: document, storage: memoryStorage(), onPick: vi.fn() });
    picker.open();
    const tab = picker.el.querySelector('[title="Zed City"]');
    expect(tab.querySelector('img').getAttribute('src')).toBe('/icons/favicon.svg');
    tab.click();
    const btns = [...picker.el.querySelectorAll('.zcf-em-grid .zcf-em-btn')];
    expect(btns.length).toBeGreaterThan(0);
    expect(btns[0].querySelector('img.zcf-em-img').getAttribute('src')).toContain('/items/');
  });

  it('searches across all categories and switches away from the active tab', () => {
    const picker = createEmojiPicker({ doc: document, storage: memoryStorage(), onPick: vi.fn() });
    picker.open();
    const input = picker.el.querySelector('.zcf-em-search');
    input.value = 'zed_pack';
    input.dispatchEvent(new Event('input'));
    const titles = [...picker.el.querySelectorAll('.zcf-em-grid .zcf-em-btn')].map((b) => b.title);
    expect(titles).toContain(':zed_pack:');
    expect(tabByTitle(picker.el, 'Smileys & people').classList.contains('zcf-active')).toBe(false);
  });

  it('clicking a standard emoji calls onPick with its unicode character and remembers it', () => {
    const storage = memoryStorage();
    const onPick = vi.fn();
    const picker = createEmojiPicker({ doc: document, storage, onPick });
    picker.open();
    const input = picker.el.querySelector('.zcf-em-search');
    input.value = 'joy';
    input.dispatchEvent(new Event('input'));
    picker.el.querySelector('.zcf-em-grid .zcf-em-btn').click();
    expect(onPick).toHaveBeenCalledWith({ name: 'joy', emoji: '😂' });
    expect(JSON.parse(storage.getItem(RECENT_KEY))).toEqual(['joy']);
    expect(picker.el.hidden).toBe(true); // picking closes it, like the game
  });

  it('clicking a Zed City emoji calls onPick with its item image src', () => {
    const onPick = vi.fn();
    const picker = createEmojiPicker({ doc: document, storage: memoryStorage(), onPick });
    picker.open();
    picker.el.querySelector('[title="Zed City"]').click();
    picker.el.querySelector('.zcf-em-grid .zcf-em-btn').click();
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ src: expect.stringContaining('/items/') }));
  });

  it('closes on Escape', () => {
    const picker = createEmojiPicker({ doc: document, storage: memoryStorage(), onPick: vi.fn() });
    picker.open();
    expect(picker.isOpen).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.el.hidden).toBe(true);
    expect(picker.isOpen).toBe(false);
  });
});
