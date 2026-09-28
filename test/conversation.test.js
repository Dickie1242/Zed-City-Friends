import { describe, it, expect, vi } from 'vitest';
import { createConversation, createConversations, PAGE_SIZE } from '../src/conversation.js';
import { fakeApi, rawMsg, flush } from './helpers.js';

const ME = 1;
const THEM = 2;
const page = (from, to) => {
  const out = [];
  for (let id = from; id <= to; id += 1) out.push(rawMsg(id, id % 2 ? ME : THEM, `m${id}`, '2026-09-28 10:00:00'));
  return out;
};

describe('conversation', () => {
  it('loads the newest page first and knows when there is nothing older', async () => {
    const api = fakeApi({ getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: page(1, 4) }) });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    expect(api.getChatMessages).toHaveBeenCalledWith(THEM, 1, PAGE_SIZE);
    expect(c.messages().map((m) => m.id)).toEqual([1, 2, 3, 4]);
    expect(c.state).toMatchObject({ loaded: true, hasMore: false });
  });

  it('pages older messages from how many it holds, even after new ones arrived', async () => {
    // A fake server holding messages 1..n where page p is counted back from the newest.
    let n = 30;
    const serverPage = (p) => {
      const hi = n - (p - 1) * PAGE_SIZE;
      return hi < 1 ? [] : page(Math.max(1, hi - PAGE_SIZE + 1), hi);
    };
    const api = fakeApi({
      getChatMessages: vi.fn((id, p) => Promise.resolve({ ok: true, data: serverPage(p) })),
      getNewMessages: vi.fn((id, last) => Promise.resolve({ ok: true, data: last < n ? page(last + 1, n) : [] })),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    n = 35;
    await c.fetchNew();
    expect(c.messages().map((m) => m.id)).toEqual(page(21, 35).map((m) => m.id));
    await c.loadOlder();
    expect(c.messages()[0].id).toBe(16);
    await c.loadOlder();
    expect(c.messages()[0].id).toBe(6);
    await c.loadOlder();
    expect(c.messages()[0].id).toBe(1);
    expect(c.state.hasMore).toBe(false);
    expect(api.getChatMessages.mock.calls.map((x) => x[1])).toEqual([1, 2, 3, 4]);
  });

  it('fetches new messages after the last id and reports activity from them', async () => {
    const onActivity = vi.fn();
    const api = fakeApi({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: page(1, 2) }),
      getNewMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(3, THEM, 'yo', '2026-09-28 10:01:00')] }),
    });
    const c = createConversation({ api, userId: THEM, myId: ME, onActivity });
    await c.fetchNew();
    expect(api.getChatMessages).toHaveBeenCalledTimes(1);
    await c.fetchNew();
    expect(api.getNewMessages).toHaveBeenCalledWith(THEM, 2);
    expect(c.messages().map((m) => m.id)).toEqual([1, 2, 3]);
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it('shows sends immediately and drops the pending copy when the real one arrives', async () => {
    const api = fakeApi({
      sendMail: vi.fn().mockResolvedValue({ ok: true, data: { message_id: 50 } }),
      getNewMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(50, ME, 'hello', '2026-09-28 10:02:00')] }),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    const sending = c.send('  hello  ');
    expect(c.pending()).toMatchObject([{ text: 'hello', error: false }]);
    await sending;
    await flush();
    expect(api.sendMail).toHaveBeenCalledWith(THEM, 'hello');
    expect(c.pending()).toEqual([]);
    expect(c.messages().map((m) => m.id)).toEqual([50]);
  });

  it('marks failed sends and retries them', async () => {
    const api = fakeApi({
      sendMail: vi.fn()
        .mockResolvedValueOnce({ ok: false, kind: 'network' })
        .mockResolvedValueOnce({ ok: true, data: { message_id: 8 } }),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    expect(await c.send('x')).toBe(false);
    expect(c.pending()[0].error).toBe(true);
    expect(await c.retry(c.pending()[0].localId)).toBe(true);
    expect(c.pending()).toMatchObject([{ realId: 8, error: false }]);
  });

  it('ignores empty sends and flags blocked or busy threads', async () => {
    const api = fakeApi({
      getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'access' }),
      getNewMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'busy', busy: 'traveling' }),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    expect(await c.send('   ')).toBe(false);
    await c.loadInitial();
    expect(c.state.blocked).toBe(true);
    expect(await c.send('hi')).toBe(false);
    expect(api.sendMail).not.toHaveBeenCalled();
  });

  it('reads chat info for the other user', async () => {
    const onInfo = vi.fn();
    const api = fakeApi({ getChatInfo: vi.fn().mockResolvedValue({ ok: true, data: { 1: { username: 'Me' }, 2: { username: 'Spike', avatar: 'a.png', online: true, active: 5 } } }) });
    const c = createConversation({ api, userId: THEM, myId: ME, onInfo });
    await c.refreshInfo();
    expect(c.state.info).toEqual({ username: 'Spike', avatar: 'a.png', online: true, active: 5 });
    expect(onInfo).toHaveBeenCalledWith(c.state.info);
  });

  it('trims to the newest messages and allows loading older again', async () => {
    const api = fakeApi({ getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: page(1, 5) }) });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    expect(c.trim(3)).toBe(true);
    expect(c.messages().map((m) => m.id)).toEqual([3, 4, 5]);
    expect(c.state.hasMore).toBe(true);
  });

  it('registry reuses one conversation per user and forwards events', async () => {
    const onChange = vi.fn();
    const reg = createConversations({ api: fakeApi(), myId: ME, onChange });
    const a = reg.acquire(THEM);
    expect(reg.acquire(THEM)).toBe(a);
    await a.loadInitial();
    expect(onChange).toHaveBeenCalledWith(THEM);
    reg.release(THEM);
    expect(reg.get(THEM)).toBeNull();
  });
});
