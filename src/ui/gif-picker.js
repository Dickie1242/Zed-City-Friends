// The DM composer's GIF picker: Klipy search, wired exactly like the game's own chat GIF picker.
import { h } from './dom.js';
import { debounce, safe } from '../util.js';

// The game's public client key for Klipy, copied from its live bundle (2026-09-26 build). It's
// meant to be embedded in client code, the same way the game itself ships it.
const KLIPY_KEY = 'XnaONUEjqFvkZSqJx0ouuO17Og1kVP1VCiNXYMeQixllGKwC5xzjdshlvoMwGfYa';
const CLIENT_KEY = 'zed-ui';
const SEARCH_DEBOUNCE_MS = 250;

const CATEGORIES = [
  { label: 'Trending', term: '' },
  { label: 'Reactions', term: 'reaction meme' },
  { label: 'Happy', term: 'happy excited' },
  { label: 'Love', term: 'love heart kiss' },
  { label: 'Sad', term: 'sad crying' },
  { label: 'Angry', term: 'angry mad' },
  { label: 'Animals', term: 'cute animals' },
  { label: 'Gaming', term: 'gaming reaction' },
  { label: 'Memes', term: 'meme funny' },
];

// Only a Klipy-hosted, http(s) URL gets routed through the game's proxy; anything else is dropped
// rather than fetched directly (that's the whole point of the proxy - it hides the viewer's IP).
function proxied(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.hostname !== 'klipy.com' && !u.hostname.endsWith('.klipy.com')) return null;
  return `https://cdn.zed.city/?url=${encodeURIComponent(u.href)}`;
}

function normalizeResult(r) {
  const formats = r && typeof r === 'object' ? r.media_formats : null;
  if (!formats || typeof formats !== 'object') return null;
  const previewRaw = formats.tinygif || formats.nanogif || formats.gif;
  const fullRaw = formats.gif || formats.mediumgif || formats.tinygif;
  if (!previewRaw || !previewRaw.url || !fullRaw || !fullRaw.url) return null;
  const preview = proxied(previewRaw.url);
  const full = proxied(fullRaw.url);
  if (!preview || !full) return null;
  const title = (typeof r.content_description === 'string' && r.content_description) || (typeof r.title === 'string' && r.title) || '';
  return { preview, full, title };
}

export function createGifPicker({ doc = document, fetchImpl = (...a) => fetch(...a), onPick } = {}) {
  let seq = 0;
  let controller = null;
  let opened = false;
  let lastTerm = '';

  const status = h('div', { class: 'zcf-gif-status' });
  const grid = h('div', { class: 'zcf-gif-grid' });
  const searchInput = h('input', { class: 'zcf-gif-search', type: 'text', placeholder: 'Search GIFs…', 'aria-label': 'Search GIFs' });
  const chipsRow = h('div', { class: 'zcf-gif-chips' });
  const el = h('div', { class: 'zcf-gifpanel', hidden: true }, searchInput, chipsRow, status, grid);

  function clearGrid() {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
  }

  function runQuery(term) {
    lastTerm = term;
    const mySeq = ++seq;
    if (controller) controller.abort();
    controller = new AbortController();
    status.textContent = 'Loading…';
    clearGrid();
    const params = new URLSearchParams();
    params.set('key', KLIPY_KEY);
    params.set('client_key', CLIENT_KEY);
    params.set('limit', '24');
    params.set('media_filter', 'gif,tinygif');
    params.set('contentfilter', 'medium');
    if (term) params.set('q', term);
    const endpoint = term ? 'search' : 'featured';
    const url = `https://api.klipy.com/v2/${endpoint}?${params.toString()}`;
    // Called synchronously (not deferred a tick) so a caller can assert the request right after
    // open()/a chip click, the same way the response is awaited separately.
    let request;
    try {
      request = fetchImpl(url, { credentials: 'omit', signal: controller.signal });
    } catch (e) {
      request = Promise.reject(e);
    }
    Promise.resolve(request)
      .then((res) => res.json())
      .then((data) => {
        if (mySeq !== seq) return;
        const rows = data && Array.isArray(data.results) ? data.results : [];
        const results = rows.map(normalizeResult).filter(Boolean);
        if (!results.length) {
          status.textContent = 'No GIFs found.';
          return;
        }
        status.textContent = '';
        for (const r of results) {
          const label = r.title || 'GIF';
          const img = h('img', {
            class: 'zcf-gif-thumb',
            src: r.preview,
            alt: label,
            title: label,
            loading: 'lazy',
            referrerpolicy: 'no-referrer',
          });
          img.addEventListener('click', safe('gif-picker-pick', () => {
            onPick({ title: r.title, url: r.full });
            close();
          }));
          grid.appendChild(img);
        }
      })
      .catch((e) => {
        if (mySeq !== seq) return;
        if (e && e.name === 'AbortError') return;
        status.textContent = 'Unable to load GIFs right now.';
      });
  }

  const debouncedSearch = debounce(() => {
    for (const btn of chipButtons) btn.classList.remove('zcf-active');
    runQuery(searchInput.value.trim());
  }, SEARCH_DEBOUNCE_MS);

  const chipButtons = CATEGORIES.map((cat, i) => {
    const btn = h('button', { class: `zcf-mini zcf-gif-chip${i === 0 ? ' zcf-active' : ''}`, type: 'button' }, cat.label);
    btn.addEventListener('click', safe('gif-picker-chip', () => {
      debouncedSearch.cancel();
      for (const b of chipButtons) b.classList.remove('zcf-active');
      btn.classList.add('zcf-active');
      searchInput.value = '';
      runQuery(cat.term);
    }));
    chipsRow.appendChild(btn);
    return btn;
  });

  searchInput.addEventListener('input', safe('gif-picker-search', () => debouncedSearch()));

  // Document-level (not just the panel's own keydown) so Esc closes it even when focus is still
  // on the GIF button that opened it, not yet inside the panel.
  const onDocKeydown = safe('gif-picker-keydown', (e) => {
    if (opened && e.key === 'Escape') close();
  });
  doc.addEventListener('keydown', onDocKeydown);

  function open() {
    if (opened) return;
    opened = true;
    el.hidden = false;
    runQuery(lastTerm);
  }

  function close() {
    if (!opened) return;
    opened = false;
    el.hidden = true;
    debouncedSearch.cancel();
    if (controller) controller.abort();
  }

  function toggle() {
    if (opened) close();
    else open();
  }

  function destroy() {
    close();
    doc.removeEventListener('keydown', onDocKeydown);
  }

  return { el, open, close, toggle, destroy };
}
