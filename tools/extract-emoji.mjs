// Regenerates src/emoji-data.js from the game's own emoji picker data.
// Usage: download the game's current assets/load-components-*.js (find its name in the page's
// index-*.js bundle), then: node tools/extract-emoji.mjs <load-components.js> src/emoji-data.js
// The standard set is the array literal assigned to F4 and the Zed City set to V7 (minified names;
// check them if the game's bundle changes).
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(process.argv[2], 'utf8');

function arrayLiteral(varName) {
  const start = src.indexOf(`${varName}=[{`);
  if (start < 0) throw new Error(`no ${varName}`);
  let i = start + varName.length + 1;
  let depth = 0;
  let inStr = null;
  for (; i < src.length; i += 1) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i += 1; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '`' || c === '"' || c === "'") { inStr = c; continue; }
    if (c === '[' || c === '{') depth += 1;
    if (c === ']' || c === '}') { depth -= 1; if (depth === 0) break; }
  }
  const text = src.slice(start + varName.length + 1, i + 1);
  if (/\$\{/.test(text)) throw new Error(`${varName}: template expression found`);
  return vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 2000 });
}

const standard = arrayLiteral('F4');
const zed = arrayLiteral('V7');

const groupOf = (e) => {
  const g = String(e.group || '').trim().toLowerCase();
  return !g || g === 'github' || g === 'components' ? 'misc' : g;
};
const clean = (s) => String(s || '').trim();
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

// Standard: "<emoji>\t<name>[\t<alias,alias>]" per line, grouped, in the game's order.
const groups = new Map();
let aliasCount = 0;
for (const e of standard) {
  const emoji = clean(e.emoji);
  const name = clean(e.name);
  if (!emoji || !name) continue;
  const aliases = (e.shortcodes || []).map(clean).filter((s) => s && s !== name);
  aliasCount += aliases.length;
  const g = groupOf(e);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(aliases.length ? `${emoji}\t${name}\t${aliases.join(',')}` : `${emoji}\t${name}`);
}

// Zed City: "<name>\t<alias,alias>\t<image path>" — images are same-origin /items/... paths.
const zedLines = [];
for (const e of zed) {
  const name = clean(e.name);
  const img = clean(e.fallbackImage);
  if (!name || !/^\/[A-Za-z0-9_./-]+\.(webp|png|gif|svg)$/.test(img)) continue;
  const aliases = (e.shortcodes || []).map(clean).filter((s) => s && s !== name);
  zedLines.push(`${name}\t${aliases.join(',')}\t${img}`);
}

let out = `// Generated from Zed City's own emoji picker data (its standard and "Zed City" sets), ${new Date().toISOString().slice(0, 10)}.\n`;
out += '// Regenerate rather than edit by hand. Standard lines: emoji<TAB>name[<TAB>alias,alias].\n';
out += '// Zed City lines: name<TAB>alias,alias<TAB>/items/... image path (same origin as the game).\n';
out += 'export const EMOJI_GROUPS = {\n';
for (const [g, lines] of groups) out += `  ${JSON.stringify(g)}: \`${esc(lines.join('\n'))}\`,\n`;
out += '};\n\n';
out += `export const ZED_EMOJIS = \`${esc(zedLines.join('\n'))}\`;\n`;

const target = process.argv[3];
writeFileSync(target, out);
console.log(`standard: ${standard.length} (${aliasCount} aliases), zed: ${zedLines.length}/${zed.length}, groups: ${[...groups.keys()].join(' | ')}`);
console.log(`bytes: ${Buffer.byteLength(out)}`);
