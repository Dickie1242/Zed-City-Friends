import { describe, it, expect } from 'vitest';
import {
  defaultSettings,
  normalizeSettings,
  setPmTab,
  setSound,
  isMuted,
  setMuted,
  updateChat,
  resetChat,
  resetAllChats,
  MAX_MUTED,
} from '../src/settings.js';

describe('settings document', () => {
  it('normalizes, and rejects documents that are not ours', () => {
    expect(normalizeSettings({ v: 1 })).toEqual(defaultSettings());
    expect(normalizeSettings({ v: 1, pmTab: 'blocked', sound: 'bell', muted: [3, '4', 3, -1, 'x'], chats: { pm: { w: 380 }, bad: {} } })).toEqual({
      v: 1,
      pmTab: 'blocked',
      sound: 'bell',
      chats: { pm: { w: 380 } },
      muted: [3, 4],
    });
    expect(normalizeSettings({ v: 1, pmTab: 'nope', sound: 'siren' })).toMatchObject({ pmTab: 'chats', sound: 'off' });
    expect(() => normalizeSettings({ v: 2 })).toThrow();
    expect(() => normalizeSettings([])).toThrow();
  });

  it('sets the tab and sound only to known values', () => {
    const s = defaultSettings();
    setPmTab(s, 'faction');
    setPmTab(s, 'nope');
    setSound(s, 'ping');
    setSound(s, 'siren');
    expect(s).toMatchObject({ pmTab: 'faction', sound: 'ping' });
  });

  it('mutes and unmutes, newest first, capped', () => {
    const s = defaultSettings();
    setMuted(s, 5, true);
    setMuted(s, '6', true);
    setMuted(s, 5, true);
    expect(s.muted).toEqual([5, 6]);
    expect(isMuted(s, 6)).toBe(true);
    setMuted(s, 6, false);
    expect(s.muted).toEqual([5]);
    for (let id = 1000; id < 1000 + MAX_MUTED + 5; id += 1) setMuted(s, id, true);
    expect(s.muted).toHaveLength(MAX_MUTED);
    expect(s.muted[0]).toBe(1000 + MAX_MUTED + 4);
  });

  it('merges per-chat changes, resets fields with null, and removes entries back at the defaults', () => {
    const s = defaultSettings();
    updateChat(s, 'pm', { locked: false, w: 380 });
    updateChat(s, 'pm', { text: 120 });
    expect(s.chats.pm).toEqual({ locked: false, w: 380, text: 120 });
    updateChat(s, 'pm', { w: null, text: 100, locked: null });
    expect(s.chats.pm).toBeUndefined();
    updateChat(s, 'bogus', { w: 400 });
    expect(s.chats).toEqual({});
    updateChat(s, 'dm:5', { x: 10, y: 20 });
    updateChat(s, 'game:general', { h: 600 });
    resetChat(s, 'dm:5');
    expect(Object.keys(s.chats)).toEqual(['game:general']);
    resetAllChats(s);
    expect(s.chats).toEqual({});
  });
});
