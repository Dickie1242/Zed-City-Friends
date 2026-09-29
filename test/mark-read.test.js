import { describe, it, expect, vi } from 'vitest';
import { markAllRead, MARK_ALL_MAX } from '../src/mark-read.js';

describe('mark all as read', () => {
  it('reads each chat one at a time, the way opening it does, marks it seen and reports progress', async () => {
    let inFlight = 0;
    let most = 0;
    const api = {
      getChatMessages: vi.fn(async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return { ok: true, data: [] };
      }),
    };
    const markSeen = vi.fn();
    const onProgress = vi.fn();
    const toast = vi.fn();
    expect(await markAllRead({ ids: [4, 5, 6], api, markSeen, onProgress, toast })).toBe(3);
    expect(most).toBe(1);
    expect(api.getChatMessages.mock.calls).toEqual([[4, 1, 10], [5, 1, 10], [6, 1, 10]]);
    expect(markSeen.mock.calls.map((c) => c[0])).toEqual([4, 5, 6]);
    expect(onProgress.mock.calls).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
    expect(toast).toHaveBeenCalledWith('Marked 3 chats as read');
  });

  it(`does at most ${MARK_ALL_MAX} per press`, async () => {
    const api = { getChatMessages: vi.fn(async () => ({ ok: true })) };
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(await markAllRead({ ids, api, markSeen: () => {}, toast: () => {} })).toBe(MARK_ALL_MAX);
    expect(api.getChatMessages).toHaveBeenCalledTimes(MARK_ALL_MAX);
  });

  it('stops with a toast when the session ended or mail is unavailable', async () => {
    for (const kind of ['auth', 'busy']) {
      const api = { getChatMessages: vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValue({ ok: false, kind }) };
      const markSeen = vi.fn();
      const toast = vi.fn();
      expect(await markAllRead({ ids: [1, 2, 3], api, markSeen, toast })).toBe(1);
      expect(api.getChatMessages).toHaveBeenCalledTimes(2);
      expect(markSeen).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(expect.any(String), { error: true });
    }
  });
});
