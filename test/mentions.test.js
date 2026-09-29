import { describe, it, expect } from 'vitest';
import { makeMatcher } from '../src/mentions.js';

describe('mentions', () => {
  it('matches whole words in any case, with @ and punctuation around them', () => {
    const m = makeMatcher(['Moth']);
    expect(m.test('hey @moth!')).toBe(true);
    expect(m.test('MOTH, come here')).toBe(true);
    expect(m.test('moth')).toBe(true);
    expect(m.test('mothball')).toBe(false);
    expect(m.test('bigmoth')).toBe(false);
    expect(m.test('moth_2')).toBe(false);
  });

  it('knows letters beyond English, and takes words literally', () => {
    expect(makeMatcher(['Ölaf']).test('hi ölaf')).toBe(true);
    expect(makeMatcher(['Ölaf']).test('hiÖlaf')).toBe(false);
    const dots = makeMatcher(['a.b']);
    expect(dots.test('axb')).toBe(false);
    expect(dots.test('see a.b now')).toBe(true);
    expect(makeMatcher(['[DWR]']).test('join [dwr] today')).toBe(true);
  });

  it('finds every match, preferring the longer word', () => {
    const m = makeMatcher(['Moth', 'DWR', 'Moth Man']);
    expect(m.ranges('Moth: dwr at 8, moth man')).toEqual([[0, 4], [6, 9], [16, 24]]);
  });

  it('is null with nothing to look for', () => {
    expect(makeMatcher([])).toBeNull();
    expect(makeMatcher(['', '  ', null])).toBeNull();
  });
});
