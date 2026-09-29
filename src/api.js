// The only module that talks to the server. Every call resolves to
// { ok: true, data } or { ok: false, kind, code, message, busy? } and never redirects the page.
export const API_BASE = 'https://api.zed.city/';
export const MAIL_ACCESS_ERROR = 'You cannot access messages with this user!';
const BUSY_CODES = { 3: 'fight', 5: 'traveling', 6: 'exploring', 7: 'offline' };

export function classifyResponse(status, body) {
  if (body && typeof body === 'object' && body.error !== undefined) {
    const code = body.errorCode;
    const message = String(body.error);
    if (code === 1) return { ok: false, kind: 'auth', code, message };
    if (BUSY_CODES[code]) return { ok: false, kind: 'busy', code, message, busy: BUSY_CODES[code] };
    if (message === MAIL_ACCESS_ERROR) return { ok: false, kind: 'access', code, message };
    if (code === 403 || status === 403) return { ok: false, kind: 'csrf', code: 403, message };
    // A JSON error body can still carry a rate-limit or server-error status; classify those by
    // status so the poller's backoff (which only triggers on 'network'/'rate') sees them.
    if (status === 429) return { ok: false, kind: 'rate', code: 429, message };
    if (status >= 500) return { ok: false, kind: 'network', code: status, message };
    return { ok: false, kind: 'other', code, message };
  }
  if (status === 429) return { ok: false, kind: 'rate', code: 429, message: 'Rate limited' };
  if (status === 403) return { ok: false, kind: 'csrf', code: 403, message: 'Forbidden' };
  if (status >= 500) return { ok: false, kind: 'network', code: status, message: `Server error ${status}` };
  if (status >= 400) return { ok: false, kind: 'other', code: status, message: `HTTP ${status}` };
  if (body === null || typeof body !== 'object') return { ok: false, kind: 'other', code: status, message: 'Unexpected response' };
  return { ok: true, data: body };
}

export function createApi({ fetchImpl = (...args) => fetch(...args), base = API_BASE, timeoutMs = 20000 } = {}) {
  let csrfToken = null;

  async function send(method, path, { params, body } = {}) {
    let url = base + path;
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    const init = { method, credentials: 'include', headers: { Accept: 'application/json' } };
    if (method !== 'GET') {
      init.headers['Content-Type'] = 'application/json';
      if (csrfToken) init.headers['X-CSRF-Token'] = csrfToken;
      init.body = JSON.stringify(body || {});
    }
    // Only GETs time out. Aborting a POST (e.g. sendMail) after the server accepted it would
    // report a delivered message as failed, and a retry would send it twice.
    let timer = null;
    let timedOut = false;
    if (method === 'GET' && typeof AbortController === 'function') {
      const controller = new AbortController();
      init.signal = controller.signal;
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (timedOut) return { ok: false, kind: 'network', code: 0, message: 'Request timed out' };
      return { ok: false, kind: 'network', code: 0, message: String((e && e.message) || e) };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    } finally {
      // The body can stall after the headers arrive, so the timer stays armed until json() settles.
      if (timer) clearTimeout(timer);
    }
    if (timedOut) return { ok: false, kind: 'network', code: 0, message: 'Request timed out' };
    return classifyResponse(res.status, data);
  }

  async function refreshCsrf() {
    csrfToken = null;
    const r = await send('GET', 'csrfToken');
    if (r.ok && r.data && typeof r.data.token === 'string') csrfToken = r.data.token;
    return csrfToken;
  }

  async function request(method, path, opts) {
    if (method !== 'GET' && !csrfToken) await refreshCsrf();
    let r = await send(method, path, opts);
    if (!r.ok && r.kind === 'csrf' && method !== 'GET') {
      await refreshCsrf();
      r = await send(method, path, opts);
      if (!r.ok && r.kind === 'csrf') r = { ...r, kind: 'other' };
    }
    return r;
  }

  return {
    getStats: () => request('GET', 'getStats'),
    getChats: (page = 1) => request('GET', 'getChats', { params: { page } }),
    getChatInfo: (userId) => request('GET', 'getChatInfo', { params: { user_id: userId } }),
    // `page` is the game's 1-based page number (it calls it "offset"); page 1 is the newest messages.
    getChatMessages: (userId, page = 1, limit = 10) =>
      request('GET', 'getChatMessages', { params: { user_id: userId, offset: page, limit } }),
    getNewMessages: (userId, lastMessageId) =>
      request('GET', 'getNewMessages', { params: { user_id: userId, last_message_id: lastMessageId } }),
    sendMail: (userId, message) => request('POST', 'sendMail', { body: { message, user_id: userId } }),
    getProfile: (userId) => request('GET', 'getProfile', { params: { user: userId } }),
    findPlayer: (q) => request('GET', 'findPlayer', { params: { q } }),
    getFactionMembers: () => request('GET', 'getFactionMembers'),
    blockList: (page = 1) => request('GET', 'blockList', { params: { page } }),
    unblockUser: (userId) => request('POST', 'unblockUser', { body: { user_id: userId } }),
  };
}
