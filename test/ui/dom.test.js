import { describe, it, expect, vi } from 'vitest';
import { h, avatarUrl, avatar, highlightMatch, badge, setBadge, DEFAULT_AVATAR, AVATAR_BASE } from '../../src/ui/dom.js';

describe('dom helpers', () => {
  it('builds elements with classes, attributes, events and text children', () => {
    const onclick = vi.fn();
    const el = h('button', { class: 'a b', type: 'button', hidden: false, dataset: { x: '1' }, onclick }, 'Hi ', 5, null, ['!']);
    expect(el.outerHTML).toBe('<button class="a b" type="button" data-x="1">Hi 5!</button>');
    el.click();
    expect(onclick).toHaveBeenCalled();
  });

  it('never interprets strings as HTML', () => {
    const el = h('div', null, '<img src=x onerror=alert(1)>');
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('only builds avatar URLs from relative CDN paths', () => {
    expect(avatarUrl('avatars/123.png')).toBe(`${AVATAR_BASE}avatars/123.png`);
    expect(avatarUrl('/avatars/1.png')).toBe(`${AVATAR_BASE}avatars/1.png`);
    expect(avatarUrl('https://evil.example/x.png')).toBe(DEFAULT_AVATAR);
    expect(avatarUrl('javascript:alert(1)')).toBe(DEFAULT_AVATAR);
    expect(avatarUrl('../secret')).toBe(DEFAULT_AVATAR);
    expect(avatarUrl(null)).toBe(DEFAULT_AVATAR);
  });

  it('adds a status dot only when online status is known', () => {
    expect(avatar({ avatar: null, online: true }).querySelector('.zcf-dot.zcf-on')).not.toBeNull();
    expect(avatar({ avatar: null, online: false }).querySelector('.zcf-dot.zcf-off')).not.toBeNull();
    expect(avatar({ avatar: null }).querySelector('.zcf-dot')).toBeNull();
  });

  it('highlights the first match', () => {
    const wrap = h('div', null, highlightMatch('Gravedigger', 'DIG'));
    expect(wrap.innerHTML).toBe('Grave<mark>dig</mark>ger');
    expect(highlightMatch('Nyx', '')).toEqual(['Nyx']);
  });

  it('shows badges only when visible and non-zero', () => {
    const b = badge();
    setBadge(b, 3, true);
    expect(b.hidden).toBe(false);
    expect(b.textContent).toBe('3');
    setBadge(b, 0, true);
    expect(b.hidden).toBe(true);
    setBadge(b, 3, false);
    expect(b.hidden).toBe(true);
  });
});
