// Just enough of the CSS cascade to ask "which declaration wins on this element?" without a layout engine:
// flat rules (with the @media they sit in), selector specificity, !important, then stylesheet and rule order.

const splitSelectors = (list) => list.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);

export function specificity(selector) {
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

export function parseCss(css) {
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
export function mediaApplies(media, width) {
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
export function matches(el, selector) {
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
export function winner(el, prop, width, sheets) {
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
