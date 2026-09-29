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
