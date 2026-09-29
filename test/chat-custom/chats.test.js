import { describe, it, expect } from 'vitest';
import {
  isChatKey,
  dmKey,
  dmIdOf,
  normalizeChatEntry,
  normalizeChats,
  clampText,
  textOf,
  isLocked,
  isMoved,
  chatLabel,
  describeChat,
  LIMITS,
} from '../../src/chat-custom/chats.js';

describe('chat keys and entries', () => {
  it('accepts only the known chat keys', () => {
    for (const k of ['game:general', 'game:faction', 'game:activity', 'pm', 'settings', 'dm:5', dmKey(123)]) expect(isChatKey(k)).toBe(true);
    for (const k of ['game:trade', 'dm:0', 'dm:-1', 'dm:x', 'PM', '', null, 'dm:5 ']) expect(isChatKey(k)).toBe(false);
    expect(dmIdOf('dm:77')).toBe(77);
    expect(dmIdOf('pm')).toBeNull();
  });

  it('clamps sizes and message size, and drops defaults', () => {
    expect(normalizeChatEntry({ w: 10, h: 99999, text: 137, locked: true, x: 5 })).toEqual({ w: LIMITS.minW, h: LIMITS.maxH, text: 140 });
    expect(normalizeChatEntry({ w: 420.4, h: 520, text: 100, locked: false, x: -3, y: 40.6 })).toEqual({ w: 420, h: 520, locked: false, x: 0, y: 41 });
    expect(normalizeChatEntry({ text: 20 })).toEqual({ text: 80 });
    expect(normalizeChatEntry({ w: 'wide', x: NaN, y: 1 })).toEqual({});
    expect(normalizeChatEntry(null)).toEqual({});
    expect(clampText(250)).toBe(200);
  });

  it('keeps only valid keys and non-empty entries', () => {
    expect(normalizeChats({ pm: { w: 380 }, 'dm:3': { text: 100 }, bogus: { w: 400 }, 'game:general': { locked: false } })).toEqual({
      pm: { w: 380 },
      'game:general': { locked: false },
    });
    expect(normalizeChats([])).toEqual({});
    expect(normalizeChats('x')).toEqual({});
  });

  it('reads an entry with defaults', () => {
    expect(textOf(undefined)).toBe(100);
    expect(isLocked(undefined)).toBe(true);
    expect(isLocked({ locked: false })).toBe(false);
    expect(isMoved({ x: 0, y: 0 })).toBe(true);
    expect(isMoved({ w: 400 })).toBe(false);
  });

  it('labels chats and describes their settings', () => {
    expect(chatLabel('game:general')).toBe('Global');
    expect(chatLabel('game:activity')).toBe('Activity');
    expect(chatLabel('pm')).toBe('Private Messages');
    expect(chatLabel('settings')).toBe('Chat settings');
    expect(chatLabel('dm:5', 'Spike')).toBe('Spike');
    expect(chatLabel('dm:5')).toBe('#5');
    expect(describeChat(undefined)).toBe('docked · default size · text 100%');
    expect(describeChat({ x: 1, y: 2, w: 420, h: 520, text: 120 })).toBe('moved · 420×520 · text 120%');
    expect(describeChat({ w: 400 })).toBe('docked · 400×auto · text 100%');
  });
});
