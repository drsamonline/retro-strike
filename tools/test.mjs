#!/usr/bin/env node
// Regression test for retro-strike — the repo's first test.
//
//   node tools/test.mjs
//
// It guards the promises the README makes, which nothing checked before:
//   1. the game is ONE self-contained document (one <style>, one <script>, one <canvas>)
//   2. it works OFFLINE — the source makes no external request
//   3. the build runs and produces a smaller artifact that keeps the essentials
//   4. the shipped demo (docs/play/index.html) IS the built artifact, so the live
//      page can never silently serve a stale build
//
// Zero dependencies of its own. The build step needs `terser` (a devDependency);
// if it is not installed the build step is skipped and the static checks still run.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src/retro-strike.html');
const DIST = resolve(root, 'dist/retro-strike.min.html');
const PLAY = resolve(root, 'docs/play/index.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  (' + extra + ')' : '')); }
}

const src = readFileSync(SRC, 'utf8');

// 1. one self-contained document
ok('src has exactly one <style>', (src.match(/<style>/g) || []).length === 1);
ok('src has exactly one <script>', (src.match(/<script>/g) || []).length === 1);
ok('src has exactly one <canvas>', (src.match(/<canvas/g) || []).length === 1);

// 2. offline: the game must not fetch anything at runtime
const external = src.match(/https?:\/\/[^"')\s]+/g) || [];
ok('src makes no external request', external.length === 0, external.slice(0, 3).join(', '));

// 3. the frame loop the game is built on
ok('src drives a requestAnimationFrame loop', /requestAnimationFrame/.test(src));

// 4. the build. Required whenever terser IS installed (so a broken build FAILS);
//    skipped only when the dependency is genuinely absent.
let terserAvailable = true;
try { await import('terser'); } catch { terserAvailable = false; }

let built = null;
if (!terserAvailable) {
  console.log('SKIP  build (terser not installed) — static checks above still ran');
} else {
  try {
    execFileSync('node', [resolve(root, 'tools/build.mjs')], { cwd: root, stdio: 'pipe' });
    built = readFileSync(DIST, 'utf8');
    ok('build wrote dist/retro-strike.min.html', built.length > 0, built.length + ' B');
    ok('minified is smaller than the source', built.length < src.length,
       src.length + ' -> ' + built.length + ' B');
    ok('minified keeps the canvas', /<canvas/.test(built));
    ok('minified keeps the frame loop', /requestAnimationFrame/.test(built));
  } catch (e) {
    ok('build runs (node tools/build.mjs)', false, String(e.message).split('\n')[0]);
  }
}

// 5. the deployed demo must be the built artifact (guards a stale play build)
const distText = built || (existsSync(DIST) ? readFileSync(DIST, 'utf8') : null);
const playText = existsSync(PLAY) ? readFileSync(PLAY, 'utf8') : null;
ok('dist/retro-strike.min.html exists', !!distText);
ok('docs/play/index.html exists', !!playText);
if (distText && playText) {
  ok('docs/play matches the built dist (no stale demo)', playText === distText,
     'dist=' + distText.length + ' play=' + playText.length);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
