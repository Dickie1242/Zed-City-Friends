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
  togglePinned,
  isPinned,
  setFlag,
  MAX_PINNED,
  setSettingsTab,
  setMentionSound,
  setVolume,
  setMentionWords,
  setTextAll,
  restoreDefaults,
  applyBackupSettings,
  MAX_MENTION_WORDS,
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
      pinned: [],
      notify: false,
      notifyFriendsOnly: false,
      titleCount: true,
      hoverLocal: true,
      settingsTab: 'general',
      mentionSound: 'off',
      volume: 100,
      textAll: 100,
      mentions: true,
      mentionWords: [],
      clock12: false,
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

  it('reads the 0.6 options strictly, with notifications off and the tab count on by default', () => {
    expect(defaultSettings()).toMatchObject({ pinned: [], notify: false, notifyFriendsOnly: false, titleCount: true, hoverLocal: true });
    expect(normalizeSettings({ v: 1, hoverLocal: false }).hoverLocal).toBe(false);
    expect(normalizeSettings({ v: 1, hoverLocal: 0 }).hoverLocal).toBe(true);
    expect(normalizeSettings({ v: 1, localTime: true })).not.toHaveProperty('localTime'); // 0.6 test builds had a time setting
    expect(normalizeSettings({ v: 1, notify: 'yes', notifyFriendsOnly: 1, titleCount: 0, pinned: [5, '5', 7, 'x'] })).toMatchObject({
      notify: false,
      notifyFriendsOnly: false,
      titleCount: true,
      pinned: [5, 7],
    });
    expect(normalizeSettings({ v: 1, titleCount: false }).titleCount).toBe(false);
  });

  it('pins newest first, unpins, and refuses a pin past the cap', () => {
    const s = defaultSettings();
    expect(togglePinned(s, 5)).toBe(true);
    togglePinned(s, '6');
    expect(s.pinned).toEqual([6, 5]);
    expect(isPinned(s, 5)).toBe(true);
    togglePinned(s, 5);
    expect(s.pinned).toEqual([6]);
    for (let id = 100; s.pinned.length < MAX_PINNED; id += 1) togglePinned(s, id);
    const full = [...s.pinned];
    expect(togglePinned(s, 999)).toBe(false);
    expect(s.pinned).toEqual(full);
  });

  it('sets only the known switches', () => {
    const s = defaultSettings();
    setFlag(s, 'notify', 1);
    setFlag(s, 'titleCount', false);
    setFlag(s, 'pmTab', 'x');
    expect(s).toMatchObject({ notify: true, titleCount: false, pmTab: 'chats' });
  });

  it('reads the 0.7 options, with mention highlights on and the rest off or as before', () => {
    expect(defaultSettings()).toMatchObject({ settingsTab: 'general', mentionSound: 'off', volume: 100, textAll: 100, mentions: true, mentionWords: [], clock12: false });
    expect(normalizeSettings({ v: 1, settingsTab: 'about', mentionSound: 'bell', volume: 42, textAll: 123, mentions: false, mentionWords: ' DWR , dwr, x, mothy ', clock12: true }))
      .toMatchObject({ settingsTab: 'about', mentionSound: 'bell', volume: 40, textAll: 120, mentions: false, mentionWords: ['DWR', 'mothy'], clock12: true });
    expect(normalizeSettings({ v: 1, settingsTab: 'x', mentionSound: 'siren', volume: 'loud', textAll: 'big', mentions: 0, clock12: 'yes' }))
      .toMatchObject({ settingsTab: 'general', mentionSound: 'off', volume: 100, textAll: 100, mentions: true, clock12: false });
  });

  it('sets the settings tab, mention sound and volume only to known values', () => {
    const s = defaultSettings();
    setSettingsTab(s, 'chats');
    setSettingsTab(s, 'nope');
    setMentionSound(s, 'ping');
    setMentionSound(s, 'siren');
    setVolume(s, 33);
    expect(s).toMatchObject({ settingsTab: 'chats', mentionSound: 'ping', volume: 35 });
    setVolume(s, -5);
    expect(s.volume).toBe(0);
  });

  it('keeps up to 10 mention words of 2-30 characters', () => {
    const s = defaultSettings();
    setMentionWords(s, Array.from({ length: 12 }, (_, i) => `word${i}`));
    expect(s.mentionWords).toHaveLength(MAX_MENTION_WORDS);
    setMentionWords(s, ['a'.repeat(31), '  two   words ', 7]);
    expect(s.mentionWords).toEqual(['two words']);
  });

  it("sets the text size for every chat, clearing each chat's own, and a chat keeps only a size that differs", () => {
    const s = defaultSettings();
    updateChat(s, 'pm', { text: 120, w: 380 });
    updateChat(s, 'dm:5', { text: 90 });
    setTextAll(s, 110);
    expect(s.textAll).toBe(110);
    expect(s.chats).toEqual({ pm: { w: 380 } });
    updateChat(s, 'dm:5', { text: 110 });
    expect(s.chats['dm:5']).toBeUndefined();
    updateChat(s, 'dm:5', { text: 100 });
    expect(s.chats['dm:5']).toEqual({ text: 100 });
    expect(normalizeSettings(JSON.parse(JSON.stringify(s))).chats['dm:5']).toEqual({ text: 100 });
    resetAllChats(s);
    expect(s).toMatchObject({ chats: {}, textAll: 100 });
  });

  it('restores defaults but keeps muted and pinned chats and the tabs', () => {
    const s = defaultSettings();
    Object.assign(s, { sound: 'bell', volume: 50, clock12: true, notify: true, pmTab: 'friends', settingsTab: 'about', mentionWords: ['DWR'] });
    setMuted(s, 5, true);
    togglePinned(s, 7);
    updateChat(s, 'pm', { w: 400 });
    restoreDefaults(s);
    expect(s).toEqual({ ...defaultSettings(), muted: [5], pinned: [7], pmTab: 'friends', settingsTab: 'about' });
  });

  it("takes a backup's settings, merging muted and pinned chats with ours, and changes nothing for a bad one", () => {
    const s = defaultSettings();
    setMuted(s, 5, true);
    togglePinned(s, 7);
    applyBackupSettings(s, { v: 1, sound: 'ping', clock12: true, muted: [6, 5], pinned: [8], chats: { pm: { w: 400 } } });
    expect(s).toMatchObject({ sound: 'ping', clock12: true, muted: [6, 5], pinned: [8, 7], chats: { pm: { w: 400 } } });
    const before = JSON.stringify(s);
    expect(() => applyBackupSettings(s, { v: 2 })).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
});
