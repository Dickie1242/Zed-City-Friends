const warned = new Set();

// Logs a warning once per key so a broken selector or endpoint can't flood the console.
export function warnOnce(key, ...details) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[ZCF]', key, ...details);
}

export function resetWarnings() {
  warned.clear();
}

// Wraps a callback so an exception (or rejected promise) is logged once and never reaches the game's code.
export function safe(key, fn) {
  return function safeWrapped(...args) {
    try {
      const out = fn.apply(this, args);
      if (out && typeof out.then === 'function') out.then(undefined, (e) => warnOnce(key, e));
      return out;
    } catch (e) {
      warnOnce(key, e);
      return undefined;
    }
  };
}

export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

// The API sometimes returns lists as objects keyed by index; accept both.
export function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

export function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// getStats: spec §2 lists the player as `user.id` / `user.username`; accept that or a flat object.
export function statsPlayer(data) {
  const u = data && typeof data === 'object' && data.user && typeof data.user === 'object' ? data.user : data;
  const id = toId(u && u.id);
  return id ? { id, username: typeof u.username === 'string' ? u.username : '' } : null;
}
