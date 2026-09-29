# Zed City Friends 0.6.0 (Notifications, Pins, Phones, Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 0.6.0 from `docs/superpowers/specs/2026-09-29-notifications-and-polish-design.md`: desktop notifications (off by default, Friends-only switch, slow background check), an unread count in the tab title, pinned chats, the phone dock with the open window on its own row, a local-time option, and the fixes the 0.5.0 review logged.

**Architecture:** Two new small modules (`src/notify.js`, `src/ui/title-count.js`) plus changes to existing ones. All new options live in the settings document (`src/settings.js`), which already syncs across tabs. The background check is a `hiddenInterval` option on the existing poller, used only by the thread poller and only while notifications are on and permitted.

**Tech Stack:** Vanilla ES modules, esbuild, Vitest + jsdom, headless Edge preview (`tools/preview`).

---

## Conventions

- Branch `notify-and-polish` (created from `main` at 0.5.2). Commit as "Zed City Friends" with the usual trailer. Push only when the user says so.
- Files are CRLF on disk: edit with the Edit tool or the scratchpad `edit-lib.cjs` helper, never raw `\n` string replacement.
- TDD per task; commit per group; one review at the end; fix Critical/Important only.

## File map

| File | Change |
|---|---|
| `src/settings.js` | `pinned`, `notify`, `notifyFriendsOnly`, `titleCount`, `localTime`; `togglePinned`, `setFlag`, `MAX_PINNED` |
| `src/poller.js` | `hiddenInterval` |
| `src/notify.js` | new: `createNotifier` |
| `src/ui/title-count.js` | new: `createTitleCount` |
| `src/pm-view.js` | pinned first, stub rows |
| `src/ui/pm-window.js` | pin buttons; fixes 1, 2, 6, 11 |
| `src/time.js`, `src/mail.js` | `local` option (`dayKey`, `formatClock`, `formatMessageTime`, `formatDayLabel`, `buildLog`) |
| `src/ui/dm-window.js` | local time, redraw on change |
| `src/ui/settings-window.js` | Notifications and Display sections; focus keys on persistent controls |
| `src/sound.js` | `play(name, { fromUser })` |
| `src/ui/chat-custom/index.js`, `menu.js` | resize cost, menu focus and position |
| `src/chat-custom/user-style.js`, `src/ui/styles.js` | touch-action, phone dock, pin buttons, settings rows, skull row |
| `src/ui/enemy-marks.js`, `src/ui/profile-button.js`, `src/ui/dock-view.js`, `src/ui/friends-page.js` | fixes 9, 8, 7, 13 |
| `src/app.js` | notifier, background interval, title count, new actions and services |
| `src/whats-new.js`, `package.json`, `dist/` | 0.6.0 |

---

### Task 1: Settings fields

- [ ] **Tests** (`test/settings.test.js`): `normalizeSettings({ v: 1 })` equals `defaultSettings()`, which now includes `pinned: []`, `notify: false`, `notifyFriendsOnly: false`, `titleCount: true`, `localTime: false`; bad values normalize (`notify: 'yes'` → false, `titleCount: 0` → false only when `=== false`… i.e. `titleCount` is `doc.titleCount !== false`; `pinned` like `muted` capped at `MAX_PINNED` = 20); `togglePinned` adds newest first, removes, and returns `false` at the cap without changing the list; `setFlag` sets only the four known flags. Update the existing exact-shape expectation in `'normalizes, and rejects documents that are not ours'` to include the new defaults.
- [ ] **Implement** in `src/settings.js`:

```js
export const MAX_PINNED = 20;
export const FLAGS = ['notify', 'notifyFriendsOnly', 'titleCount', 'localTime'];

export function defaultSettings() {
  return { v: 1, pmTab: 'chats', sound: 'off', chats: {}, muted: [], pinned: [], notify: false, notifyFriendsOnly: false, titleCount: true, localTime: false };
}

// Positive integer ids, no duplicates, at most `max` (the first ones win: newest first).
function normalizeIdList(list, max) { /* body of today's normalizeMuted with MAX_MUTED → max */ }
export const normalizeMuted = (list) => normalizeIdList(list, MAX_MUTED);

// in normalizeSettings:
    pinned: normalizeIdList(doc.pinned, MAX_PINNED),
    notify: doc.notify === true,
    notifyFriendsOnly: doc.notifyFriendsOnly === true,
    titleCount: doc.titleCount !== false,
    localTime: doc.localTime === true,

export const isPinned = (s, id) => s.pinned.includes(Number(id));

// Pins newest first; returns false (and changes nothing) when the list is full.
export function togglePinned(s, id) {
  const n = toId(id);
  if (!n) return true;
  if (s.pinned.includes(n)) {
    s.pinned = s.pinned.filter((x) => x !== n);
    return true;
  }
  if (s.pinned.length >= MAX_PINNED) return false;
  s.pinned = [n, ...s.pinned];
  return true;
}

export function setFlag(s, key, on) {
  if (FLAGS.includes(key)) s[key] = !!on;
}
```

### Task 2: Poller `hiddenInterval`

- [ ] **Tests** (`test/poller.test.js`): with a doc whose `visibilityState` is `'hidden'`, a poller with `hiddenInterval: () => 60000` runs at start and again every 60s; with `hiddenInterval: () => null` it doesn't run while hidden (today's behavior); going hidden with a hidden interval reschedules at 60s instead of stopping; becoming visible runs at once.
- [ ] **Implement** in `src/poller.js`: add `hiddenInterval = null` to the options, and

```js
  const hiddenMs = () => {
    const v = typeof hiddenInterval === 'function' ? hiddenInterval() : hiddenInterval;
    return typeof v === 'number' && v > 0 ? v : null;
  };
  const canRun = () => visible() || hiddenMs() !== null;

  function schedule(ms) {
    clear();
    if (!active) return;
    if (visible()) timer = setTimeout(tick, ms);
    else if (hiddenMs() !== null) timer = setTimeout(tick, Math.max(ms, hiddenMs()));
  }
```

`tick()` returns early on `!active || !canRun()`; `onVisibility()` becomes: visible → `tick()`; hidden with a hidden interval → `schedule(hiddenMs())`; else `clear()`.

### Task 3: Notifier

<!-- file: src/notify.js -->
```js
// Desktop notifications for new private messages (0.6 spec §1.1). The player turns them on in Chat settings;
// nothing here asks for permission except request(), called from that click.
export function createNotifier({ win = window, onOpen = () => {} } = {}) {
  const N = win.Notification;
  const supported = typeof N === 'function';

  return {
    supported,
    permission: () => (supported ? N.permission : 'unsupported'),
    async request() {
      if (!supported) return 'unsupported';
      if (N.permission !== 'default') return N.permission;
      try {
        const answer = await N.requestPermission();
        return answer || N.permission;
      } catch {
        return N.permission;
      }
    },
    // One notification per player (the tag), so a newer message replaces the older one, and a second game
    // tab's copy replaces the first. Returns the notification, or null when it can't be shown.
    show({ id, title, body, icon }) {
      if (!supported || N.permission !== 'granted') return null;
      let n;
      try {
        n = new N(title, { body, icon, tag: `zcf-dm-${id}` });
      } catch {
        return null;
      }
      n.onclick = () => {
        try {
          win.focus();
        } catch {
          // focusing can be refused; opening the DM still helps
        }
        onOpen(id);
        n.close();
      };
      return n;
    },
  };
}
```

<!-- file: test/notify.test.js -->
```js
import { describe, it, expect, vi } from 'vitest';
import { createNotifier } from '../src/notify.js';

function fakeWin(permission = 'default') {
  const shown = [];
  class N {
    constructor(title, opts) {
      this.title = title;
      this.opts = opts;
      this.close = vi.fn();
      shown.push(this);
    }
  }
  N.permission = permission;
  N.requestPermission = vi.fn(async () => {
    N.permission = 'granted';
    return 'granted';
  });
  return { win: { Notification: N, focus: vi.fn() }, shown, N };
}

describe('notifier', () => {
  it('reports no support without the Notification API', async () => {
    const n = createNotifier({ win: {} });
    expect(n.supported).toBe(false);
    expect(n.permission()).toBe('unsupported');
    expect(await n.request()).toBe('unsupported');
    expect(n.show({ id: 1, title: 'x' })).toBeNull();
  });

  it('asks for permission only when it has not been decided', async () => {
    const { win, N } = fakeWin('default');
    const n = createNotifier({ win });
    expect(await n.request()).toBe('granted');
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
    const denied = fakeWin('denied');
    expect(await createNotifier({ win: denied.win }).request()).toBe('denied');
    expect(denied.N.requestPermission).not.toHaveBeenCalled();
  });

  it('shows one notification per player, and a click focuses the game and opens the DM', () => {
    const { win, shown } = fakeWin('granted');
    const onOpen = vi.fn();
    const n = createNotifier({ win, onOpen });
    n.show({ id: 5, title: 'Spike', body: 'see you at the bunker', icon: 'a.png' });
    expect(shown[0].title).toBe('Spike');
    expect(shown[0].opts).toEqual({ body: 'see you at the bunker', icon: 'a.png', tag: 'zcf-dm-5' });
    shown[0].onclick();
    expect(win.focus).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith(5);
    expect(shown[0].close).toHaveBeenCalled();
  });

  it('shows nothing without permission', () => {
    const { win, shown } = fakeWin('denied');
    expect(createNotifier({ win }).show({ id: 5, title: 'Spike' })).toBeNull();
    expect(shown).toHaveLength(0);
  });
});
```

### Task 4: Title count

<!-- file: src/ui/title-count.js -->
```js
// "(N) " in front of the browser tab's title while there are unread private messages (0.6 spec §1.3). The
// game rewrites the title on every route change, so an observer on <head> puts the prefix back. Only our
// own "(digits) " prefix is ever added or removed, and a write that changes nothing is skipped (no loops).
const PREFIX = /^\(\d+\) /;

export function createTitleCount({ doc = document, win = window } = {}) {
  let want = '';
  let observer = null;

  function apply() {
    const next = want + doc.title.replace(PREFIX, '');
    if (doc.title !== next) doc.title = next;
  }

  function watch() {
    if (observer) return;
    observer = new win.MutationObserver(() => apply());
    observer.observe(doc.head || doc.documentElement, { childList: true, subtree: true, characterData: true });
  }

  return {
    set(count, enabled) {
      want = enabled && count > 0 ? `(${count}) ` : '';
      apply();
      if (want) watch();
    },
    destroy() {
      if (observer) observer.disconnect();
      observer = null;
      want = '';
      apply();
    },
  };
}
```

<!-- file: test/ui/title-count.test.js -->
```js
import { describe, it, expect, afterEach } from 'vitest';
import { createTitleCount } from '../../src/ui/title-count.js';
import { flush } from '../helpers.js';

describe('title count', () => {
  let tc = null;
  afterEach(() => {
    if (tc) tc.destroy();
    tc = null;
  });

  it('puts the unread count in front of the title, and takes it away at zero or when turned off', () => {
    document.title = 'Zed City';
    tc = createTitleCount();
    tc.set(2, true);
    expect(document.title).toBe('(2) Zed City');
    tc.set(5, true);
    expect(document.title).toBe('(5) Zed City');
    tc.set(0, true);
    expect(document.title).toBe('Zed City');
    tc.set(3, false);
    expect(document.title).toBe('Zed City');
  });

  it('puts it back when the game rewrites the title', async () => {
    document.title = 'Zed City';
    tc = createTitleCount();
    tc.set(1, true);
    document.title = 'Inventory | Zed City';
    await flush();
    expect(document.title).toBe('(1) Inventory | Zed City');
  });
});
```

### Task 5: Pinned chats

- [ ] **pm-view tests:** pinned rows come first (newest first among pinned), each row has `pinned`; a pinned id with no thread gets a stub row `{ userId, username, avatar, preview: '', lastReply: null, stub: true }` from `stub(id)` (or `#id`).
- [ ] **pm-view:** `buildChatRows({ page1, older, threads, pinned = [], stub = null })`: after the merge, add a stub for each pinned id missing from `best`; map rows with `pinned: pins.has(userId)`; sort pinned first, then `lastReply` desc, then id.
- [ ] **pm-window tests:** a pin button per Chats row (`.zcf-pm-pin`, `aria-pressed`), clicking calls `actions.togglePin(id)` and doesn't open the DM; pinned rows first with `.zcf-pinned`; a stub row opens the DM.
- [ ] **pm-window:** pass `pinned: settings.get().pinned` and `stub` (name/avatar from friends, dock DMs, enemies) to `buildChatRows`; add to each chat row, after the time:

```js
h('button', {
  class: `zcf-pm-pin${t.pinned ? ' zcf-pinned' : ''}`,
  type: 'button',
  title: t.pinned ? 'Unpin' : 'Pin to the top',
  'aria-label': t.pinned ? `Unpin ${t.username}` : `Pin ${t.username} to the top`,
  'aria-pressed': String(!!t.pinned),
  'data-zcf-focus': `pin:${t.userId}`,
  onclick: (e) => {
    e.stopPropagation();
    actions.togglePin(t.userId);
  },
}, icon('thumbtack'))
```

  and add `t.pinned` to the row signature.
- [ ] **Test services:** `togglePin: vi.fn((id) => settings.update((s) => togglePinned(s, id)))`.
- [ ] **CSS:** `.zcf-pm-pin{flex:none;width:18px;height:18px;display:none;align-items:center;justify-content:center;padding:0;background:none;border:0;color:#ffffff4d;font-size:10px;cursor:pointer}`, shown on `.zcf-row:hover`/`:focus-within`, on `.zcf-pinned` (`color:#f2c037`) and under `@media (hover:none)`.

### Task 6: Local time

- [ ] **time tests:** `dayKey(ts, true)`/`formatClock(ts, true)` use local fields; `formatMessageTime(ts, now, true)` and `formatDayLabel(ts, true)` likewise (tests set `process.env.TZ`-independent expectations by comparing against `new Date(ts).getHours()` etc.).
- [ ] **time.js:** `parts(ts, local)` helper; `dayKey(ts, local = false)`; keep `utcDayKey = (ts) => dayKey(ts, false)`; `formatClock`, `formatMessageTime(ts, now, local)`, `formatDayLabel(ts, local)` take `local`.
- [ ] **mail.js:** `buildLog(messages, { local = false } = {})` groups and labels days with `dayKey(…, local)` / `formatDayLabel(…, local)`.
- [ ] **dm-window:** `const localTime = () => !!(services.isLocalTime && services.isLocalTime());` pass it to `buildLog` and `formatMessageTime`; `update()` redraws the log when it changes (reset `renderedKeys`).
- [ ] **dm-window test:** switching `localTime` redraws times (spy that `formatMessageTime` output uses local hours: compare with `new Date(ts).getHours()`).

### Task 7: Settings window sections

- [ ] **Tests:** a Notifications section with three checkboxes (Desktop notifications, Friends only — disabled while notifications are off, Unread count in the browser tab) calling `setNotify`, `setNotifyFriendsOnly`, `setTitleCount`; a note for `denied` and `unsupported` permission (from `services.notifier.permission()`); a Display section with the Message times select calling `setLocalTime`; focus stays on the sound select across a redraw; ▶ calls `sound.play(name, { fromUser: true })`.
- [ ] **Implement:** persistent controls built once (like the sound select), each with `data-zcf-focus`; `render()` syncs their values and includes the note text in the signature.

### Task 8: App wiring

- [ ] **Tests** (`test/app.test.js`): with notifications on and granted (fake notifier) and `document.hasFocus()` false, a new message notifies once with name, preview and avatar; with focus, none; Friends only skips a non-friend; muted never; `setNotify(true)` with a denied request leaves it off and toasts; the thread poller keeps polling while hidden only with notifications on (fake `visibilityState`); the title shows `(N) ` and drops it when turned off; `togglePin` at the cap toasts.
- [ ] **Implement:** `createApp({ …, notifier: notifierOpt = null })`; in the body `const notifier = notifierOpt || createNotifier({ win, onOpen: (id) => actions.openDm(id, { expand: true }) })`; `INTERVALS.hiddenNotify = 60000`; thread poller `hiddenInterval: () => (settings.get().notify && notifier.permission() === 'granted' ? INTERVALS.hiddenNotify : null)`; `onNewMail(arrived)` plays the sound and calls `notifyNewMail(arrived)` (conditions in spec §1.1, at most 3, newest first, body cut to 120); title count synced on store, inbox and settings changes and at start; actions `setNotify`, `setNotifyFriendsOnly`, `setTitleCount`, `setLocalTime`, `togglePin`; services `notifier`, `isLocalTime`; `destroy()` also destroys the title count and the dock view.

### Task 9: Phone dock (B)

- [ ] **CSS** (phone media block): the two `:has(> .zcf-root > .zcf.zcf-open)` rules from spec §2.1; `.zcf-pm:not(.chat-minimized){height:min(450px,60vh)}`; move the cog-hiding rule into `@supports not selector(:has(a)){…}` so the cog stays in the bubble row where the new layout works.
- [ ] **Tests:** the rules are present; if jsdom's `matches()` supports `:has`, assert via `winner()` that the dock gets `flex-wrap: wrap-reverse` at 400px with a window open and not at 1280px; update the cog test accordingly.

### Task 10: The review fixes (spec §2.3)

Each with a regression test where it's observable:
1. `loadBlocked`: `if (blocked.loading) { if (!more) reloadWanted = true; return; }`, and after a load finishes, `if (reloadWanted) { reloadWanted = false; loadBlocked(); }`.
2. `loadFaction`: `other`/`access` → "not in a faction"; any other failure keeps loaded data or shows the retry line.
3. `sound.play(name, { fromUser })`: without `fromUser`, play only when the context is `running`; with it, `resume()` then schedule.
4. `user-style.js`: unlocked headers get `cursor:grab;touch-action:none`; `styles.js` (desktop media): `.chat-containers .chat-container.chat-minimized{touch-action:none}`.
5. `menu.js`: Esc closes and focuses the anchor; `render()` restores focus to the same index or the nearest enabled button; `update()` repositions.
6. `pm-window` `update()`: `if (holdRender) renderWanted = true; else renderList();`.
7. `dock-view` `destroy()`; app calls it.
8. `profile-button`: `tryInsert()` returns `'own'` on your own profile; `onRoute` and the observer stop watching then.
9. `enemy-marks`: cap `pending` at 500; past it, clear and rescan on the next frame.
10. `chat-custom` resize `onMove`: `applyStyle()` plus a sync of that chat's controls only.
11. Chats tab with no rows: "No conversations yet." and no Load older button.
12. Settings persistent controls get `data-zcf-focus` (Task 7).
13. Friends page: `h('div', { class: 'zcf-name-row' }, skull, chip)` with `.zcf-page .zcf-name-row{display:flex;align-items:center;gap:6px}`.

### Task 11: Release

- [ ] `src/whats-new.js`: a 0.6.0 entry (Desktop notifications; Unread count in the tab; Pinned chats; Phones; Local time; Fixes); update `test/version.test.js` expectations.
- [ ] `package.json` 0.6.0; `npm run build`; README (notifications, pins, local time) and `docs/manual-test.md` items; commit.

### Task 12: Review, visual check

- [ ] One reviewer agent over `main...notify-and-polish`; fix Critical/Important.
- [ ] `tools/preview`: add pinned ids (one stub) to the pm-chats scene; re-shoot desktop and phone; check the phone open-window layout and the new settings sections.

## Self-review notes

- Spec coverage: §1.1 → Tasks 3, 7, 8; §1.2 → Tasks 2, 8; §1.3 → Tasks 4, 8; §1.4 → Tasks 1, 5, 8; §2.1 → Task 9; §2.2 → Task 6; §2.3 → Task 10 (and 7 for #12); Part 3 → Tasks 1, 7, 8; Part 5 → tests per task and Task 12.
