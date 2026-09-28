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

  it('does not let loadOlder add messages newer than what is held, so a big gap fills in via fetchNew and a pending send inside it reconciles', async () => {
    // Same server shape as the paging test above: page p counts back from the newest of n.
    let n = 30;
    const serverPage = (p) => {
      const hi = n - (p - 1) * PAGE_SIZE;
      return hi < 1 ? [] : page(Math.max(1, hi - PAGE_SIZE + 1), hi);
    };
    const api = fakeApi({
      getChatMessages: vi.fn((id, p) => Promise.resolve({ ok: true, data: serverPage(p) })),
      getNewMessages: vi.fn((id, last) => Promise.resolve({ ok: true, data: last < n ? page(last + 1, n) : [] })),
      sendMail: vi.fn().mockResolvedValue({ ok: true, data: { message_id: 35 } }),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial(); // holds 21..30
    n = 60; // 30 more land server-side before the next poll (e.g. the tab was hidden)
    await c.loadOlder(); // scrolled up before fetchNew catches up: page 2 is now 41..50, all newer than 21
    expect(c.lastId()).toBe(30); // must not advance past messages we never fetched
    // Our own message landed in the still-unfetched gap (35 is odd -> ME, matching `page()`).
    const sending = c.send('gap message');
    await sending;
    await flush(); // lets send's own fetchNew() (unawaited) settle
    expect(c.pending()).toEqual([]);
    for (let i = 0; i < 12 && c.state.hasMore; i += 1) {
      await c.loadOlder();
      await c.fetchNew();
    }
    expect(c.messages().map((m) => m.id)).toEqual(page(1, 60).map((m) => m.id));
    expect(c.state.hasMore).toBe(false);
  });

  it('refuses to trim while an older page is loading, so the fetch above cannot leave a gap', async () => {
    const N = 260;
    const serverPage = (p) => {
      const hi = N - (p - 1) * PAGE_SIZE;
      return hi < 1 ? [] : page(Math.max(1, hi - PAGE_SIZE + 1), hi);
    };
    let hold = null;
    const api = fakeApi({
      getChatMessages: vi.fn((id, p) => (hold && p === hold.page ? hold.promise : Promise.resolve({ ok: true, data: serverPage(p) }))),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    for (let i = 0; i < 24; i += 1) await c.loadOlder(); // holds 250 messages (11..260)
    expect(c.messages()).toHaveLength(250);
    let resolveHold;
    hold = { page: 26, promise: new Promise((res) => { resolveHold = res; }) };
    const older = c.loadOlder(); // page 26 (1..10) is in flight
    expect(c.trim()).toBe(false);
    expect(c.messages()).toHaveLength(250); // nothing dropped mid-load
    resolveHold({ ok: true, data: serverPage(26) });
    await older;
    expect(c.messages()).toHaveLength(260);
  });

  it('stops polling and refreshing info once a thread is blocked', async () => {
    const api = fakeApi({ getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'access' }) });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    expect(c.state.blocked).toBe(true);
    api.getChatMessages.mockClear();
    await c.fetchNew();
    await c.refreshInfo();
    expect(api.getChatMessages).not.toHaveBeenCalled();
    expect(api.getChatInfo).not.toHaveBeenCalled();
  });

  it('reconciles a pending send that the still-loading first page already contains', async () => {
    let resolveLoad;
    const loadPromise = new Promise((res) => { resolveLoad = res; });
    const api = fakeApi({
      getChatMessages: vi.fn(() => loadPromise),
      sendMail: vi.fn().mockResolvedValue({ ok: true, data: { message_id: 50 } }),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    c.ensureLoaded(); // starts loadInitial (in flight) + refreshInfo
    const sending = c.send('hello');
    await sending;
    // the server stored our message before answering the still-in-flight page-1 request
    resolveLoad({ ok: true, data: [...page(41, 49), rawMsg(50, ME, 'hello', '2026-09-28 10:00:00')] });
    await flush();
    expect(c.pending()).toEqual([]);
    expect(c.messages().filter((m) => m.id === 50)).toHaveLength(1);
  });

  it('keeps a failed send when retried on a blocked thread', async () => {
    const api = fakeApi({ sendMail: vi.fn().mockResolvedValue({ ok: false, kind: 'access' }) });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    expect(await c.send('draft')).toBe(false);
    expect(c.pending()).toHaveLength(1);
    expect(c.state.blocked).toBe(true);
    expect(await c.retry(c.pending()[0].localId)).toBe(false);
    expect(c.pending()).toHaveLength(1);
  });

  it('does not end paging early because of one malformed row on a full page', async () => {
    const rows = page(11, 20);
    rows[0] = { ...rows[0], id: null };
    const api = fakeApi({ getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: rows }) });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    expect(c.messages()).toHaveLength(9);
    expect(c.state.hasMore).toBe(true);
  });

  it('clears busy on a successful refreshInfo', async () => {
    const api = fakeApi({
      getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'busy', busy: 'traveling' }),
      getChatInfo: vi.fn().mockResolvedValue({ ok: true, data: { 2: { username: 'Spike' } } }),
    });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    expect(c.state.busy).toBe('traveling');
    await c.refreshInfo();
    expect(c.state.busy).toBeNull();
  });

  it('flags busy from a failed poll', async () => {
    const api = fakeApi({ getNewMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'busy', busy: 'traveling' }) });
    const c = createConversation({ api, userId: THEM, myId: ME });
    await c.loadInitial();
    await c.fetchNew();
    expect(c.state.busy).toBe('traveling');
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
