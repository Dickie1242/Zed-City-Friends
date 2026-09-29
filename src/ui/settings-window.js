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
