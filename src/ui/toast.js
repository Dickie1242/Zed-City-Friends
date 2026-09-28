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
