import { describe, it, expect, vi } from 'vitest';
import { h, avatarUrl, avatar, highlightMatch, badge, setBadge, downloadText, DEFAULT_AVATAR, AVATAR_BASE } from '../../src/ui/dom.js';
import { createToaster } from '../../src/ui/toast.js';

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

  it('coerces non-string text in highlightMatch instead of throwing', () => {
    const wrap = h('div', null, highlightMatch(123, '1'));
    expect(wrap.innerHTML).toBe('<mark>1</mark>23');
    expect(() => highlightMatch(undefined, 'a')).not.toThrow();
  });

  it('keeps the highlighted range aligned when lowercasing changes length', () => {
    // 'İ'.toLowerCase() is two UTF-16 units, so a naive lowercase+indexOf misaligns the slice.
    const wrap = h('div', null, highlightMatch('İstanbul', 'stan'));
    expect(wrap.innerHTML).toBe('İ<mark>stan</mark>bul');
  });

  it('returns plain text only when there is no match', () => {
    expect(highlightMatch('Nyx', 'zz')).toEqual(['Nyx']);
  });

  it('treats the query as plain text, never as HTML', () => {
    const wrap = h('div', null, highlightMatch('<b>x</b>', '<b>'));
    expect(wrap.querySelectorAll('b')).toHaveLength(0);
    expect(wrap.textContent).toBe('<b>x</b>');
  });

  it('ignores string on* values instead of setting an inline handler attribute', () => {
    const el = h('div', { onclick: 'alert(1)' });
    expect(el.hasAttribute('onclick')).toBe(false);
    expect(el.outerHTML).toBe('<div></div>');
  });

  it('still attaches function on* handlers as listeners', () => {
    const onclick = vi.fn();
    const el = h('button', { onclick });
    expect(el.hasAttribute('onclick')).toBe(false);
    el.click();
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('never creates an img element from a string child containing markup', () => {
    const el = h('div', null, '<img src=x onerror=alert(1)>');
    expect(el.querySelectorAll('img')).toHaveLength(0);
  });

  it('builds avatar URLs on the CDN host with no query or fragment for hostile input', () => {
    const hostile = ['//evil.example/x.png', 'a?b=1', 'a#frag', 'javascript:alert(1)', '../x.png'];
    for (const input of hostile) {
      const url = avatarUrl(input);
      const parsed = new URL(url);
      expect(parsed.host).toBe('daz02uqlb9gre.cloudfront.net');
      expect(parsed.search).toBe('');
      expect(parsed.hash).toBe('');
    }
  });

  it('falls back to the default avatar once and does not loop on repeated errors', () => {
    const wrap = avatar({ avatar: 'x.png' });
    const img = wrap.querySelector('img');
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(DEFAULT_AVATAR);
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(DEFAULT_AVATAR);
  });

  it('creates a blob URL, clicks an anchor, and revokes the URL after a delay', () => {
    vi.useFakeTimers();
    const created = [];
    const revoked = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob);
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revoked.push(url));
    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clicks.push({ href: this.getAttribute('href'), download: this.getAttribute('download'), connected: this.isConnected });
    });

    downloadText('f.json', '{"a":1}');

    expect(created).toHaveLength(1);
    expect(clicks).toEqual([{ href: 'blob:mock', download: 'f.json', connected: true }]);
    expect(document.querySelectorAll('a')).toHaveLength(0);
    expect(revoked).toHaveLength(0);
    vi.advanceTimersByTime(999);
    expect(revoked).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(revoked).toEqual(['blob:mock']);

    vi.useRealTimers();
  });

  it('renders toast messages as text, never as HTML', () => {
    vi.useFakeTimers();
    const toast = createToaster(document);
    toast('<img src=x onerror=alert(1)>');
    const host = document.querySelector('.zcf-toasts');
    expect(host.querySelectorAll('img')).toHaveLength(0);
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
    vi.advanceTimersByTime(3500);
    host.remove();
    vi.useRealTimers();
  });
});
