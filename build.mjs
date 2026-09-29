// Bundles src/ into one userscript: dist/zed-city-friends.user.js
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export const OUTFILE = 'dist/zed-city-friends.user.js';

export const HEADER = `// ==UserScript==
// @name         Zed City Friends
// @namespace    zed-city-friends
// @version      ${pkg.version}
// @description  ${pkg.description}
// @license      ${pkg.license}
// @match        https://www.zed.city/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/Dickie1242/Zed-City-Friends
// @supportURL   https://github.com/Dickie1242/Zed-City-Friends/issues
// @downloadURL  https://raw.githubusercontent.com/Dickie1242/Zed-City-Friends/main/dist/zed-city-friends.user.js
// @updateURL    https://raw.githubusercontent.com/Dickie1242/Zed-City-Friends/main/dist/zed-city-friends.user.js
// ==/UserScript==
`;

export function bundle({ write = true } = {}) {
  return build({
    absWorkingDir: root,
    entryPoints: ['src/index.js'],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    banner: { js: HEADER },
    outfile: OUTFILE,
    define: { __ZCF_VERSION__: JSON.stringify(pkg.version) },
    write,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await bundle();
  console.log(`Built ${OUTFILE}`);
}
