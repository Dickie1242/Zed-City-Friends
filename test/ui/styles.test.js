import { describe, it, expect, beforeEach } from 'vitest';
import { CSS } from '../../src/ui/styles.js';
import { createDockView } from '../../src/ui/dock-view.js';
import { addFriend, openDm, setDmOpen, setFriendsOpen } from '../../src/state.js';
import { makeServices } from './services.js';
import { DOCK_HTML, HEADER_HTML, PAGE_404_HTML } from '../fixtures/game-dom.js';
import { createFriendsPage } from '../../src/ui/friends-page.js';
import { createTopbarButton } from '../../src/ui/topbar-button.js';
import { GAME_DOCK_CSS } from '../fixtures/game-dock-css.js';

// Just enough of the CSS cascade to ask "which declaration wins on this element?" without a layout engine:
// flat rules (with the @media they sit in), selector specificity, !important, then stylesheet and rule order.

const splitSelectors = (list) => list.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);

function specificity(selector) {
  const spec = [0, 0, 0];
  let rest = selector.replace(/:not\(([^)]*)\)/g, (_, inner) => {
    const s = specificity(inner);
    for (let i = 0; i < 3; i += 1) spec[i] += s[i];
    return ' ';
  });
  rest = rest.replace(/::?[\w-]+/g, (m) => {
    spec[/^::|^:(before|after)$/.test(m) ? 2 : 1] += 1;
    return ' ';
  });
  rest = rest.replace(/\[[^\]]*\]/g, () => { spec[1] += 1; return ' '; });
  rest = rest.replace(/#[\w-]+/g, () => { spec[0] += 1; return ' '; });
  rest = rest.replace(/\.[\w-]+/g, () => { spec[1] += 1; return ' '; });
  for (const token of rest.split(/[\s>+~]+/)) if (/^[a-z][\w-]*$/i.test(token)) spec[2] += 1;
  return spec;
}

function parseCss(css) {
  const rules = [];
  (function walk(text, media) {
    let pos = 0;
    for (;;) {
      const open = text.indexOf('{', pos);
      if (open < 0) return;
      const prelude = text.slice(pos, open).trim();
      if (prelude.startsWith('@')) {
        let depth = 1;
        let j = open + 1;
        for (; depth && j < text.length; j += 1) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0;
        if (prelude.startsWith('@media')) walk(text.slice(open + 1, j - 1), prelude.slice(6).trim());
        pos = j;
        continue;
      }
      const close = text.indexOf('}', open);
      const decls = text.slice(open + 1, close).split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
        const k = d.indexOf(':');
        const raw = d.slice(k + 1).trim();
        return { prop: d.slice(0, k).trim(), value: raw.replace(/\s*!important$/, ''), important: /!important$/.test(raw) };
      });
      for (const selector of splitSelectors(prelude)) rules.push({ selector, media, decls, spec: specificity(selector), index: rules.length });
      pos = close + 1;
    }
  })(css, null);
  return rules;
}

// Width-based queries decide; anything else (hover, pixel ratio) is assumed able to apply.
function mediaApplies(media, width) {
  if (!media) return true;
  return media.split(',').some((query) => query.split(/\band\b/).every((feature) => {
    const m = feature.match(/\((min|max)-width:\s*([\d.]+)px\)/);
    if (!m) return true;
    return m[1] === 'min' ? width >= Number(m[2]) : width <= Number(m[2]);
  }));
}

// Cached per element: every check below asks the same element about the same selectors many times,
// and the elements' classes don't change while they're being checked.
const matchCache = new WeakMap();
function matches(el, selector) {
  let seen = matchCache.get(el);
  if (!seen) matchCache.set(el, (seen = new Map()));
  if (!seen.has(selector)) {
    let hit = false;
    if (!/::|:before|:after/.test(selector)) { // a pseudo-element selector styles that, not el itself
      try {
        hit = el.matches(selector);
      } catch {
        hit = false;
      }
    }
    seen.set(selector, hit);
  }
  return seen.get(selector);
}

const compareKeys = (a, b) => {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

// sheets: rule lists in <head> order, last one appended last.
function winner(el, prop, width, sheets) {
  let best = null;
  sheets.forEach((rules, order) => {
    for (const rule of rules) {
      if (!mediaApplies(rule.media, width) || !matches(el, rule.selector)) continue;
      for (const d of rule.decls) {
        if (d.prop !== prop) continue;
        const key = [d.important ? 1 : 0, ...rule.spec, order, rule.index];
        if (!best || compareKeys(key, best.key) >= 0) best = { key, value: d.value, selector: rule.selector };
      }
    }
  });
  return best;
}

const GAME = parseCss(GAME_DOCK_CSS);
const OURS = parseCss(CSS);
const OURS_LAST = [GAME, OURS];
const OURS_FIRST = [OURS, GAME];
const WIDTHS = [1280, 800, 400];

// Every window state we draw: open and minimized DMs, and the Friends window both ways.
const STATES = [
  { friendsOpen: true, dms: [[5, true], [6, false]] },
  { friendsOpen: false, dms: [[5, false], [6, true]] },
];

function renderDock({ friendsOpen, dms }) {
  document.body.innerHTML = DOCK_HTML;
  const root = document.createElement('div');
  root.className = 'zcf-root';
  document.querySelector('.chat-containers').prepend(root);
  const services = makeServices();
  services.store.update((s) => {
    addFriend(s, { id: 5, username: 'Spike' }, 0);
    for (const [id, open] of dms) {
      openDm(s, id, { expand: open, now: id, username: `P${id}` });
      setDmOpen(s, id, open);
    }
    setFriendsOpen(s, friendsOpen);
  });
  createDockView({ root, services }).render();
  return root;
}

const describeEl = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
const hasOurRule = (selector) => OURS.some((r) => r.selector === selector);

// Every computed value of ours under `root` that would change if the game's stylesheet loaded after ours.
function orderProblems(root) {
  const problems = [];
  for (const width of WIDTHS) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const props = new Set(OURS.filter((r) => mediaApplies(r.media, width) && matches(el, r.selector)).flatMap((r) => r.decls.map((d) => d.prop)));
      for (const prop of props) {
        const last = winner(el, prop, width, OURS_LAST);
        const first = winner(el, prop, width, OURS_FIRST);
        if (last.value !== first.value) {
          problems.push(`${width}px ${describeEl(el)} ${prop}: "${last.value}" (${last.selector}) if ours loads last, "${first.value}" (${first.selector}) if ours loads first`);
        }
      }
    }
  }
  return problems;
}

describe('styles against the game dock CSS', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('never depends on whether the game stylesheet or ours loaded last', () => {
    const problems = new Set();
    for (const state of STATES) for (const p of orderProblems(renderDock(state))) problems.add(p);
    expect([...problems]).toEqual([]);
  });

  it('keeps the page and top-bar rules order-independent too', () => {
    document.body.innerHTML = HEADER_HTML + PAGE_404_HTML;
    const services = makeServices({ presence: { 5: { online: true, active: 0, profile: { level: 3, faction: { id: 2, name: 'F' }, injured: true, traveling: true } } } });
    services.store.update((s) => {
      addFriend(s, { id: 5, username: 'Spike' }, 0);
      addFriend(s, { id: 6, username: 'Nyx' }, 0);
    });
    const page = createFriendsPage(services);
    page.onRoute('/friends');
    const topbar = createTopbarButton({ router: services.router });
    topbar.start();
    expect(document.querySelector('.zcf-page-table th').textContent).toBe('Name');
    expect(hasOurRule('.zcf-page-table th')).toBe(true);
    // The add-friend pop-out sits in a button-sized positioned box; a % max-width would squash it.
    document.querySelector('.zcf-page-add').click();
    expect(winner(document.querySelector('.zcf-page .zcf-pop'), 'max-width', 400, OURS_LAST).value).toBe('calc(100vw - 32px)');
    expect([...orderProblems(document.querySelector('main.zcf-page')), ...orderProblems(document.querySelector('.zcf-topbar'))]).toEqual([]);
    page.destroy();
    topbar.destroy();
  });

  it('lays out every open window body as a flex column, so the DM composer and the Friends list scroll fit', () => {
    const checked = new Set();
    for (const state of STATES) {
      const root = renderDock(state);
      for (const body of root.querySelectorAll('.zcf.chat-container:not(.chat-minimized) > .chat-content')) {
        checked.add(body.parentElement.classList.contains('zcf-dm') ? 'dm' : 'friends');
        for (const width of WIDTHS) {
          for (const sheets of [OURS_LAST, OURS_FIRST]) {
            expect(winner(body, 'display', width, sheets).value, `${describeEl(body.parentElement)} at ${width}px`).toBe('flex');
            expect(winner(body, 'flex-direction', width, sheets).value).toBe('column');
          }
        }
      }
    }
    expect([...checked].sort()).toEqual(['dm', 'friends']);
  });

  it('parses specificity the way browsers count it', () => {
    expect(specificity('.chat-container .chat-content')).toEqual([0, 2, 0]);
    expect(specificity('.zcf-dm:not(.chat-minimized)')).toEqual([0, 2, 0]);
    expect(specificity('html.chat-fullscreen-lock')).toEqual([0, 1, 1]);
    expect(specificity('.zcf-row:hover .zcf-row-actions')).toEqual([0, 3, 0]);
    expect(specificity('.zcf-gifbtn[aria-expanded="true"]')).toEqual([0, 2, 0]);
  });
});
