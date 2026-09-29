// The DM composer's emoji picker: same categories/labels/order as the game's own, sharing its
// "recently used" list in localStorage, plus Zed City's custom item emojis. Mirrors gif-picker.js.
import { h, clear } from './dom.js';
import { safe } from '../util.js';
import { emojiCategories, findEmoji, searchEmoji, isFlag, flagImageUrl } from '../emoji.js';
import { readGameRecentEmojis, rememberGameRecentEmoji } from '../store.js';

export function createEmojiPicker({ doc = document, storage, onPick } = {}) {
  const categories = emojiCategories();
  let opened = false;
  let activeKey = 'people & body';

  const searchInput = h('input', { class: 'zcf-em-search', type: 'text', placeholder: 'Search emoji…', 'aria-label': 'Search emoji' });
  const tabsRow = h('div', { class: 'zcf-em-tabs' });
  const grid = h('div', { class: 'zcf-em-grid' });
  const el = h('div', { class: 'zcf-empanel', hidden: true }, searchInput, tabsRow, grid);

  function recentItems() {
    return readGameRecentEmojis(storage).map((name) => findEmoji(name)).filter(Boolean);
  }

  function defaultCategory() {
    return recentItems().length ? 'recent' : 'people & body';
  }

  function handlePick(item) {
    const picked = item.src
      ? { name: item.name, src: item.src }
      : isFlag(item.emoji)
        ? { name: item.name, emoji: item.emoji, src: flagImageUrl(item.emoji) }
        : { name: item.name, emoji: item.emoji };
    rememberGameRecentEmoji(storage, item.name);
    onPick(picked);
    close();
  }

  function itemButton(item) {
    const flag = typeof item.emoji === 'string' && isFlag(item.emoji);
    const btn = h('button', { class: 'zcf-em-btn', type: 'button', title: `:${item.name}:` },
      item.src || flag
        ? h('img', { class: 'zcf-em-img', src: item.src || flagImageUrl(item.emoji), alt: '', draggable: 'false', loading: 'lazy' })
        : item.emoji);
    btn.addEventListener('click', safe('emoji-picker-pick', () => handlePick(item)));
    return btn;
  }

  function renderGrid() {
    clear(grid);
    const query = searchInput.value.trim();
    const items = query ? searchEmoji(query) : activeKey === 'recent' ? recentItems() : (categories.find((c) => c.key === activeKey) || {}).items || [];
    if (!items.length) {
      grid.appendChild(h('div', { class: 'zcf-em-empty' }, query ? 'No emoji found.' : activeKey === 'recent' ? 'No recent emoji yet.' : 'No emoji here.'));
      return;
    }
    for (const item of items) grid.appendChild(itemButton(item));
  }

  function updateTabs() {
    const searching = !!searchInput.value.trim();
    for (const [key, btn] of tabButtons) btn.classList.toggle('zcf-active', !searching && key === activeKey);
  }

  function selectCategory(key) {
    activeKey = key;
    searchInput.value = '';
    updateTabs();
    renderGrid();
  }

  const tabButtons = new Map();
  for (const cat of categories) {
    const iconEl = cat.img ? h('img', { class: 'zcf-em-tab-icon', src: cat.img, alt: '' }) : h('i', { class: cat.icon, 'aria-hidden': 'true' });
    const btn = h('button', { class: 'zcf-mini zcf-em-tab', type: 'button', title: cat.label, 'aria-label': cat.label }, iconEl);
    btn.addEventListener('click', safe('emoji-picker-tab', () => selectCategory(cat.key)));
    tabsRow.appendChild(btn);
    tabButtons.set(cat.key, btn);
  }

  searchInput.addEventListener('input', safe('emoji-picker-search', () => {
    updateTabs();
    renderGrid();
  }));

  // Document-level so Esc closes it even when focus is still on the button that opened it.
  const onDocKeydown = safe('emoji-picker-keydown', (e) => {
    if (opened && e.key === 'Escape') close();
  });
  doc.addEventListener('keydown', onDocKeydown);

  function open() {
    if (opened) return;
    opened = true;
    el.hidden = false;
    searchInput.value = '';
    activeKey = defaultCategory();
    updateTabs();
    renderGrid();
  }

  function close() {
    if (!opened) return;
    opened = false;
    el.hidden = true;
  }

  function toggle() {
    if (opened) close();
    else open();
  }

  function destroy() {
    close();
    doc.removeEventListener('keydown', onDocKeydown);
  }

  return {
    el,
    open,
    close,
    toggle,
    get isOpen() {
      return opened;
    },
    destroy,
  };
}
