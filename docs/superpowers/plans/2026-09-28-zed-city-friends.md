# Zed City Friends & DMs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a userscript that adds a Friends tab and Torn-style DM windows to Zed City's bottom-right chat dock, an "Add Friend" button on profiles, and a "+ friend" action on chat names. It runs entirely on the game's existing Mail API.

**Architecture:** Plain ES modules with no framework, bundled by esbuild into one readable `dist/zed-city-friends.user.js` (`@grant none`, page context).
- Only `src/api.js` does network I/O, and only `src/store.js` does storage I/O.
- Pure logic (`state`, `mail`, `time`, `friends-view`, `backup`) is separate from DOM code (`src/ui/*`).
- `src/app.js` wires everything together and owns the polling policy.
- Our windows are ordinary `.chat-container` elements placed inside the game's `.chat-containers` dock through a `display:contents` root, so the game's global CSS styles them.

**Tech Stack:** JavaScript (ES2020 modules), esbuild 0.28, Vitest 5 + jsdom 29, Node 24 (tested with v24.11.1).

**Spec:** `docs/superpowers/specs/2026-09-28-zed-city-friends-design.md`. Read §2 (environment facts) before starting.

---

## Notes for the implementer

- **Working directory:** `D:\dev\Zed City Scripts` (a git repo on `master` with the spec already committed). Use the Bash tool (Git Bash) for the commands below.
- **The code in this plan has been verified.** Every file below was built and run in a scratch copy of this project, and the full suite passed (118 tests across 24 files). Type the files exactly as given. If a test fails, the difference is in what was typed, so diff against the plan before changing any logic.
- **Commits:** end each commit message with whatever attribution trailer your session instructions require.
- **You can't test against the live game.** Task 26 is a manual check the user runs while logged in, so the automated tests use fixtures copied from the live client's markup (`test/fixtures/game-dom.js`).
- **Expected "fail" output:** when a step says a run should fail because a module is missing, Vitest prints something like `Error: Failed to load url ../src/<name>.js ... Does the file exist?` Any failure that points at the missing module counts.

## File structure

```
package.json, package-lock.json, vitest.config.js, build.mjs, README.md
src/
  util.js            warnOnce/safe/debounce/asArray/toId
  time.js            UTC parsing + formatting (message times, day labels, "Active 12m ago")
  api.js             fetch wrapper: credentials, CSRF + one retry, error kinds, endpoints
  mail.js            normalize messages/threads, buildLog (dividers + grouping), findNewMail, reconcilePending
  state.js           pure mutators over the saved document (friends, threads, dock)
  store.js           localStorage persistence per player, cross-tab sync, corrupt backup
  backup.js          export/import JSON with strict validation
  poller.js          visibility-aware timer with backoff, poke, reschedule
  presence.js        online-status cache, 2 concurrent fetches 250ms apart
  players.js         findPlayer search, exact-name resolve, cached getProfile
  router.js          page-change events (history patch + popstate), navigate via the game's Vue router
  conversation.js    one DM thread (paging, fetchNew, optimistic send, trim) + registry
  inbox.js           getChats polling → unread badges, friend pop-ups, change signals
  friends-view.js    pure Online/Offline/Recent section builder
  app.js             wiring + polling policy (15s/5s threads, 2s active DM, 60s info/presence)
  main.js            waitForPlayer + boot (once per page)
  index.js           bundle entry: boot()
  ui/dom.js          h(), text-only rendering, avatar, badge, highlight, download
  ui/styles.js       CSS string + injectStyles
  ui/toast.js        minimal toasts
  ui/dock.js         mount root into .chat-containers, re-mount, phone one-open-chat coordination
  ui/add-friend-popover.js   person-plus pop-out search
  ui/friends-window.js       Friends tab/window
  ui/dm-window.js            DM tab/window
  ui/dock-view.js            reconciles windows inside the dock root
  ui/profile-button.js       Add Friend / Friends button on /profile/{id}
  ui/chat-names.js           "+ friend" on chat sender names
test/                mirrors src/ (+ helpers.js, fixtures/game-dom.js, ui/services.js)
docs/manual-test.md  live-game checklist
dist/zed-city-friends.user.js   built artifact (committed)
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vitest.config.js`, `test/helpers.js`
- Modify: `.gitignore` (already contains `.superpowers/` and `node_modules/`, so leave it as is)

- [ ] **Step 1: Create `package.json`**

`package.json`:

```json
{
  "name": "zed-city-friends",
  "version": "0.1.0",
  "description": "Friends list and Torn-style DM windows in Zed City's chat dock.",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "node build.mjs"
  },
  "devDependencies": {
    "esbuild": "^0.28.2",
    "jsdom": "^29.1.1",
    "vitest": "^5.0.2"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `npm install`
Expected: installs esbuild, jsdom and vitest with no errors, and creates `package-lock.json`.

- [ ] **Step 3: Create `vitest.config.js`**

`vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    restoreMocks: true,
  },
});
```

- [ ] **Step 4: Create the shared test helpers `test/helpers.js`**

`test/helpers.js`:

```js
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
```

- [ ] **Step 5: Verify the toolchain**

Run: `npx vitest --version`
Expected: prints `vitest/5.x.x ...`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js test/helpers.js
git commit -m "chore: scaffold userscript project with vitest and esbuild"
```

---

### Task 2: util.js

**Files:**
- Create: `src/util.js`
- Test: `test/util.test.js`

- [ ] **Step 1: Write the failing test**

`test/util.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warnOnce, resetWarnings, safe, debounce, asArray, toId } from '../src/util.js';

describe('util', () => {
  beforeEach(() => resetWarnings());

  it('warnOnce logs each key only once', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOnce('a', 1);
    warnOnce('a', 2);
    warnOnce('b');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]).toEqual(['[ZCF]', 'a', 1]);
  });

  it('safe swallows sync throws and async rejections', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(safe('x', () => { throw new Error('boom'); })()).toBeUndefined();
    safe('y', async () => { throw new Error('later'); })();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('debounce runs once after the quiet period and can be cancelled', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d(1);
    d(2);
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith(2);
    d(3);
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('asArray accepts arrays and index-keyed objects', () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray({ 0: 'a', 1: 'b' })).toEqual(['a', 'b']);
    expect(asArray(null)).toEqual([]);
  });

  it('toId only accepts positive integers', () => {
    expect(toId('42')).toBe(42);
    expect(toId(0)).toBeNull();
    expect(toId('abc')).toBeNull();
    expect(toId(1.5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/util.test.js`
Expected: FAIL, because `../src/util.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/util.js`**

`src/util.js`:

```js
const warned = new Set();

// Logs a warning once per key so a broken selector or endpoint can't flood the console.
export function warnOnce(key, ...details) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[ZCF]', key, ...details);
}

export function resetWarnings() {
  warned.clear();
}

// Wraps a callback so an exception (or rejected promise) is logged once and never reaches the game's code.
export function safe(key, fn) {
  return function safeWrapped(...args) {
    try {
      const out = fn.apply(this, args);
      if (out && typeof out.then === 'function') out.then(undefined, (e) => warnOnce(key, e));
      return out;
    } catch (e) {
      warnOnce(key, e);
      return undefined;
    }
  };
}

export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

// The API sometimes returns lists as objects keyed by index; accept both.
export function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

export function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/util.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/util.js test/util.test.js
git commit -m "feat: add util helpers (warnOnce, safe, debounce, asArray, toId)"
```

---

### Task 3: time.js (UTC parsing and formatting)

**Files:**
- Create: `src/time.js`
- Test: `test/time.test.js`

The game formats all times in UTC (`dayjs.utc()`), and `sent_at` strings without a timezone are UTC. `formatMessageTime` copies the inbox: `HH:mm`, `Yesterday at HH:mm`, `DD/MM/YYYY at HH:mm`.

- [ ] **Step 1: Write the failing test**

`test/time.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseSentAt, formatMessageTime, formatDayLabel, timeAgo, statusText, utcDayKey } from '../src/time.js';

const T = Date.UTC(2026, 8, 28, 14, 3, 11); // 2026-09-28 14:03:11 UTC

describe('time', () => {
  it('parses the formats the API may use as UTC', () => {
    expect(parseSentAt('2026-09-28 14:03:11')).toBe(T);
    expect(parseSentAt('2026-09-28T14:03:11')).toBe(T);
    expect(parseSentAt('2026-09-28T14:03:11Z')).toBe(T);
    expect(parseSentAt('2026-09-28T16:03:11+02:00')).toBe(T);
    expect(parseSentAt(T / 1000)).toBe(T);
    expect(parseSentAt(String(T / 1000))).toBe(T);
    expect(parseSentAt(T)).toBe(T);
    expect(parseSentAt('')).toBeNull();
    expect(parseSentAt('nonsense')).toBeNull();
    expect(parseSentAt(null)).toBeNull();
  });

  it('formats message times like the game inbox (UTC)', () => {
    const now = Date.UTC(2026, 8, 28, 20, 0, 0);
    expect(formatMessageTime(T, now)).toBe('14:03');
    expect(formatMessageTime(T - 86400000, now)).toBe('Yesterday at 14:03');
    expect(formatMessageTime(Date.UTC(2026, 8, 1, 9, 5), now)).toBe('01/09/2026 at 09:05');
  });

  it('formats day dividers and day keys', () => {
    expect(formatDayLabel(T)).toBe('September 28, 2026');
    expect(utcDayKey(T)).toBe('2026-09-28');
  });

  it('describes last-active time', () => {
    const now = T + 12 * 60000;
    expect(timeAgo(T, now)).toBe('12m ago');
    expect(timeAgo(T, T + 30000)).toBe('just now');
    expect(timeAgo(T, T + 3 * 3600000)).toBe('3h ago');
    expect(timeAgo(T, T + 3 * 86400000)).toBe('3d ago');
    expect(statusText({ online: true }, now)).toBe('Online');
    expect(statusText({ online: false, active: T }, now)).toBe('Active 12m ago');
    expect(statusText({ online: false, active: null }, now)).toBe('Offline');
    expect(statusText(null, now)).toBe('');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/time.test.js`
Expected: FAIL, because `../src/time.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/time.js`**

`src/time.js`:

```js
// All game times are UTC, matching the game's own dayjs.utc() formatting.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

// Accepts unix seconds, unix ms, ISO strings and "YYYY-MM-DD HH:mm:ss" (treated as UTC). Returns ms or null.
export function parseSentAt(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 1e12 ? value * 1000 : value;
  }
  let s = String(value).trim();
  if (/^\d+$/.test(s)) return parseSentAt(Number(s));
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

export function utcDayKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatClock(ts) {
  const d = new Date(ts);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatMessageTime(ts, now = Date.now()) {
  const clock = formatClock(ts);
  const day = utcDayKey(ts);
  if (day === utcDayKey(now)) return clock;
  if (day === utcDayKey(now - DAY_MS)) return `Yesterday at ${clock}`;
  const d = new Date(ts);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} at ${clock}`;
}

export function formatDayLabel(ts) {
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// info: { online: boolean, active: ms|null } from the presence cache.
export function statusText(info, now = Date.now()) {
  if (!info) return '';
  if (info.online) return 'Online';
  if (info.active) return `Active ${timeAgo(info.active, now)}`;
  return 'Offline';
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/time.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/time.js test/time.test.js
git commit -m "feat: add UTC time parsing and formatting"
```

---

### Task 4: api.js (the only network code)

**Files:**
- Create: `src/api.js`
- Test: `test/api.test.js`

Every call resolves to `{ok:true,data}` or `{ok:false,kind,code,message,busy?}`, with `kind` ∈ `auth | busy | access | csrf | rate | network | other`. A POST fetches `/csrfToken` lazily. On a CSRF rejection it refreshes the token and retries once. It never redirects the page (the game's own axios interceptor does; we must not).

- [ ] **Step 1: Write the failing test**

`test/api.test.js`:

```js
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/api.test.js`
Expected: FAIL, because `../src/api.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/api.js`**

`src/api.js`:

```js
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
    return { ok: false, kind: 'other', code, message };
  }
  if (status === 429) return { ok: false, kind: 'rate', code: 429, message: 'Rate limited' };
  if (status === 403) return { ok: false, kind: 'csrf', code: 403, message: 'Forbidden' };
  if (status >= 500) return { ok: false, kind: 'network', code: status, message: `Server error ${status}` };
  if (status >= 400) return { ok: false, kind: 'other', code: status, message: `HTTP ${status}` };
  if (body === null || typeof body !== 'object') return { ok: false, kind: 'other', code: status, message: 'Unexpected response' };
  return { ok: true, data: body };
}

export function createApi({ fetchImpl = (...args) => fetch(...args), base = API_BASE } = {}) {
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
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (e) {
      return { ok: false, kind: 'network', code: 0, message: String((e && e.message) || e) };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
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
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/api.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api.js test/api.test.js
git commit -m "feat: add api client with CSRF retry and error kinds"
```

---

### Task 5: mail.js (messages, threads, log building)

**Files:**
- Create: `src/mail.js`
- Test: `test/mail.test.js`

`buildLog` copies the game inbox: a same-sender message is grouped if it's within 15 minutes and on the same UTC day, and a day divider appears whenever the day changes. `findNewMail` returns threads with `new_mail > 0` from the other person whose `lastReply` is newer than the stored `lastSeenReply`.

- [ ] **Step 1: Write the failing test**

`test/mail.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  messageText,
  normalizeMessages,
  normalizeThreads,
  buildLog,
  findNewMail,
  reconcilePending,
} from '../src/mail.js';
import { rawMsg, rawThread } from './helpers.js';

describe('mail', () => {
  it('turns object messages into readable text', () => {
    expect(messageText('hey')).toBe('hey');
    expect(messageText({ cmd: 'tradeInvite' })).toBe('Sent a trade invite');
    expect(messageText({ cmd: 'activityInvite' })).toBe('Sent an activity invite');
    expect(messageText({ cmd: 'mystery' })).toBe('Sent a message that can only be viewed in the inbox');
    expect(messageText(null)).toBe('');
  });

  it('normalizes messages and drops rows without an id', () => {
    const out = normalizeMessages([rawMsg(5, 2, 'a', '2026-09-28 10:00:00'), { message: 'no id' }]);
    expect(out).toEqual([{ id: 5, senderId: 2, text: 'a', ts: Date.UTC(2026, 8, 28, 10), isSystem: false }]);
  });

  it('normalizes thread rows, including boolean or numeric new_mail', () => {
    const [a, b, c] = normalizeThreads({
      0: rawThread(10, { newMail: 3 }),
      1: rawThread(11, { newMail: true }),
      2: { ...rawThread(12), other_user: null, new_mail: 0 },
    });
    expect(a).toMatchObject({ userId: 10, username: 'User10', newMail: 3, preview: 'hi', avatar: null });
    expect(b.newMail).toBe(1);
    expect(c).toMatchObject({ userId: 12, username: '#12', newMail: 0 });
  });

  it('builds a log with day dividers and 15-minute same-sender grouping', () => {
    const msgs = normalizeMessages([
      rawMsg(3, 2, 'c', '2026-09-28 10:10:00'),
      rawMsg(1, 2, 'a', '2026-09-27 23:59:00'),
      rawMsg(2, 2, 'b', '2026-09-28 10:00:00'),
      rawMsg(4, 1, 'd', '2026-09-28 10:21:00'),
      rawMsg(5, 1, 'e', '2026-09-28 10:40:00'),
      rawMsg(2, 2, 'b', '2026-09-28 10:00:00'),
    ]);
    const log = buildLog(msgs);
    expect(log.map((i) => i.key)).toEqual(['d:2026-09-27', 'm:1', 'd:2026-09-28', 'm:2', 'm:3', 'm:4', 'm:5']);
    expect(log[0].label).toBe('September 27, 2026');
    const grouped = Object.fromEntries(log.filter((i) => i.type === 'msg').map((i) => [i.msg.id, i.grouped]));
    expect(grouped).toEqual({ 1: false, 2: false, 3: true, 4: false, 5: false });
  });

  it('finds unread mail newer than what was seen, from the other person only', () => {
    const threads = normalizeThreads([
      rawThread(10, { newMail: 1, lastReply: '2026-09-28 12:00:00' }),
      rawThread(11, { newMail: 1, senderId: 1 }),
      rawThread(12, { newMail: 1, isSystem: 1 }),
      rawThread(13, { newMail: 0 }),
      rawThread(14, { newMail: 2, lastReply: '2026-09-28 12:00:00' }),
    ]);
    const seen = { 14: { lastSeenReply: Date.UTC(2026, 8, 28, 12) } };
    expect(findNewMail(threads, seen, 1).map((t) => t.userId)).toEqual([10]);
  });

  it('drops pending messages once their server copy arrives', () => {
    const pending = [{ localId: 1, realId: 50 }, { localId: 2, realId: null }, { localId: 3, realId: 60 }];
    expect(reconcilePending(pending, [{ id: 50 }]).map((p) => p.localId)).toEqual([2, 3]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/mail.test.js`
Expected: FAIL, because `../src/mail.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/mail.js`**

`src/mail.js`:

```js
import { parseSentAt, utcDayKey, formatDayLabel } from './time.js';
import { asArray, toId } from './util.js';

// Same grouping window the game's inbox uses (MailView groupWindowMs).
export const GROUP_WINDOW_MS = 900000;

export function messageText(message) {
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object') {
    if (message.cmd === 'tradeInvite') return 'Sent a trade invite';
    if (message.cmd === 'activityInvite') return 'Sent an activity invite';
    return 'Sent a message that can only be viewed in the inbox';
  }
  if (message === null || message === undefined) return '';
  return String(message);
}

export function normalizeMessage(raw) {
  const id = toId(raw && raw.id);
  if (!id) return null;
  return {
    id,
    senderId: toId(raw.sender_id),
    text: messageText(raw.message),
    ts: parseSentAt(raw.sent_at),
    isSystem: !!raw.is_system,
  };
}

export function normalizeMessages(data) {
  return asArray(data).map(normalizeMessage).filter(Boolean);
}

export function normalizeThread(raw) {
  const userId = toId(raw && raw.other_user_id);
  if (!userId) return null;
  const other = raw.other_user && typeof raw.other_user === 'object' ? raw.other_user : {};
  const unread = Number(raw.new_mail);
  return {
    userId,
    username: typeof other.username === 'string' && other.username ? other.username : `#${userId}`,
    avatar: typeof other.avatar === 'string' && other.avatar ? other.avatar : null,
    preview: messageText(raw.message),
    senderId: toId(raw.sender_id),
    lastReply: parseSentAt(raw.last_reply),
    newMail: unread > 0 ? Math.floor(unread) : 0,
    isSystem: !!raw.is_system,
  };
}

export function normalizeThreads(data) {
  return asArray(data).map(normalizeThread).filter(Boolean);
}

// Turns messages (any order, duplicates allowed) into render items: day dividers + messages with a `grouped` flag.
export function buildLog(messages) {
  const byId = new Map();
  for (const m of messages) byId.set(m.id, m);
  const sorted = [...byId.values()].sort((a, b) => a.id - b.id);
  const items = [];
  let prev = null;
  for (const m of sorted) {
    const day = m.ts !== null ? utcDayKey(m.ts) : null;
    const prevDay = prev && prev.ts !== null ? utcDayKey(prev.ts) : null;
    if (day && day !== prevDay) items.push({ type: 'divider', key: `d:${day}`, label: formatDayLabel(m.ts) });
    const grouped =
      !!prev &&
      prev.senderId === m.senderId &&
      day !== null &&
      day === prevDay &&
      Math.abs(m.ts - prev.ts) <= GROUP_WINDOW_MS;
    items.push({ type: 'msg', key: `m:${m.id}`, msg: m, grouped });
    prev = m;
  }
  return items;
}

// Threads with unread mail from the other person that is newer than what we've already seen.
// `seen` is state.threads: { [userId]: { lastSeenReply } }.
export function findNewMail(threads, seen, myId) {
  const out = [];
  for (const t of threads) {
    if (t.isSystem || t.newMail <= 0 || t.senderId === myId) continue;
    const lastSeen = (seen[t.userId] && seen[t.userId].lastSeenReply) || 0;
    if (t.lastReply !== null && t.lastReply <= lastSeen) continue;
    out.push(t);
  }
  return out;
}

// Drops optimistic messages once the server copy (matched by message_id) has arrived.
export function reconcilePending(pending, messages) {
  const ids = new Set(messages.map((m) => m.id));
  return pending.filter((p) => !(p.realId && ids.has(p.realId)));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/mail.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/mail.js test/mail.test.js
git commit -m "feat: add mail normalization, log grouping and unread detection"
```

---

### Task 6: state.js (pure state mutators)

**Files:**
- Create: `src/state.js`
- Test: `test/state.test.js`

The saved document is `{ v:1, friends:{[id]:{id,username,avatar,addedAt}}, threads:{[id]:{lastSeenReply,lastNotifiedReply,unread}}, dock:{friendsOpen, dms:[{id,open,lastUsed,username,avatar}]} }`. Timestamps are milliseconds. At most 4 DM entries are kept, and the least recently used entry without unread mail is evicted first.

- [ ] **Step 1: Write the failing test**

`test/state.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  emptyState,
  normalizeState,
  addFriend,
  removeFriend,
  updateFriendInfo,
  isFriend,
  markSeen,
  openDm,
  setDmOpen,
  closeDm,
  setFriendsOpen,
  collapseAll,
  friendsUnreadTotal,
  MAX_DMS,
} from '../src/state.js';

describe('state', () => {
  it('normalizes documents and rejects unknown versions', () => {
    expect(normalizeState({ v: 1 })).toEqual(emptyState());
    expect(normalizeState({ v: 1, dock: { dms: [{ id: 3 }, { id: 'x' }, null] } }).dock.dms).toEqual([{ id: 3 }]);
    expect(() => normalizeState({ v: 2 })).toThrow();
    expect(() => normalizeState(null)).toThrow();
  });

  it('adds, updates and removes friends', () => {
    const s = emptyState();
    expect(addFriend(s, { id: 5, username: 'Spike', avatar: 'a.png' }, 100)).toBe(true);
    expect(addFriend(s, { id: 5, username: 'Other' }, 200)).toBe(false);
    expect(s.friends[5]).toEqual({ id: 5, username: 'Spike', avatar: 'a.png', addedAt: 100 });
    expect(isFriend(s, 5)).toBe(true);
    expect(updateFriendInfo(s, 5, { username: 'Spike2' })).toBe(true);
    expect(updateFriendInfo(s, 5, { username: 'Spike2', avatar: '' })).toBe(false);
    removeFriend(s, 5);
    expect(isFriend(s, 5)).toBe(false);
  });

  it('marks threads seen', () => {
    const s = emptyState();
    s.threads[5] = { lastSeenReply: 10, lastNotifiedReply: 0, unread: 3 };
    markSeen(s, 5, 50);
    expect(s.threads[5]).toMatchObject({ unread: 0, lastSeenReply: 50 });
    markSeen(s, 5, 20);
    expect(s.threads[5].lastSeenReply).toBe(50);
  });

  it('opens DMs minimized or expanded, exclusively on phones', () => {
    const s = emptyState();
    s.dock.friendsOpen = true;
    openDm(s, 1, { now: 1 });
    expect(s.dock.dms).toEqual([{ id: 1, open: false, lastUsed: 1, username: null, avatar: null }]);
    openDm(s, 2, { expand: true, now: 2, username: 'Nyx' });
    expect(s.dock.friendsOpen).toBe(true);
    openDm(s, 1, { expand: true, exclusive: true, now: 3 });
    expect(s.dock.dms.map((d) => [d.id, d.open])).toEqual([[1, true], [2, false]]);
    expect(s.dock.friendsOpen).toBe(false);
    expect(s.dock.dms[1].username).toBe('Nyx');
  });

  it(`keeps at most ${MAX_DMS} DMs, evicting the oldest without unread first`, () => {
    const s = emptyState();
    for (let id = 1; id <= 4; id += 1) openDm(s, id, { now: id });
    s.threads[1] = { unread: 2 };
    openDm(s, 5, { now: 5 });
    expect(s.dock.dms.map((d) => d.id)).toEqual([1, 3, 4, 5]);
    for (const id of [3, 4, 5]) s.threads[id] = { unread: 1 };
    openDm(s, 6, { now: 6 });
    expect(s.dock.dms.map((d) => d.id)).toEqual([3, 4, 5, 6]);
  });

  it('toggles and closes dock entries', () => {
    const s = emptyState();
    openDm(s, 1, { now: 1 });
    openDm(s, 2, { now: 2, expand: true });
    setDmOpen(s, 1, true, { exclusive: true, now: 9 });
    expect(s.dock.dms.map((d) => d.open)).toEqual([true, false]);
    expect(s.dock.dms[0].lastUsed).toBe(9);
    setFriendsOpen(s, true, { exclusive: true });
    expect(s.dock.dms.every((d) => !d.open)).toBe(true);
    collapseAll(s);
    expect(s.dock.friendsOpen).toBe(false);
    closeDm(s, 1);
    expect(s.dock.dms.map((d) => d.id)).toEqual([2]);
  });

  it('sums unread mail from friends only', () => {
    const s = emptyState();
    addFriend(s, { id: 1, username: 'a' }, 0);
    addFriend(s, { id: 2, username: 'b' }, 0);
    s.threads = { 1: { unread: 2 }, 2: { unread: 0 }, 3: { unread: 5 } };
    expect(friendsUnreadTotal(s)).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/state.test.js`
Expected: FAIL, because `../src/state.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/state.js`**

`src/state.js`:

```js
// Pure functions over the saved state document. Mutators change the draft passed in by store.update().
import { toId } from './util.js';

export const MAX_DMS = 4;

export function emptyState() {
  return { v: 1, friends: {}, threads: {}, dock: { friendsOpen: false, dms: [] } };
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// Validates a parsed document; throws for anything we can't read so the store can back it up.
export function normalizeState(doc) {
  if (!isObj(doc) || doc.v !== 1) throw new Error('Unsupported state document');
  const dock = isObj(doc.dock) ? doc.dock : {};
  return {
    v: 1,
    friends: isObj(doc.friends) ? doc.friends : {},
    threads: isObj(doc.threads) ? doc.threads : {},
    dock: {
      friendsOpen: !!dock.friendsOpen,
      dms: Array.isArray(dock.dms) ? dock.dms.filter((d) => isObj(d) && toId(d.id)) : [],
    },
  };
}

export function isFriend(state, id) {
  return !!state.friends[id];
}

export function addFriend(state, { id, username, avatar }, now) {
  if (state.friends[id]) return false;
  state.friends[id] = { id, username: username || `#${id}`, avatar: avatar || null, addedAt: now };
  return true;
}

export function removeFriend(state, id) {
  delete state.friends[id];
}

export function updateFriendInfo(state, id, { username, avatar }) {
  const f = state.friends[id];
  if (!f) return false;
  let changed = false;
  if (typeof username === 'string' && username && username !== f.username) {
    f.username = username;
    changed = true;
  }
  if (typeof avatar === 'string' && avatar && avatar !== f.avatar) {
    f.avatar = avatar;
    changed = true;
  }
  return changed;
}

export function threadEntry(state, id) {
  if (!state.threads[id]) state.threads[id] = { lastSeenReply: 0, lastNotifiedReply: 0, unread: 0 };
  return state.threads[id];
}

export function markSeen(state, id, lastReply) {
  const t = threadEntry(state, id);
  t.unread = 0;
  if (lastReply && lastReply > (t.lastSeenReply || 0)) t.lastSeenReply = lastReply;
}

function collapseOthers(state, keep) {
  for (const d of state.dock.dms) if (d !== keep) d.open = false;
  state.dock.friendsOpen = false;
}

// Adds (or refreshes) a DM entry in the dock. `exclusive` is used on phones where only one window may be open.
export function openDm(state, id, opts = {}) {
  const { expand = false, exclusive = false, now = 0, max = MAX_DMS, username, avatar } = opts;
  let entry = state.dock.dms.find((d) => d.id === id);
  if (!entry) {
    entry = { id, open: false, lastUsed: now, username: username || null, avatar: avatar || null };
    state.dock.dms.push(entry);
  }
  if (username) entry.username = username;
  if (avatar) entry.avatar = avatar;
  entry.lastUsed = now;
  if (expand) {
    entry.open = true;
    if (exclusive) collapseOthers(state, entry);
  }
  evictDms(state, id, max);
}

// Keeps at most `max` DM entries, dropping the least recently used ones without unread mail first.
export function evictDms(state, keepId, max = MAX_DMS) {
  while (state.dock.dms.length > max) {
    const candidates = state.dock.dms.filter((d) => d.id !== keepId);
    if (!candidates.length) break;
    const quiet = candidates.filter((d) => !(state.threads[d.id] && state.threads[d.id].unread > 0));
    const pool = (quiet.length ? quiet : candidates).slice().sort((a, b) => a.lastUsed - b.lastUsed);
    const victim = pool[0];
    state.dock.dms = state.dock.dms.filter((d) => d !== victim);
  }
}

export function setDmOpen(state, id, open, { exclusive = false, now } = {}) {
  const entry = state.dock.dms.find((d) => d.id === id);
  if (!entry) return;
  entry.open = !!open;
  if (now) entry.lastUsed = now;
  if (open && exclusive) collapseOthers(state, entry);
}

export function closeDm(state, id) {
  state.dock.dms = state.dock.dms.filter((d) => d.id !== id);
}

export function setFriendsOpen(state, open, { exclusive = false } = {}) {
  state.dock.friendsOpen = !!open;
  if (open && exclusive) for (const d of state.dock.dms) d.open = false;
}

export function collapseAll(state) {
  state.dock.friendsOpen = false;
  for (const d of state.dock.dms) d.open = false;
}

export function friendsUnreadTotal(state) {
  let n = 0;
  for (const id of Object.keys(state.friends)) {
    const t = state.threads[id];
    if (t && t.unread > 0) n += t.unread;
  }
  return n;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/state.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/state.js test/state.test.js
git commit -m "feat: add pure state mutators for friends, threads and dock"
```

---

### Task 7: store.js (the only storage code)

**Files:**
- Create: `src/store.js`
- Test: `test/store.test.js`

The key is `zcf:v1:{playerId}`. `update(mutate)` re-reads localStorage before applying the change so two game tabs don't overwrite each other, and the `storage` event reloads the state. A corrupt document is backed up to `zcf:v1:{id}:corrupt:{ts}` and the store starts empty.

- [ ] **Step 1: Write the failing test**

`test/store.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createStore, storageKey } from '../src/store.js';
import { addFriend } from '../src/state.js';
import { memoryStorage } from './helpers.js';

describe('store', () => {
  it('keeps a separate document per player', () => {
    const storage = memoryStorage();
    const a = createStore({ playerId: 1, storage });
    const b = createStore({ playerId: 2, storage });
    a.update((s) => addFriend(s, { id: 9, username: 'x' }, 0));
    expect(JSON.parse(storage.getItem(storageKey(1))).friends[9].username).toBe('x');
    expect(b.get().friends).toEqual({});
  });

  it('notifies subscribers and returns the mutator result', () => {
    const store = createStore({ playerId: 1, storage: memoryStorage() });
    const fn = vi.fn();
    store.subscribe(fn);
    expect(store.update((s) => addFriend(s, { id: 9, username: 'x' }, 0))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().friends[9]).toBeTruthy();
  });

  it('applies updates on top of changes written by another tab', () => {
    const storage = memoryStorage();
    const tab1 = createStore({ playerId: 1, storage });
    const tab2 = createStore({ playerId: 1, storage });
    tab1.update((s) => addFriend(s, { id: 1, username: 'a' }, 0));
    tab2.update((s) => addFriend(s, { id: 2, username: 'b' }, 0));
    expect(Object.keys(tab2.get().friends)).toEqual(['1', '2']);
  });

  it('reloads when the storage event fires for its key', () => {
    const storage = memoryStorage();
    const store = createStore({ playerId: 1, storage });
    const fn = vi.fn();
    store.subscribe(fn);
    storage.setItem(storageKey(1), JSON.stringify({ v: 1, friends: { 4: { id: 4, username: 'z' } } }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(fn).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey(1) }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().friends[4].username).toBe('z');
    store.destroy();
  });

  it('backs up a corrupt document and starts empty', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage({ [storageKey(1)]: '{not json' });
    const store = createStore({ playerId: 1, storage, now: () => 123 });
    expect(store.get().friends).toEqual({});
    expect(storage.getItem(`${storageKey(1)}:corrupt:123`)).toBe('{not json');
    expect(storage.getItem(storageKey(1))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/store.test.js`
Expected: FAIL, because `../src/store.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/store.js`**

`src/store.js`:

```js
// The only module that touches storage. One JSON document per player in localStorage.
import { emptyState, normalizeState } from './state.js';
import { warnOnce } from './util.js';

export const storageKey = (playerId) => `zcf:v1:${playerId}`;

export function createStore({ playerId, storage = window.localStorage, win = window, now = () => Date.now() }) {
  const key = storageKey(playerId);
  const subs = new Set();
  let state = read();

  function read() {
    let text = null;
    try {
      text = storage.getItem(key);
    } catch (e) {
      warnOnce('store-read', e);
      return emptyState();
    }
    if (!text) return emptyState();
    try {
      return normalizeState(JSON.parse(text));
    } catch (e) {
      warnOnce('store-corrupt', e);
      try {
        storage.setItem(`${key}:corrupt:${now()}`, text);
        storage.removeItem(key);
      } catch {
        // storage full or blocked: starting empty is still better than crashing
      }
      return emptyState();
    }
  }

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn(state);
      } catch (e) {
        warnOnce('store-subscriber', e);
      }
    }
  }

  // Re-reads the saved copy before applying `mutate`, so edits made in another game tab aren't overwritten.
  function update(mutate) {
    const draft = read();
    const result = mutate(draft);
    state = draft;
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch (e) {
      warnOnce('store-write', e);
    }
    emit();
    return result;
  }

  function onStorage(e) {
    if (e.key !== key) return;
    state = read();
    emit();
  }
  win.addEventListener('storage', onStorage);

  return {
    key,
    get: () => state,
    update,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    destroy() {
      win.removeEventListener('storage', onStorage);
      subs.clear();
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/store.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/store.js test/store.test.js
git commit -m "feat: add per-player localStorage store with cross-tab sync"
```

---

### Task 8: backup.js (export / import)

**Files:**
- Create: `src/backup.js`
- Test: `test/backup.test.js`

- [ ] **Step 1: Write the failing test**

`test/backup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { exportFriends, parseImport } from '../src/backup.js';
import { emptyState, addFriend } from '../src/state.js';

describe('backup', () => {
  it('round-trips an export', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike', avatar: 'a.png' }, 0);
    const text = exportFriends(s, 77);
    expect(JSON.parse(text)).toEqual({ v: 1, playerId: 77, friends: [{ id: 5, username: 'Spike' }] });
    expect(parseImport(text, 77)).toEqual({ ok: true, friends: [{ id: 5, username: 'Spike' }] });
  });

  it('rejects bad files and other players', () => {
    expect(parseImport('nope', 1)).toMatchObject({ ok: false, error: 'That file is not valid JSON.' });
    expect(parseImport('{"v":1}', 1)).toMatchObject({ ok: false, error: 'That file is not a Zed City Friends export.' });
    expect(parseImport('{"v":1,"playerId":2,"friends":[]}', 1)).toMatchObject({ ok: false, error: 'That export belongs to a different player.' });
  });

  it('keeps only valid, unique entries and trims long names', () => {
    const text = JSON.stringify({
      v: 1,
      playerId: 1,
      friends: [{ id: 3, username: 'x'.repeat(40) }, { id: 3, username: 'dup' }, { id: -1 }, { id: 'abc' }, { id: 4, extra: 'drop me' }],
    });
    expect(parseImport(text, 1)).toEqual({ ok: true, friends: [{ id: 3, username: 'x'.repeat(32) }, { id: 4, username: '#4' }] });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/backup.test.js`
Expected: FAIL, because `../src/backup.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/backup.js`**

`src/backup.js`:

```js
import { toId } from './util.js';

export function exportFriends(state, playerId) {
  const friends = Object.values(state.friends).map((f) => ({ id: f.id, username: f.username }));
  return JSON.stringify({ v: 1, playerId, friends }, null, 2);
}

// Strictly validates an export file. Returns { ok: true, friends } or { ok: false, error }.
export function parseImport(text, playerId) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!doc || typeof doc !== 'object' || doc.v !== 1 || !Array.isArray(doc.friends)) {
    return { ok: false, error: 'That file is not a Zed City Friends export.' };
  }
  if (toId(doc.playerId) !== toId(playerId)) {
    return { ok: false, error: 'That export belongs to a different player.' };
  }
  const friends = [];
  const seen = new Set();
  for (const f of doc.friends) {
    const id = toId(f && f.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const username = typeof f.username === 'string' ? f.username.slice(0, 32) : '';
    friends.push({ id, username: username || `#${id}` });
  }
  return { ok: true, friends };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/backup.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backup.js test/backup.test.js
git commit -m "feat: add friends export/import with validation"
```

---

### Task 9: poller.js

**Files:**
- Create: `src/poller.js`
- Test: `test/poller.test.js`

Behavior:
- Runs immediately on `start()` and never overlaps runs.
- Pauses while `document.visibilityState === 'hidden'` and runs immediately when the tab is visible again.
- On `network` / `rate` failures the wait doubles, capped at `maxBackoff`. On `busy` it waits at least `busyInterval`. On `auth` it stops and calls `onAuthLost`.
- `interval` can be a function, which is read before every wait. `reschedule()` restarts the wait with the current interval.

- [ ] **Step 1: Write the failing test**

`test/poller.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makePoller } from '../src/poller.js';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('runs immediately on start and then every interval', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = makePoller({ run, interval: 1000 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    p.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
    p.destroy();
  });

  it('pauses while hidden and runs right away when visible again', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = makePoller({ run, interval: 1000 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    p.destroy();
  });

  it('doubles the wait on network errors up to the cap, and resets on success', async () => {
    const results = [{ ok: false, kind: 'network' }, { ok: false, kind: 'rate' }, { ok: false, kind: 'network' }, { ok: true }, { ok: true }];
    const times = [];
    const run = vi.fn(() => {
      times.push(Date.now());
      return Promise.resolve(results.shift() || { ok: true });
    });
    const p = makePoller({ run, interval: 1000, maxBackoff: 3000 });
    const t0 = Date.now();
    p.start();
    await vi.advanceTimersByTimeAsync(20000);
    const gaps = times.slice(1, 6).map((t, i) => t - times[i]);
    expect(times[0] - t0).toBe(0);
    expect(gaps).toEqual([2000, 3000, 3000, 1000, 1000]);
    p.destroy();
  });

  it('slows to busyInterval while busy and stops on auth errors', async () => {
    const onAuthLost = vi.fn();
    const results = [{ ok: false, kind: 'busy' }, { ok: false, kind: 'auth' }];
    const run = vi.fn(() => Promise.resolve(results.shift()));
    const p = makePoller({ run, interval: 1000, busyInterval: 60000, onAuthLost });
    p.start();
    await vi.advanceTimersByTimeAsync(59999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(p.active).toBe(false);
    p.destroy();
  });

  it('reads a function interval before every wait and can reschedule', async () => {
    let ms = 15000;
    const run = vi.fn().mockResolvedValue({ ok: true });
    const p = makePoller({ run, interval: () => ms });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    ms = 5000;
    p.reschedule();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
    p.destroy();
  });

  it('never overlaps runs; a poke during a run triggers one more run after it', async () => {
    let release;
    const run = vi.fn(() => new Promise((r) => { release = r; }));
    const p = makePoller({ run, interval: 10000 });
    p.start();
    p.poke();
    p.poke();
    expect(run).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    release({ ok: true });
    p.destroy();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/poller.test.js`
Expected: FAIL, because `../src/poller.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/poller.js`**

`src/poller.js`:

```js
import { warnOnce } from './util.js';

// A timer loop that pauses while the tab is hidden, never overlaps runs, and backs off on errors.
// `run` resolves to an api-style result ({ ok, kind }) or undefined. `interval` may be a function (read before every wait).
export function makePoller({ run, interval, maxBackoff = 300000, busyInterval = 60000, onAuthLost, doc = document }) {
  let active = false;
  let timer = null;
  let running = false;
  let rerun = false;
  let backoff = 0;

  const base = () => (typeof interval === 'function' ? interval() : interval);
  const visible = () => doc.visibilityState !== 'hidden';

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(ms) {
    clear();
    if (active && visible()) timer = setTimeout(tick, ms);
  }

  async function tick() {
    clear();
    if (!active || !visible()) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    let result;
    try {
      result = await run();
    } catch (e) {
      warnOnce('poller-run', e);
      result = { ok: false, kind: 'network' };
    }
    running = false;
    if (!active) return;
    if (rerun) {
      rerun = false;
      tick();
      return;
    }
    let delay = base();
    if (result && result.ok === false) {
      if (result.kind === 'auth') {
        active = false;
        if (onAuthLost) onAuthLost();
        return;
      }
      if (result.kind === 'network' || result.kind === 'rate') {
        backoff = Math.min(backoff ? backoff * 2 : base() * 2, maxBackoff);
        delay = backoff;
      } else {
        backoff = 0;
        if (result.kind === 'busy') delay = Math.max(base(), busyInterval);
      }
    } else {
      backoff = 0;
    }
    schedule(delay);
  }

  function onVisibility() {
    if (!active) return;
    if (visible()) tick();
    else clear();
  }
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    start() {
      if (active) return;
      active = true;
      tick();
    },
    stop() {
      active = false;
      clear();
    },
    // Run now (or right after the current run finishes).
    poke() {
      if (active) tick();
    },
    // Restart the wait using the current interval, without running now.
    reschedule() {
      if (active && !running && !backoff) schedule(base());
    },
    get active() {
      return active;
    },
    destroy() {
      active = false;
      clear();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/poller.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/poller.js test/poller.test.js
git commit -m "feat: add visibility-aware poller with backoff"
```

---

### Task 10: presence.js

**Files:**
- Create: `src/presence.js`
- Test: `test/presence.test.js`

- [ ] **Step 1: Write the failing test**

`test/presence.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPresence } from '../src/presence.js';

describe('presence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fetches at most 2 at a time, 250ms apart', async () => {
    const started = [];
    const fetchProfile = vi.fn((id) => {
      started.push([id, Date.now()]);
      return Promise.resolve({ ok: true, data: { online: id % 2 === 0, active: '2026-09-28 10:00:00' } });
    });
    const p = createPresence({ fetchProfile });
    const t0 = Date.now();
    p.refresh([1, 2, 3, 4, 5]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(started.map(([id]) => id)).toEqual([1, 2, 3, 4, 5]);
    expect(started.map(([, t]) => t - t0)).toEqual([0, 0, 250, 250, 500]);
    expect(p.get(2)).toMatchObject({ online: true, active: Date.UTC(2026, 8, 28, 10) });
  });

  it('skips fresh entries and refetches stale ones', async () => {
    let t = 1000;
    const fetchProfile = vi.fn(() => Promise.resolve({ ok: true, data: { online: true } }));
    const p = createPresence({ fetchProfile, now: () => t, staleMs: 60000 });
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
    t += 60000;
    p.refresh([1]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers and passes profiles to onProfile', async () => {
    const onProfile = vi.fn();
    const sub = vi.fn();
    const p = createPresence({ fetchProfile: () => Promise.resolve({ ok: true, data: { username: 'Spike', online: false } }), onProfile });
    p.subscribe(sub);
    p.refresh([7]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onProfile).toHaveBeenCalledWith(7, { username: 'Spike', online: false });
    expect(sub).toHaveBeenCalledWith(7);
    p.set(8, { online: true });
    expect(sub).toHaveBeenCalledWith(8);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/presence.test.js`
Expected: FAIL, because `../src/presence.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/presence.js`**

`src/presence.js`:

```js
// In-memory online/last-active cache. Never persisted.
import { parseSentAt } from './time.js';
import { warnOnce } from './util.js';

export function createPresence({
  fetchProfile,
  onProfile,
  staleMs = 60000,
  concurrency = 2,
  gapMs = 250,
  now = () => Date.now(),
}) {
  const cache = new Map();
  const queue = [];
  const queued = new Set();
  const subs = new Set();
  let inFlight = 0;

  function emit(id) {
    for (const fn of [...subs]) {
      try {
        fn(id);
      } catch (e) {
        warnOnce('presence-subscriber', e);
      }
    }
  }

  // info: anything with { online, active } (getProfile / getChatInfo entries).
  function set(id, info) {
    if (!info || typeof info !== 'object') return;
    cache.set(id, { online: !!info.online, active: parseSentAt(info.active), fetchedAt: now() });
    emit(id);
  }

  function isStale(id) {
    const c = cache.get(id);
    return !c || now() - c.fetchedAt >= staleMs;
  }

  function pump() {
    while (inFlight < concurrency && queue.length) {
      const id = queue.shift();
      inFlight += 1;
      Promise.resolve()
        .then(() => fetchProfile(id))
        .then((r) => {
          if (r && r.ok && r.data) {
            set(id, r.data);
            if (onProfile) onProfile(id, r.data);
          }
        })
        .catch((e) => warnOnce('presence-fetch', e))
        .finally(() => {
          queued.delete(id);
          setTimeout(() => {
            inFlight -= 1;
            pump();
          }, gapMs);
        });
    }
  }

  // Queues a fetch for every id whose cached status is missing or older than staleMs.
  function refresh(ids) {
    for (const id of ids) {
      if (!queued.has(id) && isStale(id)) {
        queued.add(id);
        queue.push(id);
      }
    }
    pump();
  }

  return {
    get: (id) => cache.get(id) || null,
    set,
    refresh,
    isStale,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/presence.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/presence.js test/presence.test.js
git commit -m "feat: add presence cache with limited concurrency"
```

---

### Task 11: players.js

**Files:**
- Create: `src/players.js`
- Test: `test/players.test.js`

- [ ] **Step 1: Write the failing test**

`test/players.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createPlayers } from '../src/players.js';
import { fakeApi } from './helpers.js';

describe('players', () => {
  it('normalizes search results', async () => {
    const api = fakeApi({ findPlayer: vi.fn().mockResolvedValue({ ok: true, data: [{ id: '5', username: 'Spike', avatar: 'a.png' }, { id: 0, username: 'bad' }] }) });
    const players = createPlayers({ api });
    expect(await players.search('spi')).toEqual({ ok: true, data: [{ id: 5, username: 'Spike', avatar: 'a.png' }] });
  });

  it('resolves only exact case-insensitive name matches', async () => {
    const api = fakeApi({ findPlayer: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 1, username: 'Spikey' }, { id: 2, username: 'SPIKE' }] }) });
    const players = createPlayers({ api });
    expect(await players.resolveExact('spike')).toMatchObject({ id: 2 });
    expect(await players.resolveExact('spik')).toBeNull();
  });

  it('caches profiles briefly', async () => {
    let t = 0;
    const api = fakeApi();
    const players = createPlayers({ api, now: () => t, ttlMs: 60000 });
    await players.get(5);
    await players.get(5);
    expect(api.getProfile).toHaveBeenCalledTimes(1);
    t = 60000;
    await players.get(5);
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/players.test.js`
Expected: FAIL, because `../src/players.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/players.js`**

`src/players.js`:

```js
// Player lookups for the UI (add-friend search, chat names, profile button).
import { asArray, toId } from './util.js';

export function createPlayers({ api, ttlMs = 60000, now = () => Date.now() }) {
  const profiles = new Map();

  async function search(q) {
    const r = await api.findPlayer(q);
    if (!r.ok) return r;
    const data = asArray(r.data)
      .map((p) => ({
        id: toId(p && p.id),
        username: p && typeof p.username === 'string' ? p.username : '',
        avatar: p && typeof p.avatar === 'string' ? p.avatar : null,
      }))
      .filter((p) => p.id && p.username);
    return { ok: true, data };
  }

  // Chat names carry no player id, so only accept an exact (case-insensitive) username match.
  async function resolveExact(name) {
    const wanted = String(name || '').trim().toLowerCase();
    if (!wanted) return null;
    const r = await search(wanted);
    if (!r.ok) return null;
    return r.data.find((p) => p.username.toLowerCase() === wanted) || null;
  }

  async function get(id) {
    const hit = profiles.get(id);
    if (hit && now() - hit.at < ttlMs) return { ok: true, data: hit.data };
    const r = await api.getProfile(id);
    if (r.ok) profiles.set(id, { at: now(), data: r.data });
    return r;
  }

  return { search, resolveExact, get };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/players.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/players.js test/players.test.js
git commit -m "feat: add player search, exact resolve and profile cache"
```

---

### Task 12: router.js

**Files:**
- Create: `src/router.js`
- Test: `test/router.test.js`

The game uses Vue Router in history mode. We wrap `history.pushState` / `replaceState` once, guarded by a `Symbol.for('zcf.historyPatched')` flag, and listen to `popstate`. `navigate(path)` uses `#q-app.__vue_app__.config.globalProperties.$router.push`, which Vue also sets in production builds, and falls back to `location.assign`.

- [ ] **Step 1: Write the failing test**

`test/router.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../src/router.js';

describe('router', () => {
  it('reports path changes from pushState, replaceState and popstate', async () => {
    const router = createRouter();
    const fn = vi.fn();
    router.onChange(fn);
    history.pushState({}, '', '/profile/5');
    await Promise.resolve();
    history.replaceState({}, '', '/profile/5');
    await Promise.resolve();
    history.replaceState({}, '', '/mail');
    await Promise.resolve();
    history.pushState({}, '', '/profile/6');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await Promise.resolve();
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['/profile/5', '/mail', '/profile/6']);
    expect(router.path).toBe('/profile/6');
  });

  it('navigates through the game router when it is available', () => {
    const push = vi.fn();
    const app = document.createElement('div');
    app.id = 'q-app';
    app.__vue_app__ = { config: { globalProperties: { $router: { push } } } };
    document.body.appendChild(app);
    createRouter().navigate('/profile/9');
    expect(push).toHaveBeenCalledWith('/profile/9');
    app.remove();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/router.test.js`
Expected: FAIL, because `../src/router.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/router.js`**

`src/router.js`:

```js
// Page-change notifications for a Vue Router (history mode) app, plus navigation through the game's own router.
import { safe } from './util.js';

const PATCHED = Symbol.for('zcf.historyPatched');

export function createRouter({ win = window, doc = document } = {}) {
  const subs = new Set();
  let last = win.location.pathname;

  function check() {
    const path = win.location.pathname;
    if (path === last) return;
    last = path;
    for (const fn of [...subs]) safe('router-subscriber', fn)(path);
  }

  const history = win.history;
  if (!history[PATCHED]) {
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        win.dispatchEvent(new Event('zcf:locationchange'));
        return result;
      };
    }
    history[PATCHED] = true;
  }
  win.addEventListener('zcf:locationchange', () => queueMicrotask(check));
  win.addEventListener('popstate', check);

  function navigate(path) {
    try {
      const app = doc.querySelector('#q-app');
      const router = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$router;
      if (router && typeof router.push === 'function') {
        router.push(path);
        return;
      }
    } catch {
      // fall through to a full page load
    }
    win.location.assign(path);
  }

  return {
    get path() {
      return win.location.pathname;
    },
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    navigate,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/router.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/router.js test/router.test.js
git commit -m "feat: add route change events and navigation via the game router"
```

---

### Task 13: conversation.js (one DM thread)

**Files:**
- Create: `src/conversation.js`
- Test: `test/conversation.test.js`

`getChatMessages` pages count back from the newest message (page 1 = newest 10). The next older page is `floor(held / 10) + 1`. If new messages arrived in the meantime the pages overlap, which is harmless because messages are keyed by id, and a fully overlapping page just moves on to the next one (up to 3 tries).

Sends appear immediately as "pending" and are matched to the real message by the `message_id` that `sendMail` returns. `createConversations` is a registry that keeps one conversation per open DM window.

- [ ] **Step 1: Write the failing test**

`test/conversation.test.js`:

```js
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/conversation.test.js`
Expected: FAIL, because `../src/conversation.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/conversation.js`**

`src/conversation.js`:

```js
// One DM thread: loads pages, fetches new messages, sends with optimistic "pending" copies.
import { normalizeMessages, reconcilePending } from './mail.js';
import { toId, warnOnce } from './util.js';

export const PAGE_SIZE = 10;
export const MAX_MESSAGES = 200;

export function createConversation({
  api,
  userId,
  myId,
  now = () => Date.now(),
  onActivity = () => {},
  onInfo = () => {},
}) {
  const messages = new Map();
  const subs = new Set();
  let pending = [];
  let localSeq = 0;
  const state = {
    loaded: false,
    loading: false,
    loadingOlder: false,
    hasMore: true,
    blocked: false,
    busy: null,
    info: null,
  };

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn();
      } catch (e) {
        warnOnce('conversation-subscriber', e);
      }
    }
  }

  function add(list) {
    let added = 0;
    let fromThem = false;
    for (const m of list) {
      if (messages.has(m.id)) continue;
      messages.set(m.id, m);
      added += 1;
      if (m.senderId !== myId) fromThem = true;
    }
    return { added, fromThem };
  }

  function fail(r) {
    if (r.kind === 'access') state.blocked = true;
    else if (r.kind === 'busy') state.busy = r.busy || 'busy';
  }

  function list() {
    return [...messages.values()].sort((a, b) => a.id - b.id);
  }

  function lastId() {
    let max = 0;
    for (const id of messages.keys()) if (id > max) max = id;
    return max;
  }

  function latestTs() {
    let max = 0;
    for (const m of messages.values()) if (m.ts && m.ts > max) max = m.ts;
    return max;
  }

  async function loadInitial() {
    if (state.loading) return { ok: true };
    state.loading = true;
    emit();
    const r = await api.getChatMessages(userId, 1, PAGE_SIZE);
    state.loading = false;
    if (!r.ok) {
      fail(r);
      emit();
      return r;
    }
    state.busy = null;
    const msgs = normalizeMessages(r.data);
    add(msgs);
    state.loaded = true;
    if (msgs.length < PAGE_SIZE) state.hasMore = false;
    emit();
    return r;
  }

  // Pages are counted from the newest message, so the next older page follows from how many we hold.
  // Overlap (new messages arrived since) is harmless because messages are keyed by id.
  async function loadOlder() {
    if (!state.loaded || state.loadingOlder || !state.hasMore) return { ok: true };
    state.loadingOlder = true;
    emit();
    let r = { ok: true };
    let page = Math.floor(messages.size / PAGE_SIZE) + 1;
    try {
      for (let tries = 0; tries < 3; tries += 1, page += 1) {
        r = await api.getChatMessages(userId, page, PAGE_SIZE);
        if (!r.ok) {
          fail(r);
          break;
        }
        const msgs = normalizeMessages(r.data);
        if (msgs.length === 0) {
          state.hasMore = false;
          break;
        }
        const { added } = add(msgs);
        if (msgs.length < PAGE_SIZE) state.hasMore = false;
        if (added > 0 || !state.hasMore) break;
      }
    } finally {
      state.loadingOlder = false;
      emit();
    }
    return r;
  }

  async function fetchNew() {
    if (!state.loaded) return loadInitial();
    const r = await api.getNewMessages(userId, lastId());
    if (!r.ok) {
      fail(r);
      emit();
      return r;
    }
    const wasBusy = state.busy;
    state.busy = null;
    const { added, fromThem } = add(normalizeMessages(r.data));
    const before = pending.length;
    pending = reconcilePending(pending, list());
    if (added || pending.length !== before || wasBusy) emit();
    if (fromThem) onActivity();
    return r;
  }

  async function refreshInfo() {
    const r = await api.getChatInfo(userId);
    if (!r.ok) {
      fail(r);
      emit();
      return r;
    }
    const info = r.data && (r.data[userId] || r.data[String(userId)]);
    if (info && typeof info === 'object') {
      state.info = {
        username: typeof info.username === 'string' ? info.username : null,
        avatar: typeof info.avatar === 'string' ? info.avatar : null,
        online: !!info.online,
        active: info.active,
      };
      onInfo(state.info);
      emit();
    }
    return r;
  }

  // First expand: load the newest page and the header info together.
  function ensureLoaded() {
    if (state.loaded || state.loading) return;
    loadInitial();
    refreshInfo();
  }

  async function send(text) {
    const body = String(text || '').trim();
    if (!body || state.blocked) return false;
    const p = { localId: ++localSeq, text: body, ts: now(), error: false, realId: null };
    pending.push(p);
    emit();
    onActivity();
    const r = await api.sendMail(userId, body);
    if (r.ok) {
      const id = toId(r.data && r.data.message_id);
      if (id) p.realId = id;
      else pending = pending.filter((x) => x !== p);
      pending = reconcilePending(pending, list());
      emit();
      fetchNew();
      return true;
    }
    p.error = true;
    fail(r);
    emit();
    return false;
  }

  function retry(localId) {
    const p = pending.find((x) => x.localId === localId);
    if (!p) return Promise.resolve(false);
    pending = pending.filter((x) => x !== p);
    return send(p.text);
  }

  // Drops the oldest messages beyond MAX_MESSAGES (called while the view is pinned to the bottom).
  function trim(max = MAX_MESSAGES) {
    if (messages.size <= max) return false;
    const drop = list().slice(0, messages.size - max);
    for (const m of drop) messages.delete(m.id);
    state.hasMore = true;
    emit();
    return true;
  }

  return {
    userId,
    state,
    messages: list,
    pending: () => pending,
    lastId,
    latestTs,
    loadInitial,
    loadOlder,
    fetchNew,
    refreshInfo,
    ensureLoaded,
    send,
    retry,
    trim,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// Keeps one conversation per user id while its DM window exists.
export function createConversations({ api, myId, onActivity = () => {}, onInfo = () => {}, onChange = () => {} }) {
  const map = new Map();
  return {
    acquire(userId) {
      let c = map.get(userId);
      if (!c) {
        c = createConversation({
          api,
          userId,
          myId,
          onActivity: () => onActivity(userId),
          onInfo: (info) => onInfo(userId, info),
        });
        c.subscribe(() => onChange(userId));
        map.set(userId, c);
      }
      return c;
    },
    get: (userId) => map.get(userId) || null,
    release: (userId) => map.delete(userId),
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/conversation.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/conversation.js test/conversation.test.js
git commit -m "feat: add conversation model with paging and optimistic sends"
```

---

### Task 14: inbox.js (thread-list polling)

**Files:**
- Create: `src/inbox.js`
- Test: `test/inbox.test.js`

Each `poll()` does the following:
1. Sets unread counts from `getChats`.
2. Pops a **minimized** DM entry for a friend only when their `lastReply` is newer than `lastNotifiedReply`, so a closed tab doesn't reappear until a new message arrives.
3. Clears badges for threads that were read elsewhere.
4. After the first poll, which only sets the baseline, calls `onThreadChanged(id)` for moved threads, and `onActivity()` if any of them belongs to a friend or an open DM.

- [ ] **Step 1: Write the failing test**

`test/inbox.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createInbox } from '../src/inbox.js';
import { createStore } from '../src/store.js';
import { addFriend, markSeen } from '../src/state.js';
import { fakeApi, memoryStorage, rawThread } from './helpers.js';

const ME = 1;

function setup(rowsSequence) {
  const rows = [...rowsSequence];
  const api = fakeApi({ getChats: vi.fn(() => Promise.resolve({ ok: true, data: rows.shift() || [] })) });
  const store = createStore({ playerId: ME, storage: memoryStorage() });
  const onActivity = vi.fn();
  const onThreadChanged = vi.fn();
  const inbox = createInbox({ api, store, myId: ME, now: () => 1000, onActivity, onThreadChanged });
  return { api, store, inbox, onActivity, onThreadChanged };
}

describe('inbox', () => {
  it('pops a minimized DM tab with a badge when a friend messages you', async () => {
    const { store, inbox } = setup([[rawThread(5, { username: 'Spike', newMail: 2 })]]);
    store.update((s) => addFriend(s, { id: 5, username: 'Spike' }, 0));
    await inbox.poll();
    const s = store.get();
    expect(s.threads[5].unread).toBe(2);
    expect(s.dock.dms).toEqual([{ id: 5, open: false, lastUsed: 1000, username: 'Spike', avatar: null }]);
  });

  it('does not pop non-friends, but tracks their unread count for Recent', async () => {
    const { store, inbox } = setup([[rawThread(6, { newMail: 1 })]]);
    await inbox.poll();
    expect(store.get().dock.dms).toEqual([]);
    expect(store.get().threads[6].unread).toBe(1);
    expect(inbox.threads().map((t) => t.userId)).toEqual([6]);
  });

  it('does not re-open a tab you closed until a newer message arrives', async () => {
    const { store, inbox } = setup([
      [rawThread(5, { newMail: 1, lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { newMail: 1, lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { newMail: 2, lastReply: '2026-09-28 10:05:00' })],
    ]);
    store.update((s) => addFriend(s, { id: 5, username: 'Spike' }, 0));
    await inbox.poll();
    store.update((s) => { s.dock.dms = []; });
    await inbox.poll();
    expect(store.get().dock.dms).toEqual([]);
    await inbox.poll();
    expect(store.get().dock.dms.map((d) => d.id)).toEqual([5]);
  });

  it('clears badges for threads read elsewhere and ignores threads already seen', async () => {
    const { store, inbox } = setup([
      [rawThread(5, { newMail: 0 }), rawThread(7, { newMail: 1, lastReply: '2026-09-28 10:00:00' })],
    ]);
    store.update((s) => {
      s.threads[5] = { lastSeenReply: 0, lastNotifiedReply: 0, unread: 3 };
      markSeen(s, 7, Date.UTC(2026, 8, 28, 10));
    });
    await inbox.poll();
    expect(store.get().threads[5].unread).toBe(0);
    expect(store.get().threads[7].unread).toBe(0);
  });

  it('reports changed threads after the first poll, and activity only for friends or open DMs', async () => {
    const { store, inbox, onActivity, onThreadChanged } = setup([
      [rawThread(5, { lastReply: '2026-09-28 10:00:00' }), rawThread(6, { lastReply: '2026-09-28 10:00:00' })],
      [rawThread(5, { lastReply: '2026-09-28 10:00:00' }), rawThread(6, { lastReply: '2026-09-28 10:01:00' })],
      [rawThread(5, { lastReply: '2026-09-28 10:02:00' }), rawThread(6, { lastReply: '2026-09-28 10:01:00' })],
    ]);
    store.update((s) => addFriend(s, { id: 5, username: 'Spike' }, 0));
    await inbox.poll();
    expect(onThreadChanged).not.toHaveBeenCalled();
    await inbox.poll();
    expect(onThreadChanged).toHaveBeenCalledWith(6);
    expect(onActivity).not.toHaveBeenCalled();
    await inbox.poll();
    expect(onThreadChanged).toHaveBeenLastCalledWith(5);
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it('passes API failures through without touching state', async () => {
    const api = fakeApi({ getChats: vi.fn().mockResolvedValue({ ok: false, kind: 'network' }) });
    const store = createStore({ playerId: ME, storage: memoryStorage() });
    const inbox = createInbox({ api, store, myId: ME });
    expect(await inbox.poll()).toMatchObject({ ok: false, kind: 'network' });
    expect(inbox.lastReply(5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/inbox.test.js`
Expected: FAIL, because `../src/inbox.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/inbox.js`**

`src/inbox.js`:

```js
// Polls the thread list (getChats page 1): unread badges, friend pop-ups, the Recent section, and change signals.
import { normalizeThreads, findNewMail } from './mail.js';
import { openDm, threadEntry } from './state.js';
import { warnOnce } from './util.js';

export function createInbox({ api, store, myId, now = () => Date.now(), onActivity = () => {}, onThreadChanged = () => {} }) {
  let threads = [];
  let previous = null; // Map userId -> lastReply from the previous poll; null until the first poll
  const subs = new Set();

  function emit() {
    for (const fn of [...subs]) {
      try {
        fn();
      } catch (e) {
        warnOnce('inbox-subscriber', e);
      }
    }
  }

  async function poll() {
    const r = await api.getChats(1);
    if (!r.ok) return r;
    threads = normalizeThreads(r.data);
    const byId = new Map(threads.map((t) => [t.userId, t]));
    const state = store.get();
    const fresh = findNewMail(threads, state.threads, myId);
    const freshIds = new Set(fresh.map((t) => t.userId));

    const changes = [];
    for (const t of fresh) {
      const seen = state.threads[t.userId] || {};
      const pop = !!state.friends[t.userId] && (t.lastReply || 0) > (seen.lastNotifiedReply || 0);
      if (seen.unread !== t.newMail || pop) changes.push({ t, pop });
    }
    // Threads we still show as unread but that were read elsewhere (e.g. in the game's inbox).
    const cleared = Object.keys(state.threads)
      .map(Number)
      .filter((id) => state.threads[id].unread > 0 && !freshIds.has(id) && byId.has(id));

    if (changes.length || cleared.length) {
      store.update((s) => {
        for (const { t, pop } of changes) {
          const entry = threadEntry(s, t.userId);
          entry.unread = t.newMail;
          if (pop) {
            entry.lastNotifiedReply = t.lastReply || 0;
            openDm(s, t.userId, { now: now(), username: t.username, avatar: t.avatar });
          }
        }
        for (const id of cleared) threadEntry(s, id).unread = 0;
      });
    }

    // The first poll only sets the baseline; later polls report threads whose last reply moved.
    if (previous) {
      let chatting = false;
      for (const t of threads) {
        if (previous.has(t.userId) && previous.get(t.userId) === t.lastReply) continue;
        onThreadChanged(t.userId);
        if (state.friends[t.userId] || state.dock.dms.some((d) => d.id === t.userId)) chatting = true;
      }
      if (chatting) onActivity();
    }
    previous = new Map(threads.map((t) => [t.userId, t.lastReply]));
    emit();
    return r;
  }

  return {
    poll,
    threads: () => threads,
    lastReply(userId) {
      const t = threads.find((x) => x.userId === userId);
      return t ? t.lastReply : null;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/inbox.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inbox.js test/inbox.test.js
git commit -m "feat: add inbox polling with unread badges and friend pop-ups"
```

---

### Task 15: friends-view.js (pure list sections)

**Files:**
- Create: `src/friends-view.js`
- Test: `test/friends-view.test.js`

- [ ] **Step 1: Write the failing test**

`test/friends-view.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildFriendSections } from '../src/friends-view.js';

const friends = {
  1: { id: 1, username: 'spike' },
  2: { id: 2, username: 'Nyx' },
  3: { id: 3, username: 'Gravedigger' },
  4: { id: 4, username: 'RustyBucket' },
  5: { id: 5, username: 'Anon' },
};
const presenceMap = {
  1: { online: true },
  2: { online: true },
  3: { online: false, active: 100 },
  4: { online: false, active: 900 },
};
const presence = (id) => presenceMap[id] || null;
const threads = [
  { userId: 9, username: 'TradeGuy', lastReply: 10, isSystem: false },
  { userId: 8, username: 'Zombo', lastReply: 20, isSystem: false },
  { userId: 1, username: 'spike', lastReply: 30, isSystem: false },
  { userId: 7, username: 'System', lastReply: 40, isSystem: true },
];

describe('buildFriendSections', () => {
  it('sorts online A-Z, offline by last active, recent by newest non-friend thread', () => {
    const s = buildFriendSections({ friends, presence, threads, filter: '' });
    expect(s.online.map((r) => r.username)).toEqual(['Nyx', 'spike']);
    expect(s.offline.map((r) => r.username)).toEqual(['RustyBucket', 'Gravedigger', 'Anon']);
    expect(s.recent.map((t) => t.username)).toEqual(['Zombo', 'TradeGuy']);
    expect(s.onlineCount).toBe(2);
    expect(s.total).toBe(5);
  });

  it('filters every section case-insensitively but keeps the totals', () => {
    const s = buildFriendSections({ friends, presence, threads, filter: 'GR' });
    expect(s.online).toEqual([]);
    expect(s.offline.map((r) => r.username)).toEqual(['Gravedigger']);
    expect(s.recent).toEqual([]);
    expect(s.onlineCount).toBe(2);
    expect(s.total).toBe(5);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/friends-view.test.js`
Expected: FAIL, because `../src/friends-view.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/friends-view.js`**

`src/friends-view.js`:

```js
// Pure data for the Friends window: filtered, sorted Online / Offline / Recent sections.
const byName = (a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });

export function buildFriendSections({ friends, presence, threads, filter }) {
  const q = String(filter || '').trim().toLowerCase();
  const matches = (name) => !q || String(name).toLowerCase().includes(q);
  const online = [];
  const offline = [];
  let onlineCount = 0;
  const all = Object.values(friends);
  for (const f of all) {
    const p = presence(f.id);
    if (p && p.online) onlineCount += 1;
    if (!matches(f.username)) continue;
    const row = { id: f.id, username: f.username, avatar: f.avatar, presence: p };
    (p && p.online ? online : offline).push(row);
  }
  online.sort(byName);
  offline.sort((a, b) => ((b.presence && b.presence.active) || 0) - ((a.presence && a.presence.active) || 0) || byName(a, b));
  const recent = threads
    .filter((t) => !t.isSystem && !friends[t.userId] && matches(t.username))
    .sort((a, b) => (b.lastReply || 0) - (a.lastReply || 0));
  return { online, offline, recent, onlineCount, total: all.length };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/friends-view.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/friends-view.js test/friends-view.test.js
git commit -m "feat: add friends list section builder"
```

---

### Task 16: UI primitives (dom.js, styles.js, toast.js)

**Files:**
- Create: `src/ui/dom.js`, `src/ui/styles.js`, `src/ui/toast.js`
- Test: `test/ui/dom.test.js`

`h()` only ever creates text nodes for strings. That's the XSS guarantee for everything rendered from the server. Avatars only load from the game's CDN base plus a relative path.

`styles.js` holds only the CSS the game doesn't already provide. The dock's `.chat-container` / `.chat-header` / `.chat-content` / `.chat-minimized` rules are global in the game (`LoggedIn-*.css`) and style our elements automatically. `badge()` copies the game's Quasar QBadge classes so the dock's `.unread-badge` positioning applies.

- [ ] **Step 1: Write the failing test**

`test/ui/dom.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { h, avatarUrl, avatar, highlightMatch, badge, setBadge, DEFAULT_AVATAR, AVATAR_BASE } from '../../src/ui/dom.js';

describe('dom helpers', () => {
  it('builds elements with classes, attributes, events and text children', () => {
    const onclick = vi.fn();
    const el = h('button', { class: 'a b', type: 'button', hidden: false, dataset: { x: '1' }, onclick }, 'Hi ', 5, null, ['!']);
    expect(el.outerHTML).toBe('<button class="a b" type="button" data-x="1">Hi 5!</button>');
    el.click();
    expect(onclick).toHaveBeenCalled();
  });

  it('never interprets strings as HTML', () => {
    const el = h('div', null, '<img src=x onerror=alert(1)>');
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('only builds avatar URLs from relative CDN paths', () => {
    expect(avatarUrl('avatars/123.png')).toBe(`${AVATAR_BASE}avatars/123.png`);
    expect(avatarUrl('/avatars/1.png')).toBe(`${AVATAR_BASE}avatars/1.png`);
    expect(avatarUrl('https://evil.example/x.png')).toBe(DEFAULT_AVATAR);
    expect(avatarUrl('javascript:alert(1)')).toBe(DEFAULT_AVATAR);
    expect(avatarUrl('../secret')).toBe(DEFAULT_AVATAR);
    expect(avatarUrl(null)).toBe(DEFAULT_AVATAR);
  });

  it('adds a status dot only when online status is known', () => {
    expect(avatar({ avatar: null, online: true }).querySelector('.zcf-dot.zcf-on')).not.toBeNull();
    expect(avatar({ avatar: null, online: false }).querySelector('.zcf-dot.zcf-off')).not.toBeNull();
    expect(avatar({ avatar: null }).querySelector('.zcf-dot')).toBeNull();
  });

  it('highlights the first match', () => {
    const wrap = h('div', null, highlightMatch('Gravedigger', 'DIG'));
    expect(wrap.innerHTML).toBe('Grave<mark>dig</mark>ger');
    expect(highlightMatch('Nyx', '')).toEqual(['Nyx']);
  });

  it('shows badges only when visible and non-zero', () => {
    const b = badge();
    setBadge(b, 3, true);
    expect(b.hidden).toBe(false);
    expect(b.textContent).toBe('3');
    setBadge(b, 0, true);
    expect(b.hidden).toBe(true);
    setBadge(b, 3, false);
    expect(b.hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/ui/dom.test.js`
Expected: FAIL, because `../../src/ui/dom.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/ui/dom.js`**

`src/ui/dom.js`:

```js
// Tiny DOM helpers. Every string from the server goes through text nodes, never innerHTML.
export const AVATAR_BASE = 'https://daz02uqlb9gre.cloudfront.net/';
export const DEFAULT_AVATAR = `${AVATAR_BASE}default.png`;

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function icon(name) {
  return h('i', { class: `fas fa-${name}`, 'aria-hidden': 'true' });
}

// Only relative asset paths from the game's CDN are accepted; anything else falls back to the default avatar.
export function avatarUrl(path) {
  if (typeof path !== 'string' || !path || path.includes('..') || !/^[\w\-./]+$/.test(path)) return DEFAULT_AVATAR;
  return AVATAR_BASE + path.replace(/^\/+/, '');
}

export function avatar({ avatar: path, online, size = 26 }) {
  const img = h('img', { class: 'zcf-av-img', src: avatarUrl(path), alt: '', width: size, height: size, loading: 'lazy' });
  img.addEventListener('error', () => {
    if (img.getAttribute('src') !== DEFAULT_AVATAR) img.setAttribute('src', DEFAULT_AVATAR);
  });
  const wrap = h('span', { class: 'zcf-av', style: { width: `${size}px`, height: `${size}px` } }, img);
  if (typeof online === 'boolean') wrap.appendChild(h('span', { class: `zcf-dot ${online ? 'zcf-on' : 'zcf-off'}` }));
  return wrap;
}

// Wraps the first case-insensitive match of `query` in <mark>.
export function highlightMatch(text, query) {
  const q = String(query || '').trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return [text];
  return [text.slice(0, i), h('mark', null, text.slice(i, i + q.length)), text.slice(i + q.length)].filter((x) => x !== '');
}

// Same markup as the game's Quasar QBadge so the dock's .unread-badge rules apply.
export function badge() {
  return h('span', {
    class: 'q-badge flex inline items-center no-wrap q-badge--single-line q-badge--floating q-badge--rounded bg-red-5 text-white unread-badge zcf-badge',
    hidden: true,
  });
}

export function setBadge(el, count, visible) {
  el.textContent = String(count);
  el.hidden = !(visible && count > 0);
}

export function downloadText(filename, text, doc = document) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: Implement `src/ui/styles.js`**

`src/ui/styles.js`:

```js
// Only what the game's own (global) chat-dock CSS doesn't already provide. Colors come from the game's palette.
export const CSS = `
.zcf-root{display:contents}
.zcf [hidden]{display:none!important}
.zcf.chat-container .chat-header{gap:6px}
.zcf.chat-container .chat-title{min-width:0}
.zcf-friends .chat-title .chat-icon{color:#3d8b40}
.zcf .zcf-count{text-transform:none;letter-spacing:0;opacity:.6;font-weight:400}
.zcf .zcf-hbtn{background:none;border:0;padding:0 2px;margin:0;color:#ffffff4d;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center}
.zcf .zcf-hbtn:hover{color:#ffffffb3}
.zcf .chat-toggle{margin-left:0}
.zcf.chat-minimized .zcf-badge{position:absolute;top:-6px;right:2px;min-height:12px;padding:0 3px;font-size:8px;line-height:12px}
.zcf.chat-minimized .chat-title{justify-content:center;position:relative}
.zcf-body{display:flex;flex-direction:column;height:420px;position:relative;font-size:13px}
.zcf-toolbar{display:flex;gap:6px;align-items:center;background:#ffffff05;border-bottom:1px solid #ffffff1a;min-height:42px;padding:7px 8px}
.zcf-search{flex:1;display:flex;align-items:center;gap:6px;background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:0 7px}
.zcf-search i{opacity:.45;font-size:11px}
.zcf-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 0}
.zcf-input::placeholder{color:#ffffff4d}
.zcf-iconbtn{width:30px;height:28px;display:flex;align-items:center;justify-content:center;background:#ffffff0a;border:1px solid #ffffff14;border-radius:3px;color:#a6a6a6;cursor:pointer}
.zcf-iconbtn:hover,.zcf-iconbtn.zcf-active{background:#3d8b40;border-color:#3d8b40;color:#fff}
.zcf-list{flex:1;overflow-y:auto;overscroll-behavior:contain}
.zcf-sec{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff59;padding:8px 10px 4px}
.zcf-row{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;position:relative}
.zcf-row:hover{background:#ffffff08}
.zcf-row-main{min-width:0;flex:1}
.zcf-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-name mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-status{font-size:11px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-pill{background:#ff4242;color:#fff;font-size:9px;font-weight:700;border-radius:8px;padding:1px 5px}
.zcf-row-actions{display:none;gap:4px}
.zcf-row:hover .zcf-row-actions,.zcf-row:focus-within .zcf-row-actions{display:flex}
.zcf-mini{background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font-size:10.5px;padding:3px 6px;cursor:pointer}
.zcf-mini:hover{background:#ffffff1f;color:#fff}
.zcf-mini.zcf-danger{background:#ff42421f;color:#ff8a8a}
.zcf-add{background:#3d8b40;border:0;border-radius:3px;color:#fff;font-size:10px;text-transform:uppercase;padding:3px 8px;cursor:pointer}
.zcf-add-outline{background:none;border:1px solid #3d8b4088;color:#6fcf73}
.zcf-done{font-size:10px;text-transform:uppercase;color:#6fcf73;padding:3px 4px}
.zcf-empty{padding:6px 10px 10px;font-size:11.5px;opacity:.45}
.zcf-av{position:relative;flex:none;display:inline-block;border-radius:50%}
.zcf-av-img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;background:#2c3036}
.zcf-dot{position:absolute;bottom:-1px;right:-1px;width:7px;height:7px;border-radius:50%;border:1px solid #151619}
.zcf-on{background:#3d8b40}.zcf-off{background:#ef5350}
.zcf-pop{position:absolute;top:44px;right:8px;width:260px;max-width:calc(100% - 16px);background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;z-index:5;padding-bottom:4px}
.zcf-pop-title,.zcf-menu-title{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff66;padding:8px 10px 0}
.zcf-pop .zcf-input{display:block;width:calc(100% - 16px);margin:6px 8px;background:#0e1013;border:1px solid #0a748f;border-radius:3px;padding:6px 8px}
.zcf-results{max-height:240px;overflow-y:auto}
.zcf-result{display:flex;align-items:center;gap:8px;padding:6px 10px}
.zcf-result:hover{background:#ffffff08}
.zcf-menu{position:absolute;top:4px;right:8px;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;z-index:6;min-width:160px;padding:4px 0}
.zcf-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:#d9d9d9;font-size:12.5px;padding:7px 12px;cursor:pointer}
.zcf-menu button:hover{background:#ffffff0a}
.zcf-dm .chat-title .zcf-dm-name{text-transform:none;letter-spacing:0;font-weight:700;color:#d9d9d9;cursor:pointer;overflow:hidden;text-overflow:ellipsis}
.zcf-dm .chat-title .zcf-dm-name:hover{text-decoration:underline}
.zcf-dm .chat-title .zcf-dm-status{text-transform:none;letter-spacing:0;opacity:.55;white-space:nowrap}
.zcf-dm .chat-title .zcf-dm-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-dm.chat-minimized .zcf-close{position:absolute;top:-6px;left:-6px;width:14px;height:14px;border-radius:50%;background:#2c3036;color:#fff;font-size:8px;justify-content:center;display:none;padding:0}
.zcf-dm.chat-minimized:hover .zcf-close{display:flex}
.zcf-dm.chat-minimized .chat-header{position:relative}
.zcf-notice{background:#f2c0371a;color:#f2c037;font-size:11.5px;padding:6px 12px;border-bottom:1px solid #f2c03733}
.zcf-scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 8px}
.zcf-loader{text-align:center;font-size:11px;opacity:.5;padding:6px}
.zcf-divider{display:flex;align-items:center;gap:8px;margin:10px 15px 2px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#ffffff59}
.zcf-divider:before,.zcf-divider:after{content:"";flex:1;border-top:1px solid #ffffff14}
.zcf-msg{padding:2px 15px;margin-top:8px}
.zcf-msg.zcf-grouped,.zcf-pending-msg{margin-top:1px}
.zcf-msg:hover{background:#ffffff08}
.zcf-sender{font-weight:700;line-height:1.5}
.zcf-sender.zcf-them{color:#6fb3c8;cursor:pointer}
.zcf-sender.zcf-them:hover{text-decoration:underline}
.zcf-time{opacity:.4;margin-left:8px;font-size:11px}
.zcf-text{opacity:.9;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.zcf-system .zcf-text{font-style:italic;opacity:.7}
.zcf-pending-msg .zcf-text{opacity:.55}
.zcf-failed .zcf-text{opacity:.5}
.zcf-error{color:#e57373;font-size:12px}
.zcf-link{background:none;border:0;padding:0;color:#e57373;text-decoration:underline;cursor:pointer;font:inherit}
.zcf-newchip{position:absolute;bottom:56px;left:50%;transform:translateX(-50%);background:#0a748f;color:#fff;border:0;border-radius:12px;font-size:11px;padding:3px 10px;cursor:pointer;box-shadow:0 4px 10px #0006}
.zcf-composer{display:flex;gap:6px;align-items:flex-end;border-top:1px solid #ffffff14;padding:8px}
.zcf-compose{background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:6px 8px;resize:none;max-height:90px;line-height:1.4}
.zcf-send{background:#0a748f;color:#fff;border:0;border-radius:3px;font-size:10.5px;text-transform:uppercase;padding:7px 10px;cursor:pointer}
.zcf-send:disabled{opacity:.4;cursor:default}
.zcf-toasts{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.zcf-toast{background:#202327;color:#d9d9d9;border:1px solid #000;border-left:3px solid #3d8b40;border-radius:4px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 18px #00000080}
.zcf-toast-error{border-left-color:#ff4242}
.zcf-addname{background:none;border:1px solid #3d8b4088;border-radius:3px;color:#6fcf73;font-size:10px;line-height:15px;padding:0 4px;margin-left:6px;cursor:pointer;vertical-align:1px}
.zcf-addname:hover{background:#3d8b40;color:#fff}
.q-btn.zcf-is-friend{color:#81c784!important}
@media (max-width:599.98px){
  .chat-containers .zcf.zcf-open{order:1;flex:1 1 340px;width:auto;min-width:0;max-width:340px}
  .zcf-body{height:min(420px,60vh)}
}
`;

export function injectStyles(doc = document) {
  if (doc.getElementById('zcf-styles')) return;
  const style = doc.createElement('style');
  style.id = 'zcf-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
}
```

- [ ] **Step 5: Implement `src/ui/toast.js`**

`src/ui/toast.js`:

```js
import { h } from './dom.js';

export function createToaster(doc = document) {
  let host = null;
  return function toast(text, { error = false, ms = 3500 } = {}) {
    if (!host || !host.isConnected) {
      host = h('div', { class: 'zcf-toasts', role: 'status', 'aria-live': 'polite' });
      doc.body.appendChild(host);
    }
    const el = h('div', { class: `zcf-toast${error ? ' zcf-toast-error' : ''}` }, text);
    host.appendChild(el);
    setTimeout(() => el.remove(), ms);
  };
}
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run test/ui/dom.test.js`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/ui/dom.js src/ui/styles.js src/ui/toast.js test/ui/dom.test.js
git commit -m "feat: add DOM helpers, styles and toasts"
```

---

### Task 17: Game DOM fixtures, UI test services, and dock.js

**Files:**
- Create: `test/fixtures/game-dom.js`, `test/ui/services.js`, `src/ui/dock.js`
- Test: `test/ui/dock.test.js`

`dock.js` prepends a `display:contents` root into `.chat-containers`. A `MutationObserver` on `body` re-mounts it at most once per animation frame whenever the game rebuilds the dock.

On phones (`max-width: 599.98px`), `minimizeGameChats()` clicks the header of each open game chat, which is the game's own toggle. A dock-scoped observer calls `onGameChatOpened` when a *game* chat goes from minimized to open. It uses `attributeOldValue`, so our own class changes never trigger it.

- [ ] **Step 1: Create the fixtures (markup copied from the live client)**

`test/fixtures/game-dom.js`:

```js
// Markup copied from the live Zed City client (Vue/Quasar build of 2026-09-26), trimmed to what the script touches.

const msg = (name, time, text) =>
  `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span>${time}</span></div><div>${text}</div></div></div></div></div>`;

export const DOCK_HTML = `
<div class="chat-containers">
  <!--v-if-->
  <div class="chat-container faction-chat chat-minimized">
    <div class="chat-header"><div class="chat-title"><i class="fas fa-users chat-icon" aria-hidden="true"></i></div></div>
    <div class="chat-content chat-hidden"></div>
  </div>
  <div class="chat-container general-chat">
    <div class="chat-header"><div class="chat-title"><i class="fas fa-comments chat-icon" aria-hidden="true"></i><span>Chat</span></div><div class="chat-toggle" aria-hidden="true"><i class="fas fa-chevron-down"></i></div></div>
    <div class="chat-content">
      <div class="message-panel">
        ${msg('Gravedigger', '14:10', 'anyone doing the bunker tonight?')}
        ${msg('Nyx', '14:11', 'ya, need 2 more')}
        ${msg('Me', '14:12', 'me too')}
      </div>
    </div>
  </div>
</div>`;

// Simulates Vue toggling a game chat when its header is clicked.
export function wireGameHeaders(root = document) {
  for (const header of root.querySelectorAll('.chat-containers > .chat-container > .chat-header')) {
    header.addEventListener('click', () => header.parentElement.classList.toggle('chat-minimized'));
  }
}

const qbtn = (iconClass, label, color = 'text-grey-4') =>
  `<div><button class="q-btn q-btn-item non-selectable no-outline q-btn--outline q-btn--rectangle ${color} q-btn--actionable q-focusable q-hoverable q-btn--wrap" tabindex="0" type="button"><span class="q-focus-helper" tabindex="-1"></span><span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon fas ${iconClass} on-left" aria-hidden="true" role="img"></i><span class="block">${label}</span></span></button></div>`;

// The top bar's round mail icon must never be mistaken for the profile's Mail button.
export const TOP_BAR_HTML =
  '<div class="top-bar"><a class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--round text-grey-4" href="/mail"><span class="q-btn__content"><i class="q-icon fal fa-envelope" aria-hidden="true"></i></span></a></div>';

export const PROFILE_OTHER_HTML = `${TOP_BAR_HTML}<div class="profile-head"><div class="profile-actions">${qbtn('fa-ban', 'Block', 'text-red-4')}${qbtn('fa-exchange', 'Trade')}${qbtn('fa-envelope', 'Mail')}</div></div>`;

export const PROFILE_BLOCKED_HTML = `${TOP_BAR_HTML}<div class="profile-head"><div class="profile-actions">${qbtn('fa-ban', 'Unblock', 'text-red-4')}</div></div>`;

export const PROFILE_OWN_HTML = `${TOP_BAR_HTML}<div class="profile-head"><div>${qbtn('fa-cog', 'Settings')}</div></div>`;
```

- [ ] **Step 2: Create the shared UI test services**

`test/ui/services.js`:

```js
// Real store + real conversations over a fake api, with simple stand-ins for everything else.
import { vi } from 'vitest';
import { createStore } from '../../src/store.js';
import { createConversations } from '../../src/conversation.js';
import { addFriend, removeFriend, openDm, setDmOpen, closeDm, setFriendsOpen } from '../../src/state.js';
import { exportFriends, parseImport } from '../../src/backup.js';
import { fakeApi, memoryStorage } from '../helpers.js';

export const ME = 1;

export function makeServices({ api = fakeApi(), threads = [], presence = {}, searchResults = [] } = {}) {
  const store = createStore({ playerId: ME, storage: memoryStorage() });
  const conversations = createConversations({ api, myId: ME });
  const actions = {
    addFriend: vi.fn((p) => store.update((s) => addFriend(s, p, 0))),
    removeFriend: vi.fn((id) => store.update((s) => removeFriend(s, id))),
    openDm: vi.fn((id, o = {}) => store.update((s) => openDm(s, id, { expand: true, now: 1, ...o }))),
    toggleDm: vi.fn((id) => {
      const e = store.get().dock.dms.find((d) => d.id === id);
      store.update((s) => setDmOpen(s, id, !e.open));
    }),
    minimizeDm: vi.fn((id) => store.update((s) => setDmOpen(s, id, false))),
    closeDm: vi.fn((id) => store.update((s) => closeDm(s, id))),
    toggleFriends: vi.fn(() => store.update((s) => setFriendsOpen(s, !s.dock.friendsOpen))),
    setActiveDm: vi.fn(),
    exportFriends: () => exportFriends(store.get(), ME),
    importFriends: (text) => {
      const r = parseImport(text, ME);
      if (!r.ok) return r;
      return { ok: true, added: store.update((s) => r.friends.filter((f) => addFriend(s, f, 0)).length) };
    },
  };
  return {
    api,
    playerId: ME,
    myId: ME,
    myName: 'Me',
    store,
    actions,
    conversations,
    presence: { get: (id) => presence[id] || null, subscribe: () => () => {} },
    inbox: { threads: () => threads, subscribe: () => () => {} },
    players: {
      search: vi.fn().mockResolvedValue({ ok: true, data: searchResults }),
      resolveExact: vi.fn(),
      get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    },
    router: { navigate: vi.fn(), path: '/' },
    toast: vi.fn(),
    isSmall: () => false,
  };
}
```

- [ ] **Step 3: Write the failing test**

`test/ui/dock.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDock } from '../../src/ui/dock.js';
import { DOCK_HTML, wireGameHeaders } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

const setSmall = (small) => {
  window.matchMedia = vi.fn(() => ({ matches: small, addEventListener() {} }));
};

describe('dock', () => {
  let dock;
  beforeEach(() => {
    document.body.innerHTML = DOCK_HTML;
    wireGameHeaders();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    setSmall(false);
  });
  afterEach(() => {
    if (dock) dock.destroy();
    vi.unstubAllGlobals();
    delete window.matchMedia;
  });

  it('prepends its root into the game dock', () => {
    dock = createDock();
    dock.start();
    const containers = document.querySelector('.chat-containers');
    expect(containers.firstChild).toBe(dock.root);
    expect(dock.root.className).toBe('zcf-root');
  });

  it('re-mounts when the game rebuilds the dock', async () => {
    dock = createDock();
    dock.start();
    document.querySelector('.chat-containers').remove();
    await flush();
    expect(dock.root.isConnected).toBe(false);
    document.body.insertAdjacentHTML('beforeend', DOCK_HTML);
    await flush();
    await flush();
    expect(document.querySelector('.chat-containers').firstChild).toBe(dock.root);
  });

  it('waits quietly when there is no dock', () => {
    document.body.innerHTML = '<div id="q-app"></div>';
    dock = createDock();
    expect(() => dock.start()).not.toThrow();
    expect(dock.root.isConnected).toBe(false);
  });

  it('minimizes open game chats by clicking their headers', () => {
    dock = createDock();
    dock.start();
    dock.minimizeGameChats();
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(true);
    expect(document.querySelector('.faction-chat').classList.contains('chat-minimized')).toBe(true);
  });

  it('on phones, reports when the player opens a game chat', async () => {
    setSmall(true);
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    const ours = document.createElement('div');
    ours.className = 'chat-container zcf chat-minimized';
    dock.root.appendChild(ours);
    ours.classList.remove('chat-minimized');
    await flush();
    expect(onGameChatOpened).not.toHaveBeenCalled();
    document.querySelector('.faction-chat .chat-header').click();
    await flush();
    expect(onGameChatOpened).toHaveBeenCalledTimes(1);
  });

  it('on desktop, ignores game chats opening', async () => {
    const onGameChatOpened = vi.fn();
    dock = createDock({ onGameChatOpened });
    dock.start();
    document.querySelector('.faction-chat .chat-header').click();
    await flush();
    expect(onGameChatOpened).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npx vitest run test/ui/dock.test.js`
Expected: FAIL, because `../../src/ui/dock.js` doesn't exist yet.

- [ ] **Step 5: Implement `src/ui/dock.js`**

`src/ui/dock.js`:

```js
// Keeps our root inside the game's .chat-containers and coordinates the phone-layout "one open chat" rule.
import { h } from './dom.js';
import { safe } from '../util.js';

export const SMALL_QUERY = '(max-width: 599.98px)';

export function createDock({ doc = document, win = window, onGameChatOpened = () => {} } = {}) {
  // display:contents lets our .chat-container children sit directly in the game's flex row.
  const root = h('div', { class: 'zcf-root' });
  let dockEl = null;
  let frame = 0;

  const isSmall = () =>
    typeof win.matchMedia === 'function' ? win.matchMedia(SMALL_QUERY).matches : win.innerWidth < 600;

  const classObserver = new win.MutationObserver(
    safe('dock-class-observer', (mutations) => {
      if (!isSmall()) return;
      for (const m of mutations) {
        const t = m.target;
        if (!t.classList || !t.classList.contains('chat-container') || root.contains(t)) continue;
        const wasMinimized = /\bchat-minimized\b/.test(m.oldValue || '');
        if (wasMinimized && !t.classList.contains('chat-minimized')) {
          onGameChatOpened();
          return;
        }
      }
    }),
  );

  function ensure() {
    if (root.isConnected) return true;
    const found = doc.querySelector('.chat-containers');
    if (found !== dockEl) {
      classObserver.disconnect();
      dockEl = found;
      if (dockEl) {
        classObserver.observe(dockEl, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
      }
    }
    if (!dockEl) return false;
    dockEl.insertBefore(root, dockEl.firstChild);
    return true;
  }

  // One cheap check per animation frame, however many DOM mutations the game makes.
  const bodyObserver = new win.MutationObserver(() => {
    if (frame || root.isConnected) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      safe('dock-ensure', ensure)();
    });
  });

  function minimizeGameChats() {
    if (!dockEl) return;
    for (const c of dockEl.querySelectorAll(':scope > .chat-container:not(.chat-minimized)')) {
      const header = c.querySelector(':scope > .chat-header');
      if (header) header.click();
    }
  }

  return {
    root,
    isSmall,
    ensure,
    minimizeGameChats,
    start() {
      ensure();
      bodyObserver.observe(doc.body, { childList: true, subtree: true });
    },
    destroy() {
      bodyObserver.disconnect();
      classObserver.disconnect();
      if (frame) win.cancelAnimationFrame(frame);
      root.remove();
    },
  };
}
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run test/ui/dock.test.js`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add test/fixtures/game-dom.js test/ui/services.js src/ui/dock.js test/ui/dock.test.js
git commit -m "feat: mount into the game chat dock with phone coordination"
```

---

### Task 18: Friends window and add-friend pop-out

**Files:**
- Create: `src/ui/add-friend-popover.js`, `src/ui/friends-window.js`
- Test: `test/ui/friends-window.test.js`

The window is laid out like this:
- **Header:** the `fa-user-friends` icon in green, "Friends", `n / N online`, a ⋯ menu (Export/Import) and the chevron toggle.
- **Toolbar:** the **filter** input, which filters locally with no requests, and the **person-plus** button, which opens the pop-out search. The search waits 300ms and needs 2+ characters or an all-digit ID, shows at most 8 results, and stays open after an Add.
- **Sections:** Online (A–Z), Offline (most recently active first), then Recent (non-friend threads, each with `+ Friend`).
- **Rows:** hovering shows Profile and Remove, and Remove asks for an inline confirmation.

- [ ] **Step 1: Write the failing test**

`test/ui/friends-window.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFriendsWindow } from '../../src/ui/friends-window.js';
import { addFriend } from '../../src/state.js';
import { makeServices } from './services.js';

function mount(opts) {
  const services = makeServices(opts);
  const win = createFriendsWindow(services);
  document.body.appendChild(win.el);
  services.store.subscribe(() => win.update());
  win.update();
  return { services, win, el: win.el };
}

const names = (el) => [...el.querySelectorAll('.zcf-row .zcf-name')].map((n) => n.textContent);

describe('friends window', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('is a minimized game-style tab with an unread badge for friends only', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.threads = { 5: { unread: 2 }, 9: { unread: 4 } };
    });
    expect(el.classList.contains('chat-container')).toBe(true);
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.querySelector('.chat-icon').className).toContain('fa-user-friends');
    expect(el.querySelector('.unread-badge').textContent).toBe('2');
    expect(el.querySelector('.unread-badge').hidden).toBe(false);
    expect(el.querySelector('.zcf-body').hidden).toBe(true);
  });

  it('opens from the header and lists online, offline and recent sections', () => {
    const { services, el } = mount({
      presence: { 5: { online: true }, 6: { online: false, active: Date.now() - 12 * 60000 } },
      threads: [{ userId: 9, username: 'TradeGuy', preview: 'wanna buy ammo?', lastReply: 1, isSystem: false }],
    });
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      addFriend(s, { id: 6, username: 'Rusty' }, 0);
    });
    el.querySelector('.chat-header').click();
    expect(services.actions.toggleFriends).toHaveBeenCalled();
    expect(el.classList.contains('zcf-open')).toBe(true);
    expect(el.querySelector('.zcf-count').textContent).toBe('1 / 2 online');
    expect([...el.querySelectorAll('.zcf-sec')].map((s) => s.textContent)).toEqual(['Online — 1', 'Offline — 1', 'Recent — not friends — 1']);
    expect(names(el)).toEqual(['Spike', 'Rusty', 'TradeGuy']);
    expect(el.textContent).toContain('Active 12m ago');
    expect(el.textContent).toContain('wanna buy ammo?');
  });

  it('filters the list locally and highlights matches', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      addFriend(s, { id: 6, username: 'Gravedigger' }, 0);
      s.dock.friendsOpen = true;
    });
    const input = el.querySelector('.zcf-toolbar input');
    input.value = 'gra';
    input.dispatchEvent(new Event('input'));
    expect(names(el)).toEqual(['Gravedigger']);
    expect(el.querySelector('.zcf-row mark').textContent).toBe('Gra');
    expect(services.players.search).not.toHaveBeenCalled();
  });

  it('opens a DM when a row is clicked', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.dock.friendsOpen = true;
    });
    el.querySelector('.zcf-row').click();
    expect(services.actions.openDm).toHaveBeenCalledWith(5, { expand: true, username: 'Spike', avatar: null });
  });

  it('removes a friend after an inline confirm', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      s.dock.friendsOpen = true;
    });
    const remove = [...el.querySelectorAll('.zcf-row-actions button')].find((b) => b.textContent === 'Remove');
    remove.click();
    expect(el.textContent).toContain('Remove Spike from friends?');
    el.querySelector('.zcf-danger').click();
    expect(services.store.get().friends).toEqual({});
  });

  it('searches players from the person-plus pop-out and adds them', async () => {
    vi.useFakeTimers();
    const { services, el } = mount({
      searchResults: [{ id: 7, username: 'ZombieKing', avatar: null }, { id: 8, username: 'Zombo', avatar: null }],
    });
    services.store.update((s) => {
      addFriend(s, { id: 8, username: 'Zombo' }, 0);
      s.dock.friendsOpen = true;
    });
    el.querySelector('.zcf-iconbtn').click();
    const pop = el.querySelector('.zcf-pop');
    expect(pop.hidden).toBe(false);
    const input = pop.querySelector('input');
    input.value = 'zo';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(299);
    expect(services.players.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(services.players.search).toHaveBeenCalledWith('zo');
    const rows = [...pop.querySelectorAll('.zcf-result')];
    expect(rows.map((r) => r.querySelector('.zcf-name').textContent)).toEqual(['ZombieKing', 'Zombo']);
    expect(rows[1].textContent).toContain('✓ Friend');
    rows[0].querySelector('.zcf-add').click();
    expect(services.actions.addFriend).toHaveBeenCalledWith({ id: 7, username: 'ZombieKing', avatar: null });
    expect(services.toast).toHaveBeenCalledWith('ZombieKing added to friends');
    expect(pop.querySelector('.zcf-result').textContent).toContain('✓ Friend');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pop.hidden).toBe(true);
  });

  it('adds a Recent player with + Friend', () => {
    const { services, el } = mount({ threads: [{ userId: 9, username: 'TradeGuy', preview: 'hi', lastReply: 1, isSystem: false }] });
    services.store.update((s) => { s.dock.friendsOpen = true; });
    el.querySelector('.zcf-add-outline').click();
    expect(services.store.get().friends[9].username).toBe('TradeGuy');
  });

  it('shows usernames as plain text', () => {
    const { services, el } = mount();
    services.store.update((s) => {
      addFriend(s, { id: 5, username: '<b>bold</b>' }, 0);
      s.dock.friendsOpen = true;
    });
    expect(el.querySelector('.zcf-row b')).toBeNull();
    expect(names(el)).toEqual(['<b>bold</b>']);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/ui/friends-window.test.js`
Expected: FAIL, because `../../src/ui/friends-window.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/ui/add-friend-popover.js`**

`src/ui/add-friend-popover.js`:

```js
// The pop-out behind the person-plus button: search the game's players by name or ID and add them.
import { h, clear, avatar } from './dom.js';
import { debounce } from '../util.js';

export const MAX_RESULTS = 8;

export function createAddFriendPopover({ players, isFriend, onAdd }) {
  let seq = 0;
  let results = [];

  const input = h('input', { class: 'zcf-input', type: 'text', placeholder: 'Name or player ID', 'aria-label': 'Find a player' });
  const list = h('div', { class: 'zcf-results' });
  const el = h('div', { class: 'zcf-pop', hidden: true }, h('div', { class: 'zcf-pop-title' }, 'Add friend'), input, list);

  function message(text) {
    clear(list);
    if (text) list.appendChild(h('div', { class: 'zcf-empty' }, text));
  }

  function row(p) {
    const action = isFriend(p.id)
      ? h('span', { class: 'zcf-done' }, '✓ Friend')
      : h('button', {
          class: 'zcf-add',
          type: 'button',
          onclick: (e) => {
            e.stopPropagation();
            onAdd(p);
            render();
          },
        }, 'Add');
    return h('div', { class: 'zcf-result' },
      avatar({ avatar: p.avatar, size: 22 }),
      h('div', { class: 'zcf-row-main' }, h('div', { class: 'zcf-name' }, p.username), h('div', { class: 'zcf-status' }, `#${p.id}`)),
      action);
  }

  function render() {
    if (!results.length) {
      message('No players found.');
      return;
    }
    clear(list);
    for (const p of results) list.appendChild(row(p));
  }

  const search = debounce(async (q) => {
    const mine = ++seq;
    const r = await players.search(q);
    if (mine !== seq) return;
    if (!r.ok) {
      message('Search failed. Try again.');
      return;
    }
    results = r.data.slice(0, MAX_RESULTS);
    render();
  }, 300);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length >= 2 || /^\d+$/.test(q)) {
      message('Searching…');
      search(q);
    } else {
      search.cancel();
      seq += 1;
      results = [];
      message(q ? 'Keep typing…' : '');
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

  function open() {
    el.hidden = false;
    input.value = '';
    results = [];
    message('');
    input.focus();
  }

  function close() {
    el.hidden = true;
    search.cancel();
    seq += 1;
  }

  return {
    el,
    input,
    open,
    close,
    get isOpen() {
      return !el.hidden;
    },
    // Re-draw "Add" / "✓ Friend" after the friends list changes elsewhere.
    refresh() {
      if (!el.hidden && results.length) render();
    },
  };
}
```

- [ ] **Step 4: Implement `src/ui/friends-window.js`**

`src/ui/friends-window.js`:

```js
// The Friends tab/window in the dock: filter, Online / Offline / Recent sections, add-friend pop-out, ⋯ menu.
import { h, clear, icon, avatar, highlightMatch, badge, setBadge, downloadText } from './dom.js';
import { createAddFriendPopover } from './add-friend-popover.js';
import { buildFriendSections } from '../friends-view.js';
import { friendsUnreadTotal, isFriend } from '../state.js';
import { statusText } from '../time.js';

export function createFriendsWindow(services, { doc = document } = {}) {
  const { store, actions, presence, inbox, players, router, toast, playerId } = services;
  let filter = '';
  let confirmId = null;
  let frame = 0;

  const titleText = h('span', null, 'Friends');
  const count = h('span', { class: 'zcf-count' });
  const unreadBadge = badge();
  const title = h('div', { class: 'chat-title' }, h('i', { class: 'fas fa-user-friends chat-icon', 'aria-hidden': 'true' }), titleText, count, unreadBadge);
  const menuBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'More', 'aria-label': 'More' }, icon('ellipsis-h'));
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleFriends() }, title, menuBtn, toggle);

  const filterInput = h('input', { class: 'zcf-input', type: 'text', placeholder: 'Search friends…', 'aria-label': 'Search friends' });
  const addBtn = h('button', { class: 'zcf-iconbtn', type: 'button', title: 'Add friend', 'aria-label': 'Add friend' }, icon('user-plus'));
  const toolbar = h('div', { class: 'zcf-toolbar' }, h('label', { class: 'zcf-search' }, icon('search'), filterInput), addBtn);
  const list = h('div', { class: 'zcf-list' });

  const pop = createAddFriendPopover({
    players,
    isFriend: (id) => isFriend(store.get(), id),
    onAdd: (p) => {
      actions.addFriend(p);
      toast(`${p.username} added to friends`);
    },
  });

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const menu = h('div', { class: 'zcf-menu', hidden: true },
    h('div', { class: 'zcf-menu-title' }, 'Friends list'),
    h('button', { type: 'button', onclick: onExport }, 'Export friends'),
    h('button', { type: 'button', onclick: () => { menu.hidden = true; fileInput.click(); } }, 'Import friends'));

  const body = h('div', { class: 'chat-content zcf-body' }, toolbar, list, pop.el, menu, fileInput);
  const el = h('div', { class: 'chat-container zcf zcf-friends' }, header, body);

  filterInput.addEventListener('input', () => {
    filter = filterInput.value;
    renderList();
  });
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.isOpen) pop.close();
    else pop.open();
    addBtn.classList.toggle('zcf-active', pop.isOpen);
  });
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const res = actions.importFriends(await file.text());
    toast(res.ok ? `Imported ${res.added} new friend${res.added === 1 ? '' : 's'}.` : res.error, { error: !res.ok });
  });
  // Close the pop-out and menu on outside clicks.
  doc.addEventListener('mousedown', (e) => {
    if (pop.isOpen && !pop.el.contains(e.target) && !addBtn.contains(e.target)) {
      pop.close();
      addBtn.classList.remove('zcf-active');
    }
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) menu.hidden = true;
  });

  function onExport() {
    menu.hidden = true;
    const s = store.get();
    downloadText(`zed-city-friends-${playerId}.json`, actions.exportFriends(), doc);
    toast(`Exported ${Object.keys(s.friends).length} friends.`);
  }

  function section(label, rows, render, emptyText) {
    list.appendChild(h('div', { class: 'zcf-sec' }, `${label} — ${rows.length}`));
    if (!rows.length) list.appendChild(h('div', { class: 'zcf-empty' }, emptyText));
    for (const r of rows) list.appendChild(render(r));
  }

  function friendRow(r, s, now) {
    if (confirmId === r.id) {
      return h('div', { class: 'zcf-row' },
        h('div', { class: 'zcf-row-main' }, `Remove ${r.username} from friends?`),
        h('button', { class: 'zcf-mini zcf-danger', type: 'button', onclick: (e) => { e.stopPropagation(); confirmId = null; actions.removeFriend(r.id); } }, 'Remove'),
        h('button', { class: 'zcf-mini', type: 'button', onclick: (e) => { e.stopPropagation(); confirmId = null; renderList(); } }, 'Cancel'));
    }
    const online = !!(r.presence && r.presence.online);
    const unread = (s.threads[r.id] && s.threads[r.id].unread) || 0;
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      onclick: () => actions.openDm(r.id, { expand: true, username: r.username, avatar: r.avatar }),
    },
      avatar({ avatar: r.avatar, online: r.presence ? online : undefined }),
      h('div', { class: 'zcf-row-main' },
        h('div', { class: 'zcf-name' }, highlightMatch(r.username, filter)),
        h('div', { class: `zcf-status${online ? ' zcf-status-on' : ''}` }, statusText(r.presence, now) || ' ')),
      unread > 0 ? h('span', { class: 'zcf-pill' }, String(unread)) : null,
      h('div', { class: 'zcf-row-actions' },
        h('button', { class: 'zcf-mini', type: 'button', onclick: (e) => { e.stopPropagation(); router.navigate(`/profile/${r.id}`); } }, 'Profile'),
        h('button', { class: 'zcf-mini', type: 'button', onclick: (e) => { e.stopPropagation(); confirmId = r.id; renderList(); } }, 'Remove')));
  }

  function recentRow(t, s) {
    const unread = (s.threads[t.userId] && s.threads[t.userId].unread) || 0;
    return h('div', {
      class: 'zcf-row',
      tabindex: 0,
      onclick: () => actions.openDm(t.userId, { expand: true, username: t.username, avatar: t.avatar }),
    },
      avatar({ avatar: t.avatar }),
      h('div', { class: 'zcf-row-main' },
        h('div', { class: 'zcf-name' }, highlightMatch(t.username, filter)),
        h('div', { class: 'zcf-status' }, t.preview || ' ')),
      unread > 0 ? h('span', { class: 'zcf-pill' }, String(unread)) : null,
      h('button', {
        class: 'zcf-add zcf-add-outline',
        type: 'button',
        onclick: (e) => {
          e.stopPropagation();
          actions.addFriend({ id: t.userId, username: t.username, avatar: t.avatar });
          toast(`${t.username} added to friends`);
        },
      }, '+ Friend'));
  }

  function renderList() {
    const s = store.get();
    const now = Date.now();
    const sec = buildFriendSections({ friends: s.friends, presence: presence.get, threads: inbox.threads(), filter });
    count.textContent = `${sec.onlineCount} / ${sec.total} online`;
    const scrollTop = list.scrollTop;
    clear(list);
    const none = filter ? 'No matches' : 'None';
    if (!sec.total && !filter) {
      list.appendChild(h('div', { class: 'zcf-empty' }, 'No friends yet. Use the person-plus button above, "Add Friend" on a profile, or "+ friend" next to a name in chat.'));
    } else {
      section('Online', sec.online, (r) => friendRow(r, s, now), none);
      section('Offline', sec.offline, (r) => friendRow(r, s, now), none);
    }
    if (sec.recent.length) section('Recent — not friends', sec.recent, (t) => recentRow(t, s), none);
    list.scrollTop = scrollTop;
  }

  function update() {
    const s = store.get();
    const open = !!s.dock.friendsOpen;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    titleText.hidden = !open;
    count.hidden = !open;
    menuBtn.hidden = !open;
    toggle.hidden = !open;
    setBadge(unreadBadge, friendsUnreadTotal(s), !open);
    if (open) {
      renderList();
      pop.refresh();
    } else {
      pop.close();
      addBtn.classList.remove('zcf-active');
      menu.hidden = true;
      confirmId = null;
    }
  }

  // Presence and inbox updates arrive in bursts; redraw at most once per frame.
  function scheduleList() {
    if (frame || !store.get().dock.friendsOpen) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderList();
    });
  }

  return { el, update, scheduleList };
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/ui/friends-window.test.js`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/ui/add-friend-popover.js src/ui/friends-window.js test/ui/friends-window.test.js
git commit -m "feat: add Friends window with filter, sections and add-friend pop-out"
```

---

### Task 19: DM window

**Files:**
- Create: `src/ui/dm-window.js`
- Test: `test/ui/dm-window.test.js`

The window works like this:
- **Minimized:** an avatar tab with an unread badge. It never loads messages, so the thread stays unread in the game's inbox.
- **Expanded:** the header shows avatar · name (links to the profile) · status · open-in-inbox · minimize · close. The first expand calls `conv.ensureLoaded()`.
- **Messages:** use the game chat's line style.
- **Scrolling:** new messages are appended rather than the list being redrawn. Scrolling up loads older pages, and a "New messages ↓" chip appears when you're scrolled up. When pinned to the bottom, the window keeps at most 200 messages.
- **Composer:** Enter sends and Shift+Enter adds a new line. A failed send shows a Retry link. A notice appears when the player is blocked or busy (traveling, exploring, in a fight).

- [ ] **Step 1: Write the failing test**

`test/ui/dm-window.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDmWindow } from '../../src/ui/dm-window.js';
import { openDm, addFriend } from '../../src/state.js';
import { makeServices, ME } from './services.js';
import { fakeApi, rawMsg, flush } from '../helpers.js';

const THEM = 5;

function mount(apiOverrides = {}, { open = true } = {}) {
  const api = fakeApi(apiOverrides);
  const services = makeServices({ api });
  services.store.update((s) => {
    addFriend(s, { id: THEM, username: 'Spike' }, 0);
    openDm(s, THEM, { expand: open, now: 1 });
  });
  const win = createDmWindow(services, THEM);
  document.body.appendChild(win.el);
  services.store.subscribe(() => win.update());
  win.update();
  return { services, win, el: win.el, api };
}

const texts = (el) => [...el.querySelectorAll('.zcf-log .zcf-text')].map((n) => n.textContent);

describe('dm window', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('loads the conversation when expanded and renders it like game chat', async () => {
    const { el, api } = mount({
      getChatMessages: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          rawMsg(1, THEM, 'you still need those nails?', '2026-09-28 14:02:00'),
          rawMsg(2, THEM, 'got 60 spare', '2026-09-28 14:02:30'),
          rawMsg(3, ME, 'yeah like 40', '2026-09-28 14:03:00'),
        ],
      }),
      getChatInfo: vi.fn().mockResolvedValue({ ok: true, data: { [THEM]: { username: 'Spike', online: true } } }),
    });
    await flush();
    expect(api.getChatMessages).toHaveBeenCalledWith(THEM, 1, 10);
    expect(api.getChatInfo).toHaveBeenCalledWith(THEM);
    expect(texts(el)).toEqual(['you still need those nails?', 'got 60 spare', 'yeah like 40']);
    expect([...el.querySelectorAll('.zcf-sender')].map((n) => n.textContent)).toEqual(['Spike', 'Me']);
    expect(el.querySelectorAll('.zcf-grouped')).toHaveLength(1);
    expect(el.querySelector('.zcf-divider').textContent).toBe('September 28, 2026');
    expect(el.querySelector('.zcf-dm-name').textContent).toBe('Spike');
  });

  it('does not load anything while minimized, and shows the unread badge', async () => {
    const { el, api, services } = mount({}, { open: false });
    services.store.update((s) => { s.threads[THEM] = { unread: 3 }; });
    await flush();
    expect(api.getChatMessages).not.toHaveBeenCalled();
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.querySelector('.unread-badge').textContent).toBe('3');
    expect(el.querySelector('.unread-badge').hidden).toBe(false);
  });

  it('sends on Enter, shows the message right away, and keeps Shift+Enter for new lines', async () => {
    const { el, api } = mount({ sendMail: vi.fn(() => new Promise(() => {})) });
    await flush();
    const input = el.querySelector('textarea');
    input.value = 'line';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(api.sendMail).not.toHaveBeenCalled();
    input.value = 'bet, send a trade';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(api.sendMail).toHaveBeenCalledWith(THEM, 'bet, send a trade');
    expect(input.value).toBe('');
    expect(el.querySelector('.zcf-pending-msg').textContent).toBe('bet, send a trade');
  });

  it('shows a Retry link when sending fails', async () => {
    const { el, api } = mount({ sendMail: vi.fn().mockResolvedValue({ ok: false, kind: 'network' }) });
    await flush();
    el.querySelector('textarea').value = 'hello';
    el.querySelector('.zcf-send').click();
    await flush();
    expect(el.querySelector('.zcf-failed .zcf-error').textContent).toContain('Failed to send');
    api.sendMail.mockResolvedValue({ ok: true, data: { message_id: 9 } });
    el.querySelector('.zcf-link').click();
    await flush();
    expect(api.sendMail).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.zcf-failed')).toBeNull();
  });

  it('disables the composer for players you cannot message', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'access' }) });
    await flush();
    expect(el.querySelector('.zcf-notice').textContent).toBe("You can't message this player.");
    expect(el.querySelector('textarea').disabled).toBe(true);
  });

  it('shows the travel notice while mail is unavailable', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: false, kind: 'busy', busy: 'traveling' }) });
    await flush();
    expect(el.querySelector('.zcf-notice').textContent).toBe('Mail is unavailable while you are traveling.');
  });

  it('renders message text literally', async () => {
    const { el } = mount({ getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, '<img src=x onerror=alert(1)>', '2026-09-28 14:02:00')] }) });
    await flush();
    expect(el.querySelector('.zcf-log img')).toBeNull();
    expect(texts(el)).toEqual(['<img src=x onerror=alert(1)>']);
  });

  it('header buttons minimize, close and open the inbox', async () => {
    const { el, services } = mount();
    await flush();
    el.querySelector('[title="Open in inbox"]').click();
    expect(services.router.navigate).toHaveBeenCalledWith(`/mail/${THEM}`);
    el.querySelector('[title="Minimize"]').click();
    expect(services.store.get().dock.dms[0].open).toBe(false);
    el.querySelector('[title="Close"]').click();
    expect(services.store.get().dock.dms).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/ui/dm-window.test.js`
Expected: FAIL, because `../../src/ui/dm-window.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/ui/dm-window.js`**

`src/ui/dm-window.js`:

```js
// One DM window/tab in the dock, styled like the game's chat (name · time · text, grouped).
import { h, clear, icon, avatar, badge, setBadge } from './dom.js';
import { buildLog } from '../mail.js';
import { formatMessageTime, statusText } from '../time.js';

const BUSY_TEXT = {
  fight: 'Mail is unavailable while you are in a fight.',
  traveling: 'Mail is unavailable while you are traveling.',
  exploring: 'Mail is unavailable while you are exploring.',
  offline: 'Mail is unavailable while the game is offline.',
};

export function createDmWindow(services, userId) {
  const { store, actions, conversations, presence, router, myId, myName } = services;
  const conv = conversations.acquire(userId);
  let renderedKeys = [];
  let atBottom = true;
  let wasOpen = false;

  const avatarSlot = h('span', { class: 'zcf-dm-avatar' });
  const nameEl = h('span', { class: 'zcf-dm-name', title: 'View profile' });
  const statusEl = h('span', { class: 'zcf-dm-status' });
  const unreadBadge = badge();
  const title = h('div', { class: 'chat-title' }, avatarSlot, nameEl, statusEl, unreadBadge);
  const inboxBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'Open in inbox', 'aria-label': 'Open in inbox' }, icon('external-link-alt'));
  const minBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'Minimize', 'aria-label': 'Minimize' }, icon('minus'));
  const closeBtn = h('button', { class: 'zcf-hbtn zcf-close', type: 'button', title: 'Close', 'aria-label': 'Close' }, icon('times'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleDm(userId) }, title, inboxBtn, minBtn, closeBtn);

  const notice = h('div', { class: 'zcf-notice', hidden: true });
  const loader = h('div', { class: 'zcf-loader', hidden: true }, 'Loading…');
  const log = h('div', { class: 'zcf-log' });
  const pendingEl = h('div', { class: 'zcf-pending' });
  const scroller = h('div', { class: 'zcf-scroll' }, loader, log, pendingEl);
  const newChip = h('button', { class: 'zcf-newchip', type: 'button', hidden: true }, 'New messages ↓');
  const input = h('textarea', { class: 'zcf-input zcf-compose', rows: 1, placeholder: 'Message…', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'zcf-send', type: 'button' }, 'Send');
  const body = h('div', { class: 'chat-content zcf-body zcf-dm-body' }, notice, scroller, newChip, h('div', { class: 'zcf-composer' }, input, sendBtn));
  const el = h('div', { class: 'chat-container zcf zcf-dm', dataset: { zcfDm: String(userId) } }, header, body);

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn(e);
  };
  nameEl.addEventListener('click', stop(() => router.navigate(`/profile/${userId}`)));
  inboxBtn.addEventListener('click', stop(() => router.navigate(`/mail/${userId}`)));
  minBtn.addEventListener('click', stop(() => actions.minimizeDm(userId)));
  closeBtn.addEventListener('click', stop(() => actions.closeDm(userId)));
  newChip.addEventListener('click', () => scrollToBottom());
  sendBtn.addEventListener('click', () => submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener('focus', () => actions.setActiveDm(userId));
  body.addEventListener('mousedown', () => actions.setActiveDm(userId));
  scroller.addEventListener('scroll', () => {
    atBottom = isAtBottom();
    if (atBottom) newChip.hidden = true;
    if (scroller.scrollTop < 40 && conv.state.hasMore && !conv.state.loadingOlder) conv.loadOlder();
  });

  const unsubscribe = conv.subscribe(() => renderConversation());

  function isAtBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
  }

  function scrollToBottom() {
    scroller.scrollTop = scroller.scrollHeight;
    atBottom = true;
    newChip.hidden = true;
  }

  function submit() {
    if (!input.value.trim() || conv.state.blocked) return;
    const text = input.value;
    input.value = '';
    atBottom = true;
    conv.send(text);
  }

  function displayName() {
    const s = store.get();
    const entry = s.dock.dms.find((d) => d.id === userId);
    return (conv.state.info && conv.state.info.username) || (s.friends[userId] && s.friends[userId].username) || (entry && entry.username) || `#${userId}`;
  }

  function avatarPath() {
    const s = store.get();
    const entry = s.dock.dms.find((d) => d.id === userId);
    return (conv.state.info && conv.state.info.avatar) || (s.friends[userId] && s.friends[userId].avatar) || (entry && entry.avatar) || null;
  }

  function renderItem(item) {
    if (item.type === 'divider') return h('div', { class: 'zcf-divider' }, item.label);
    const m = item.msg;
    const cls = `zcf-msg${item.grouped ? ' zcf-grouped' : ''}${m.isSystem ? ' zcf-system' : ''}`;
    const time = m.ts ? formatMessageTime(m.ts) : '';
    if (item.grouped) return h('div', { class: cls, title: time }, h('div', { class: 'zcf-text' }, m.text));
    const mine = m.senderId === myId;
    const sender = mine
      ? h('span', { class: 'zcf-sender' }, myName)
      : h('span', { class: 'zcf-sender zcf-them', onclick: () => router.navigate(`/profile/${userId}`) }, displayName());
    return h('div', { class: cls }, sender, h('span', { class: 'zcf-time' }, time), h('div', { class: 'zcf-text' }, m.text));
  }

  function renderPending() {
    clear(pendingEl);
    for (const p of conv.pending()) {
      pendingEl.appendChild(h('div', { class: `zcf-msg zcf-pending-msg${p.error ? ' zcf-failed' : ''}` },
        h('div', { class: 'zcf-text' }, p.text),
        p.error
          ? h('div', { class: 'zcf-error' }, 'Failed to send · ', h('button', { class: 'zcf-link', type: 'button', onclick: () => conv.retry(p.localId) }, 'Retry'))
          : null));
    }
  }

  function renderNotice() {
    const text = conv.state.blocked ? "You can't message this player." : conv.state.busy ? BUSY_TEXT[conv.state.busy] || 'Mail is unavailable right now.' : '';
    notice.textContent = text;
    notice.hidden = !text;
    input.disabled = conv.state.blocked;
    sendBtn.disabled = conv.state.blocked || !!conv.state.busy;
  }

  // Appends when the new log only extends the old one; otherwise redraws (older page loaded, trimmed).
  function renderConversation() {
    renderNotice();
    loader.hidden = !(conv.state.loading || conv.state.loadingOlder);
    const items = buildLog(conv.messages());
    const keys = items.map((i) => i.key);
    const isAppend = renderedKeys.length > 0 && keys.length >= renderedKeys.length && renderedKeys.every((k, i) => keys[i] === k);
    const prepended = !isAppend && renderedKeys.length > 0 && keys[keys.length - 1] === renderedKeys[renderedKeys.length - 1];
    const grew = keys.length > renderedKeys.length;
    const prevHeight = scroller.scrollHeight;
    const prevTop = scroller.scrollTop;
    if (isAppend) {
      for (const item of items.slice(renderedKeys.length)) log.appendChild(renderItem(item));
    } else if (keys.join() !== renderedKeys.join()) {
      clear(log);
      for (const item of items) log.appendChild(renderItem(item));
    }
    renderedKeys = keys;
    renderPending();
    if (atBottom) {
      scrollToBottom();
      if (conv.trim()) return;
    } else if (prepended) {
      scroller.scrollTop = prevTop + (scroller.scrollHeight - prevHeight);
    } else if (grew) {
      newChip.hidden = false;
    }
  }

  function update() {
    const s = store.get();
    const entry = s.dock.dms.find((d) => d.id === userId);
    if (!entry) return;
    const open = !!entry.open;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    nameEl.hidden = !open;
    statusEl.hidden = !open;
    inboxBtn.hidden = !open;
    minBtn.hidden = !open;
    const p = presence.get(userId);
    clear(avatarSlot).appendChild(avatar({ avatar: avatarPath(), online: p ? p.online : undefined, size: open ? 18 : 24 }));
    nameEl.textContent = displayName();
    statusEl.textContent = statusText(p);
    statusEl.classList.toggle('zcf-status-on', !!(p && p.online));
    el.title = open ? '' : displayName();
    const unread = (s.threads[userId] && s.threads[userId].unread) || 0;
    setBadge(unreadBadge, unread, !open);
    if (open && !wasOpen) {
      conv.ensureLoaded();
      atBottom = true;
      renderConversation();
    }
    wasOpen = open;
  }

  return {
    el,
    update,
    destroy() {
      unsubscribe();
      conversations.release(userId);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/ui/dm-window.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/dm-window.js test/ui/dm-window.test.js
git commit -m "feat: add DM window styled like game chat"
```

---

### Task 20: Dock view (window reconciliation)

**Files:**
- Create: `src/ui/dock-view.js`
- Test: `test/ui/dock-view.test.js`

The order inside the root is DM windows (in store order), then Friends. That puts Friends right next to the game's chats. On phones, only the 2 most recently used DM entries get a tab.

- [ ] **Step 1: Write the failing test**

`test/ui/dock-view.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createDockView, visibleDms, SMALL_MAX_DMS } from '../../src/ui/dock-view.js';
import { openDm } from '../../src/state.js';
import { makeServices } from './services.js';

describe('dock view', () => {
  it(`shows every DM on desktop but only the ${SMALL_MAX_DMS} most recent on phones`, () => {
    const dms = [{ id: 1, lastUsed: 3 }, { id: 2, lastUsed: 1 }, { id: 3, lastUsed: 2 }];
    expect(visibleDms(dms, false)).toBe(dms);
    expect(visibleDms(dms, true).map((d) => d.id)).toEqual([1, 3]);
  });

  it('orders DM windows (store order) before the Friends tab and removes closed ones', () => {
    const services = makeServices();
    const root = document.createElement('div');
    const view = createDockView({ root, services });
    services.store.update((s) => {
      openDm(s, 7, { now: 1 });
      openDm(s, 8, { now: 2 });
    });
    view.render();
    expect([...root.children].map((c) => c.dataset.zcfDm || 'friends')).toEqual(['7', '8', 'friends']);
    services.store.update((s) => { s.dock.dms = s.dock.dms.filter((d) => d.id !== 7); });
    view.render();
    expect([...root.children].map((c) => c.dataset.zcfDm || 'friends')).toEqual(['8', 'friends']);
    expect(services.conversations.get(7)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/ui/dock-view.test.js`
Expected: FAIL, because `../../src/ui/dock-view.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/ui/dock-view.js`**

`src/ui/dock-view.js`:

```js
// Reconciles our windows inside the dock root: [DM windows in store order] then [Friends], left of the game's chats.
import { createFriendsWindow } from './friends-window.js';
import { createDmWindow } from './dm-window.js';

export const SMALL_MAX_DMS = 2;

// On phones only the most recently used DM entries get a tab, so the dock still fits on screen.
export function visibleDms(dms, small) {
  if (!small || dms.length <= SMALL_MAX_DMS) return dms;
  const keep = new Set(dms.slice().sort((a, b) => b.lastUsed - a.lastUsed).slice(0, SMALL_MAX_DMS).map((d) => d.id));
  return dms.filter((d) => keep.has(d.id));
}

export function createDockView({ root, services }) {
  const friends = createFriendsWindow(services);
  const dms = new Map();

  function render() {
    const s = services.store.get();
    const entries = visibleDms(s.dock.dms, services.isSmall());
    const wanted = new Set(entries.map((e) => e.id));
    for (const [id, w] of dms) {
      if (!wanted.has(id)) {
        w.destroy();
        w.el.remove();
        dms.delete(id);
      }
    }
    for (const e of entries) if (!dms.has(e.id)) dms.set(e.id, createDmWindow(services, e.id));
    const desired = [...entries.map((e) => dms.get(e.id).el), friends.el];
    desired.forEach((node, i) => {
      if (root.children[i] !== node) root.insertBefore(node, root.children[i] || null);
    });
    for (const w of dms.values()) w.update();
    friends.update();
  }

  return {
    render,
    friends,
    dmWindow: (id) => dms.get(id) || null,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/ui/dock-view.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/dock-view.js test/ui/dock-view.test.js
git commit -m "feat: add dock view that orders DM and Friends windows"
```

---

### Task 21: Profile page button

**Files:**
- Create: `src/ui/profile-button.js`
- Test: `test/ui/profile-button.test.js`

- **Placement:** the button is a clone of the game's own Mail button wrapper, with the icon changed to `fa-user-plus` and the label to "Add Friend". It goes between Trade and Mail.
- **Fallbacks:** if Trade and Mail are missing, the Block button is cloned instead, recolored to `text-grey-4`, and placed after Block. Your own profile (a Settings button) gets nothing.
- **Friend state:** "Friends" with `fa-user-check` and our `zcf-is-friend` class in green. Removing it takes two clicks ("Remove?" for 4s).
- **Staying in place:** a body observer, batched to one check per animation frame, re-inserts the button while you're on `/profile/{id}` because the game re-renders the row while loading.
- **Search scope:** buttons are matched only among `.q-btn--outline` elements with the right label, so the top bar's round mail icon is ignored.

- [ ] **Step 1: Write the failing test**

`test/ui/profile-button.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProfileButton } from '../../src/ui/profile-button.js';
import { PROFILE_OTHER_HTML, PROFILE_BLOCKED_HTML, PROFILE_OWN_HTML } from '../fixtures/game-dom.js';
import { makeServices } from './services.js';
import { flush } from '../helpers.js';

let mounted = [];

function setup(html, profile = { username: 'TePuu', avatar: 'a.png' }) {
  document.body.innerHTML = html;
  const services = makeServices();
  services.players.get = vi.fn().mockResolvedValue({ ok: true, data: profile });
  const pb = createProfileButton({ ...services });
  services.store.subscribe(() => pb.refresh());
  mounted.push(pb);
  return { services, pb };
}

const labels = () => [...document.querySelectorAll('.profile-actions .q-btn .block')].map((n) => n.textContent);

describe('profile button', () => {
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
  afterEach(() => {
    for (const pb of mounted) pb.destroy();
    mounted = [];
    vi.unstubAllGlobals();
  });

  it('adds "Add Friend" between Trade and Mail, styled like them', () => {
    const { pb } = setup(PROFILE_OTHER_HTML);
    pb.onRoute('/profile/42');
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Mail']);
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    expect(btn.classList.contains('q-btn--outline')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(true);
    expect(btn.querySelector('i').classList.contains('fa-user-plus')).toBe(true);
    expect(btn.querySelector('i').classList.contains('fa-envelope')).toBe(false);
  });

  it('adds the friend on click and switches to "Friends"', async () => {
    const { pb, services } = setup(PROFILE_OTHER_HTML);
    pb.onRoute('/profile/42');
    document.querySelector('.zcf-profile-btn .q-btn').click();
    await flush();
    expect(services.players.get).toHaveBeenCalledWith(42);
    expect(services.store.get().friends[42]).toMatchObject({ username: 'TePuu', avatar: 'a.png' });
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    expect(labels()[2]).toBe('Friends');
    expect(btn.classList.contains('zcf-is-friend')).toBe(true);
    expect(btn.classList.contains('text-grey-4')).toBe(false);
    expect(btn.querySelector('i').classList.contains('fa-user-check')).toBe(true);
  });

  it('removes only after a second confirming click', async () => {
    const { pb, services } = setup(PROFILE_OTHER_HTML);
    services.store.update((s) => { s.friends[42] = { id: 42, username: 'TePuu' }; });
    pb.onRoute('/profile/42');
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    btn.click();
    await flush();
    expect(labels()[2]).toBe('Remove?');
    expect(services.store.get().friends[42]).toBeTruthy();
    btn.click();
    await flush();
    expect(services.store.get().friends[42]).toBeUndefined();
    expect(labels()[2]).toBe('Add Friend');
  });

  it('falls back to after Block, recolored grey, when Trade and Mail are hidden', () => {
    const { pb } = setup(PROFILE_BLOCKED_HTML);
    pb.onRoute('/profile/42');
    expect(labels()).toEqual(['Unblock', 'Add Friend']);
    const btn = document.querySelector('.zcf-profile-btn .q-btn');
    expect(btn.classList.contains('text-red-4')).toBe(false);
    expect(btn.classList.contains('text-grey-4')).toBe(true);
  });

  it('adds nothing on your own profile or other pages', () => {
    const own = setup(PROFILE_OWN_HTML);
    own.pb.onRoute('/profile/1');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
    const other = setup(PROFILE_OTHER_HTML);
    other.pb.onRoute('/inventory');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
  });

  it('comes back after the game re-renders the button row', async () => {
    const { pb } = setup('<div id="page"></div>');
    pb.onRoute('/profile/42');
    expect(document.querySelector('.zcf-profile-btn')).toBeNull();
    document.getElementById('page').innerHTML = PROFILE_OTHER_HTML;
    await flush();
    await flush();
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Mail']);
    document.getElementById('page').innerHTML = PROFILE_OTHER_HTML;
    await flush();
    await flush();
    expect(labels()).toEqual(['Block', 'Trade', 'Add Friend', 'Mail']);
    pb.onRoute('/inventory');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/ui/profile-button.test.js`
Expected: FAIL, because `../../src/ui/profile-button.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/ui/profile-button.js`**

`src/ui/profile-button.js`:

```js
// "Add Friend" / "Friends" button on /profile/{id}, cloned from the game's own Mail button so it matches exactly.
import { isFriend } from '../state.js';
import { safe, warnOnce } from '../util.js';

export const PROFILE_PATH = /^\/profile\/(\d+)\/?$/;
const CONFIRM_MS = 4000;

export function createProfileButton({ doc = document, win = window, store, actions, players, toast }) {
  let profileId = null;
  let wrap = null;
  let button = null;
  let label = null;
  let iconEl = null;
  let confirming = false;
  let confirmTimer = null;
  let observer = null;
  let frame = 0;
  let warnTimer = null;

  function findButton(iconClass, labelRe) {
    for (const btn of doc.querySelectorAll('.q-btn.q-btn--outline')) {
      if (btn.closest('.zcf-profile-btn')) continue;
      if (btn.querySelector(`.${iconClass}`) && labelRe.test(btn.textContent.trim())) return btn;
    }
    return null;
  }

  function setIcon(name) {
    if (!iconEl) return;
    for (const c of [...iconEl.classList]) if (/^fa-/.test(c)) iconEl.classList.remove(c);
    iconEl.classList.add(name);
  }

  function refresh() {
    if (!button || !button.isConnected || profileId === null) return;
    const friend = isFriend(store.get(), profileId);
    setIcon(friend ? 'fa-user-check' : 'fa-user-plus');
    label.textContent = friend ? (confirming ? 'Remove?' : 'Friends') : 'Add Friend';
    button.classList.toggle('zcf-is-friend', friend);
    button.classList.toggle('text-grey-4', !friend);
    button.title = friend ? 'Click to remove from friends' : 'Add to your friends list';
  }

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = profileId;
    if (id === null) return;
    if (isFriend(store.get(), id)) {
      if (confirming) {
        confirming = false;
        clearTimeout(confirmTimer);
        actions.removeFriend(id);
      } else {
        confirming = true;
        confirmTimer = setTimeout(() => {
          confirming = false;
          refresh();
        }, CONFIRM_MS);
      }
      refresh();
      return;
    }
    const r = await players.get(id);
    const data = r.ok && r.data ? r.data : {};
    const username = typeof data.username === 'string' && data.username ? data.username : `#${id}`;
    actions.addFriend({ id, username, avatar: typeof data.avatar === 'string' ? data.avatar : null });
    toast(`${username} added to friends`);
  }

  // Returns true once there is nothing left to do on this page (inserted, or it's our own profile).
  function tryInsert() {
    if (profileId === null) return true;
    if (wrap && wrap.isConnected) return true;
    if (findButton('fa-cog', /^settings$/i)) return true;
    const mail = findButton('fa-envelope', /^mail$/i);
    const trade = findButton('fa-exchange', /^trade$/i);
    const block = findButton('fa-ban', /^(un)?block$/i);
    const template = mail || block;
    if (!template || !template.parentElement) return false;

    wrap = template.parentElement.cloneNode(true);
    wrap.classList.add('zcf-profile-btn');
    button = wrap.querySelector('.q-btn');
    button.removeAttribute('href');
    button.removeAttribute('to');
    for (const c of [...button.classList]) if (/^text-/.test(c)) button.classList.remove(c);
    button.classList.add('text-grey-4');
    iconEl = button.querySelector('i');
    label = button.querySelector('.block') || button.querySelector('.q-btn__content span:last-child');
    if (!label) {
      label = doc.createElement('span');
      label.className = 'block';
      button.querySelector('.q-btn__content').appendChild(label);
    }
    button.addEventListener('click', safe('profile-button-click', onClick));

    if (mail && trade) trade.parentElement.after(wrap);
    else if (mail) mail.parentElement.before(wrap);
    else block.parentElement.after(wrap);
    confirming = false;
    refresh();
    return true;
  }

  function stopWatching() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(warnTimer);
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  }

  function onRoute(path) {
    stopWatching();
    if (wrap) wrap.remove();
    wrap = null;
    button = null;
    const m = PROFILE_PATH.exec(path);
    profileId = m ? Number(m[1]) : null;
    if (profileId === null) return;
    tryInsert();
    // The game re-renders the button row while a profile loads, so keep watching while we're on this page.
    observer = new win.MutationObserver(() => {
      if (frame || (wrap && wrap.isConnected)) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        safe('profile-button-insert', tryInsert)();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    warnTimer = setTimeout(() => {
      if (!wrap && !findButton('fa-cog', /^settings$/i)) warnOnce('profile-buttons-not-found', path);
    }, 10000);
  }

  function destroy() {
    stopWatching();
    clearTimeout(confirmTimer);
    if (wrap) wrap.remove();
    wrap = null;
    button = null;
    profileId = null;
  }

  return { onRoute, refresh, tryInsert, destroy };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/ui/profile-button.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/profile-button.js test/ui/profile-button.test.js
git commit -m "feat: add Add Friend button to player profiles"
```

---

### Task 22: Chat-name "+ friend" action

**Files:**
- Create: `src/ui/chat-names.js`
- Test: `test/ui/chat-names.test.js`

One delegated `mouseover` listener on `document` handles this, with no per-message work. A single shared button moves to just after the hovered `.sender-name`. It's hidden for your own messages, existing friends, and our own `.zcf` windows. Chat names carry no player ID, so a click resolves the name with `findPlayer` and only adds on an exact match.

- [ ] **Step 1: Write the failing test**

`test/ui/chat-names.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatNames } from '../../src/ui/chat-names.js';
import { addFriend } from '../../src/state.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { makeServices } from './services.js';
import { flush } from '../helpers.js';

function hover(name) {
  const el = [...document.querySelectorAll('.sender-name')].find((n) => n.textContent === name);
  el.parentElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return el;
}

describe('chat names', () => {
  let chat;
  let services;
  beforeEach(() => {
    document.body.innerHTML = DOCK_HTML;
    services = makeServices();
    chat = createChatNames({ ...services, myName: 'Me' });
    services.store.subscribe(() => chat.refresh());
    chat.start();
  });
  afterEach(() => chat.stop());

  it('shows "+ friend" after the hovered sender name', () => {
    const name = hover('Gravedigger');
    expect(name.nextSibling).toBe(chat.button);
    hover('Nyx');
    expect(document.querySelectorAll('.zcf-addname')).toHaveLength(1);
  });

  it('hides it for your own messages and for existing friends', () => {
    hover('Gravedigger');
    hover('Me');
    expect(chat.button.isConnected).toBe(false);
    services.store.update((s) => addFriend(s, { id: 3, username: 'nyx' }, 0));
    hover('Nyx');
    expect(chat.button.isConnected).toBe(false);
  });

  it('ignores our own DM windows', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="chat-container zcf"><div class="msg-cont"><span class="sender-name">Spike</span></div></div>');
    hover('Spike');
    expect(chat.button.isConnected).toBe(false);
  });

  it('adds the exact match found by name', async () => {
    services.players.resolveExact = vi.fn().mockResolvedValue({ id: 3, username: 'Nyx', avatar: null });
    hover('Nyx');
    chat.button.click();
    await flush();
    expect(services.players.resolveExact).toHaveBeenCalledWith('Nyx');
    expect(services.store.get().friends[3].username).toBe('Nyx');
    expect(services.toast).toHaveBeenCalledWith('Nyx added to friends');
  });

  it('reports names it cannot find', async () => {
    services.players.resolveExact = vi.fn().mockResolvedValue(null);
    hover('Gravedigger');
    chat.button.click();
    await flush();
    expect(services.toast).toHaveBeenCalledWith("Couldn't find Gravedigger", { error: true });
    expect(services.store.get().friends).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/ui/chat-names.test.js`
Expected: FAIL, because `../../src/ui/chat-names.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/ui/chat-names.js`**

`src/ui/chat-names.js`:

```js
// "+ friend" next to a sender's name in the game's Global/Faction chat, via one delegated listener.
import { h, icon } from './dom.js';
import { safe } from '../util.js';

export function createChatNames({ doc = document, store, myName, players, actions, toast }) {
  let currentName = null;
  let busy = false;
  let friendNames = new Set();

  const btn = h('button', { class: 'zcf-addname', type: 'button', title: 'Add friend' }, icon('user-plus'), ' friend');

  function refresh() {
    friendNames = new Set(Object.values(store.get().friends).map((f) => String(f.username).toLowerCase()));
    if (currentName && friendNames.has(currentName.toLowerCase())) btn.remove();
  }

  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  btn.addEventListener('click', safe('chat-add-click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const name = currentName;
    if (!name || busy) return;
    busy = true;
    try {
      const p = await players.resolveExact(name);
      if (!p) {
        toast(`Couldn't find ${name}`, { error: true });
        return;
      }
      actions.addFriend(p);
      toast(`${p.username} added to friends`);
      btn.remove();
    } finally {
      busy = false;
    }
  }));

  const onOver = safe('chat-names-over', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function' || btn.contains(t)) return;
    const row = t.closest('.msg-cont');
    if (!row) return;
    const container = row.closest('.chat-container');
    if (!container || container.classList.contains('zcf')) return;
    const nameEl = row.querySelector('.sender-name');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    if (!name || name.toLowerCase() === String(myName).toLowerCase() || friendNames.has(name.toLowerCase())) {
      btn.remove();
      return;
    }
    currentName = name;
    if (nameEl.nextSibling !== btn) nameEl.after(btn);
  });

  return {
    button: btn,
    refresh,
    start() {
      refresh();
      doc.addEventListener('mouseover', onOver);
    },
    stop() {
      doc.removeEventListener('mouseover', onOver);
      btn.remove();
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/ui/chat-names.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/chat-names.js test/ui/chat-names.test.js
git commit -m "feat: add + friend action on chat sender names"
```

---

### Task 23: App wiring and polling policy

**Files:**
- Create: `src/app.js`
- Test: `test/app.test.js`

The polling policy (spec §6):

| Poller | Interval |
|---|---|
| threads (`getChats`) | 15s, or 5s for 5 minutes after any DM activity |
| active expanded DM (`getNewMessages`) | 2s |
| other expanded DMs | fetch only when the thread poll shows they changed |
| chat info | 60s while any DM is expanded |
| presence | 60s while the Friends window is open |

Every poller pauses while the tab is hidden, and everything stops on an `auth` error until the next page change finds you logged in again. On phones, opening one of our windows minimizes the game's open chat, and opening a game chat collapses ours.

- [ ] **Step 1: Write the failing test**

`test/app.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, INTERVALS } from '../src/app.js';
import { storageKey } from '../src/store.js';
import { DOCK_HTML, wireGameHeaders } from './fixtures/game-dom.js';
import { fakeApi, memoryStorage, rawThread, rawMsg, flush } from './helpers.js';

const ME = 1;
const SPIKE = 5;

function withFriend() {
  return memoryStorage({ [storageKey(ME)]: JSON.stringify({ v: 1, friends: { [SPIKE]: { id: SPIKE, username: 'Spike' } } }) });
}

describe('app', () => {
  let app;
  beforeEach(() => {
    document.body.innerHTML = DOCK_HTML;
    wireGameHeaders();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  });
  afterEach(() => {
    if (app) app.destroy();
    app = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('puts the Friends tab into the game dock, left of the game chats', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    const dock = document.querySelector('.chat-containers');
    const first = dock.firstElementChild;
    expect(first.className).toBe('zcf-root');
    expect(first.querySelector('.zcf-friends.chat-container.chat-minimized')).not.toBeNull();
    expect(first.nextElementSibling.classList.contains('faction-chat')).toBe(true);
  });

  it('pops up a friend DM from the thread poll, then loads it and clears the badge when expanded', async () => {
    const api = fakeApi({
      getChats: vi.fn().mockResolvedValue({ ok: true, data: [rawThread(SPIKE, { username: 'Spike', newMail: 1, lastReply: '2026-09-28 14:02:00' })] }),
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, SPIKE, 'you still need those nails?', '2026-09-28 14:02:00')] }),
    });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    await flush();
    const tab = document.querySelector('.zcf-dm');
    expect(tab.classList.contains('chat-minimized')).toBe(true);
    expect(tab.querySelector('.unread-badge').textContent).toBe('1');
    expect(document.querySelector('.zcf-friends .unread-badge').textContent).toBe('1');
    expect(api.getChatMessages).not.toHaveBeenCalled();

    tab.querySelector('.chat-header').click();
    await flush();
    await flush();
    expect(api.getChatMessages).toHaveBeenCalledWith(SPIKE, 1, 10);
    expect(tab.querySelector('.zcf-log').textContent).toContain('you still need those nails?');
    expect(app.store.get().threads[SPIKE].unread).toBe(0);
  });

  it('polls threads every 15s when idle and every 5s after DM activity', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getChats).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsIdle);
    expect(api.getChats).toHaveBeenCalledTimes(2);
    app.actions.openDm(SPIKE, { expand: true });
    await vi.advanceTimersByTimeAsync(0);
    await app.conversations.acquire(SPIKE).send('hi');
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsChatting);
    expect(api.getChats).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(INTERVALS.threadsChatting);
    expect(api.getChats).toHaveBeenCalledTimes(4);
  });

  it('polls only the active expanded DM every 2s', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: withFriend() });
    app.actions.openDm(SPIKE, { expand: true });
    await vi.advanceTimersByTimeAsync(0);
    const before = api.getNewMessages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVALS.activeDm * 3);
    expect(api.getNewMessages.mock.calls.length - before).toBe(3);
    app.actions.minimizeDm(SPIKE);
    await vi.advanceTimersByTimeAsync(INTERVALS.activeDm * 3);
    expect(api.getNewMessages.mock.calls.length - before).toBe(3);
  });

  it('stops polling when the session ends', async () => {
    vi.useFakeTimers();
    const api = fakeApi({ getChats: vi.fn().mockResolvedValue({ ok: false, kind: 'auth' }) });
    app = createApp({ api, playerId: ME, playerName: 'Me', storage: memoryStorage() });
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.getChats).toHaveBeenCalledTimes(1);
  });

  it('on phones, opening a DM minimizes the open game chat', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {} }));
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: withFriend() });
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(false);
    app.actions.openDm(SPIKE, { expand: true });
    expect(document.querySelector('.general-chat').classList.contains('chat-minimized')).toBe(true);
    document.querySelector('.general-chat .chat-header').click();
    await flush();
    expect(app.store.get().dock.dms[0].open).toBe(false);
    delete window.matchMedia;
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/app.test.js`
Expected: FAIL, because `../src/app.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/app.js`**

`src/app.js`:

```js
// Wires the modules together: store, pollers, dock UI, profile button and chat-name action.
import { createStore } from './store.js';
import { createRouter } from './router.js';
import { createPlayers } from './players.js';
import { createPresence } from './presence.js';
import { createConversations } from './conversation.js';
import { createInbox } from './inbox.js';
import { makePoller } from './poller.js';
import { exportFriends, parseImport } from './backup.js';
import {
  addFriend,
  removeFriend,
  updateFriendInfo,
  markSeen,
  openDm,
  setDmOpen,
  closeDm,
  setFriendsOpen,
  collapseAll,
} from './state.js';
import { createDock } from './ui/dock.js';
import { createDockView } from './ui/dock-view.js';
import { createToaster } from './ui/toast.js';
import { createProfileButton } from './ui/profile-button.js';
import { createChatNames } from './ui/chat-names.js';

export const CHATTING_MS = 5 * 60 * 1000;
export const INTERVALS = { threadsIdle: 15000, threadsChatting: 5000, activeDm: 2000, dmInfo: 60000, presence: 60000 };

export function createApp({ api, playerId, playerName, doc = document, win = window, storage = win.localStorage, now = () => Date.now() }) {
  const store = createStore({ playerId, storage, win, now });
  const router = createRouter({ win, doc });
  const toast = createToaster(doc);
  const players = createPlayers({ api, now });
  let stopped = false;
  let activeDmId = null;
  let chattingUntil = 0;

  const isChatting = () => now() < chattingUntil;
  const dmEntry = (id) => store.get().dock.dms.find((d) => d.id === id);
  const isExpanded = (id) => !!(dmEntry(id) && dmEntry(id).open);
  const expandedIds = () => store.get().dock.dms.filter((d) => d.open).map((d) => d.id);

  function syncFriendInfo(id, info) {
    const f = store.get().friends[id];
    if (!f || !info) return;
    const nameChanged = typeof info.username === 'string' && info.username && info.username !== f.username;
    const avatarChanged = typeof info.avatar === 'string' && info.avatar && info.avatar !== f.avatar;
    if (nameChanged || avatarChanged) store.update((s) => updateFriendInfo(s, id, info));
  }

  const presence = createPresence({ fetchProfile: (id) => api.getProfile(id), onProfile: syncFriendInfo, now });

  function markChatting() {
    const was = isChatting();
    chattingUntil = now() + CHATTING_MS;
    if (!was) threadsPoller.reschedule();
  }

  // Clears the unread badge once an expanded DM has loaded; skips the write when nothing changed.
  function markSeenIfNeeded(id) {
    if (!isExpanded(id)) return;
    const c = conversations.get(id);
    if (!c || !c.state.loaded) return;
    const seen = Math.max(c.latestTs(), inbox.lastReply(id) || 0);
    const t = store.get().threads[id];
    if (!t || t.unread > 0 || (t.lastSeenReply || 0) < seen) store.update((s) => markSeen(s, id, seen));
  }

  const conversations = createConversations({
    api,
    myId: playerId,
    onActivity: () => markChatting(),
    onInfo: (id, info) => {
      presence.set(id, info);
      syncFriendInfo(id, info);
    },
    onChange: (id) => markSeenIfNeeded(id),
  });

  const inbox = createInbox({
    api,
    store,
    myId: playerId,
    now,
    onActivity: () => markChatting(),
    // Expanded DMs other than the active one only fetch when the thread list shows they changed.
    onThreadChanged: (id) => {
      if (id === activeDmId || !isExpanded(id)) return;
      const c = conversations.get(id);
      if (c) c.fetchNew();
    },
  });

  function pickActive() {
    if (activeDmId && isExpanded(activeDmId)) return activeDmId;
    const open = store.get().dock.dms.filter((d) => d.open).sort((a, b) => b.lastUsed - a.lastUsed);
    activeDmId = open.length ? open[0].id : null;
    return activeDmId;
  }

  const onAuthLost = () => stopAll();
  const threadsPoller = makePoller({
    run: () => inbox.poll(),
    interval: () => (isChatting() ? INTERVALS.threadsChatting : INTERVALS.threadsIdle),
    onAuthLost,
    doc,
  });
  const activeDmPoller = makePoller({
    run: async () => {
      const id = pickActive();
      if (!id) return { ok: true };
      const r = await conversations.acquire(id).fetchNew();
      markSeenIfNeeded(id);
      return r;
    },
    interval: INTERVALS.activeDm,
    onAuthLost,
    doc,
  });
  const infoPoller = makePoller({
    run: async () => {
      for (const id of expandedIds()) await conversations.acquire(id).refreshInfo();
      return { ok: true };
    },
    interval: INTERVALS.dmInfo,
    doc,
  });
  const presencePoller = makePoller({
    run: () => {
      presence.refresh(Object.keys(store.get().friends).map(Number));
      return { ok: true };
    },
    interval: INTERVALS.presence,
    doc,
  });
  const pollers = [threadsPoller, activeDmPoller, infoPoller, presencePoller];

  function syncPollers() {
    if (stopped) return;
    const s = store.get();
    const anyOpen = s.dock.dms.some((d) => d.open);
    for (const [p, on] of [[activeDmPoller, anyOpen], [infoPoller, anyOpen], [presencePoller, s.dock.friendsOpen]]) {
      if (on) p.start();
      else p.stop();
    }
  }

  function stopAll() {
    stopped = true;
    for (const p of pollers) p.stop();
  }

  // After the session ends (errorCode 1), try again on the next page change.
  async function resumeIfLoggedIn() {
    if (!stopped) return;
    const r = await api.getStats();
    if (!r.ok || !r.data || Number(r.data.id) !== Number(playerId)) return;
    stopped = false;
    threadsPoller.start();
    syncPollers();
  }

  const dock = createDock({ doc, win, onGameChatOpened: () => store.update((s) => collapseAll(s)) });

  const actions = {
    addFriend(p) {
      store.update((s) => addFriend(s, p, now()));
      presence.refresh([p.id]);
    },
    removeFriend: (id) => store.update((s) => removeFriend(s, id)),
    openDm(id, { expand = true, username, avatar } = {}) {
      const small = dock.isSmall();
      store.update((s) => openDm(s, id, { expand, exclusive: small && expand, now: now(), username, avatar }));
      if (expand) {
        activeDmId = id;
        activeDmPoller.poke();
        if (small) dock.minimizeGameChats();
      }
    },
    toggleDm(id) {
      const e = dmEntry(id);
      if (!e) return;
      if (e.open) actions.minimizeDm(id);
      else actions.openDm(id, { expand: true });
    },
    minimizeDm: (id) => store.update((s) => setDmOpen(s, id, false)),
    closeDm(id) {
      store.update((s) => closeDm(s, id));
      if (activeDmId === id) activeDmId = null;
    },
    toggleFriends() {
      const open = !store.get().dock.friendsOpen;
      const small = dock.isSmall();
      store.update((s) => setFriendsOpen(s, open, { exclusive: small }));
      if (open && small) dock.minimizeGameChats();
    },
    setActiveDm(id) {
      if (activeDmId === id) return;
      activeDmId = id;
      activeDmPoller.poke();
    },
    exportFriends: () => exportFriends(store.get(), playerId),
    importFriends(text) {
      const r = parseImport(text, playerId);
      if (!r.ok) return r;
      const added = store.update((s) => r.friends.reduce((n, f) => n + (addFriend(s, f, now()) ? 1 : 0), 0));
      return { ok: true, added };
    },
  };

  const services = {
    playerId,
    myId: playerId,
    myName: playerName,
    store,
    actions,
    presence,
    players,
    inbox,
    conversations,
    router,
    toast,
    isSmall: dock.isSmall,
  };

  const view = createDockView({ root: dock.root, services });
  const profileButton = createProfileButton({ doc, win, store, actions, players, toast });
  const chatNames = createChatNames({ doc, store, myName: playerName, players, actions, toast });

  store.subscribe(() => {
    view.render();
    syncPollers();
    profileButton.refresh();
    chatNames.refresh();
  });
  presence.subscribe(() => {
    view.friends.scheduleList();
    for (const d of store.get().dock.dms) {
      const w = view.dmWindow(d.id);
      if (w) w.update();
    }
  });
  inbox.subscribe(() => view.friends.scheduleList());
  router.onChange((path) => {
    profileButton.onRoute(path);
    resumeIfLoggedIn();
  });
  const smallQuery = typeof win.matchMedia === 'function' ? win.matchMedia('(max-width: 599.98px)') : null;
  if (smallQuery && smallQuery.addEventListener) smallQuery.addEventListener('change', () => view.render());

  dock.start();
  view.render();
  profileButton.onRoute(router.path);
  chatNames.start();
  threadsPoller.start();
  syncPollers();

  return {
    store,
    actions,
    view,
    conversations,
    stop: stopAll,
    destroy() {
      stopAll();
      for (const p of pollers) p.destroy();
      dock.destroy();
      profileButton.destroy();
      chatNames.stop();
      store.destroy();
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/app.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app.js test/app.test.js
git commit -m "feat: wire app together with adaptive polling policy"
```

---

### Task 24: Entry point and build

**Files:**
- Create: `src/main.js`, `src/index.js`, `build.mjs`, `dist/zed-city-friends.user.js` (generated)
- Test: `test/main.test.js`, `test/build.test.js`

- [ ] **Step 1: Write the failing tests**

`test/main.test.js`:

`test/main.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForPlayer, boot } from '../src/main.js';
import { fakeApi } from './helpers.js';

describe('main', () => {
  afterEach(() => {
    delete window.__zcfStarted;
    document.getElementById('zcf-styles')?.remove();
  });

  it('waits until getStats returns a logged-in player', async () => {
    const api = fakeApi({
      getStats: vi.fn()
        .mockResolvedValueOnce({ ok: false, kind: 'auth' })
        .mockResolvedValueOnce({ ok: true, data: { id: 42, username: 'TePuu' } }),
    });
    expect(await waitForPlayer(api, { retryMs: 0 })).toEqual({ id: 42, username: 'TePuu' });
    expect(api.getStats).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxTries', async () => {
    const api = fakeApi({ getStats: vi.fn().mockResolvedValue({ ok: false, kind: 'auth' }) });
    expect(await waitForPlayer(api, { retryMs: 0, maxTries: 2 })).toBeNull();
  });

  it('starts only once per page and injects styles', async () => {
    document.body.innerHTML = '';
    const api = fakeApi();
    const app = await boot({ api });
    expect(app).not.toBeNull();
    expect(document.getElementById('zcf-styles')).not.toBeNull();
    expect(await boot({ api })).toBeNull();
    app.destroy();
  });
});
```

`test/build.test.js` runs in the Node environment (esbuild does not run inside jsdom):

`test/build.test.js`:

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { bundle, HEADER } from '../build.mjs';

describe('build', () => {
  it('produces one userscript with the metadata header, under the size budget', async () => {
    const result = await bundle({ write: false });
    expect(result.outputFiles).toHaveLength(1);
    const text = result.outputFiles[0].text;
    expect(text.startsWith(HEADER)).toBe(true);
    expect(text).toContain('// @match        https://www.zed.city/*');
    expect(text).toContain('// @grant        none');
    expect(text).not.toMatch(/\bimport\s*[{*]/);
    // ~85 KB readable today (Greasy Fork forbids minified code); the cap catches accidental bloat.
    expect(Buffer.byteLength(text)).toBeLessThan(120 * 1024);
  }, 30000);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run test/main.test.js test/build.test.js`
Expected: FAIL, because `../src/main.js` and `../build.mjs` don't exist yet.

- [ ] **Step 3: Implement `src/main.js`**

`src/main.js`:

```js
// Userscript entry: wait until the player is logged in, then start the app once.
import { createApi } from './api.js';
import { createApp } from './app.js';
import { injectStyles } from './ui/styles.js';
import { warnOnce } from './util.js';

const RETRY_MS = 15000;

export async function waitForPlayer(api, { retryMs = RETRY_MS, maxTries = Infinity } = {}) {
  for (let i = 0; i < maxTries; i += 1) {
    const r = await api.getStats();
    if (r.ok && r.data && Number(r.data.id) > 0) {
      return { id: Number(r.data.id), username: String(r.data.username || '') };
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  return null;
}

export async function boot({ win = window, doc = document, api = createApi() } = {}) {
  if (win.__zcfStarted) return null;
  win.__zcfStarted = true;
  try {
    const player = await waitForPlayer(api);
    if (!player) return null;
    injectStyles(doc);
    return createApp({ api, playerId: player.id, playerName: player.username, doc, win });
  } catch (e) {
    warnOnce('boot', e);
    return null;
  }
}
```

- [ ] **Step 4: Implement `src/index.js`**

`src/index.js`:

```js
import { boot } from './main.js';

boot();
```

- [ ] **Step 5: Implement `build.mjs`**

`build.mjs`:

```js
// Bundles src/ into one userscript: dist/zed-city-friends.user.js
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export const OUTFILE = 'dist/zed-city-friends.user.js';

export const HEADER = `// ==UserScript==
// @name         Zed City Friends & DMs
// @namespace    zed-city-friends
// @version      ${pkg.version}
// @description  ${pkg.description}
// @match        https://www.zed.city/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
`;

export function bundle({ write = true } = {}) {
  return build({
    absWorkingDir: root,
    entryPoints: ['src/index.js'],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    banner: { js: HEADER },
    outfile: OUTFILE,
    write,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await bundle();
  console.log(`Built ${OUTFILE}`);
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/main.test.js test/build.test.js`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: `Test Files  24 passed (24)` and `Tests  118 passed (118)`

- [ ] **Step 8: Build the userscript**

Run: `npm run build && head -10 dist/zed-city-friends.user.js && wc -c dist/zed-city-friends.user.js`
Expected: `Built dist/zed-city-friends.user.js`. The file starts with `// ==UserScript==`, `// @name         Zed City Friends & DMs`, `// @match        https://www.zed.city/*` and `// @grant        none`, and is about 85,000 bytes.

- [ ] **Step 9: Commit**

```bash
git add src/main.js src/index.js build.mjs test/main.test.js test/build.test.js dist/zed-city-friends.user.js
git commit -m "feat: add entry point and esbuild userscript build"
```

---

### Task 25: README and manual test checklist

**Files:**
- Create: `README.md`, `docs/manual-test.md`

- [ ] **Step 1: Create `README.md`**

`README.md`:

````markdown
# Zed City Friends & DMs

A userscript that adds a **friends list** and **Torn-style DM chat windows** to [Zed City](https://www.zed.city)'s bottom-right chat dock, next to the Global and Faction chats.

- **Friends tab.** Your friends with live online status, a filter, a Recent section for other conversations, and a person-plus button to find and add players.
- **DM windows.** One window per conversation, styled like the game's chat. Minimized DMs become avatar tabs with unread badges, and a friend's new message pops up as a tab.
- **Add Friend button** on player profiles (between Trade and Mail), plus a **"+ friend"** action next to names in Global and Faction chat.

DMs are sent through the game's own **Mail** system. The other player gets your messages in their normal inbox, whether or not they have the script. Nothing leaves `zed.city`: there's no external server, and your friends list is stored in your browser, separately for each player account.

## Install

1. Install a userscript manager, such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open `dist/zed-city-friends.user.js` and install it (or paste it into a new script).
3. Reload www.zed.city.

## How often it checks for messages

Zed City doesn't push new mail to the browser, so the script checks on a timer:

| What you're doing | New messages appear within | Requests / minute |
|---|---|---|
| In a DM conversation | ~2s in that window, ~5s elsewhere | ~43 (the game's own inbox page: 60) |
| Chatted in the last 5 minutes | ~5s | 12 |
| Idle | ~15s (the game's envelope badge: 60s) | 4 |
| Game tab in the background | checked the moment you return | 0 |

## Backup

In the Friends window, **⋯ → Export friends** downloads your list as JSON. **Import friends** merges a file back in; it only adds friends and never removes any.

## Development

```bash
npm install
npm test          # Vitest + jsdom unit tests
npm run build     # writes dist/zed-city-friends.user.js
```

`src/` is plain ES modules with no framework. `build.mjs` bundles it with esbuild into one readable userscript.

| Path | Responsibility |
|---|---|
| `src/api.js` | The only code that talks to `api.zed.city` (CSRF, error kinds; never redirects) |
| `src/store.js`, `src/state.js` | The only code that touches storage, plus pure state mutators |
| `src/mail.js`, `src/time.js` | Message/thread normalization, grouping, UTC time formatting |
| `src/conversation.js` | One DM thread: paging, new messages, optimistic sends |
| `src/inbox.js` | Thread-list polling, unread badges, friend pop-ups |
| `src/poller.js` | Visibility-aware timers with backoff |
| `src/presence.js`, `src/players.js` | Online status cache, player search/lookup |
| `src/router.js` | Page-change events and navigation via the game's router |
| `src/app.js` | Wiring and polling policy |
| `src/ui/*` | Dock mounting, Friends window, DM windows, profile button, chat-name action |

Design spec: `docs/superpowers/specs/2026-09-28-zed-city-friends-design.md`

## For the Zed City devs

Everything here maps onto the game's own code:

- Each window (`ui/friends-window.js`, `ui/dm-window.js`) is a Vue SFC waiting to happen. The markup already uses the dock's `.chat-container` / `.chat-header` / `.chat-content` classes.
- `store.js` / `state.js` become a Pinia store. The dock logic in `ui/dock.js` goes away once the windows render inside the layout component.
- Only the existing endpoints are used: `getChats`, `getChatInfo`, `getChatMessages`, `getNewMessages`, `sendMail`, `getProfile`, `findPlayer`.

Server-side changes that would remove the client-side workarounds:

1. **Push new mail over the existing socket.io connection** (for example a `new-mail` event), instead of the client polling `getChats` and `getNewMessages`.
2. **A `friends` table** with requests and approval, synced across devices, instead of per-browser storage.
3. **A batched presence endpoint** (online / last active for a list of ids), instead of one `getProfile` per friend.
````

- [ ] **Step 2: Create `docs/manual-test.md`**

`docs/manual-test.md`:

````markdown
# Manual test checklist (live game)

Run these on www.zed.city, logged in, with the built `dist/zed-city-friends.user.js` installed. Keep DevTools open, with the Network tab filtered to `api.zed.city` and the Console filtered to `[ZCF]`.

## A. Verify the API assumptions (spec §12)

Record the answers in this file under "Findings", and fix the code only if an answer differs from the assumption.

1. **`getChats` → `new_mail`:** is it a count or a boolean? (Look at the Response for `getChats?page=1` with an unread thread.) Either works; note which.
2. **`getChats` → `other_user.avatar`:** is it present? If not, Recent rows show the default avatar until a DM is opened. That's acceptable.
3. **`getChatMessages` order:** is each page oldest → newest? The code sorts by `id`, so it works either way; note it.
4. **`getNewMessages`:** does calling it mark the thread read in the game's inbox?
5. **`sent_at` / `last_reply` format:** an ISO string, `YYYY-MM-DD HH:mm:ss`, or unix time? All three are parsed as UTC.
6. **`getChatMessages?offset=1`:** does it mark the thread read? Open a DM from the dock, then check the game's envelope badge after its next 60s refresh.
7. **Navigation:** in the Console, `document.querySelector('#q-app').__vue_app__.config.globalProperties.$router` should be defined. Clicking "Profile" in the Friends list should change page without a full reload.

## B. Feature checks

1. The dock shows the Friends tab (green two-person icon) to the left of Faction/Global. Minimizing and expanding looks like the game's chats.
2. **Profile page of another player:** `ADD FRIEND` sits between `TRADE` and `MAIL`, with the same outline style. Click it → it becomes a green `FRIENDS`. Click → `Remove?` → click again → removed.
3. **Own profile:** no button. A blocked player (Trade/Mail hidden): the button sits after Block.
4. **Global chat:** hovering a message shows `+ friend` after the name. It's hidden for your own messages and for existing friends. Click it → toast "X added to friends".
5. **Friends window:** the filter narrows the list with highlights. The person-plus pop-out finds players by name and by ID. **Add** changes to **✓ Friend**. Esc closes it.
6. **With a second account:** send a DM to the first account. Within ~15s, a minimized avatar tab with a badge appears on the first account. The game's inbox still shows the thread as unread until the DM is expanded.
7. Expand the DM: the history loads, and scrolling up loads older messages. Replies from the second account show within ~2s. Enter sends; Shift+Enter adds a new line.
8. Go offline (DevTools → Network → Offline) and send a message: it shows "Failed to send · Retry". Go back online → Retry works.
9. **Reload the page:** the friends list and open or minimized DM tabs come back.
10. **Responsive mode (375px wide):** only one window is open at a time. Opening a DM minimizes Global chat, and opening Global minimizes the DM.
11. **Traveling or exploring:** an open DM shows "Mail is unavailable while you are traveling/exploring."
12. **Switch to another browser tab for a minute:** the Network tab shows no `api.zed.city` requests from the script until you return.
13. **Export**, then remove a friend, then **Import**: the friend is back. Importing a file from another account is rejected.

## Findings

_(fill in during the run)_
````

- [ ] **Step 3: Commit**

```bash
git add README.md docs/manual-test.md
git commit -m "docs: add README with dev-adoption notes and manual test checklist"
```

---

### Task 26: Live verification with the user

This needs the user, because it has to run in their logged-in browser.

- [ ] **Step 1:** Ask the user to install `dist/zed-city-friends.user.js` in Tampermonkey or Violentmonkey and reload www.zed.city.
- [ ] **Step 2:** Walk them through `docs/manual-test.md` section A. For each item, ask them to paste the relevant Network response or Console output, and record the answers under "Findings".
- [ ] **Step 3:** For any assumption that turned out wrong, make a targeted fix with a failing test first, in the module named in spec §12. Then re-run `npm test` and `npm run build`.
- [ ] **Step 4:** Walk through section B. Fix issues one at a time, test first.
- [ ] **Step 5:** Commit the findings, fixes and rebuilt `dist/`:

```bash
git add docs/manual-test.md src test dist
git commit -m "fix: adjust to live API findings"
```
