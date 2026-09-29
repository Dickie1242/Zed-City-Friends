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
    const res = await fetchImpl(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res || !res.ok) return { status: 'failed' };
    const latest = headerVersion(await res.text());
    if (!latest) return { status: 'failed' };
    return compareVersions(latest, current) > 0 ? { status: 'newer', latest } : { status: 'current' };
  } catch {
    return { status: 'failed' };
  }
}
