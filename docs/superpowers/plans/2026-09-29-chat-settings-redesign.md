# Chat settings redesign (0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Chat settings as three tabs (General, Chats, About) with game-styled controls. Add mentions in Global/Faction, volume, a test notification, a 12-hour clock, text size for every chat, a Muted list, check for updates, backup with settings, and restore defaults. Ship as 0.7.0.

**Architecture:** New settings live in the existing settings document (`src/settings.js`, still `v: 1`). Pure logic gets its own small modules, each with unit tests:
- `src/mentions.js`: the mention matcher.
- `src/update-check.js`: the update check.

The UI splits the settings window into a shell (`src/ui/settings-window.js`) and one module per tab under `src/ui/settings/`. Game chats are touched only the way enemy skulls already are: our own inserted nodes plus stylesheet rules, never Vue's attributes. The mention colour uses the CSS Custom Highlight API.

**Tech Stack:** Plain ES modules bundled by esbuild into one userscript; vitest + jsdom tests; headless-Edge preview harness (`tools/preview`).

**Spec:** `docs/superpowers/specs/2026-09-29-chat-settings-redesign-design.md`

**Pace (user preference):**
- Implement task by task with the tests below, and run the whole suite after each task.
- No per-task review loop. Do one review at the end (Task 11), and fix only Critical/Important findings.
- Commit after each task on branch `settings-redesign`. Don't push.
- Commit messages end with the two trailer lines the session asks for:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018xFLSnTGkyRmowXEhicgAC
  ```

**Commands:**
- Full suite: `npx vitest run` (currently 523 tests, all passing).
- One file: `npx vitest run test/settings.test.js`.
- Build: `npm run build`.
- Screenshots: `node tools/preview/shoot.mjs <outdir>` (run `node tools/preview/fetch-css.mjs` first if `tools/preview/game-css/` is missing).

## File map

| File | Change |
|---|---|
| `src/chat-custom/chats.js` | `normalizeChatEntry/normalizeChats/textOf` take `textAll`; `chatSummary` replaces `describeChat` |
| `src/settings.js` | new fields, helpers `setSettingsTab`, `setMentionSound`, `setVolume`, `setMentionWords`, `setTextAll`, `restoreDefaults`, `applyBackupSettings` |
| `src/chat-custom/user-style.js` | a rule for the text size for every chat |
| `src/ui/chat-custom/index.js`, `src/ui/chat-custom/padlock.js` | step and show text from `textAll` |
| `src/sound.js` | `volume` option |
| `src/time.js` | 12-hour `formatClock` / `formatMessageTime` / `formatStamp` |
| `src/ui/game-clock.js`, `src/ui/time-hover.js`, `src/ui/dm-window.js` | 12-hour clock |
| `src/mentions.js` (new) | pure matcher |
| `src/ui/mention-marks.js` (new) | row flags, highlight ranges, mention callback |
| `src/ui/enemy-marks.js` | `onRow(row, { fresh })` |
| `src/backup.js` | settings in the backup file; `importMessage` mentions settings |
| `src/update-check.js` (new) | `compareVersions`, `headerVersion`, `checkForUpdate` |
| `src/version.js`, `build.mjs` | `UPDATE_URL` shared |
| `src/ui/backup-file.js` (new) | Save backup / Load backup, shared by two windows |
| `src/ui/pm-window.js` | ⋯ menu becomes Save backup / Load backup |
| `src/app.js` | new actions, mention marks, clock and volume wiring |
| `src/ui/settings-window.js` | shell with tabs |
| `src/ui/settings/controls.js`, `general-tab.js`, `chats-tab.js`, `about-tab.js` (new) | the tabs |
| `src/ui/styles.js` | new settings CSS, mention CSS |
| `src/whats-new.js`, `package.json`, `test/build.test.js` | 0.7.0 |
| `tools/preview/harness.js`, `tools/preview/shoot.mjs` | new scenes |
| tests | as listed per task |

---

### Task 1: Settings document and chat text helpers

**Files:**
- Modify: `src/chat-custom/chats.js`
- Modify: `src/settings.js`
- Test: `test/settings.test.js`, `test/chat-custom/chats.test.js`

- [ ] **Step 1: Write the failing tests**

In `test/chat-custom/chats.test.js`:
- Replace `describeChat,` in the import list with `chatSummary,`.
- In the test `'labels chats and describes their settings'`, delete the three `expect(describeChat(...))` lines and rename the test to `'labels chats'`.
- Add after it:

```js
  it('sums up a chat in plain words', () => {
    expect(chatSummary(undefined, true)).toBe('As the game made it');
    expect(chatSummary(undefined)).toBe('As it came');
    expect(chatSummary({ x: 1, y: 2, w: 420, h: 520, text: 120, locked: false }, true)).toBe('Moved · Resized · Text 120% · Unlocked');
    expect(chatSummary({ w: 400 })).toBe('Resized');
  });

  it('reads text size from a chat, or else the size for every chat', () => {
    expect(textOf(undefined, 120)).toBe(120);
    expect(textOf({ text: 90 }, 120)).toBe(90);
    expect(normalizeChatEntry({ text: 100 }, 120)).toEqual({ text: 100 });
    expect(normalizeChatEntry({ text: 120 }, 120)).toEqual({});
    expect(normalizeChats({ pm: { text: 120 }, 'dm:5': { text: 100 } }, 120)).toEqual({ 'dm:5': { text: 100 } });
  });
```

In `test/settings.test.js`, extend the import list with `setSettingsTab, setMentionSound, setVolume, setMentionWords, setTextAll, restoreDefaults, applyBackupSettings, MAX_MENTION_WORDS`. In the first test's big `toEqual({...})` object, add these fields after `hoverLocal: true,`:

```js
      settingsTab: 'general',
      mentionSound: 'off',
      volume: 100,
      textAll: 100,
      mentions: true,
      mentionWords: [],
      clock12: false,
```

Then add these tests inside `describe('settings document', ...)`:

```js
  it('reads the 0.7 options, with mention highlights on and the rest off or as before', () => {
    expect(defaultSettings()).toMatchObject({ settingsTab: 'general', mentionSound: 'off', volume: 100, textAll: 100, mentions: true, mentionWords: [], clock12: false });
    expect(normalizeSettings({ v: 1, settingsTab: 'about', mentionSound: 'bell', volume: 42, textAll: 123, mentions: false, mentionWords: ' DWR , dwr, x, mothy ', clock12: true }))
      .toMatchObject({ settingsTab: 'about', mentionSound: 'bell', volume: 40, textAll: 120, mentions: false, mentionWords: ['DWR', 'mothy'], clock12: true });
    expect(normalizeSettings({ v: 1, settingsTab: 'x', mentionSound: 'siren', volume: 'loud', textAll: 'big', mentions: 0, clock12: 'yes' }))
      .toMatchObject({ settingsTab: 'general', mentionSound: 'off', volume: 100, textAll: 100, mentions: true, clock12: false });
  });

  it('sets the settings tab, mention sound and volume only to known values', () => {
    const s = defaultSettings();
    setSettingsTab(s, 'chats');
    setSettingsTab(s, 'nope');
    setMentionSound(s, 'ping');
    setMentionSound(s, 'siren');
    setVolume(s, 33);
    expect(s).toMatchObject({ settingsTab: 'chats', mentionSound: 'ping', volume: 35 });
    setVolume(s, -5);
    expect(s.volume).toBe(0);
  });

  it('keeps up to 10 mention words of 2-30 characters', () => {
    const s = defaultSettings();
    setMentionWords(s, Array.from({ length: 12 }, (_, i) => `word${i}`));
    expect(s.mentionWords).toHaveLength(MAX_MENTION_WORDS);
    setMentionWords(s, ['a'.repeat(31), '  two   words ', 7]);
    expect(s.mentionWords).toEqual(['two words']);
  });

  it("sets the text size for every chat, clearing each chat's own, and a chat keeps only a size that differs", () => {
    const s = defaultSettings();
    updateChat(s, 'pm', { text: 120, w: 380 });
    updateChat(s, 'dm:5', { text: 90 });
    setTextAll(s, 110);
    expect(s.textAll).toBe(110);
    expect(s.chats).toEqual({ pm: { w: 380 } });
    updateChat(s, 'dm:5', { text: 110 });
    expect(s.chats['dm:5']).toBeUndefined();
    updateChat(s, 'dm:5', { text: 100 });
    expect(s.chats['dm:5']).toEqual({ text: 100 });
    expect(normalizeSettings(JSON.parse(JSON.stringify(s))).chats['dm:5']).toEqual({ text: 100 });
    resetAllChats(s);
    expect(s).toMatchObject({ chats: {}, textAll: 100 });
  });

  it('restores defaults but keeps muted and pinned chats and the tabs', () => {
    const s = defaultSettings();
    Object.assign(s, { sound: 'bell', volume: 50, clock12: true, notify: true, pmTab: 'friends', settingsTab: 'about', mentionWords: ['DWR'] });
    setMuted(s, 5, true);
    togglePinned(s, 7);
    updateChat(s, 'pm', { w: 400 });
    restoreDefaults(s);
    expect(s).toEqual({ ...defaultSettings(), muted: [5], pinned: [7], pmTab: 'friends', settingsTab: 'about' });
  });

  it("takes a backup's settings, merging muted and pinned chats with ours, and changes nothing for a bad one", () => {
    const s = defaultSettings();
    setMuted(s, 5, true);
    togglePinned(s, 7);
    applyBackupSettings(s, { v: 1, sound: 'ping', clock12: true, muted: [6, 5], pinned: [8], chats: { pm: { w: 400 } } });
    expect(s).toMatchObject({ sound: 'ping', clock12: true, muted: [6, 5], pinned: [8, 7], chats: { pm: { w: 400 } } });
    const before = JSON.stringify(s);
    expect(() => applyBackupSettings(s, { v: 2 })).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/settings.test.js test/chat-custom/chats.test.js`
Expected: FAIL (missing exports `chatSummary`, `setTextAll`, …).

- [ ] **Step 3: Implement `src/chat-custom/chats.js` changes**

Replace the comment above `normalizeChatEntry`, plus `normalizeChatEntry`, `normalizeChats`, `textOf` and `describeChat`, with:

```js
// Keeps only valid fields, clamped. Anything equal to its default is left out: locked (the default), a
// message size equal to the size for every chat (`textAll`, 0.7 spec §3.1), no position (x and y come as a
// pair or not at all).
export function normalizeChatEntry(raw, textAll = DEFAULT_TEXT) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if (raw.locked === false) out.locked = false;
  const x = num(raw.x);
  const y = num(raw.y);
  if (x !== null && y !== null) {
    out.x = Math.max(0, Math.round(x));
    out.y = Math.max(0, Math.round(y));
  }
  const w = num(raw.w);
  if (w !== null) out.w = clamp(Math.round(w), LIMITS.minW, LIMITS.maxW);
  const h = num(raw.h);
  if (h !== null) out.h = clamp(Math.round(h), LIMITS.minH, LIMITS.maxH);
  const t = num(raw.text);
  if (t !== null && clampText(t) !== textAll) out.text = clampText(t);
  return out;
}

export function normalizeChats(chats, textAll = DEFAULT_TEXT) {
  const out = {};
  if (!chats || typeof chats !== 'object' || Array.isArray(chats)) return out;
  for (const [key, raw] of Object.entries(chats)) {
    if (!isChatKey(key)) continue;
    const entry = normalizeChatEntry(raw, textAll);
    if (Object.keys(entry).length) out[key] = entry;
  }
  return out;
}

// A chat's own message size, or else the size for every chat.
export const textOf = (entry, textAll = DEFAULT_TEXT) => (entry && entry.text) || textAll;
```

and, in place of `describeChat`:

```js
// One line for a chat's row in Chat settings, in plain words: what differs from how the chat came.
export function chatSummary(entry, game = false) {
  const parts = [];
  if (isMoved(entry)) parts.push('Moved');
  if (entry && (entry.w || entry.h)) parts.push('Resized');
  if (entry && entry.text) parts.push(`Text ${entry.text}%`);
  if (!isLocked(entry)) parts.push('Unlocked');
  if (parts.length) return parts.join(' · ');
  return game ? 'As the game made it' : 'As it came';
}
```

(`isLocked` and `isMoved` are declared above `chatLabel` in the same file. Since `chatSummary` is only called at runtime, it can sit where `describeChat` was.)

- [ ] **Step 4: Implement `src/settings.js`**

Replace the file's head, from the top comment through `normalizeSettings`, with:

```js
// The settings document (spec §B.5, 0.6 spec Part 3, 0.7 spec Part 7): the Private Messages and Chat
// settings tabs, sounds and their volume, per-chat customizations and the text size for every chat, muted
// and pinned conversations, mentions, and the notification, tab-title and time switches. Pure; store.js
// reads and writes it as its own localStorage document.
import { normalizeChats, normalizeChatEntry, isChatKey, clampText, DEFAULT_TEXT } from './chat-custom/chats.js';
import { toId } from './util.js';

export const PM_TABS = ['chats', 'friends', 'faction', 'blocked'];
export const SETTINGS_TABS = ['general', 'chats', 'about'];
export const SOUNDS = ['off', 'chirp', 'ping', 'bell'];
export const MAX_MUTED = 500;
export const MAX_PINNED = 20;
export const MAX_MENTION_WORDS = 10;
export const MENTION_WORD_LENGTH = { min: 2, max: 30 };
// On/off switches: notifications and Friends only (off by default), the tab-title count (on), your own time
// in the time hover (on), mention highlights (on) and the 12-hour clock (off).
export const FLAGS = ['notify', 'notifyFriendsOnly', 'titleCount', 'hoverLocal', 'mentions', 'clock12'];

export function defaultSettings() {
  return {
    v: 1,
    pmTab: 'chats',
    settingsTab: 'general',
    sound: 'off',
    mentionSound: 'off',
    volume: 100,
    chats: {},
    textAll: DEFAULT_TEXT,
    muted: [],
    pinned: [],
    notify: false,
    notifyFriendsOnly: false,
    titleCount: true,
    hoverLocal: true, // the chat time hover shows your own time under ZCT
    mentions: true,
    mentionWords: [],
    clock12: false,
  };
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Positive integer ids, no duplicates, at most `max` (the first ones win: newest first).
function normalizeIdList(list, max) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    if (out.length >= max) break;
    const id = toId(v);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export const normalizeMuted = (list) => normalizeIdList(list, MAX_MUTED);

// 0-100 in steps of 5; anything else is full volume.
export const normalizeVolume = (v) => (isNum(v) ? Math.min(100, Math.max(0, Math.round(v / 5) * 5)) : 100);

// A list, or the comma-separated text typed in Chat settings: trimmed, 2-30 characters, no duplicates
// (ignoring case), at most 10.
export function normalizeMentionWords(list) {
  const raw = typeof list === 'string' ? list.split(',') : Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    if (out.length >= MAX_MENTION_WORDS) break;
    if (typeof v !== 'string') continue;
    const word = v.trim().replace(/\s+/g, ' ');
    const key = word.toLowerCase();
    if (word.length < MENTION_WORD_LENGTH.min || word.length > MENTION_WORD_LENGTH.max || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

// Throws for a document that isn't ours, so the store falls back to the defaults.
export function normalizeSettings(doc) {
  if (!isObj(doc) || doc.v !== 1) throw new Error('Unsupported settings document');
  const textAll = isNum(doc.textAll) ? clampText(doc.textAll) : DEFAULT_TEXT;
  return {
    v: 1,
    pmTab: PM_TABS.includes(doc.pmTab) ? doc.pmTab : 'chats',
    settingsTab: SETTINGS_TABS.includes(doc.settingsTab) ? doc.settingsTab : 'general',
    sound: SOUNDS.includes(doc.sound) ? doc.sound : 'off',
    mentionSound: SOUNDS.includes(doc.mentionSound) ? doc.mentionSound : 'off',
    volume: normalizeVolume(doc.volume),
    chats: normalizeChats(doc.chats, textAll),
    textAll,
    muted: normalizeMuted(doc.muted),
    pinned: normalizeIdList(doc.pinned, MAX_PINNED),
    notify: doc.notify === true,
    notifyFriendsOnly: doc.notifyFriendsOnly === true,
    titleCount: doc.titleCount !== false,
    hoverLocal: doc.hoverLocal !== false,
    mentions: doc.mentions !== false,
    mentionWords: normalizeMentionWords(doc.mentionWords),
    clock12: doc.clock12 === true,
  };
}

export function setSettingsTab(s, tab) {
  if (SETTINGS_TABS.includes(tab)) s.settingsTab = tab;
}

export function setMentionSound(s, sound) {
  if (SOUNDS.includes(sound)) s.mentionSound = sound;
}

export function setVolume(s, v) {
  s.volume = normalizeVolume(Number(v));
}

export function setMentionWords(s, words) {
  s.mentionWords = normalizeMentionWords(words);
}
```

Keep `setPmTab`, `setSound`, `isMuted`, `setMuted`, `isPinned`, `togglePinned` and `setFlag` as they are. Replace `updateChat`, `resetChat` and `resetAllChats` (the end of the file) with:

```js
// Merges `patch` into one chat's entry. A null field goes back to its default, and an entry left with
// nothing but defaults is removed. A message size equal to the size for every chat isn't kept.
export function updateChat(s, key, patch) {
  if (!isChatKey(key)) return;
  const next = { ...(s.chats[key] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = v;
  }
  const entry = normalizeChatEntry(next, s.textAll);
  if (Object.keys(entry).length) s.chats[key] = entry;
  else delete s.chats[key];
}

export function resetChat(s, key) {
  delete s.chats[key];
}

export function resetAllChats(s) {
  s.chats = {};
  s.textAll = DEFAULT_TEXT;
}

// The text size for every chat (0.7 spec §3.1): sets it and clears each chat's own, so every chat follows.
export function setTextAll(s, text) {
  if (!isNum(text)) return;
  s.textAll = clampText(text);
  for (const key of Object.keys(s.chats)) updateChat(s, key, { text: null });
}

function replaceWith(s, next) {
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, next);
}

// Back to defaultSettings() (0.7 spec §4.3), keeping what's yours rather than a preference: muted and
// pinned chats, and the tabs you were on.
export function restoreDefaults(s) {
  replaceWith(s, { ...defaultSettings(), muted: s.muted, pinned: s.pinned, pmTab: s.pmTab, settingsTab: s.settingsTab });
}

// A backup's settings replace ours, except muted and pinned chats, which are merged (the backup's first).
// Throws for settings that aren't ours, before changing anything.
export function applyBackupSettings(s, incoming) {
  const next = normalizeSettings(incoming);
  next.muted = normalizeMuted([...next.muted, ...s.muted]);
  next.pinned = normalizeIdList([...next.pinned, ...s.pinned], MAX_PINNED);
  replaceWith(s, next);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/settings.test.js test/chat-custom/chats.test.js`
Expected: PASS.

Then run `npx vitest run`. Expected: the only failures are in `test/ui/settings-window.test.js`, because `describeChat` is gone. Task 9 rewrites that file. To keep the suite green meanwhile, change its import `describeChat` → `chatSummary` in `src/ui/settings-window.js`, and in `build()` replace `describeChat(r.entry)` with `chatSummary(r.entry, r.key.startsWith('game:'))`. Then mark the old test `'lists every chat there is with its settings, and resets one or all'` as `it.skip`; Task 9 replaces the whole file anyway.

- [ ] **Step 6: Commit**

```bash
git add src/chat-custom/chats.js src/settings.js src/ui/settings-window.js test/settings.test.js test/chat-custom/chats.test.js test/ui/settings-window.test.js
git commit -m "feat: settings for 0.7 (tabs, mention words and sound, volume, 12-hour clock, text size for every chat, restore, backup)"
```

---

### Task 2: Text size for every chat, applied

**Files:**
- Modify: `src/chat-custom/user-style.js`
- Modify: `src/ui/chat-custom/index.js`
- Modify: `src/ui/chat-custom/padlock.js`
- Test: `test/chat-custom/user-style.test.js`, `test/ui/chat-custom.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `describe('user stylesheet', ...)` in `test/chat-custom/user-style.test.js`:

```js
  it('scales every chat by the size for every chat, and a chat with its own size on top of that', () => {
    const css = buildUserCss({ chats: { pm: { text: 100 }, 'dm:5': { w: 400 } }, textAll: 120 });
    expect(css.split('\n')[0]).toBe('body .chat-containers > .chat-container:is(.general-chat,.faction-chat,.activity-chat) .chat-content,body .chat-containers .zcf[data-zcf-chat] .zcf-zoom{zoom:1.2}');
    expect(css).toContain('body .chat-containers .zcf[data-zcf-chat="pm"] .zcf-zoom{zoom:1}');
    expect(css).not.toContain('"dm:5"] .zcf-zoom');
    expect(buildUserCss({ chats: {}, textAll: 100 })).toBe('');
  });
```

Append to the chat customization `describe` in `test/ui/chat-custom.test.js` (add `setTextAll` to the `../../src/settings.js` import):

```js
  it('shows and steps a chat\'s text from the size for every chat', () => {
    const { settings, general } = setup();
    general.getBoundingClientRect = () => rect(600, 300, 450, 450); // wide enough for the header controls
    settings.update((s) => setTextAll(s, 120));
    const value = general.querySelector('.zcf-cc-value');
    expect(value.textContent).toBe('120%');
    click(general.querySelector('.zcf-cc-step[aria-label="Larger messages"]'));
    expect(chat('game:general')).toEqual({ text: 130 });
    expect(userCss()).toContain('zoom:1.2}');
    expect(userCss()).toContain('.general-chat .chat-content{zoom:1.3}');
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/chat-custom/user-style.test.js test/ui/chat-custom.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/chat-custom/user-style.js`:
- Change the import to `import { GAME_CHATS, LIMITS, DEFAULT_TEXT, isLocked, isMoved, textOf } from './chats.js';`.
- Add after `zoomTargets`:

```js
// Every chat's messages at once, for the text size for every chat (0.7 spec §3.1). Same specificity as a
// single chat's zoom rule, which comes later and so wins.
export const ALL_ZOOM = [
  `body .chat-containers > .chat-container:is(${GAME_CHATS.map((g) => `.${g.cls}`).join(',')}) .chat-content`,
  'body .chat-containers .zcf[data-zcf-chat] .zcf-zoom',
].join(',');
```

- Change the signature to `export function buildUserCss({ chats = {}, textAll = DEFAULT_TEXT, live = null, small = false, vw = 1280, vh = 800, sizes = {}, front = [] })`, update its comment to mention `textAll`, and make the first lines of the body:

```js
  const rules = [];
  if (textAll !== DEFAULT_TEXT) rules.push(`${ALL_ZOOM}{zoom:${textAll / 100}}`);
```

- Inside the loop, replace the two text lines with:

```js
    const text = textOf(entry, textAll);
    if (text !== textAll) rules.push(`${zoomTargets(key).map((t) => `${sel} ${t}`).join(',')}{zoom:${text / 100}}`);
```

In `src/ui/chat-custom/padlock.js`:
- Change the import to `import { LIMITS, DEFAULT_TEXT, textOf, isLocked, isMoved } from '../../chat-custom/chats.js';`.
- Change `function sync(entry, width)` to `function sync(entry, width, textAll = DEFAULT_TEXT)`, with the comment `// width: the chat's width now, for the 400px header controls. textAll: the size for every chat.`
- Change the value line to `value.textContent = `${textOf(entry, textAll)}%`;`.

In `src/ui/chat-custom/index.js`:
- After `const save = ...`, add `const textAll = () => settings.get().textAll;`.
- `stepText: (key, delta) => save(key, { text: clampText(textOf(saved(key), textAll()) + delta) }),`
- In `menuModel`: `const text = textOf(entry, textAll());`
- In `applyStyle`: `buildUserCss({ chats: settings.get().chats, textAll: textAll(), live, small: isSmall(), vw: win.innerWidth, vh: win.innerHeight, sizes, front })`
- In `syncControls`: `rec.controls.sync(entry, (entry && entry.w) || c.el.getBoundingClientRect().width, textAll());`
- In `refresh`: `rec.controls.sync(entry, (!c.minimized && entry && entry.w) || c.el.getBoundingClientRect().width, textAll());`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/chat-custom test/ui/chat-custom.test.js test/ui/styles.test.js`
Expected: PASS. Then run `npx vitest run`: all pass (with the one skip).

- [ ] **Step 5: Commit**

```bash
git add src/chat-custom/user-style.js src/ui/chat-custom/index.js src/ui/chat-custom/padlock.js test/chat-custom/user-style.test.js test/ui/chat-custom.test.js
git commit -m "feat: one text size for every chat, with each chat's own size on top"
```

---

### Task 3: Sound volume

**Files:**
- Modify: `src/sound.js`
- Test: `test/sound.test.js`

- [ ] **Step 1: Write the failing test**

In `test/sound.test.js`'s `fakeAudio()`, record the gains:
- In the `FakeContext` constructor add `this.gains = [];`.
- Change `createGain()` to:

```js
    createGain() {
      const g = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      this.gains.push(g);
      return g;
    }
```

Add the test:

```js
  it('scales every tone by the volume, and stays silent at 0', () => {
    const { win, made } = fakeAudio();
    const sound = createSound({ win });
    expect(sound.play('ping', { volume: 0 })).toBe(false);
    expect(made).toHaveLength(0);
    expect(sound.play('ping', { volume: 50 })).toBe(true);
    expect(made[0].gains[0].gain.exponentialRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(0.09);
    sound.play('ping');
    expect(made[0].gains[1].gain.exponentialRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(0.18);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/sound.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/sound.js`, replace `play` and `schedule` with:

```js
  // Plays a named sound at `volume` (0-100, from Chat settings); 'off', any unknown name or volume 0 is
  // silent. Returns whether anything was (or will be) scheduled. A suspended context is only waited for when
  // the call comes from a click (`fromUser`): otherwise tones queued in it would all play at once on the
  // player's first click.
  function play(name, { fromUser = false, volume = 100 } = {}) {
    const tones = TONES[name];
    if (!tones) return false;
    const level = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
    if (!level) return false;
    const ac = context();
    if (!ac) return false;
    if (ac.state === 'running') {
      schedule(ac, tones, level);
      return true;
    }
    if (!fromUser || typeof ac.resume !== 'function') return false;
    ac.resume().then(() => schedule(ac, tones, level), () => {});
    return true;
  }

  function schedule(ac, tones, level) {
    const t0 = ac.currentTime;
    for (const tone of tones) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const start = t0 + tone.at;
      const end = start + tone.dur;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.f, start);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, (tone.gain || 0.18) * level), start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
```

(`Number(undefined) || 0` would make volume 0 silent by default, but the default parameter `volume = 100` covers a missing option. A caller passing `volume: undefined` also gets 100.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/sound.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sound.js test/sound.test.js
git commit -m "feat: a volume for the chat sounds"
```

---

### Task 4: 12-hour clock

**Files:**
- Modify: `src/time.js`, `src/ui/game-clock.js`, `src/ui/time-hover.js`, `src/ui/dm-window.js`
- Test: `test/time.test.js`, `test/ui/game-clock.test.js`, `test/ui/time-hover.test.js`, `test/ui/dm-window.test.js`

- [ ] **Step 1: Write the failing tests**

`test/time.test.js` already imports `formatStamp`, `formatMessageTime` and `formatClock`. Add:

```js
  it('writes a 12-hour clock when asked', () => {
    expect(formatClock(Date.UTC(2026, 8, 29, 14, 27))).toBe('14:27');
    expect(formatClock(Date.UTC(2026, 8, 29, 14, 27), false, true)).toBe('2:27 PM');
    expect(formatClock(Date.UTC(2026, 8, 29, 0, 5), false, true)).toBe('12:05 AM');
    expect(formatClock(Date.UTC(2026, 8, 29, 12, 0), false, true)).toBe('12:00 PM');
    expect(formatStamp(Date.UTC(2026, 8, 29, 18, 27), false, true)).toBe('Tue, Sep 29, 6:27 PM ZCT');
    expect(formatMessageTime(Date.UTC(2026, 8, 29, 18, 27), Date.UTC(2026, 8, 29, 20, 0), false, true)).toBe('6:27 PM');
  });
```

`test/ui/game-clock.test.js`:

```js
  it('writes a 12-hour clock when asked, even where the game already prints the right clock, and goes back', () => {
    const gc = setup(chat('17:59', '09:05'));
    withStore(['2026-09-29 17:59:00']);
    document.querySelectorAll('.msg-cont').forEach((r) => gc.rewrite(r, 'game', { h12: true }));
    expect(times()).toEqual(['5:59 PM', '9:05 AM']);
    rewriteAll(gc, 'game');
    expect(times()).toEqual(['17:59', '09:05']);
  });
```

`test/ui/time-hover.test.js`: change `mount` to accept and pass `clock12`:

```js
function mount(html, { showLocal = true, clock12 = false } = {}) {
  vi.useFakeTimers();
  document.body.innerHTML = html;
  const gameClock = createGameClock({ doc: document, storage: memoryStorage({ 'zcf:v1:1:gameClock': 'local' }), key: 'zcf:v1:1:gameClock', now: () => NOW });
  hover = createTimeHover({ doc: document, win: window, now: () => NOW, gameClock, showLocal: () => showLocal, clock12: () => clock12 });
  return gameClock;
}
```

and add:

```js
  it('uses the 12-hour clock when it is on', () => {
    mount(dm, { clock12: true });
    over(document.querySelector('.zcf-time'));
    vi.advanceTimersByTime(500);
    expect(lines()).toEqual(['Tue, Sep 29, 6:18 PM ZCT', 'Tue, Sep 29, 2:18 PM EDT', '12 min ago']);
  });
```

`test/ui/dm-window.test.js` (its `mount` only subscribes to the store, so the test calls `win.update()` itself):

```js
  it('switches its times to the 12-hour clock with the Chat settings box', async () => {
    const { el, win, services } = mount({
      getChatMessages: vi.fn().mockResolvedValue({ ok: true, data: [rawMsg(1, THEM, 'hi', '2026-09-28 14:03:00')] }),
    });
    await flush();
    const time = () => el.querySelector('.zcf-time').textContent;
    expect(time()).toContain('14:03');
    services.settings.update((s) => { s.clock12 = true; });
    win.update();
    expect(time()).toContain('2:03 PM');
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/time.test.js test/ui/game-clock.test.js test/ui/time-hover.test.js test/ui/dm-window.test.js`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`src/time.js`: replace `formatClock` and `formatMessageTime`, and change `formatStamp`:

```js
// "14:27", or with `h12` the 12-hour "2:27 PM" (0.7 spec Part 6).
export function formatClock(ts, local = false, h12 = false) {
  const [, , , h, mi] = parts(ts, local);
  if (!h12) return `${pad(h)}:${pad(mi)}`;
  return `${h % 12 || 12}:${pad(mi)} ${h < 12 ? 'AM' : 'PM'}`;
}
```

```js
export function formatMessageTime(ts, now = Date.now(), local = false, h12 = false) {
  const clock = formatClock(ts, local, h12);
  const day = dayKey(ts, local);
  if (day === dayKey(now, local)) return clock;
  if (day === yesterdayKey(now, local)) return `Yesterday at ${clock}`;
  const [y, m, d] = parts(ts, local);
  return `${pad(d)}/${pad(m + 1)}/${y} at ${clock}`;
}
```

```js
// "Tue, Sep 29, 18:27 ZCT" or, with `local`, "Tue, Sep 29, 14:27 EDT"; 12-hour with `h12`.
export function formatStamp(ts, local = false, h12 = false) {
  return `${formatWeekday(ts, local)}, ${formatClock(ts, local, h12)} ${local ? zoneName(ts) : 'ZCT'}`;
}
```

`src/ui/game-clock.js`: replace `rewrite` with:

```js
  // Shows a game row's time in `want` ('local' | 'game'), as the 12-hour clock with `h12`.
  function rewrite(row, want, { h12 = false } = {}) {
    const el = row.matches && row.matches(TIME) ? row : row.querySelector(TIME);
    if (!el) return;
    const text = printedOf(el);
    const ts = momentOf(el);
    const shown = ts === null || (printed() === want && !h12) ? text : formatClock(ts, want === 'local', h12);
    printedText.set(el, { printed: text, shown });
    const node = el.firstChild;
    // Only a plain text span is ever touched.
    if (el.childNodes.length === 1 && node.nodeType === 3 && node.nodeValue.trim() !== shown) node.nodeValue = shown;
  }
```

`src/ui/time-hover.js`:
- Change the signature to `export function createTimeHover({ doc = document, win = window, now = () => Date.now(), gameClock, showLocal = () => true, clock12 = () => false })`.
- Extend its comment: `clock12(): whether times use the 12-hour clock.`
- In `linesFor`:

```js
    const lines = [formatStamp(ts, false, clock12())];
    if (showLocal() && new Date(ts).getTimezoneOffset() !== 0) lines.push(formatStamp(ts, true, clock12()));
```

`src/ui/dm-window.js`:
- After `const isMuted = ...` (line ~19), add:

```js
  // The 12-hour clock switch in Chat settings (0.7 spec Part 6).
  const clock12 = () => !!(services.settings && services.settings.get().clock12);
  let shownClock12 = clock12();
```

- In `renderItem`: `const time = m.ts ? formatMessageTime(m.ts, Date.now(), false, clock12()) : '';`
- At the start of `update()`, right after the `if (!entry) return;` line, add:

```js
    const h12 = clock12();
    if (h12 !== shownClock12) {
      shownClock12 = h12;
      for (const t of log.querySelectorAll('.zcf-time[data-zcf-ts]')) t.textContent = formatMessageTime(Number(t.getAttribute('data-zcf-ts')), Date.now(), false, h12);
    }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/time.js src/ui/game-clock.js src/ui/time-hover.js src/ui/dm-window.js test/time.test.js test/ui/game-clock.test.js test/ui/time-hover.test.js test/ui/dm-window.test.js
git commit -m "feat: a 12-hour clock for every chat time"
```

(The app passes `clock12` to the game clock and the time hover in Task 8.)

---

### Task 5: Mention matcher

**Files:**
- Create: `src/mentions.js`
- Test: `test/mentions.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { makeMatcher } from '../src/mentions.js';

describe('mentions', () => {
  it('matches whole words in any case, with @ and punctuation around them', () => {
    const m = makeMatcher(['Moth']);
    expect(m.test('hey @moth!')).toBe(true);
    expect(m.test('MOTH, come here')).toBe(true);
    expect(m.test('moth')).toBe(true);
    expect(m.test('mothball')).toBe(false);
    expect(m.test('bigmoth')).toBe(false);
    expect(m.test('moth_2')).toBe(false);
  });

  it('knows letters beyond English, and takes words literally', () => {
    expect(makeMatcher(['Ölaf']).test('hi ölaf')).toBe(true);
    expect(makeMatcher(['Ölaf']).test('hiÖlaf')).toBe(false);
    const dots = makeMatcher(['a.b']);
    expect(dots.test('axb')).toBe(false);
    expect(dots.test('see a.b now')).toBe(true);
    expect(makeMatcher(['[DWR]']).test('join [dwr] today')).toBe(true);
  });

  it('finds every match, preferring the longer word', () => {
    const m = makeMatcher(['Moth', 'DWR', 'Moth Man']);
    expect(m.ranges('Moth: dwr at 8, moth man')).toEqual([[0, 4], [6, 9], [16, 24]]);
  });

  it('is null with nothing to look for', () => {
    expect(makeMatcher([])).toBeNull();
    expect(makeMatcher(['', '  ', null])).toBeNull();
  });
});
```

Note: `\b`-style boundaries fail for words that start or end with punctuation, like `[DWR]`: the character before `[` is a space, which is fine. The lookarounds only ask that the neighbours aren't letters, digits or `_`, so `[dwr]` preceded by a space matches.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/mentions.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/mentions.js`**

```js
// Mentions in the game's Global and Faction chats (0.7 spec §5.1): your name and the words you added, as
// whole words in any case ("@Moth", "moth," but not "mothball"). Pure.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// words: what to look for. Returns { test(text), ranges(text) } or null when there's nothing to look for.
export function makeMatcher(words) {
  const seen = new Set();
  const list = [];
  for (const w of Array.isArray(words) ? words : []) {
    const word = typeof w === 'string' ? w.trim() : '';
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    list.push(word);
  }
  if (!list.length) return null;
  list.sort((a, b) => b.length - a.length); // "Moth Man" before "Moth"
  const source = `(?<![\\p{L}\\p{N}_])(?:${list.map(escape).join('|')})(?![\\p{L}\\p{N}_])`;
  const once = new RegExp(source, 'iu');
  return {
    test: (text) => once.test(String(text)),
    // [start, end) pairs of every match in `text`.
    ranges(text) {
      const out = [];
      for (const m of String(text).matchAll(new RegExp(source, 'giu'))) out.push([m.index, m.index + m[0].length]);
      return out;
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/mentions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mentions.js test/mentions.test.js
git commit -m "feat: a matcher for mentions of your name and words you add"
```

---

### Task 6: Mention marks in the game chats

**Files:**
- Create: `src/ui/mention-marks.js`
- Modify: `src/ui/enemy-marks.js`
- Modify: `src/ui/styles.js` (mention rules)
- Test: `test/ui/mention-marks.test.js`, `test/ui/enemy-marks.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `test/ui/enemy-marks.test.js`:

```js
  it('tells onRow which rows arrive while you watch: few at a time, never a refresh or a history load', async () => {
    document.body.innerHTML = DOCK_HTML;
    const seen = [];
    marks = createEnemyMarks({ names: () => new Set(), onRow: (r, info) => seen.push([r.querySelector('.sender-name').textContent, info.fresh]) });
    marks.start();
    expect(seen.every(([, fresh]) => fresh === false)).toBe(true);
    seen.length = 0;
    const panel = document.querySelector('.general-chat .message-panel');
    panel.insertAdjacentHTML('beforeend', row('Nyx'));
    await flush();
    await flush();
    expect(seen).toEqual([['Nyx', true]]);
    seen.length = 0;
    panel.insertAdjacentHTML('beforeend', Array.from({ length: 6 }, (_, i) => row(`P${i}`)).join(''));
    await flush();
    await flush();
    expect(seen).toHaveLength(6);
    expect(seen.every(([, fresh]) => fresh === false)).toBe(true);
    seen.length = 0;
    marks.refresh();
    expect(seen.every(([, fresh]) => fresh === false)).toBe(true);
  });
```

Create `test/ui/mention-marks.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMentionMarks, FLAG, HIGHLIGHT } from '../../src/ui/mention-marks.js';

const msg = (name, text) => `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span class="msg-time">14:20</span></div><div>${text}</div></div></div></div></div>`;
const html = `<div class="chat-containers">
  <div class="chat-container general-chat"><div class="chat-content"><div class="message-panel">
    ${msg('Nyx', 'hey @moth, bunker?')}${msg('Moth', 'moth here')}${msg('Rust', 'mothball time')}${msg('Grim', 'DWR raid at 8')}
  </div></div></div>
  <div class="chat-container activity-chat"><div class="chat-content">${msg('Nyx', 'moth did a thing')}</div></div>
  <div class="zcf-root"><div class="chat-container zcf">${msg('Nyx', 'moth in a DM')}</div></div>
</div>`;

const rows = () => [...document.querySelectorAll('.msg-cont')];
const flagged = () => rows().filter((r) => r.querySelector(`.${FLAG}`)).map((r) => r.querySelector('.sender-name').textContent + ':' + r.textContent.includes('DWR'));

let mm = null;
function setup({ words = ['Moth'], enabled = true, win = window, onMention = vi.fn() } = {}) {
  document.body.innerHTML = html;
  let list = words;
  let on = enabled;
  mm = createMentionMarks({ doc: document, win, words: () => list, enabled: () => on, myName: 'Moth', onMention });
  return { onMention, setWords: (w) => { list = w; }, setEnabled: (v) => { on = v; } };
}

describe('mention marks', () => {
  afterEach(() => {
    if (mm) mm.destroy();
    mm = null;
  });

  it('flags messages that mention you in Global and Faction only, never your own, with a hidden marker', () => {
    setup({ words: ['Moth', 'DWR'] });
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(flagged()).toEqual(['Nyx:false', 'Grim:true']);
    const flag = document.querySelector(`.${FLAG}`);
    expect(flag.hidden).toBe(true);
    expect(flag.parentElement.querySelector('.sender-name')).not.toBeNull();
  });

  it('calls onMention only for fresh rows', () => {
    const { onMention } = setup();
    const nyx = rows()[0];
    mm.mark(nyx, { fresh: false });
    expect(onMention).not.toHaveBeenCalled();
    mm.mark(nyx, { fresh: true });
    expect(onMention).toHaveBeenCalledWith(nyx);
  });

  it('takes flags away when switched off or when the words change, without duplicating them', () => {
    const { setWords, setEnabled } = setup({ words: ['Moth'] });
    for (const r of rows()) mm.mark(r, { fresh: false });
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(document.querySelectorAll(`.${FLAG}`)).toHaveLength(1);
    setWords(['DWR']);
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(flagged()).toEqual(['Grim:true']);
    setEnabled(false);
    for (const r of rows()) mm.mark(r, { fresh: false });
    expect(document.querySelectorAll(`.${FLAG}`)).toHaveLength(0);
  });

  it('colours the matched words through the highlight registry when the browser has one', () => {
    const registry = new Map();
    class FakeHighlight extends Set {}
    const win = { CSS: { highlights: registry }, Highlight: FakeHighlight };
    setup({ words: ['Moth', 'DWR'], win });
    for (const r of rows()) mm.mark(r, { fresh: false });
    const hl = registry.get(HIGHLIGHT);
    expect([...hl].map((r) => r.toString())).toEqual(['moth', 'DWR']);
    mm.destroy();
    mm = null;
    expect(registry.has(HIGHLIGHT)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/ui/mention-marks.test.js test/ui/enemy-marks.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/mention-marks.js`**

```js
// Messages that mention you in the game's Global and Faction chats (0.7 spec Part 5). The rows are
// Vue-owned: we only add our own hidden flag next to the sender (our stylesheet tints the row through
// :has()), and colour the matched words with the CSS Custom Highlight API, which changes no DOM at all.
// Browsers without it just get the tint.
import { makeMatcher } from '../mentions.js';

export const FLAG = 'zcf-mention-flag';
export const HIGHLIGHT = 'zcf-mention';
const CHATS = '.general-chat, .faction-chat';
const MAX_RANGES = 300;

// words(): your name plus the words you added. enabled(): the Chat settings switch. myName: your username,
// whose own messages never count. onMention(row): a mention in a row that just arrived.
export function createMentionMarks({ doc = document, win = window, words, enabled, myName = '', onMention = () => {} }) {
  const registry = win.CSS && win.CSS.highlights && typeof win.Highlight === 'function' ? win.CSS.highlights : null;
  let highlight = null;
  let ranges = new Set();
  let byRow = new WeakMap(); // row -> its ranges
  let matcher = null;
  let matcherKey = null;
  const me = String(myName || '').trim().toLowerCase();

  function currentMatcher() {
    const list = words();
    const key = JSON.stringify(list);
    if (key !== matcherKey) {
      matcherKey = key;
      matcher = makeMatcher(list);
    }
    return matcher;
  }

  function clearRow(row) {
    const old = byRow.get(row);
    if (!old) return;
    for (const r of old) {
      ranges.delete(r);
      if (highlight) highlight.delete(r);
    }
    byRow.delete(row);
  }

  // Drops ranges whose message is gone, and the oldest past MAX_RANGES.
  function prune() {
    for (const r of ranges) {
      if (ranges.size > MAX_RANGES || !r.startContainer.isConnected) {
        ranges.delete(r);
        if (highlight) highlight.delete(r);
      }
    }
  }

  function addRanges(row, textEl, m) {
    if (!registry) return;
    if (!highlight) {
      highlight = new win.Highlight();
      registry.set(HIGHLIGHT, highlight);
    }
    const mine = [];
    const walker = doc.createTreeWalker(textEl, 4); // NodeFilter.SHOW_TEXT
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const [a, b] of m.ranges(node.nodeValue)) {
        const r = doc.createRange();
        r.setStart(node, a);
        r.setEnd(node, b);
        mine.push(r);
        ranges.add(r);
        highlight.add(r);
      }
    }
    byRow.set(row, mine);
    if (ranges.size > MAX_RANGES * 1.5) prune();
  }

  function setFlag(line, on) {
    const flag = line.querySelector(`:scope > .${FLAG}`);
    if (on && !flag) {
      const i = doc.createElement('i');
      i.className = FLAG;
      i.hidden = true;
      line.appendChild(i);
    } else if (!on && flag) flag.remove();
  }

  // One game chat row: flagged and coloured when it mentions you, cleaned up when it no longer does.
  // `fresh`: it arrived while you watched (enemy-marks.js), so the app may play the mention sound.
  function mark(row, { fresh = false } = {}) {
    if (!row.closest(CHATS) || row.closest('.zcf-root')) return;
    const sender = row.querySelector('.sender-name');
    const line = sender && sender.parentElement;
    const textEl = line && line.nextElementSibling;
    if (!textEl) return;
    clearRow(row);
    const m = enabled() ? currentMatcher() : null;
    const mine = !!me && sender.textContent.trim().toLowerCase() === me;
    const hit = !!m && !mine && m.test(textEl.textContent);
    setFlag(line, hit);
    if (!hit) return;
    addRanges(row, textEl, m);
    if (fresh) onMention(row);
  }

  return {
    mark,
    destroy() {
      if (registry && highlight) registry.delete(HIGHLIGHT);
      highlight = null;
      ranges = new Set();
      byRow = new WeakMap();
      for (const f of doc.querySelectorAll(`.${FLAG}`)) f.remove();
    },
  };
}
```

- [ ] **Step 4: Implement the `fresh` flag in `src/ui/enemy-marks.js`**

- Add the constant under `MAX_PENDING`:

```js
// A pass adding more rows than this to one chat is the chat drawing its history, not messages arriving.
const MAX_FRESH = 5;
```

- Update the `onRow` doc comment: `onRow(row, { fresh }): anything else done to each game chat row as it appears (fresh when it arrived while you watched: at most MAX_FRESH new rows in its chat in one pass) and on refresh() (never fresh).`
- Replace the loop at the end of `flushPending` (from `const set = names();` on) with:

```js
    const set = names();
    const nodes = pending;
    pending = [];
    const rows = [];
    for (const node of nodes) {
      if (!node.isConnected) continue;
      for (const row of rowsIn(node)) {
        if (handled.has(row) || !isGameRow(row)) continue;
        handled.add(row);
        rows.push(row);
      }
    }
    const perChat = new Map();
    for (const row of rows) {
      const chat = row.closest('.chat-container');
      perChat.set(chat, (perChat.get(chat) || 0) + 1);
    }
    for (const row of rows) {
      markRow(row, set);
      if (onRow) onRow(row, { fresh: perChat.get(row.closest('.chat-container')) <= MAX_FRESH });
    }
```

- In `onMutations`, ignore our flags too: `if (n.nodeType === 1 && !n.classList.contains('zcf-enemy-mark') && !n.classList.contains('zcf-mention-flag')) pending.push(n);`
- In `refresh()`: `if (onRow) onRow(row, { fresh: false });`

- [ ] **Step 5: Add the CSS**

In `src/ui/styles.js`, right after the `.zcf-muted-mark{...}` line, add:

```
.chat-containers > .chat-container:not(.zcf) .msg-cont:has(.zcf-mention-flag){background:#f2c03714;box-shadow:inset 3px 0 #f2c037}
::highlight(zcf-mention){color:#f2c037}
```

(Each is its own rule: a browser without `::highlight` drops only that one.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/mention-marks.js src/ui/enemy-marks.js src/ui/styles.js test/ui/mention-marks.test.js test/ui/enemy-marks.test.js
git commit -m "feat: highlight Global and Faction messages that mention you"
```

---

### Task 7: Backup with settings, shared file picker, update check

**Files:**
- Modify: `src/backup.js`, `src/version.js`, `build.mjs`, `src/ui/pm-window.js`
- Create: `src/update-check.js`, `src/ui/backup-file.js`
- Modify: `test/ui/services.js`
- Test: `test/backup.test.js`, `test/update-check.test.js` (new), `test/build.test.js`, `test/ui/pm-window.test.js`

- [ ] **Step 1: Write the failing tests**

`test/backup.test.js`: add

```js
  it('carries the settings document, and still reads files without one', () => {
    const s = emptyState();
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    const text = exportFriends(s, 77, null, { v: 1, sound: 'ping' });
    expect(JSON.parse(text).settings).toEqual({ v: 1, sound: 'ping' });
    expect(parseImport(text, 77)).toMatchObject({ ok: true, settings: { v: 1, sound: 'ping' } });
    expect(parseImport(exportFriends(s, 77), 77).settings).toBeUndefined();
    expect(parseImport(JSON.stringify({ v: 1, playerId: 77, friends: [], settings: [1] }), 77).settings).toBeUndefined();
  });

  it('says when settings came back, or could not be read', () => {
    expect(importMessage({ added: 1, settings: 'restored' })).toBe('Imported 1 new friend. Settings restored.');
    expect(importMessage({ added: 0, settings: 'unreadable' })).toBe("Imported 0 new friends. The settings in it couldn't be read.");
  });
```

Create `test/update-check.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { compareVersions, headerVersion, checkForUpdate } from '../src/update-check.js';
import { UPDATE_URL } from '../src/version.js';

const res = (text, ok = true) => Promise.resolve({ ok, text: () => Promise.resolve(text) });

describe('update check', () => {
  it('compares dotted versions as numbers', () => {
    expect(compareVersions('0.10.0', '0.9.3')).toBe(1);
    expect(compareVersions('0.7.0', '0.7.0')).toBe(0);
    expect(compareVersions('0.7', '0.7.1')).toBe(-1);
  });

  it("reads the userscript header's version", () => {
    expect(headerVersion('// ==UserScript==\n// @name  X\n// @version      0.7.1\n')).toBe('0.7.1');
    expect(headerVersion('nothing here')).toBeNull();
    expect(headerVersion('// @version abc')).toBeNull();
  });

  it('fetches the update URL once, without the cache, and says whether a newer version is out', async () => {
    const fetchImpl = vi.fn(() => res('// @version      0.7.1\n'));
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl })).toEqual({ status: 'newer', latest: '0.7.1' });
    expect(fetchImpl).toHaveBeenCalledWith(UPDATE_URL, { cache: 'no-store', credentials: 'omit' });
    expect(await checkForUpdate({ current: '0.7.1', fetchImpl })).toEqual({ status: 'current' });
    expect(await checkForUpdate({ current: '0.8.0', fetchImpl })).toEqual({ status: 'current' });
  });

  it('fails softly', async () => {
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl: () => res('', false) })).toEqual({ status: 'failed' });
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl: () => res('no header') })).toEqual({ status: 'failed' });
    expect(await checkForUpdate({ current: '0.7.0', fetchImpl: () => Promise.reject(new Error('offline')) })).toEqual({ status: 'failed' });
  });
});
```

`test/build.test.js`: add `import { UPDATE_URL } from '../src/version.js';` and inside the test:

```js
    expect(text).toContain(`// @updateURL    ${UPDATE_URL}`);
    expect(text).toContain(`// @downloadURL  ${UPDATE_URL}`);
```

`test/ui/pm-window.test.js`:
- In the ⋯ menu test, change the expected texts `'Export friends'` → `'Save backup'` and `'Import friends'` → `'Load backup'`.
- In the oversized-import test, change `vi.spyOn(services.actions, 'importFriends')` → `'importBackup'`, and the toast `'That file is too large to be a friends export.'` → `'That file is too large to be a backup.'`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/backup.test.js test/update-check.test.js test/build.test.js test/ui/pm-window.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/backup.js` changes**

- Replace `exportFriends`:

```js
// Friends, plus enemies when there are any (older script versions ignore the extra array), plus the
// settings document (0.7 spec §4.3) when given.
export function exportFriends(state, playerId, enemiesDoc, settingsDoc) {
  const doc = { v: 1, playerId, friends: Object.values(state.friends).map(pick) };
  const enemies = enemiesDoc ? Object.values(enemiesDoc.enemies).map(pick) : [];
  if (enemies.length) doc.enemies = enemies;
  if (settingsDoc) doc.settings = settingsDoc;
  return JSON.stringify(doc, null, 2);
}
```

- In `parseImport`, replace the final `return` with:

```js
  const out = { ok: true, friends: parsePeople(doc.friends), enemies: parsePeople(Array.isArray(doc.enemies) ? doc.enemies : []) };
  // The settings go through normalizeSettings when they're applied; here only their shape is checked.
  if (doc.settings && typeof doc.settings === 'object' && !Array.isArray(doc.settings)) out.settings = doc.settings;
  return out;
```

  and update its comment to `Returns { ok: true, friends, enemies, settings? } or { ok: false, error }.`

- Replace `importMessage`:

```js
// settings: 'restored' or 'unreadable' when the file had settings.
export function importMessage({ added, enemiesAdded = 0, notes = 0, settings }) {
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const parts = [count(added, 'new friend', 'new friends')];
  if (enemiesAdded) parts.push(count(enemiesAdded, 'new enemy', 'new enemies'));
  if (notes) parts.push(count(notes, 'note', 'notes'));
  const last = parts.pop();
  const text = `Imported ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
  if (settings === 'restored') return `${text} Settings restored.`;
  if (settings === 'unreadable') return `${text} The settings in it couldn't be read.`;
  return text;
}
```

- [ ] **Step 4: `src/version.js`, `build.mjs`, `src/update-check.js`**

Append to `src/version.js`:

```js
// Where the script updates from (build.mjs writes it as @updateURL and @downloadURL). Chat settings →
// About → Check for updates reads its header, and Update now opens it for Tampermonkey.
export const UPDATE_URL = 'https://raw.githubusercontent.com/Dickie1242/Zed-City-Friends/main/dist/zed-city-friends.user.js';
```

In `build.mjs`:
- Add `import { UPDATE_URL } from './src/version.js';` after the other imports.
- Replace the two header lines with:

```
// @downloadURL  ${UPDATE_URL}
// @updateURL    ${UPDATE_URL}
```

Create `src/update-check.js`:

```js
// "Check for updates" in Chat settings → About (0.7 spec §4.1): one request, only when clicked. The update
// URL is raw.githubusercontent.com, which allows any origin; Tampermonkey still does its own checks.
import { UPDATE_URL } from './version.js';

// 1, 0 or -1: dotted numbers compared part by part, so "0.10.0" is newer than "0.9.3".
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// The "// @version x.y.z" of a userscript's header, or null.
export function headerVersion(text) {
  const m = /^\/\/\s*@version\s+(\S+)/m.exec(String(text));
  return m && /^\d+(\.\d+)*$/.test(m[1]) ? m[1] : null;
}

// { status: 'newer', latest } | { status: 'current' } | { status: 'failed' }
export async function checkForUpdate({ current, fetchImpl = (...a) => fetch(...a), url = UPDATE_URL } = {}) {
  try {
    const res = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
    if (!res || !res.ok) return { status: 'failed' };
    const latest = headerVersion(await res.text());
    if (!latest) return { status: 'failed' };
    return compareVersions(latest, current) > 0 ? { status: 'newer', latest } : { status: 'current' };
  } catch {
    return { status: 'failed' };
  }
}
```

- [ ] **Step 5: `src/ui/backup-file.js` and the PM window**

Create `src/ui/backup-file.js`:

```js
// Save backup / Load backup (0.7 spec §4.3): one file with friends, enemies, notes and settings, from Chat
// settings → About and from the Private Messages ⋯ menu. The caller puts `input` (a hidden file picker)
// inside its window.
import { h, downloadText } from './dom.js';
import { importMessage } from '../backup.js';
import { safe } from '../util.js';

export const MAX_IMPORT_BYTES = 1024 * 1024;

// actions: { exportBackup(), importBackup(text) }
export function createBackupFile({ doc = document, actions, toast, playerId }) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', safe('backup-load', async () => {
    const file = input.files && input.files[0];
    input.value = ''; // let the same file be picked again, whatever happens below
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast('That file is too large to be a backup.', { error: true });
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      toast("Couldn't read that file.", { error: true });
      return;
    }
    const res = actions.importBackup(text);
    toast(res.ok ? importMessage(res) : res.error, { error: !res.ok });
  }));

  return {
    input,
    save() {
      downloadText(`zed-city-friends-${playerId}.json`, actions.exportBackup(), doc);
      toast('Backup saved: friends, enemies, notes and settings.');
    },
    load() {
      input.click();
    },
  };
}
```

In `src/ui/pm-window.js`:
- Remove `const MAX_IMPORT_BYTES = ...`, and remove `importMessage` from the imports; add `import { createBackupFile } from './backup-file.js';`. Drop `downloadText` from the `./dom.js` import if nothing else uses it (grep first).
- Replace the `fileInput` + `menu` construction with:

```js
  const backup = createBackupFile({ doc, actions, toast, playerId });
  const menu = h('div', { class: 'zcf-menu', role: 'menu', hidden: true },
    h('div', { class: 'zcf-menu-title' }, 'Your data'),
    h('button', {
      type: 'button',
      role: 'menuitem',
      onclick: () => {
        closeMenu();
        backup.save();
      },
    }, 'Save backup'),
    h('button', {
      type: 'button',
      role: 'menuitem',
      onclick: () => {
        closeMenu();
        backup.load();
      },
    }, 'Load backup'));
  const body = h('div', { class: 'chat-content zcf-body' }, main, menu, backup.input);
```

- Delete the old `fileInput.addEventListener('change', ...)` block and the `onExport` function.

In `test/ui/services.js`:
- Change the backup import to `import { exportFriends, parseImport, mergeImport } from '../../src/backup.js';` (unchanged names).
- Rename the two actions:

```js
    exportBackup: () => exportFriends(store.get(), ME, null, settings.get()),
    importBackup: (text) => {
      const r = parseImport(text, ME);
      if (!r.ok) return r;
      return { ok: true, ...store.update((s) => mergeImport(s, r.friends, 0)) };
    },
```

In `src/app.js`, rename the actions `exportFriends` / `importFriends` to `exportBackup` / `importBackup` (Task 8 fills them in fully; for now just rename and pass `settings.get()` as the 4th export argument). In `test/app.test.js`, change `app.actions.exportFriends()` → `app.actions.exportBackup()` and `app.actions.importFriends(text)` → `app.actions.importBackup(text)`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/backup.js src/version.js build.mjs src/update-check.js src/ui/backup-file.js src/ui/pm-window.js src/app.js test/backup.test.js test/update-check.test.js test/build.test.js test/ui/pm-window.test.js test/ui/services.js test/app.test.js
git commit -m "feat: one backup file with settings, and a check for updates"
```

---

### Task 8: App wiring

**Files:**
- Modify: `src/app.js`
- Modify: `test/ui/services.js`
- Test: `test/app.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `test/app.test.js`. Its `beforeEach` already puts `DOCK_HTML` in the page, and that Global chat has Gravedigger's "anyone doing the bunker tonight?":

```js
  it('restores settings from a backup, merging muted chats', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    app.actions.toggleMute(5);
    app.settings.update((s) => { s.sound = 'bell'; s.clock12 = true; });
    const text = app.actions.exportBackup();
    app.actions.restoreDefaults();
    expect(app.settings.get()).toMatchObject({ sound: 'off', clock12: false, muted: [5] });
    app.actions.toggleMute(5);
    app.actions.toggleMute(6);
    expect(app.actions.importBackup(text)).toMatchObject({ ok: true, settings: 'restored' });
    expect(app.settings.get()).toMatchObject({ sound: 'bell', clock12: true, muted: [5, 6] });
  });

  it('flags messages mentioning you in Global, and redoes them when the words change', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    const flagged = () => [...document.querySelectorAll('.general-chat .msg-cont')].filter((r) => r.querySelector('.zcf-mention-flag')).length;
    expect(flagged()).toBe(0);
    app.actions.setMentionWords('bunker');
    expect(flagged()).toBe(1);
    app.actions.setMentions(false);
    expect(flagged()).toBe(0);
  });

  it('steps text size for one chat and for every chat', () => {
    app = createApp({ api: fakeApi(), playerId: ME, playerName: 'Me', storage: memoryStorage() });
    app.actions.stepChatText('pm', 10);
    expect(app.settings.get().chats.pm).toEqual({ text: 110 });
    app.actions.stepTextAll(20);
    expect(app.settings.get()).toMatchObject({ textAll: 120, chats: {} });
    app.actions.setChatLocked('pm', false);
    expect(app.settings.get().chats.pm).toEqual({ locked: false });
    app.actions.setChatLocked('pm', true);
    expect(app.settings.get().chats.pm).toBeUndefined();
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/app.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/app.js`**

Imports:
- Extend the `./settings.js` import with `setSettingsTab, setMentionSound, setVolume, setMentionWords, setTextAll, updateChat, restoreDefaults, applyBackupSettings`.
- Add `import { textOf, clampText } from './chat-custom/chats.js';`.
- Add `import { createMentionMarks } from './ui/mention-marks.js';`.
- Change `import { createGameClock } from './ui/game-clock.js';` to `import { createGameClock, TIME } from './ui/game-clock.js';`.

Constants, after `PRESENCE_PER_SWEEP`:

```js
// The mention sound: only for a message sent in the last 2 minutes, and at most once every 5 seconds.
const MENTION_RECENT_MS = 2 * 60 * 1000;
const MENTION_GAP_MS = 5000;
```

In `onNewMail`, play at the chosen volume:

```js
      const s = settings.get();
      if (s.sound !== 'off') sound.play(s.sound, { volume: s.volume });
```

(Replace the two lines that read `const name = settings.get().sound;` and `if (name !== 'off') sound.play(name);`.)

Add to `actions` (next to the existing settings actions):

```js
    setSettingsTab: (tab) => settings.update((s) => setSettingsTab(s, tab)),
    setMentionSound(name) {
      settings.update((s) => setMentionSound(s, name));
      sound.unlock();
    },
    setVolume: (v) => settings.update((s) => setVolume(s, v)),
    setMentions: (on) => settings.update((s) => setFlag(s, 'mentions', on)),
    // Returns the cleaned list, for the text field to show.
    setMentionWords(text) {
      settings.update((s) => setMentionWords(s, text));
      return settings.get().mentionWords;
    },
    setClock12: (on) => settings.update((s) => setFlag(s, 'clock12', on)),
    setChatLocked: (key, locked) => settings.update((s) => updateChat(s, key, { locked: locked ? null : false })),
    stepChatText: (key, delta) => settings.update((s) => updateChat(s, key, { text: clampText(textOf(s.chats[key], s.textAll) + delta) })),
    returnChat: (key) => settings.update((s) => updateChat(s, key, { x: null, y: null })),
    resetChatSize: (key) => settings.update((s) => updateChat(s, key, { w: null, h: null })),
    stepTextAll: (delta) => settings.update((s) => setTextAll(s, s.textAll + delta)),
    restoreDefaults: () => settings.update((s) => restoreDefaults(s)),
```

Replace the backup actions:

```js
    exportBackup: () => exportFriends(store.get(), playerId, enemies.get(), settings.get()),
    importBackup(text) {
      const r = parseImport(text, playerId);
      if (!r.ok) return r;
      const f = store.update((s) => mergeImport(s, r.friends, now()));
      const e = r.enemies.length ? enemies.update((d) => mergeEnemiesImport(d, r.enemies, now())) : { added: 0, notes: 0 };
      let restored;
      if (r.settings) {
        try {
          settings.update((s) => applyBackupSettings(s, r.settings));
          restored = 'restored';
        } catch {
          restored = 'unreadable';
        }
      }
      return { ok: true, added: f.added, enemiesAdded: e.added, notes: f.notes + e.notes, settings: restored };
    },
```

(The app test from Task 7 expects `toEqual({ ok: true, added: 0, enemiesAdded: 1, notes: 0 })`. A file with settings now adds `settings: 'restored'`, so change that assertion to `toMatchObject`.)

Replace the `gameClock` / `marks` lines with:

```js
  // Every chat time in Zed City time: the game's own chats print the browser clock, so theirs get rewritten.
  const gameClock = createGameClock({ doc, storage, key: `zcf:v1:${playerId}:gameClock`, now, onChange: () => marks.refresh() });
  // A mention arriving while you watch: the mention sound, if it's on, for a message from the last 2
  // minutes, at most every 5 seconds, and not when another game tab has focus (it hears it itself).
  let lastMentionSound = 0;
  function onMention(row) {
    const s = settings.get();
    if (s.mentionSound === 'off' || tabFocus.elsewhere()) return;
    const el = row.querySelector(TIME);
    const ts = el ? gameClock.momentOf(el) : null;
    const t = now();
    if (ts === null || t - ts > MENTION_RECENT_MS || t - lastMentionSound < MENTION_GAP_MS) return;
    lastMentionSound = t;
    sound.play(s.mentionSound, { volume: s.volume });
  }
  const mentionMarks = createMentionMarks({
    doc,
    win,
    words: () => [playerName, ...settings.get().mentionWords].filter(Boolean),
    enabled: () => settings.get().mentions,
    myName: playerName || '',
    onMention,
  });
  const marks = createEnemyMarks({
    doc,
    win,
    keeper,
    names: () => enemyNames(enemies.get()),
    onRow: (row, info) => {
      gameClock.rewrite(row, 'game', { h12: settings.get().clock12 });
      mentionMarks.mark(row, info);
    },
  });
```

Pass the clock to the time hover:

```js
  const timeHover = createTimeHover({ doc, win, now, gameClock, showLocal: () => settings.get().hoverLocal, clock12: () => settings.get().clock12 });
```

Replace the `settings.subscribe(...)` block with:

```js
  // The game chats' rows depend on the clock and the mention settings: redo them when those change.
  const rowsSig = () => {
    const s = settings.get();
    return JSON.stringify([s.clock12, s.mentions, s.mentionWords]);
  };
  let lastRowsSig = rowsSig();
  settings.subscribe(() => {
    renderDock();
    syncTitle();
    const sig = rowsSig();
    if (sig !== lastRowsSig) {
      lastRowsSig = sig;
      marks.refresh();
    }
  });
```

Unlock audio for either sound:

```js
  const unlockSound = () => {
    const s = settings.get();
    if (s.sound !== 'off' || s.mentionSound !== 'off') sound.unlock();
  };
```

In `destroy()`, after `marks.destroy();` add `mentionMarks.destroy();`.

- [ ] **Step 4: Add the new actions to `test/ui/services.js`**

Extend its `../../src/settings.js` import with `setSettingsTab, setMentionSound, setVolume, setMentionWords, setTextAll, updateChat, restoreDefaults` and add `import { textOf, clampText } from '../../src/chat-custom/chats.js';`. Add to `actions`:

```js
    setSettingsTab: vi.fn((tab) => settings.update((s) => setSettingsTab(s, tab))),
    setMentionSound: vi.fn((name) => settings.update((s) => setMentionSound(s, name))),
    setVolume: vi.fn((v) => settings.update((s) => setVolume(s, v))),
    setMentions: vi.fn((on) => settings.update((s) => setFlag(s, 'mentions', on))),
    setMentionWords: vi.fn((text) => {
      settings.update((s) => setMentionWords(s, text));
      return settings.get().mentionWords;
    }),
    setClock12: vi.fn((on) => settings.update((s) => setFlag(s, 'clock12', on))),
    setChatLocked: vi.fn((key, locked) => settings.update((s) => updateChat(s, key, { locked: locked ? null : false }))),
    stepChatText: vi.fn((key, delta) => settings.update((s) => updateChat(s, key, { text: clampText(textOf(s.chats[key], s.textAll) + delta) }))),
    returnChat: vi.fn((key) => settings.update((s) => updateChat(s, key, { x: null, y: null }))),
    resetChatSize: vi.fn((key) => settings.update((s) => updateChat(s, key, { w: null, h: null }))),
    stepTextAll: vi.fn((delta) => settings.update((s) => setTextAll(s, s.textAll + delta))),
    restoreDefaults: vi.fn(() => settings.update((s) => restoreDefaults(s))),
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app.js test/ui/services.js test/app.test.js
git commit -m "feat: wire mentions, the 12-hour clock, volume, chat text and backup settings into the app"
```

---

### Task 9: The Chat settings window, in tabs

**Files:**
- Rewrite: `src/ui/settings-window.js`
- Create: `src/ui/settings/controls.js`, `src/ui/settings/general-tab.js`, `src/ui/settings/chats-tab.js`, `src/ui/settings/about-tab.js`
- Modify: `src/ui/styles.js`
- Rewrite: `test/ui/settings-window.test.js`

- [ ] **Step 1: Write the new test file**

Replace `test/ui/settings-window.test.js` with:

```js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSettingsWindow } from '../../src/ui/settings-window.js';
import { openDm } from '../../src/state.js';
import { updateChat, setMuted } from '../../src/settings.js';
import { WHATS_NEW } from '../../src/whats-new.js';
import { DEV_PROFILE_ID, UPDATE_URL } from '../../src/version.js';
import { makeServices } from './services.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { flush } from '../helpers.js';

let current = null;
function mount({ open = true, fetchImpl } = {}) {
  document.body.innerHTML = DOCK_HTML;
  const services = makeServices({ fetchImpl });
  const w = createSettingsWindow(services);
  const root = document.createElement('div');
  root.className = 'zcf-root';
  root.appendChild(w.el);
  document.querySelector('.chat-containers').prepend(root);
  services.store.subscribe(() => w.update());
  services.settings.subscribe(() => w.update());
  if (open) services.store.update((s) => { s.dock.settingsOpen = true; });
  w.update();
  current = w;
  return { services, w, el: w.el };
}
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const tab = (el, name) => button(el.querySelector('[role="tablist"]'), name);
const box = (el, label) => [...el.querySelectorAll('.zcf-set-toggle')].find((l) => l.querySelector('.zcf-set-label').textContent === label).querySelector('input');
const chatRows = (el) => [...el.querySelectorAll('.zcf-set-chat')].map((r) => [r.querySelector('.zcf-name').textContent, r.querySelector('.zcf-status').textContent]);

describe('chat settings window', () => {
  afterEach(() => {
    if (current) current.destroy();
    current = null;
  });

  it('is a plain cog tab, never with a badge or dot', () => {
    const { el } = mount({ open: false });
    expect(el.dataset.zcfChat).toBe('settings');
    expect(el.classList.contains('chat-minimized')).toBe(true);
    expect(el.querySelector('.chat-icon').className).toContain('fa-cog');
    expect(el.querySelector('.q-badge, .unread-badge, .zcf-badge, .zcf-pill')).toBeNull();
    expect(el.querySelector('.zcf-body').hidden).toBe(true);
  });

  it('opens on General with three tabs, and remembers the tab', () => {
    const { services, el } = mount();
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['General', 'Chats', 'About']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(el.textContent).toContain('Desktop notifications');
    tab(el, 'About').click();
    expect(services.settings.get().settingsTab).toBe('about');
    expect(el.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('About');
    expect(el.textContent).not.toContain('Desktop notifications');
  });

  describe('General', () => {
    it('has the notification boxes, with Friends only and Test waiting on notifications', () => {
      const { services, el } = mount();
      expect(box(el, 'Desktop notifications').checked).toBe(false);
      expect(box(el, 'Friends only').disabled).toBe(true);
      expect(button(el, 'Test').disabled).toBe(true);
      expect(box(el, 'Unread count in the browser tab').checked).toBe(true);
      box(el, 'Desktop notifications').click();
      expect(services.actions.setNotify).toHaveBeenCalledWith(true);
      expect(box(el, 'Friends only').disabled).toBe(false);
      button(el, 'Test').click();
      expect(services.notifier.show).toHaveBeenCalledWith(expect.objectContaining({ id: 0, title: 'Zed City Friends' }));
      expect(services.toast).toHaveBeenCalledWith("Your browser didn't show it. Check its notification settings.", { error: true });
      box(el, 'Unread count in the browser tab').click();
      expect(services.actions.setTitleCount).toHaveBeenCalledWith(false);
    });

    it('explains when the browser blocks notifications or has none', () => {
      const { services, el, w } = mount();
      services.notifier.permission.mockReturnValue('denied');
      w.update();
      expect(el.querySelector('.zcf-set-note').textContent).toContain('blocked');
      services.notifier.supported = false;
      w.update();
      expect(el.querySelector('.zcf-set-note').textContent).toContain('Not supported');
      expect(box(el, 'Desktop notifications').disabled).toBe(true);
    });

    it('picks both sounds, plays them at the volume, and saves the volume', () => {
      const { services, el } = mount();
      const pm = el.querySelector('select[aria-label="New private message sound"]');
      const mention = el.querySelector('select[aria-label="Mention sound"]');
      pm.value = 'ping';
      pm.dispatchEvent(new Event('change'));
      mention.value = 'bell';
      mention.dispatchEvent(new Event('change'));
      expect(services.settings.get()).toMatchObject({ sound: 'ping', mentionSound: 'bell' });
      const volume = el.querySelector('input[type="range"]');
      volume.value = '40';
      volume.dispatchEvent(new Event('change'));
      expect(services.settings.get().volume).toBe(40);
      expect(services.sound.play).toHaveBeenLastCalledWith('ping', { fromUser: true, volume: 40 });
      el.querySelectorAll('.zcf-set-play')[1].click();
      expect(services.sound.play).toHaveBeenLastCalledWith('bell', { fromUser: true, volume: 40 });
    });

    it('takes mention words and tidies them, and turns highlights off', () => {
      const { services, el } = mount();
      expect(box(el, 'Highlight messages that mention you').checked).toBe(true);
      expect(el.textContent).toContain('your name, Me');
      const words = el.querySelector('input[aria-label="Also highlight these words"]');
      words.value = ' DWR, dwr , mothy,x';
      words.dispatchEvent(new Event('change'));
      expect(services.settings.get().mentionWords).toEqual(['DWR', 'mothy']);
      expect(words.value).toBe('DWR, mothy');
      box(el, 'Highlight messages that mention you').click();
      expect(services.settings.get().mentions).toBe(false);
      expect(words.disabled).toBe(true);
    });

    it('has the 12-hour clock and the time hover boxes', () => {
      const { services, el } = mount();
      box(el, '12-hour clock').click();
      expect(services.settings.get().clock12).toBe(true);
      box(el, 'Your own time in the time hover').click();
      expect(services.actions.setHoverLocal).toHaveBeenCalledWith(false);
    });

    it('marks all as read with progress, and closes all private chats', async () => {
      const { services, el } = mount();
      let finish;
      services.actions.markAllRead.mockImplementation((onProgress) => new Promise((resolve) => {
        onProgress(1, 3);
        finish = () => resolve(3);
      }));
      button(el, 'Mark all as read').click();
      expect(el.textContent).toContain('Marking… 1/3');
      finish();
      await flush();
      expect(button(el, 'Mark all as read')).toBeTruthy();
      button(el, 'Close all private chats').click();
      expect(services.actions.closeAllDms).toHaveBeenCalled();
    });

    it('keeps focus on the sound picker when the window redraws', () => {
      const { services, el } = mount();
      const select = el.querySelector('select[aria-label="New private message sound"]');
      select.focus();
      services.settings.update((s) => updateChat(s, 'pm', { text: 120 }));
      expect(document.activeElement).toBe(select);
    });
  });

  describe('Chats', () => {
    it('lists game chats, then private chats, in plain words, and opens one row at a time', () => {
      const { services, el } = mount();
      services.store.update((s) => openDm(s, 5, { username: 'Spike', now: 1 }));
      services.settings.update((s) => {
        updateChat(s, 'game:general', { x: 1, y: 2, w: 420, h: 520, text: 120 });
        updateChat(s, 'dm:9', { text: 90 });
      });
      tab(el, 'Chats').click();
      expect(chatRows(el)).toEqual([
        ['Global', 'Moved · Resized · Text 120%'],
        ['Faction', 'As the game made it'],
        ['Private Messages', 'As it came'],
        ['#9', 'Text 90%'],
        ['Spike', 'As it came'],
        ['Chat settings', 'As it came'],
      ]);
      const global = el.querySelectorAll('.zcf-set-chat')[0];
      global.click();
      expect(el.querySelectorAll('.zcf-set-panel')).toHaveLength(1);
      const panel = el.querySelector('.zcf-set-panel');
      expect(panel.textContent).toContain('Moved');
      expect(panel.textContent).toContain('420 × 520');
      button(panel, 'Back to the dock').click();
      expect(services.settings.get().chats['game:general']).toEqual({ w: 420, h: 520, text: 120 });
      button(el.querySelector('.zcf-set-panel'), 'Default size').click();
      button(el.querySelector('.zcf-set-panel'), 'Unlock').click();
      expect(services.settings.get().chats['game:general']).toEqual({ text: 120, locked: false });
      el.querySelector('.zcf-set-panel [aria-label="Larger text"]').click();
      expect(services.settings.get().chats['game:general'].text).toBe(130);
      button(el.querySelector('.zcf-set-panel'), 'Reset everything').click();
      expect(services.settings.get().chats['game:general']).toBeUndefined();
      el.querySelectorAll('.zcf-set-chat')[1].click();
      expect(el.querySelector('.zcf-set-chat[aria-expanded="true"] .zcf-name').textContent).toBe('Faction');
    });

    it('sets the text size for every chat, and resets all chats', () => {
      const { services, el } = mount();
      services.settings.update((s) => updateChat(s, 'pm', { w: 400 }));
      tab(el, 'Chats').click();
      el.querySelector('[aria-label="Larger text in every chat"]').click();
      expect(services.settings.get().textAll).toBe(110);
      expect(el.querySelector('.zcf-set-value').textContent).toBe('110%');
      button(el, 'Reset all chats').click();
      expect(services.settings.get()).toMatchObject({ chats: {}, textAll: 100 });
    });

    it('lists muted chats to unmute or open', () => {
      const { services, el } = mount();
      services.store.update((s) => openDm(s, 5, { username: 'Spike', now: 1 }));
      tab(el, 'Chats').click();
      expect(el.textContent).toContain('No muted chats.');
      services.settings.update((s) => {
        setMuted(s, 5, true);
        setMuted(s, 77, true);
      });
      const names = [...el.querySelectorAll('.zcf-set-mname')].map((b) => b.textContent);
      expect(names).toEqual(['#77', 'Spike']);
      button(el, 'Spike').click();
      expect(services.actions.openDm).toHaveBeenCalledWith(5, expect.objectContaining({ expand: true }));
      el.querySelectorAll('.zcf-set-mrow')[1].querySelector('.zcf-mini').click();
      expect(services.settings.get().muted).toEqual([77]);
    });
  });

  describe('About', () => {
    it('checks for updates on a click and offers the newer version', async () => {
      const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('// @version      99.0.0\n') }));
      const { el } = mount({ fetchImpl });
      tab(el, 'About').click();
      expect(el.textContent).toContain('Zed City Friends v');
      expect(fetchImpl).not.toHaveBeenCalled();
      button(el, 'Check for updates').click();
      expect(el.textContent).toContain('Checking…');
      await flush();
      await flush();
      expect(el.textContent).toContain('v99.0.0 is out');
      const link = [...el.querySelectorAll('a')].find((a) => a.textContent === 'Update now');
      expect(link.getAttribute('href')).toBe(UPDATE_URL);
      expect(link.getAttribute('target')).toBe('_blank');
    });

    it("shows What's new as titles to open, with earlier versions behind a toggle", () => {
      const { el } = mount();
      tab(el, 'About').click();
      const titles = () => [...el.querySelectorAll('.zcf-set-feat')].map((b) => b.textContent.trim());
      expect(titles()).toEqual(WHATS_NEW[0].features.map((f) => f.title));
      expect(el.querySelector('.zcf-set-points')).toBeNull();
      el.querySelector('.zcf-set-feat').click();
      expect(el.querySelector('.zcf-set-points').textContent).toContain(WHATS_NEW[0].features[0].points[0]);
      button(el, 'Earlier versions ▸').click();
      expect([...el.querySelectorAll('.zcf-news-vh')].map((n) => n.firstChild.textContent)).toEqual(WHATS_NEW.slice(1).map((v) => `v${v.version}`));
      expect(el.querySelector('.zcf-set-feat img, .zcf-set-points a')).toBeNull();
    });

    it('saves and loads a backup, and restores defaults after asking', () => {
      const { services, el } = mount();
      tab(el, 'About').click();
      const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      button(el, 'Load backup').click();
      expect(click).toHaveBeenCalled();
      click.mockRestore();
      services.settings.update((s) => { s.sound = 'bell'; });
      button(el, 'Restore default settings').click();
      expect(el.textContent).toContain('Put every setting back to how it came?');
      button(el, 'Cancel').click();
      expect(services.settings.get().sound).toBe('bell');
      button(el, 'Restore default settings').click();
      button(el, 'Restore').click();
      expect(services.actions.restoreDefaults).toHaveBeenCalled();
      expect(services.settings.get().sound).toBe('off');
      expect(button(el, 'Restore default settings')).toBeTruthy();
    });

    it("ends with a small link to the dev's profile, opened in-app", () => {
      const { services, el } = mount();
      tab(el, 'About').click();
      const link = el.querySelector('.zcf-set-dev');
      expect(link.textContent.trim()).toBe('Become friends or enemies with the dev!');
      expect(link.getAttribute('href')).toBe(`/profile/${DEV_PROFILE_ID}`);
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(services.router.navigate).toHaveBeenCalledWith(`/profile/${DEV_PROFILE_ID}`);
      expect(el.querySelector('.zcf-set-sec:last-child').lastElementChild).toBe(link);
    });
  });
});
```

Notes for this test file:
- `makeServices({ fetchImpl })` already accepts and returns `fetchImpl`.
- `services.notifier.show` is a `vi.fn()` returning `undefined`, which is why Test toasts the failure.
- The mock `setNotify` in services.js flips the setting directly.
- Row order: `#9` sorts before `Spike` by name within the private DMs (`'#' < 'S'`).

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/ui/settings-window.test.js`
Expected: FAIL.

- [ ] **Step 3: Create `src/ui/settings/controls.js`**

```js
// Building blocks for the Chat settings tabs (0.7 spec §1.2): section headings with an icon, the game's
// checkbox and dropdown looks (real inputs, restyled in styles.js), and a −/+ stepper.
import { h } from '../dom.js';
import { SOUNDS } from '../../settings.js';

const SOUND_LABELS = { off: 'Off', chirp: 'Chirp', ping: 'Ping', bell: 'Bell' };

// head: { icon, label, count }
export function section(head, ...children) {
  const title = head
    ? h('div', { class: 'zcf-set-h' },
      h('i', { class: `fas fa-${head.icon}`, 'aria-hidden': 'true' }),
      head.label,
      head.count ? h('span', { class: 'zcf-set-count' }, String(head.count)) : null)
    : null;
  return h('div', { class: 'zcf-set-sec' }, title, children);
}

// A checkbox with its label and an optional grey line under it. Extra controls go in `row` after the label.
export function checkRow({ label, sub = '', focus, indent = false, onChange }) {
  const input = h('input', { type: 'checkbox', class: 'zcf-check', 'data-zcf-focus': focus });
  input.addEventListener('change', () => onChange(input.checked));
  const subEl = h('span', { class: 'zcf-set-subline', hidden: !sub }, sub);
  const row = h('div', { class: `zcf-set-line${indent ? ' zcf-set-ind' : ''}` },
    h('label', { class: 'zcf-set-toggle' }, input, h('span', { class: 'zcf-set-text' }, h('span', { class: 'zcf-set-label' }, label), subEl)));
  return {
    input,
    row,
    setSub(text) {
      subEl.textContent = text;
      subEl.hidden = !text;
    },
  };
}

// A sound dropdown with its ▶ button. aria: the dropdown's name, e.g. "Mention sound".
export function soundRow({ label, aria, focus, onPick, onPlay }) {
  const select = h('select', { class: 'zcf-select', 'aria-label': aria, 'data-zcf-focus': focus },
    SOUNDS.map((k) => h('option', { value: k }, SOUND_LABELS[k])));
  const play = h('button', { class: 'zcf-mini zcf-set-play', type: 'button', title: 'Play it', 'aria-label': `Play the ${aria.toLowerCase()}`, 'data-zcf-focus': `${focus}-play` }, '▶');
  select.addEventListener('change', () => onPick(select.value));
  play.addEventListener('click', () => onPlay(select.value));
  const row = h('div', { class: 'zcf-set-line' }, h('span', { class: 'zcf-set-label zcf-grow' }, label), select, play);
  return {
    row,
    select,
    sync(value) {
      select.value = value;
      play.disabled = value === 'off';
    },
  };
}

// − value% +. name: what it sizes, for the buttons' labels ("text" → "Smaller text").
export function stepper({ value, min, max, name, focus, onStep }) {
  return h('span', { class: 'zcf-set-stepper' },
    h('button', { class: 'zcf-mini', type: 'button', 'aria-label': `Smaller ${name}`, 'data-zcf-focus': `${focus}-`, disabled: value <= min, onclick: () => onStep(-1) }, '−'),
    h('span', { class: 'zcf-set-value' }, `${value}%`),
    h('button', { class: 'zcf-mini', type: 'button', 'aria-label': `Larger ${name}`, 'data-zcf-focus': `${focus}+`, disabled: value >= max, onclick: () => onStep(1) }, '+'));
}
```

- [ ] **Step 4: Create `src/ui/settings/general-tab.js`**

```js
// Chat settings → General (0.7 spec Part 2): notifications, sounds and volume, mentions, time and quick
// actions. Every control is built once and kept, so a redraw never loses what you were doing in it.
import { h } from '../dom.js';
import { section, checkRow, soundRow } from './controls.js';

export function createGeneralTab({ services, doc = document }) {
  const { settings, actions, sound, toast } = services;
  let marking = null; // { done, total } while Mark all as read runs

  const play = (name) => sound.play(name, { fromUser: true, volume: settings.get().volume });

  const notify = checkRow({ label: 'Desktop notifications', sub: 'Pop up outside the game when a PM arrives', focus: 'notify', onChange: (on) => actions.setNotify(on) });
  const test = h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': 'notify-test', onclick: sendTest }, 'Test');
  notify.row.appendChild(test);
  const note = h('div', { class: 'zcf-set-note', hidden: true });
  const friendsOnly = checkRow({ label: 'Friends only', focus: 'notify-friends', indent: true, onChange: (on) => actions.setNotifyFriendsOnly(on) });
  const titleCount = checkRow({ label: 'Unread count in the browser tab', sub: 'Like (2) Zed City', focus: 'title-count', onChange: (on) => actions.setTitleCount(on) });

  const pmSound = soundRow({ label: 'New private message', aria: 'New private message sound', focus: 'sound', onPick: (name) => actions.setSound(name), onPlay: play });
  const mentionSound = soundRow({ label: 'Mention', aria: 'Mention sound', focus: 'mention-sound', onPick: (name) => actions.setMentionSound(name), onPlay: play });
  const volume = h('input', { type: 'range', class: 'zcf-set-range', min: 0, max: 100, step: 5, 'aria-label': 'Volume', 'data-zcf-focus': 'volume' });
  volume.addEventListener('change', () => {
    actions.setVolume(Number(volume.value));
    const s = settings.get();
    const name = s.sound !== 'off' ? s.sound : s.mentionSound;
    if (name !== 'off') sound.play(name, { fromUser: true, volume: s.volume });
  });

  const mentions = checkRow({ label: 'Highlight messages that mention you', focus: 'mentions', onChange: (on) => actions.setMentions(on) });
  const words = h('input', { type: 'text', class: 'zcf-set-input', 'aria-label': 'Also highlight these words', placeholder: 'e.g. your faction tag', maxlength: 400, 'data-zcf-focus': 'mention-words' });
  words.addEventListener('change', () => {
    words.value = actions.setMentionWords(words.value).join(', ');
  });

  const clock12 = checkRow({ label: '12-hour clock', sub: '2:27 PM instead of 14:27', focus: 'clock12', onChange: (on) => actions.setClock12(on) });
  const hoverLocal = checkRow({ label: 'Your own time in the time hover', sub: 'Under ZCT, when you rest on a chat time', focus: 'hover-local', onChange: (on) => actions.setHoverLocal(on) });

  const markBtn = h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'mark', onclick: markAll }, 'Mark all as read');
  const closeBtn = h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'closeall', onclick: () => actions.closeAllDms() }, 'Close all private chats');

  const nodes = [
    section({ icon: 'bell', label: 'Notifications' }, notify.row, note, friendsOnly.row, titleCount.row),
    section({ icon: 'volume-up', label: 'Sounds' }, pmSound.row, mentionSound.row,
      h('label', { class: 'zcf-set-line' }, h('span', { class: 'zcf-set-label zcf-grow' }, 'Volume'), volume)),
    section({ icon: 'at', label: 'Mentions' }, mentions.row,
      h('label', { class: 'zcf-set-line zcf-set-ind' }, h('span', { class: 'zcf-set-also' }, 'Also:'), words),
      h('div', { class: 'zcf-set-hint zcf-set-ind' }, 'Words or names, separated by commas')),
    section({ icon: 'clock', label: 'Time' }, clock12.row, hoverLocal.row),
    section({ icon: 'bolt', label: 'Quick actions' }, h('div', { class: 'zcf-set-btns' }, markBtn, closeBtn)),
  ];

  function sendTest() {
    const n = services.notifier;
    const shown = n && n.show({ id: 0, title: 'Zed City Friends', body: 'This is how a new private message will show up.' });
    if (!shown) toast("Your browser didn't show it. Check its notification settings.", { error: true });
  }

  async function markAll() {
    if (marking) return;
    marking = { done: 0, total: 0 };
    sync();
    try {
      await actions.markAllRead((done, total) => {
        marking = { done, total };
        sync();
      });
    } finally {
      marking = null;
      sync();
    }
  }

  // What the browser allows, in words, or '' when notifications can simply be switched on.
  function blockedNote() {
    const n = services.notifier;
    if (!n || !n.supported) return 'Not supported in this browser.';
    return n.permission() === 'denied' ? "Notifications are blocked for zed.city in your browser's site settings." : '';
  }

  function sync() {
    const s = settings.get();
    const supported = !!(services.notifier && services.notifier.supported);
    notify.input.checked = s.notify;
    notify.input.disabled = !supported;
    test.disabled = !(s.notify && supported);
    const blocked = blockedNote();
    note.textContent = blocked;
    note.hidden = !blocked;
    friendsOnly.input.checked = s.notifyFriendsOnly;
    friendsOnly.input.disabled = !s.notify;
    titleCount.input.checked = s.titleCount;
    pmSound.sync(s.sound);
    mentionSound.sync(s.mentionSound);
    if (doc.activeElement !== volume) volume.value = String(s.volume);
    mentions.input.checked = s.mentions;
    mentions.setSub(services.myName ? `In Global and Faction: your name, ${services.myName}` : 'In Global and Faction: your name');
    words.disabled = !s.mentions;
    if (doc.activeElement !== words) words.value = s.mentionWords.join(', ');
    clock12.input.checked = s.clock12;
    hoverLocal.input.checked = s.hoverLocal;
    markBtn.disabled = !!marking;
    markBtn.textContent = marking ? `Marking… ${marking.done}/${marking.total}` : 'Mark all as read';
  }

  return {
    sync,
    model: () => null, // nothing here is rebuilt: sync() keeps it current
    build: () => nodes,
  };
}
```

- [ ] **Step 5: Create `src/ui/settings/chats-tab.js`**

```js
// Chat settings → Chats (0.7 spec Part 3): the text size for every chat, then each chat as a row you tap to
// open its lock, text size, spot and size, then the muted chats.
import { h, avatar } from '../dom.js';
import { findChats } from '../chat-custom/registry.js';
import { GAME_CHATS, LIMITS, DEFAULT_TEXT, chatLabel, chatSummary, isLocked, isMoved, textOf, dmKey, dmIdOf } from '../../chat-custom/chats.js';
import { section, stepper } from './controls.js';

// Game chats in the game's order, then Private Messages, the DMs, and Chat settings itself last.
function rank(key) {
  const game = GAME_CHATS.findIndex((c) => c.key === key);
  if (game >= 0) return game;
  return key === 'pm' ? 10 : key === 'settings' ? 30 : 20;
}

export function createChatsTab({ services, doc = document, requestRender }) {
  const { store, settings, actions } = services;
  let openKey = null;

  // A player's name and picture from what we already know, or null. No API calls.
  function known(id) {
    const s = store.get();
    const d = s.dock.dms.find((x) => x.id === id);
    if (d && d.username) return { name: d.username, avatar: d.avatar || null };
    const f = s.friends[id];
    if (f && f.username) return { name: f.username, avatar: f.avatar || null };
    const e = services.enemies && services.enemies.get().enemies[id];
    if (e && e.username) return { name: e.username, avatar: e.avatar || null };
    const t = services.inbox && services.inbox.threads().find((x) => x.userId === id);
    if (t && t.username) return { name: t.username, avatar: t.avatar || null };
    return null;
  }

  // Every chat that exists now or has settings: the game's, ours, open DMs, and customized closed DMs.
  function chatRows() {
    const saved = settings.get().chats;
    const keys = new Set(['pm', 'settings']);
    for (const c of findChats(doc)) keys.add(c.key);
    for (const d of store.get().dock.dms) keys.add(dmKey(d.id));
    for (const k of Object.keys(saved)) keys.add(k);
    return [...keys]
      .map((key) => {
        const id = dmIdOf(key);
        const who = id ? known(id) : null;
        return { key, name: chatLabel(key, who ? who.name : null), entry: saved[key] || null };
      })
      .sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name));
  }

  function mutedRows() {
    return settings.get().muted.map((id) => {
      const who = known(id);
      return { id, name: who ? who.name : `#${id}`, known: !!who, avatar: who ? who.avatar : null };
    });
  }

  function model() {
    return { rows: chatRows(), muted: mutedRows(), openKey, textAll: settings.get().textAll, customized: Object.keys(settings.get().chats).length };
  }

  const mini = (label, focus, onclick) => h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': focus, onclick }, label);
  const pline = (label, ...controls) => h('div', { class: 'zcf-set-pline' }, h('span', null, label), controls);

  function panel(r, textAll) {
    const e = r.entry;
    const locked = isLocked(e);
    const w = e && e.w;
    const ht = e && e.h;
    return h('div', { class: 'zcf-set-panel' },
      pline(locked ? 'Locked' : 'Unlocked: drag it anywhere', mini(locked ? 'Unlock' : 'Lock', `lock:${r.key}`, () => actions.setChatLocked(r.key, !locked))),
      pline('Text size', stepper({ value: textOf(e, textAll), min: LIMITS.minText, max: LIMITS.maxText, name: 'text', focus: `text:${r.key}`, onStep: (d) => actions.stepChatText(r.key, d * LIMITS.textStep) })),
      pline(isMoved(e) ? 'Moved' : 'In the dock', isMoved(e) ? mini('Back to the dock', `dock:${r.key}`, () => actions.returnChat(r.key)) : null),
      pline(w || ht ? `${w || 'auto'} × ${ht || 'auto'}` : 'Default size', w || ht ? mini('Default size', `size:${r.key}`, () => actions.resetChatSize(r.key)) : null),
      e ? h('div', { class: 'zcf-set-pline zcf-set-pend' }, mini('Reset everything', `reset:${r.key}`, () => actions.resetChat(r.key))) : null);
  }

  function chatRow(r, textAll) {
    const open = openKey === r.key;
    const locked = isLocked(r.entry);
    const head = h('button', {
      class: 'zcf-set-chat',
      type: 'button',
      'aria-expanded': String(open),
      'data-zcf-focus': `row:${r.key}`,
      onclick: () => {
        openKey = open ? null : r.key;
        requestRender();
      },
    },
    h('i', { class: `fas ${locked ? 'fa-lock' : 'fa-lock-open zcf-unlocked'} zcf-set-lock`, 'aria-hidden': 'true' }),
    h('span', { class: 'zcf-row-main' },
      h('span', { class: 'zcf-name' }, r.name),
      h('span', { class: `zcf-status${r.entry ? ' zcf-set-changed' : ''}` }, chatSummary(r.entry, r.key.startsWith('game:')))),
    h('i', { class: `fas fa-chevron-${open ? 'down' : 'right'} zcf-set-chev`, 'aria-hidden': 'true' }));
    return open ? [head, panel(r, textAll)] : [head];
  }

  function mutedRow(m) {
    return h('div', { class: 'zcf-set-mrow' },
      avatar({ avatar: m.avatar, size: 22 }),
      h('button', { class: 'zcf-set-mname', type: 'button', 'data-zcf-focus': `open:${m.id}`, onclick: () => actions.openDm(m.id, { expand: true, username: m.known ? m.name : undefined }) }, m.name),
      mini('Unmute', `unmute:${m.id}`, () => actions.toggleMute(m.id)));
  }

  function build(m) {
    const game = m.rows.filter((r) => r.key.startsWith('game:'));
    const ours = m.rows.filter((r) => !r.key.startsWith('game:'));
    return [
      section(null, h('div', { class: 'zcf-set-line' },
        h('span', { class: 'zcf-set-text zcf-grow' }, h('span', { class: 'zcf-set-label' }, 'Text size for every chat'), h('span', { class: 'zcf-set-subline' }, 'Sets them all; change one below')),
        stepper({ value: m.textAll, min: LIMITS.minText, max: LIMITS.maxText, name: 'text in every chat', focus: 'textall', onStep: (d) => actions.stepTextAll(d * LIMITS.textStep) }))),
      game.length ? section({ icon: 'comments', label: 'Game chats' }, game.map((r) => chatRow(r, m.textAll))) : null,
      section({ icon: 'envelope', label: 'Private chats' }, ours.map((r) => chatRow(r, m.textAll)),
        h('button', { class: 'zcf-page-btn zcf-set-all', type: 'button', 'data-zcf-focus': 'resetall', disabled: !m.customized && m.textAll === DEFAULT_TEXT, onclick: () => actions.resetAllChats() }, 'Reset all chats')),
      section({ icon: 'bell-slash', label: 'Muted', count: m.muted.length },
        m.muted.length ? m.muted.map(mutedRow) : h('div', { class: 'zcf-set-empty' }, 'No muted chats. Mute one with the bell in its header.')),
    ];
  }

  return { model, build };
}
```

- [ ] **Step 6: Create `src/ui/settings/about-tab.js`**

```js
// Chat settings → About (0.7 spec Part 4): the version and Check for updates, a short What's new, your data
// (backup, restore defaults) and the dev's profile link.
import { h } from '../dom.js';
import { section } from './controls.js';
import { WHATS_NEW } from '../../whats-new.js';
import { VERSION, DEV_PROFILE_ID, UPDATE_URL } from '../../version.js';
import { checkForUpdate } from '../../update-check.js';

// backup: ui/backup-file.js
export function createAboutTab({ services, requestRender, backup }) {
  const { actions, router, toast } = services;
  let update = { status: 'idle' };
  const openFeatures = new Set(); // "version:index"
  let showOlder = false;
  let confirming = false;

  async function check() {
    if (update.status === 'checking') return;
    update = { status: 'checking' };
    requestRender();
    const opts = { current: VERSION };
    if (services.fetchImpl) opts.fetchImpl = services.fetchImpl;
    update = await checkForUpdate(opts);
    requestRender();
  }

  const model = () => ({ update, open: [...openFeatures], showOlder, confirming });

  function updateStatus() {
    if (update.status === 'checking') return h('span', { class: 'zcf-set-upd' }, 'Checking…');
    if (update.status === 'current') return h('span', { class: 'zcf-set-upd zcf-set-ok' }, h('i', { class: 'fas fa-check', 'aria-hidden': 'true' }), " You're up to date");
    if (update.status === 'newer') {
      return h('span', { class: 'zcf-set-upd zcf-set-new' }, `v${update.latest} is out · `,
        h('a', { class: 'zcf-set-link', href: UPDATE_URL, target: '_blank', rel: 'noopener', 'data-zcf-focus': 'update-now' }, 'Update now'));
    }
    if (update.status === 'failed') return h('span', { class: 'zcf-set-upd zcf-set-fail' }, "Couldn't check. Try again later.");
    return null;
  }

  function features(v) {
    return v.features.map((f, i) => {
      const id = `${v.version}:${i}`;
      const open = openFeatures.has(id);
      return [
        h('button', {
          class: 'zcf-set-feat',
          type: 'button',
          'aria-expanded': String(open),
          'data-zcf-focus': `feat:${id}`,
          onclick: () => {
            if (open) openFeatures.delete(id);
            else openFeatures.add(id);
            requestRender();
          },
        }, h('span', { class: 'zcf-grow' }, f.title), h('i', { class: `fas fa-chevron-${open ? 'down' : 'right'}`, 'aria-hidden': 'true' })),
        open ? h('ul', { class: 'zcf-set-points' }, f.points.map((p) => h('li', null, p))) : null,
      ];
    });
  }

  // A plain left click navigates in-app; middle and modified clicks open the profile in a new tab.
  function devLink() {
    if (!DEV_PROFILE_ID) return null;
    const href = `/profile/${DEV_PROFILE_ID}`;
    return h('a', {
      class: 'zcf-set-dev',
      href,
      'data-zcf-focus': 'dev',
      onclick: (e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.navigate(href);
      },
    }, h('i', { class: 'fas fa-user-plus', 'aria-hidden': 'true' }), ' Become friends or enemies with the dev!');
  }

  function restoreControls() {
    if (!confirming) {
      return h('button', {
        class: 'zcf-page-btn zcf-page-danger',
        type: 'button',
        'data-zcf-focus': 'restore',
        onclick: () => {
          confirming = true;
          requestRender();
        },
      }, 'Restore default settings');
    }
    return h('div', { class: 'zcf-set-confirm' },
      h('span', null, 'Put every setting back to how it came?'),
      h('button', {
        class: 'zcf-page-btn zcf-page-danger',
        type: 'button',
        'data-zcf-focus': 'restore-yes',
        onclick: () => {
          confirming = false;
          actions.restoreDefaults();
          toast('Settings are back to how they came.');
          requestRender();
        },
      }, 'Restore'),
      h('button', {
        class: 'zcf-page-btn',
        type: 'button',
        'data-zcf-focus': 'restore-no',
        onclick: () => {
          confirming = false;
          requestRender();
        },
      }, 'Cancel'));
  }

  function build() {
    const [latest, ...older] = WHATS_NEW;
    return [
      section(null,
        h('div', { class: 'zcf-set-about' }, `Zed City Friends v${VERSION}`),
        h('div', { class: 'zcf-set-line' },
          h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': 'check', disabled: update.status === 'checking', onclick: check }, 'Check for updates'),
          updateStatus())),
      section({ icon: 'star', label: `What's new in ${latest.version}` },
        features(latest),
        older.length
          ? h('button', {
            class: 'zcf-news-toggle',
            type: 'button',
            'aria-expanded': String(showOlder),
            'data-zcf-focus': 'older',
            onclick: () => {
              showOlder = !showOlder;
              requestRender();
            },
          }, `Earlier versions ${showOlder ? '▾' : '▸'}`)
          : null,
        showOlder ? older.map((v) => [h('div', { class: 'zcf-news-vh' }, `v${v.version}`, h('span', { class: 'zcf-news-date' }, v.date)), features(v)]) : null),
      section({ icon: 'save', label: 'Your data' },
        h('div', { class: 'zcf-set-hint' }, 'Friends, enemies, notes and these settings, in one file.'),
        h('div', { class: 'zcf-set-btns' },
          h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'save', onclick: () => backup.save() }, 'Save backup'),
          h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'load', onclick: () => backup.load() }, 'Load backup')),
        restoreControls(),
        h('div', { class: 'zcf-set-hint' }, 'Keeps your friends, enemies, pins and mutes.')),
      section(null, devLink()),
    ];
  }

  return {
    model,
    build,
    // The update result lasts until the window closes.
    reset() {
      update = { status: 'idle' };
      confirming = false;
    },
  };
}
```

The test `'shows What's new as titles...'` expects `.zcf-news-vh` entries for older versions only; that matches this build.

- [ ] **Step 7: Rewrite `src/ui/settings-window.js`**

```js
// The Chat settings window (0.7 spec Part 1): the cog tab in the dock's corner, opening into General, Chats
// and About tabs (ui/settings/). The cog never shows a badge or a dot.
import { h, clear, icon } from './dom.js';
import { SETTINGS_TABS } from '../settings.js';
import { createGeneralTab } from './settings/general-tab.js';
import { createChatsTab } from './settings/chats-tab.js';
import { createAboutTab } from './settings/about-tab.js';
import { createBackupFile } from './backup-file.js';

const TAB_LABELS = { general: 'General', chats: 'Chats', about: 'About' };

export function createSettingsWindow(services, { doc = document } = {}) {
  const { store, settings, actions } = services;
  let lastSig = null;
  let lastTab = null;

  const titleText = h('span', null, 'Chat settings');
  const title = h('div', { class: 'chat-title' }, h('i', { class: 'fas fa-cog chat-icon', 'aria-hidden': 'true' }), titleText);
  const toggle = h('div', { class: 'chat-toggle', 'aria-hidden': 'true' }, icon('chevron-down'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleSettings() }, title, toggle);
  const tabButtons = SETTINGS_TABS.map((tab) => h('button', {
    class: 'zcf-pm-tab',
    type: 'button',
    role: 'tab',
    'data-zcf-focus': `tab:${tab}`,
    onclick: () => actions.setSettingsTab(tab),
  }, TAB_LABELS[tab]));
  const tabBar = h('div', { class: 'zcf-pm-tabs', role: 'tablist', 'aria-label': 'Chat settings' }, tabButtons);
  const content = h('div', { class: 'zcf-set', role: 'tabpanel' });
  const scroller = h('div', { class: 'zcf-set-scroll' }, content);
  const backup = createBackupFile({ doc, actions, toast: services.toast, playerId: services.playerId });
  const body = h('div', { class: 'chat-content zcf-body' }, h('div', { class: 'zcf-set-main zcf-zoom' }, tabBar, scroller), backup.input);
  const el = h('div', { class: 'chat-container zcf zcf-settings', dataset: { zcfChat: 'settings' } }, header, body);

  const requestRender = () => render();
  const tabs = {
    general: createGeneralTab({ services, doc }),
    chats: createChatsTab({ services, doc, requestRender }),
    about: createAboutTab({ services, requestRender, backup }),
  };

  function render() {
    if (!store.get().dock.settingsOpen) return;
    const tab = settings.get().settingsTab;
    const t = tabs[tab] || tabs.general;
    tabButtons.forEach((b, i) => {
      const on = SETTINGS_TABS[i] === tab;
      b.classList.toggle('zcf-pm-tab-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (t.sync) t.sync();
    const model = t.model();
    const sig = JSON.stringify([tab, model]);
    if (sig === lastSig) return;
    lastSig = sig;
    // Controls are rebuilt; their focus keys hand focus back afterwards.
    const active = doc.activeElement;
    const focusKey = el.contains(active) && active.dataset ? active.dataset.zcfFocus : undefined;
    const scrollTop = tab === lastTab ? scroller.scrollTop : 0;
    lastTab = tab;
    clear(content);
    for (const node of t.build(model)) if (node) content.appendChild(node);
    scroller.scrollTop = scrollTop;
    if (focusKey) {
      const target = el.querySelector(`[data-zcf-focus="${focusKey}"]`);
      if (target && target !== doc.activeElement) target.focus();
    }
  }

  function update() {
    const open = !!store.get().dock.settingsOpen;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    titleText.hidden = !open;
    toggle.hidden = !open;
    el.title = open ? '' : 'Chat settings';
    if (open) render();
    else {
      lastSig = null;
      lastTab = null;
      tabs.about.reset();
    }
  }

  return {
    el,
    update,
    destroy() {
      clear(content);
    },
  };
}
```

- [ ] **Step 8: Replace the settings CSS in `src/ui/styles.js`**

Delete the rules from `.zcf-settings:not(.chat-minimized) .chat-content{overflow-y:auto}` down to and including `.zcf-news-f ul{...}` (lines 48–78 today; keep `.chat-containers .zcf-settings{order:4}`). Replace them with:

```
.zcf-settings:not(.chat-minimized){height:450px}
.zcf-settings:not(.chat-minimized) .chat-content{overflow:hidden}
.zcf-set-main{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.zcf-set-scroll{flex:1 1 auto;min-height:0;overflow-y:auto}
.zcf-set{padding:0 0 8px}
.zcf-set-sec{padding:10px 12px 6px;border-bottom:1px solid #ffffff0d}
.zcf-set-sec:last-child{border-bottom:0}
.zcf-set-h{display:flex;align-items:center;gap:7px;font-family:Oswald,sans-serif;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:#9e9e9e;margin-bottom:4px}
.zcf-set-h i{width:14px;text-align:center;color:#6fb3c8;font-size:11px}
.zcf-set-count{margin-left:auto;font-family:Roboto,sans-serif;letter-spacing:0;text-transform:none;font-size:11px;color:#6fb3c8}
.zcf-set-line{display:flex;align-items:center;gap:10px;padding:5px 0;font-size:12.5px}
.zcf-set-ind{padding-left:26px}
.zcf-grow{flex:1;min-width:0}
.zcf-set-toggle{flex:1;min-width:0;display:flex;align-items:flex-start;gap:10px;cursor:pointer}
.zcf-set-toggle:has(input:disabled){cursor:default}
.zcf-set-text{display:flex;flex-direction:column;min-width:0}
.zcf-set-subline{font-size:11px;color:#ffffff66;margin-top:1px}
.zcf-set-toggle input:disabled ~ .zcf-set-text{opacity:.45}
.zcf .zcf-check{appearance:none;-webkit-appearance:none;flex:none;box-sizing:border-box;width:16px;height:16px;margin:1px 0 0;border:2px solid #ffffffb3;border-radius:2px;background:transparent;display:inline-grid;place-content:center;cursor:pointer}
.zcf .zcf-check:checked{background:#0a748f;border-color:#0a748f}
.zcf .zcf-check:checked::after{content:"";width:8px;height:4px;border:solid #fff;border-width:0 0 2px 2px;transform:translateY(-1px) rotate(-45deg)}
.zcf .zcf-check:disabled{opacity:.45;cursor:default}
.zcf .zcf-check:focus-visible,.zcf .zcf-select:focus-visible,.zcf .zcf-set-input:focus-visible,.zcf .zcf-set-range:focus-visible{outline:2px solid #6fb3c8;outline-offset:2px}
.zcf .zcf-select{appearance:none;-webkit-appearance:none;background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0h8L4 5z' fill='%23ffffff99'/%3E%3C/svg%3E") no-repeat right 2px center;border:0;border-bottom:1px solid #ffffff4d;border-radius:0;color:#e6e6e6;font:inherit;font-size:12.5px;padding:2px 16px 2px 0;cursor:pointer}
.zcf .zcf-select option{background:#16181c;color:#e0e0e0}
.zcf .zcf-set-input{flex:1;min-width:0;background:transparent;border:0;border-bottom:1px solid #ffffff4d;border-radius:0;color:#e6e6e6;font:inherit;font-size:12.5px;padding:3px 0}
.zcf .zcf-set-input::placeholder{color:#ffffff4d}
.zcf .zcf-set-input:disabled{opacity:.45}
.zcf .zcf-set-range{width:120px;margin:0;accent-color:#0a748f;cursor:pointer}
.zcf-set-also{flex:none;font-size:12px;color:#bdbdbd}
.zcf-set-hint{font-size:11px;color:#ffffff66;padding:0 0 4px}
.zcf-set-btns{display:flex;flex-wrap:wrap;gap:6px;padding:3px 0 5px}
.zcf-set-play:disabled{opacity:.4;cursor:default}
.zcf-set-note{font-size:11px;color:#f2c037;padding:0 0 4px 26px}
.zcf-set-chat{display:flex;align-items:center;gap:8px;width:100%;padding:5px 0;background:none;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.zcf-set-chat .zcf-row-main{display:flex;flex-direction:column}
.zcf-set-chat:hover .zcf-name{color:#fff}
.zcf-set-lock{width:14px;flex:none;text-align:center;color:#ffffff59;font-size:11px}
.zcf-set-lock.zcf-unlocked{color:#f2c037}
.zcf-set-chev{flex:none;width:12px;text-align:center;color:#ffffff40;font-size:10px}
.zcf-status.zcf-set-changed{color:#6fb3c8;opacity:1}
.zcf-set-panel{background:#0f1114;margin:2px -12px 4px;padding:6px 12px 8px 34px;border-top:1px solid #000;border-bottom:1px solid #000}
.zcf-set-pline{display:flex;align-items:center;gap:8px;min-height:26px;font-size:12px;color:#bdbdbd}
.zcf-set-pline > span:first-child{flex:1;min-width:0}
.zcf-set-pend{justify-content:flex-end}
.zcf-set-stepper{flex:none;display:inline-flex;align-items:center;gap:3px}
.zcf-set-value{min-width:38px;text-align:center;font-size:11.5px;color:#e6e6e6}
.zcf-set-all{margin-top:6px}
.zcf-set-mrow{display:flex;align-items:center;gap:8px;padding:4px 0}
.zcf-set-mname{flex:1;min-width:0;background:none;border:0;padding:0;color:inherit;font:inherit;font-weight:500;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zcf-set-mname:hover{text-decoration:underline}
.zcf-set-empty{font-size:11.5px;color:#ffffff66;padding:2px 0 4px}
.zcf-set-about{font-size:14px;font-weight:500;padding:2px 0 2px}
.zcf-set-upd{font-size:11px;color:#ffffff99}
.zcf-set-ok{color:#629464}
.zcf-set-new{color:#f2c037}
.zcf-set-fail{color:#ff8a8a}
.zcf-set-link{color:#6fb3c8}
.zcf-set-feat{display:flex;align-items:center;gap:8px;width:100%;padding:5px 0;background:none;border:0;border-top:1px solid #ffffff08;color:inherit;font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.zcf-set-feat i{font-size:9px;color:#ffffff40}
.zcf-set-points{margin:0 0 4px;padding-left:16px;font-size:11.5px;color:#bdbdbd;line-height:1.45}
.zcf-set-confirm{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;padding:3px 0}
.zcf-set-dev{display:inline-block;color:#6fb3c8;font-size:11px;text-decoration:none;opacity:.8}
.zcf-set-dev:hover{opacity:1;text-decoration:underline}
.zcf-set-dev i{font-size:10px}
.zcf-news-toggle{display:block;background:none;border:0;padding:6px 0 2px;color:#6fb3c8;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.zcf-news-toggle:hover{text-decoration:underline}
.zcf-news-vh{display:flex;gap:8px;align-items:baseline;margin-top:8px;font-size:12px;font-weight:700}
.zcf-news-date{font-size:11px;font-weight:400;opacity:.45}
```

In the phone `@media (max-width:599.98px)` block, next to `.zcf-pm:not(.chat-minimized){height:min(450px,60vh)}`, add:

```
  .zcf-settings:not(.chat-minimized){height:min(450px,60vh)}
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run`
Expected: PASS. If `test/ui/styles.test.js` names an order-dependent rule, raise our selector's specificity (e.g. `.chat-containers .zcf-settings:not(.chat-minimized)`) instead of relying on source order. That file's header explains why.

- [ ] **Step 10: Commit**

```bash
git add src/ui/settings-window.js src/ui/settings src/ui/styles.js test/ui/settings-window.test.js
git commit -m "feat: Chat settings in General, Chats and About tabs, with game-styled controls"
```

---

### Task 10: Release 0.7.0, preview scenes, visual check

**Files:**
- Modify: `src/whats-new.js`, `package.json`, `test/version.test.js`, `test/build.test.js`
- Modify: `tools/preview/harness.js`, `tools/preview/shoot.mjs`
- Build: `dist/zed-city-friends.user.js`

- [ ] **Step 1: What's new and the version**

Add at the top of `WHATS_NEW` in `src/whats-new.js` (date = the day the release commit is made):

```js
  {
    version: '0.7.0',
    date: '2026-09-30',
    features: [
      {
        title: 'Chat settings, reorganised',
        points: [
          'General, Chats and About tabs, with checkboxes and dropdowns that look like the game.',
          "Tap a chat in the Chats tab to lock it, change its text size, or put it back in the dock. One size can set every chat's text at once.",
          'Unmute chats from the Muted list.',
        ],
      },
      {
        title: 'Mentions',
        points: ['Messages in Global and Faction that say your name, or words you add, are highlighted. A mention sound can go with them.'],
      },
      {
        title: 'Sounds and time',
        points: ['A volume for the sounds, a Test button for desktop notifications, and a 12-hour clock.'],
      },
      {
        title: 'Your data',
        points: ['One backup file now holds your friends, enemies, notes and settings. Check for updates and restore default settings in About.'],
      },
    ],
  },
```

Set `"version": "0.7.0"` in `package.json`. In `test/version.test.js`, change the expectations to `'0.7.0'` and `['0.7.0', '0.6.0', '0.5.x', '0.4.x', '0.3.x', '0.2.x', '0.1.x']`. In `test/build.test.js`, raise the size cap to `360 * 1024` and extend its comment: "…and since 0.7.0 the tabbed Chat settings and mentions."

- [ ] **Step 2: Preview scenes**

In `tools/preview/harness.js`:
- Replace the `if (scene === 'settings') {...}` setup block with one covering all four settings scenes:

```js
const SETTINGS_TAB = { 'settings-general': 'general', 'settings-chats': 'chats', 'settings-about': 'about' };
if (SETTINGS_TAB[scene]) {
  dock.settingsOpen = true;
  dock.dms.push({ id: 5, open: false, lastUsed: 2, username: 'Spike', avatar: null });
  settings.settingsTab = SETTINGS_TAB[scene];
  settings.sound = 'chirp';
  settings.muted = [10, 11];
  settings.mentionWords = ['DWR'];
  settings.chats = { 'game:general': { x: 60, y: 90, w: 460, h: 520, text: 120, locked: false }, pm: { text: 110 }, 'dm:5': { w: 420 } };
}
if (scene === 'mention') settings.mentionWords = ['DWR'];
```

- After `document.body.innerHTML = ...`, add the mention messages:

```js
if (scene === 'mention') {
  const pad = (n) => String(n).padStart(2, '0');
  const at = (min) => {
    const d = new Date(Date.now() - min * 60000);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const line = (name, min, text) => `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span class="msg-time" style="margin-left:8px;font-size:11px;color:#757575">${at(min)}</span></div><div>${text}</div></div></div></div></div>`;
  document.querySelector('.general-chat .msg-cont').parentElement.insertAdjacentHTML('beforeend',
    line('Rustbucket', 1, 'moth you coming to the bunker?') + line('Hollow', 1, 'anyone got meds') + line('Gravedigger', 0, 'DWR raid at 8, bring meds'));
}
```

- Name the harness player **Moth** in every scene: `createApp({ api, playerId: ME, playerName: 'Moth', storage, sound: { play() {}, unlock() {} } });`. With the old name "Me", the sample chat's "pm me" would light up as a mention in every screenshot. "Moth" appears only as a sender ("omw"), and your own messages never count.
- Replace the old `if (scene === 'settings') { setTimeout(...) }` block with one that opens Global's row on the Chats scene:

```js
if (scene === 'settings-chats') {
  setTimeout(() => {
    const row = document.querySelector('.zcf-set-chat');
    if (row) row.click();
  }, 300);
}
```

In `tools/preview/shoot.mjs`:

```js
const DESKTOP = ['pm-chats', 'pm-friends', 'pm-faction', 'pm-blocked', 'settings-general', 'settings-chats', 'settings-about', 'mention', 'custom', 'enemies', 'profile'];
const PHONE = ['pm-chats', 'pm-friends', 'settings-general', 'settings-chats', 'dm'];
```

- [ ] **Step 3: Build and shoot**

Run:
```bash
npx vitest run
npm run build
node tools/preview/shoot.mjs "<scratchpad>/shots-0.7"
```
Expected: all tests pass, `Built dist/zed-city-friends.user.js`, one `shot` line per scene.

Open the settings and mention screenshots with the Read tool, and compare them against the approved mockup (`.superpowers/brainstorm/*/content/full-design.html`). Check each of these:
- The tab strip matches Private Messages.
- The checkboxes are teal squares with a white tick.
- The dropdowns are underlined.
- The Chats rows open one at a time.
- The Muted list shows TradeGuy and Hollow.
- About's What's new is a handful of lines.
- The mention scene shows the yellow bar and tint on the two mentions and the yellow words (headless Edge supports `::highlight`).
- On phone, the window is full width and nothing overflows horizontally.

Fix any layout issue found (CSS only, unless it's a real bug), rebuild and reshoot.

- [ ] **Step 4: Commit**

```bash
git add src/whats-new.js package.json test/version.test.js test/build.test.js tools/preview/harness.js tools/preview/shoot.mjs dist/zed-city-friends.user.js
git commit -m "release: 0.7.0 with Chat settings in tabs, mentions, 12-hour clock, volume and backup with settings"
```

---

### Task 11: Final review

- [ ] **Step 1: One review of the whole branch**

Dispatch one code-review subagent over `git diff main...settings-redesign`. Point it at the spec and this plan, and ask for Critical/Important findings only, especially:
- **Vue safety:** game rows get only our inserted nodes, never attribute changes.
- **The mention sound:** it must never fire for history.
- **Backup:** a malformed file can't wipe settings.
- **Update check:** it fails softly.
- **Focus and scroll** across settings redraws.
- **Styles:** they stay order-independent against the game's CSS.

- [ ] **Step 2: Fix Critical/Important findings**

Fix each finding with a test where one fits. Run `npx vitest run`, `npm run build`, and commit (`fix: review findings for 0.7.0`). Log the Minor findings in the summary to the user; don't fix them.

- [ ] **Step 3: Report**

Tell the user what shipped on the branch, the test count, and the screenshots (send the key ones with SendUserFile). List the Minor findings. Say that pushing (fast-forward `main`, push as Dickie1242) waits for their go-ahead.
