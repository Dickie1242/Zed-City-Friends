// Downloads the game's own stylesheets for the visual check into tools/preview/game-css/ (gitignored):
// index.css from index.html, then the lazily loaded LoggedIn / load-components sheets named in index-*.js.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://www.zed.city/';
const out = new URL('./game-css/', import.meta.url);

async function get(path) {
  const r = await fetch(BASE + path, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
}

await mkdir(out, { recursive: true });
const html = await get('');
const indexCss = html.match(/assets\/index-[\w-]+\.css/)[0];
const indexJs = html.match(/assets\/index-[\w-]+\.js/)[0];
const js = await get(indexJs);
const lazy = [...new Set(js.match(/assets\/(?:LoggedIn|load-components)-[\w-]+\.css/g))];
for (const path of [indexCss, ...lazy]) {
  const name = path.split('/').pop().replace(/-[\w]+\.css$/, '.css');
  await writeFile(new URL(name, out), await get(path));
  console.log(`saved game-css/${name} (${path})`);
}
