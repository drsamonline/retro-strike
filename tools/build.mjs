#!/usr/bin/env node
// Build the minified playable release from the readable source.
//   src/retro-strike.html  ->  dist/retro-strike.min.html
// Run with:  npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';             // terser's ESM entry exports `minify` (no default)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src/retro-strike.html');
const OUT = resolve(root, 'dist/retro-strike.min.html');

const html = readFileSync(SRC, 'utf8');
const styleM = html.match(/<style>([\s\S]*?)<\/style>/);
const scriptM = html.match(/<script>([\s\S]*?)<\/script>/);
if (!styleM || !scriptM) throw new Error('Could not find <style> or <script> in ' + SRC);

const minifyCss = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();

const { code, error } = await minify(scriptM[1], {
  compress: { passes: 2, drop_debugger: true },
  mangle: true,                                  // top-level names are preserved
  format: { comments: false, ascii_only: true }
});
if (error) throw error;

const out = html
  .replace(/<style>[\s\S]*?<\/style>/, '<style>' + minifyCss(styleM[1]) + '</style>')
  .replace(/<script>[\s\S]*?<\/script>/, '<script>' + code + '</script>')
  .replace(/<!--[\s\S]*?-->/g, '');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('CSS  ' + kb(Buffer.byteLength(styleM[1])) + ' -> ' + kb(Buffer.byteLength(minifyCss(styleM[1]))));
console.log('JS   ' + kb(Buffer.byteLength(scriptM[1])) + ' -> ' + kb(Buffer.byteLength(code)));
console.log('HTML ' + kb(Buffer.byteLength(html)) + ' -> ' + kb(Buffer.byteLength(out)) +
  '  (' + (100 - Buffer.byteLength(out) / Buffer.byteLength(html) * 100).toFixed(1) + '% smaller)');
console.log('wrote ' + OUT);
