import { describe, it, expect } from 'vitest';
import { emojiCategories, findEmoji, searchEmoji, flagImageUrl, isFlag } from '../src/emoji.js';

describe('emoji', () => {
  it('finds a standard emoji by name and by alias', () => {
    expect(findEmoji('joy')).toEqual({ name: 'joy', emoji: '😂' });
    expect(findEmoji('lmao')).toEqual({ name: 'joy', emoji: '😂' });
  });

  it('finds a Zed City emoji', () => {
    expect(findEmoji('zed_pack')).toEqual({ name: 'zed_pack', src: '/items/zed_pack.webp' });
  });

  it('returns null for an unknown name', () => {
    expect(findEmoji('not_a_real_emoji')).toBeNull();
  });

  it('ranks an exact name match first in search', () => {
    const results = searchEmoji('joy');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toEqual({ name: 'joy', emoji: '😂', aliases: ['lmao', 'tears_of_joy'] });
  });

  it('search ignores a leading colon and treats _/- as spaces', () => {
    const a = searchEmoji(':zed_pack');
    expect(a.some((r) => r.name === 'zed_pack')).toBe(true);
    const b = searchEmoji('zed pack');
    expect(b.some((r) => r.name === 'zed_pack')).toBe(true);
  });

  it('computes the proxied flag image URL from an emoji\'s code points', () => {
    const usUrl = flagImageUrl('🇺🇸');
    expect(usUrl).toBe(
      'https://cdn.zed.city/?url=' + encodeURIComponent('https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f1fa-1f1f8.png'),
    );
    const rainbowUrl = flagImageUrl('\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}'); // white flag + VS16 + ZWJ + rainbow
    expect(rainbowUrl).toContain('1f3f3-fe0f-200d-1f308.png');
  });

  it('knows which emoji are flags', () => {
    expect(isFlag('🇺🇸')).toBe(true);
    expect(isFlag('😂')).toBe(false);
  });

  it('lists categories in the game\'s order with its labels', () => {
    const cats = emojiCategories();
    expect(cats.map((c) => c.key)).toEqual([
      'recent',
      'zed city',
      'people & body',
      'animals & nature',
      'food & drink',
      'activities',
      'travel & places',
      'objects',
      'symbols',
      'flags',
      'misc',
    ]);
    expect(cats.map((c) => c.label)).toEqual([
      'Recently used',
      'Zed City',
      'Smileys & people',
      'Animals & nature',
      'Food & drink',
      'Activities',
      'Travel & places',
      'Objects',
      'Symbols',
      'Flags',
      'Misc',
    ]);
    const zed = cats.find((c) => c.key === 'zed city');
    expect(zed.items.length).toBeGreaterThan(0);
    expect(zed.items.every((i) => i.src.startsWith('/items/'))).toBe(true);
    // Recent is filled in by the caller, not emoji.js.
    expect(cats.find((c) => c.key === 'recent').items).toEqual([]);
  });
});
