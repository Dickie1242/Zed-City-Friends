import { describe, it, expect } from 'vitest';
import { buildChatRows, previewLine, buildFactionRows, buildBlockedRows } from '../src/pm-view.js';

const T = (userId, lastReply, o = {}) => ({ userId, username: `U${userId}`, avatar: null, preview: 'hi', senderId: userId, lastReply, newMail: 0, isSystem: false, ...o });

describe('pm view', () => {
  it('merges page 1 with older pages: newest per player, newest first, invites included', () => {
    const rows = buildChatRows({
      page1: [T(1, 500), T(2, 900), T(3, 999, { isSystem: true })],
      older: [[T(1, 100), T(4, 50)], [T(5, 700)]],
      threads: { 2: { unread: 3 } },
    });
    expect(rows.map((r) => [r.userId, r.lastReply, r.unread])).toEqual([[3, 999, 0], [2, 900, 3], [5, 700, 0], [1, 500, 0], [4, 50, 0]]);
  });

  it('prefixes the preview with You or the sender name', () => {
    expect(previewLine(T(7, 1, { username: 'Nyx', preview: 'see you' }), 1)).toBe('Nyx: see you');
    expect(previewLine(T(7, 1, { senderId: 1, preview: 'on my way' }), 1)).toBe('You: on my way');
    expect(previewLine(T(7, 1, { preview: '' }), 1)).toBe('');
  });

  it('builds faction rows without you: online A-Z, then most recently active', () => {
    const now = 1800000000000;
    const rows = buildFactionRows({
      faction: { id: 1 },
      members: [
        { id: 1, username: 'Me', online: 1 },
        { id: 2, username: 'bram', online: '0', active: 600, level: '12' },
        { id: 3, username: 'Cato', online: true, level: 30, avatar: 'c.png' },
        { id: 4, username: 'Abe', online: 1, level: 0 },
        { id: 5, username: 'Dex', online: 0, active: 60 },
        { id: 'x', username: 'Bad' },
      ],
    }, { myId: 1, now });
    expect(rows.map((r) => r.username)).toEqual(['Abe', 'Cato', 'Dex', 'bram']);
    expect(rows[1]).toEqual({ id: 3, username: 'Cato', avatar: 'c.png', online: true, active: null, level: 30 });
    expect(rows[0].level).toBeNull();
    expect(rows[3]).toMatchObject({ online: false, active: now - 600000, level: 12 });
  });

  it('builds blocked rows A-Z, one per player', () => {
    expect(buildBlockedRows([[{ id: 2, username: 'zed' }, { id: 1, username: 'Abby', avatar: 'a.png' }], [{ id: 2, username: 'zed' }, { id: 0 }]])).toEqual([
      { id: 1, username: 'Abby', avatar: 'a.png' },
      { id: 2, username: 'zed', avatar: null },
    ]);
  });

  it('puts pinned chats first, newest first among themselves, with stub rows for pins not loaded', () => {
    const rows = buildChatRows({
      page1: [T(1, 900), T(2, 800), T(3, 700)],
      threads: {},
      pinned: [3, 9, 2],
      stub: (id) => (id === 9 ? { username: 'Grim', avatar: 'g.png' } : null),
    });
    expect(rows.map((r) => [r.userId, !!r.pinned])).toEqual([[2, true], [3, true], [9, true], [1, false]]);
    expect(rows[2]).toMatchObject({ userId: 9, username: 'Grim', avatar: 'g.png', preview: '', lastReply: null, stub: true });
    expect(buildChatRows({ page1: [], pinned: [4] })[0]).toMatchObject({ userId: 4, username: '#4', stub: true });
  });
});
