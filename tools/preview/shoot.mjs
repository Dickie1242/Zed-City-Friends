// The visual check (spec Shared 2): bundles the harness, serves tools/preview over http (so the harness can
// set routes like /enemies), and screenshots every scene with headless Edge at 1280px, and a few inside a
// 375px frame for the phone layout. Run `node tools/preview/fetch-css.mjs` once first.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DESKTOP = ['pm-chats', 'pm-friends', 'pm-faction', 'pm-blocked', 'settings-general', 'settings-chats', 'settings-about', 'mention', 'custom', 'enemies', 'profile'];
const PHONE = ['pm-chats', 'pm-friends', 'settings-general', 'settings-chats', 'dm'];
const outDir = process.argv[2] || join(here, 'out');

if (!existsSync(join(here, 'game-css', 'LoggedIn.css'))) throw new Error('Run node tools/preview/fetch-css.mjs first.');
await build({
  entryPoints: [join(here, 'harness.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: join(here, 'out', 'harness.js'),
  define: { __ZCF_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'warning',
});
await mkdir(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Routes the harness sets (/enemies, /profile/7) reload as the harness page itself.
  const file = /\.\w+$/.test(path) ? join(here, path) : join(here, 'harness.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'zcf-edge-'));

function shoot(url, file, size) {
  return new Promise((resolve, reject) => {
    execFile(EDGE, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
      `--user-data-dir=${profile}`, `--window-size=${size}`, '--virtual-time-budget=4000', `--screenshot=${file}`, url,
    ], { timeout: 60000 }, (err) => (err ? reject(err) : resolve(file)));
  });
}

try {
  for (const s of DESKTOP) console.log('shot', await shoot(`${base}/harness.html#${s}`, join(outDir, `desktop-${s}.png`), '1280,800'));
  for (const s of PHONE) console.log('shot', await shoot(`${base}/phone.html#${s}`, join(outDir, `phone-${s}.png`), '480,760'));
} finally {
  server.close();
}
