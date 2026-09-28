import { describe, it, expect, vi } from 'vitest';
import { createApi, classifyResponse, MAIL_ACCESS_ERROR } from '../src/api.js';

function response(status, body) {
  return { status, json: () => (body === undefined ? Promise.reject(new Error('no json')) : Promise.resolve(body)) };
}

describe('classifyResponse', () => {
  it('maps the game error codes to kinds', () => {
    expect(classifyResponse(200, { error: 'Must be logged in', errorCode: 1 })).toMatchObject({ ok: false, kind: 'auth' });
    expect(classifyResponse(200, { error: 'x', errorCode: 5 })).toMatchObject({ kind: 'busy', busy: 'traveling' });
    expect(classifyResponse(200, { error: 'x', errorCode: 6 })).toMatchObject({ kind: 'busy', busy: 'exploring' });
    expect(classifyResponse(200, { error: 'x', errorCode: 3 })).toMatchObject({ kind: 'busy', busy: 'fight' });
    expect(classifyResponse(200, { error: 'x', errorCode: 7 })).toMatchObject({ kind: 'busy', busy: 'offline' });
    expect(classifyResponse(200, { error: MAIL_ACCESS_ERROR })).toMatchObject({ kind: 'access' });
    expect(classifyResponse(200, { error: 'bad token', errorCode: 403 })).toMatchObject({ kind: 'csrf' });
    expect(classifyResponse(429, null)).toMatchObject({ kind: 'rate' });
    expect(classifyResponse(502, null)).toMatchObject({ kind: 'network' });
    expect(classifyResponse(200, 'text')).toMatchObject({ kind: 'other' });
    expect(classifyResponse(200, [1])).toEqual({ ok: true, data: [1] });
  });

  it('classifies an error body carrying a rate-limit or server-error status by status', () => {
    expect(classifyResponse(429, { error: 'Too many requests' })).toEqual({
      ok: false,
      kind: 'rate',
      code: 429,
      message: 'Too many requests',
    });
    expect(classifyResponse(503, { error: 'Maintenance' })).toEqual({
      ok: false,
      kind: 'network',
      code: 503,
      message: 'Maintenance',
    });
    // errorCode still wins over status when it identifies a specific kind.
    expect(classifyResponse(200, { error: 'Must be logged in', errorCode: 1 })).toMatchObject({ kind: 'auth' });
  });
});

describe('createApi', () => {
  it('sends GETs with credentials and query params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, []));
    const api = createApi({ fetchImpl });
    const r = await api.getChatMessages(55, 2, 10);
    expect(r).toEqual({ ok: true, data: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.zed.city/getChatMessages?user_id=55&offset=2&limit=10');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('fetches the CSRF token once and sends it on POSTs', async () => {
    const fetchImpl = vi.fn((url) =>
      Promise.resolve(url.endsWith('csrfToken') ? response(200, { token: 'tok' }) : response(200, { message_id: 7 })),
    );
    const api = createApi({ fetchImpl });
    await api.sendMail(55, 'hi');
    await api.sendMail(55, 'again');
    const csrfCalls = fetchImpl.mock.calls.filter(([u]) => u.endsWith('csrfToken'));
    expect(csrfCalls).toHaveLength(1);
    const [, init] = fetchImpl.mock.calls[1];
    expect(init.headers['X-CSRF-Token']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({ message: 'hi', user_id: 55 });
  });

  it('refreshes the token and retries once on a CSRF rejection', async () => {
    let tokenN = 0;
    let sendN = 0;
    const fetchImpl = vi.fn((url) => {
      if (url.endsWith('csrfToken')) return Promise.resolve(response(200, { token: `t${++tokenN}` }));
      sendN += 1;
      return Promise.resolve(sendN === 1 ? response(200, { error: 'bad', errorCode: 403 }) : response(200, { message_id: 9 }));
    });
    const api = createApi({ fetchImpl });
    const r = await api.sendMail(1, 'x');
    expect(r).toEqual({ ok: true, data: { message_id: 9 } });
    expect(tokenN).toBe(2);
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-CSRF-Token']).toBe('t2');
  });

  it('turns thrown fetches into network results', async () => {
    const api = createApi({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(await api.getChats()).toMatchObject({ ok: false, kind: 'network', message: 'offline' });
  });

  it('never touches window.location', async () => {
    const api = createApi({ fetchImpl: vi.fn().mockResolvedValue(response(200, { error: 'x', errorCode: 5 })) });
    const before = window.location.href;
    await api.getChats();
    expect(window.location.href).toBe(before);
  });
});

describe('createApi endpoint URLs', () => {
  const cases = [
    ['getStats', [], 'GET', 'https://api.zed.city/getStats'],
    ['getChats', [], 'GET', 'https://api.zed.city/getChats?page=1'],
    ['getChats', [3], 'GET', 'https://api.zed.city/getChats?page=3'],
    ['getChatInfo', [7], 'GET', 'https://api.zed.city/getChatInfo?user_id=7'],
    ['getChatMessages', [55, 2, 10], 'GET', 'https://api.zed.city/getChatMessages?user_id=55&offset=2&limit=10'],
    ['getNewMessages', [7, 99], 'GET', 'https://api.zed.city/getNewMessages?user_id=7&last_message_id=99'],
    ['getProfile', [7], 'GET', 'https://api.zed.city/getProfile?user=7'],
    ['findPlayer', ['a b&c'], 'GET', 'https://api.zed.city/findPlayer?q=a+b%26c'],
  ];

  it.each(cases)('%s(%j) calls %s %s', async (method, args, httpMethod, url) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, {}));
    const api = createApi({ fetchImpl });
    await api[method](...args);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchImpl.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init.method).toBe(httpMethod);
  });

  it('sendMail fetches the CSRF token first, then posts the URL and JSON body', async () => {
    const fetchImpl = vi.fn((url) =>
      Promise.resolve(url.endsWith('csrfToken') ? response(200, { token: 'tok' }) : response(200, { message_id: 1 })),
    );
    const api = createApi({ fetchImpl });
    const r = await api.sendMail(7, 'hi');
    expect(r).toEqual({ ok: true, data: { message_id: 1 } });
    expect(fetchImpl.mock.calls).toHaveLength(2);
    const [csrfUrl] = fetchImpl.mock.calls[0];
    expect(csrfUrl).toBe('https://api.zed.city/csrfToken');
    const [sendUrl, sendInit] = fetchImpl.mock.calls[1];
    expect(sendUrl).toBe('https://api.zed.city/sendMail');
    expect(sendInit.method).toBe('POST');
    expect(JSON.parse(sendInit.body)).toEqual({ message: 'hi', user_id: 7 });
  });
});

describe('createApi timeouts', () => {
  it('times out a stalled GET and reports it as a network error', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const api = createApi({ fetchImpl, timeoutMs: 1000 });
    const pending = api.getChats();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual({ ok: false, kind: 'network', code: 0, message: 'Request timed out' });
    vi.useRealTimers();
  });

  it('clears the timeout when a GET responds in time, so advancing time afterwards does nothing', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(response(200, []));
    const api = createApi({ fetchImpl, timeoutMs: 1000 });
    const r = await api.getChats();
    expect(r).toEqual({ ok: true, data: [] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not put a signal on POST requests, so sendMail is never aborted', async () => {
    const fetchImpl = vi.fn((url) =>
      Promise.resolve(url.endsWith('csrfToken') ? response(200, { token: 'tok' }) : response(200, { message_id: 1 })),
    );
    const api = createApi({ fetchImpl, timeoutMs: 1000 });
    await api.sendMail(1, 'hi');
    const postCall = fetchImpl.mock.calls.find(([url]) => url.includes('sendMail'));
    expect(postCall[1].signal).toBeUndefined();
  });
});
