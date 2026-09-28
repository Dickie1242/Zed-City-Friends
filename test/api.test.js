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
