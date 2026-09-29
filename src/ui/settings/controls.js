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
