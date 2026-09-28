import { vi } from 'vitest';

// A fake api where every method is a vi.fn() resolving to { ok: true, data: [] } unless overridden.
export function fakeApi(overrides = {}) {
  const ok = (data) => Promise.resolve({ ok: true, data });
  return {
    getStats: vi.fn(() => ok({ id: 1, username: 'Me' })),
    getChats: vi.fn(() => ok([])),
    getChatInfo: vi.fn(() => ok({})),
    getChatMessages: vi.fn(() => ok([])),
    getNewMessages: vi.fn(() => ok([])),
    sendMail: vi.fn(() => ok({ message_id: 999 })),
    getProfile: vi.fn(() => ok({ online: false, active: null })),
    findPlayer: vi.fn(() => ok([])),
    ...overrides,
  };
}

// Minimal in-memory localStorage replacement.
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    keys: () => [...data.keys()],
  };
}

export const flush = () => new Promise((r) => setTimeout(r, 0));

// Message rows as the API returns them.
export function rawMsg(id, senderId, text, sentAt) {
  return { id, sender_id: senderId, message: text, sent_at: sentAt, is_system: 0 };
}

export function rawThread(userId, { username = `User${userId}`, senderId = userId, lastReply = '2026-09-28 12:00:00', newMail = 0, isSystem = 0, message = 'hi' } = {}) {
  return { other_user_id: userId, other_user: { username }, message, sender_id: senderId, last_reply: lastReply, new_mail: newMail, is_system: isSystem };
}
