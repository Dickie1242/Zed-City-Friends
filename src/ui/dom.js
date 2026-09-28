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
      else if (k.startsWith('on')) continue; // never turn a string on* value into an inline handler attribute
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
  const s = String(text ?? '');
  const q = String(query || '').trim();
  const ql = q.toLowerCase();
  // Scan `s` itself (not a lowercased copy) so the index still refers to the original string:
  // lowercasing can change length (e.g. 'İ'.toLowerCase() is two UTF-16 units), which would
  // otherwise misalign the slice.
  let i = -1;
  if (q) {
    for (let j = 0; j <= s.length - q.length; j++) {
      if (s.slice(j, j + q.length).toLowerCase() === ql) {
        i = j;
        break;
      }
    }
  }
  if (i < 0) return [s];
  return [s.slice(0, i), h('mark', null, s.slice(i, i + q.length)), s.slice(i + q.length)].filter((x) => x !== '');
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
