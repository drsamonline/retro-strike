#!/usr/bin/env node
// Arena placement — the test for where the game is allowed to put things.
//
//   node tools/test-map.mjs
//
// A secret chest is collected by standing on it (0.9 tiles, see the pickup loop in
// frame()). Lava deals 8 hp every 0.5 s to anything standing on it. Those two facts
// together mean a chest placed on a lava tile can only be opened by burning health —
// and in campaign mode "FIND 2 CHESTS" / "FIND 3 CHESTS" is the objective, so the
// level cannot be completed without paying for it. placeProps() has always refused
// lava cells for barrels and decor; placeSecrets() was the one placement that did not.
//
// This test lifts the real generator OUT of src/retro-strike.html (so it exercises the
// shipped functions, not a copy) and runs it over:
//   - 3 arena sizes x 40 seeds of the procedural generator
//   - all 12 campaign levels (which share 7 hand-authored layouts)
// and asserts the invariants that make an arena playable:
//   1. no chest sits on lava, on a wall, or outside the arena
//   2. every chest is on the reachable set — you can always walk to it
//   3. barrels and decor stay off lava too (the guard that was already there)
//   4. the player's spawn cell is open and reachable, on every map
//   5. the campaign fallback (reachList < 150 -> procedural) never had to fire
//   6. the OLD placement really did put chests on lava, so this is a fix and not a
//      story: the same lifted function with the guard line removed is run against the
//      seeds that used to fail, and it must produce at least one lava chest.
//
// Zero dependencies.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(root, 'src/retro-strike.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  (' + extra + ')' : '')); }
}

// ---- lift the generator out of the shipped source ---------------------------
function lift(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// `var NAME = ...;` where the initialiser may itself contain ; inside strings? it does
// not here — CAMP_MAPS is nested arrays of ".#" strings — so bracket depth is enough.
function liftDecl(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return null;
  let i = src.indexOf('=', at) + 1, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  return null;
}

const need = {
  srand: lift(SRC, 'function srand('),
  rnd: lift(SRC, 'function rnd('),
  isWall: lift(SRC, 'function isWall('),
  applyArenaSize: lift(SRC, 'function applyArenaSize('),
  genMap: lift(SRC, 'function genMap('),
  floodFillCenter: lift(SRC, 'function floodFillCenter('),
  indexCells: lift(SRC, 'function indexCells('),
  placeSecrets: lift(SRC, 'function placeSecrets('),
  placeProps: lift(SRC, 'function placeProps('),
  normRows: lift(SRC, 'function normRows('),
  CAMP_MAPS: liftDecl(SRC, 'var CAMP_MAPS'),
  genCampaignMap: lift(SRC, 'function genCampaignMap('),
};
const missing = Object.keys(need).filter((k) => !need[k]);
ok('every generator function is in the shipped source', missing.length === 0, missing.join(', '));
if (missing.length) { console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); }

function makeWorld(placeSecretsText) {
  const parts = [
    'var SET = { arena: 0 };',
    'var MS = 48, WH = 1.7;',
    'var ARENA_SIZES = [48, 64, 80];',
    'var map = new Uint8Array(MS * MS);',
    'var lava = new Uint8Array(MS * MS);',
    'var reachList = [], secrets = [], barrels = [], decor = [];',
    'var wallCells = [], lavaCells = [];',
    'var seed = 0x9e3779b9;',
    'var arenaSeed = 1;',
    need.srand, need.rnd, need.isWall, need.applyArenaSize,
    need.genMap, need.floodFillCenter, need.indexCells,
    placeSecretsText,
    need.placeProps, need.normRows, need.CAMP_MAPS, need.genCampaignMap,
  ];
  const ctx = vm.createContext({ Math, Uint8Array, Date, console });
  vm.runInContext(parts.join('\n'), ctx);
  return (code) => vm.runInContext(code, ctx);
}

const run = makeWorld(need.placeSecrets);

// A generation is a function of (seed, arena size, layout) — never of the clock.
function generate(seed, arenaIdx, campIdx) {
  run(`arenaSeed = ${seed}; SET.arena = ${arenaIdx}; MS = 48;`);
  run(campIdx === null
    ? 'genMap();'
    : `genCampaignMap(CAMP_MAPS[${campIdx} % CAMP_MAPS.length]);`);
  return run(`({
    MS: MS,
    reach: reachList.length,
    secrets: JSON.parse(JSON.stringify(secrets)),
    barrels: JSON.parse(JSON.stringify(barrels)),
    decor: JSON.parse(JSON.stringify(decor))
  })`);
}

// the three questions this test asks of every placed object
function verdict(MS, x, z) {
  const gx = Math.floor(x), gz = Math.floor(z);
  if (gx < 0 || gz < 0 || gx >= MS || gz >= MS) return 'outside the arena';
  const c = gz * MS + gx;
  if (run(`map[${c}] === 1`)) return 'inside a wall';
  if (run(`lava[${c}] === 1`)) return 'on lava';
  if (!run(`reachList.some(function (p) { return p[0] === ${gx} && p[1] === ${gz}; })`)) return 'unreachable';
  return null;
}

// ---- 1-3. procedural arenas: 3 sizes x 40 seeds -----------------------------
const SIZES = [0, 1, 2];
const SEEDS = Array.from({ length: 40 }, (_, i) => ((i + 1) * 2654435761) | 0);
const bad = { secrets: [], barrels: [], decor: [] };
let secretsSeen = 0, barrelsSeen = 0, decorSeen = 0, minReach = Infinity, thinMaps = 0;

for (const size of SIZES) {
  for (const seed of SEEDS) {
    const g = generate(seed, size, null);
    if (g.reach < minReach) minReach = g.reach;
    if (g.reach < 300) thinMaps++;
    secretsSeen += g.secrets.length;
    barrelsSeen += g.barrels.length;
    decorSeen += g.decor.length;
    for (const c of g.secrets) { const v = verdict(g.MS, c.x, c.z); if (v) bad.secrets.push([size, seed >>> 0, c.x, c.z, v]); }
    for (const c of g.barrels) { const v = verdict(g.MS, c.x, c.z); if (v) bad.barrels.push([size, seed >>> 0, c.x, c.z, v]); }
    for (const c of g.decor) { const v = verdict(g.MS, c.x, c.z); if (v) bad.decor.push([size, seed >>> 0, c.x, c.z, v]); }
  }
}

ok('no procedural chest is on lava, in a wall or unreachable', bad.secrets.length === 0,
   bad.secrets.length ? JSON.stringify(bad.secrets.slice(0, 3)) : secretsSeen + ' chests');
ok('no procedural barrel is on lava, in a wall or unreachable', bad.barrels.length === 0,
   bad.barrels.length ? JSON.stringify(bad.barrels.slice(0, 3)) : barrelsSeen + ' barrels');
ok('no procedural decor is on lava, in a wall or unreachable', bad.decor.length === 0,
   bad.decor.length ? JSON.stringify(bad.decor.slice(0, 3)) : decorSeen + ' props');
ok('every procedural arena is generated with 4 chests', secretsSeen === SIZES.length * SEEDS.length * 4,
   secretsSeen + ' of ' + SIZES.length * SEEDS.length * 4);
ok('the reachable set is never thin enough to starve placement', thinMaps === 0,
   'smallest reachable area ' + minReach + ' cells');

// ---- 4-5. the 12 campaign levels -------------------------------------------
let campBad = [], campSpawnBad = [], campThin = 0, campChests = 0;
for (let lvl = 1; lvl <= 12; lvl++) {
  const seed = (lvl * 7919 + 1234) | 0;
  const g = generate(seed, 0, lvl - 1);
  campChests += g.secrets.length;
  for (const c of g.secrets) { const v = verdict(g.MS, c.x, c.z); if (v) campBad.push([lvl, c.x, c.z, v]); }
  // genCampaignMap falls back to a procedural arena when the reachable set is < 150;
  // a level that falls back is a level that is not the layout it claims to be.
  if (g.reach < 150) campThin++;
  const spawn = verdict(g.MS, g.MS / 2, g.MS / 2);
  if (spawn) campSpawnBad.push([lvl, spawn]);
}
ok('no campaign chest is on lava, in a wall or unreachable', campBad.length === 0,
   campBad.length ? JSON.stringify(campBad.slice(0, 3)) : campChests + ' chests');
ok('the player never spawns in a wall, on lava or out of reach', campSpawnBad.length === 0,
   JSON.stringify(campSpawnBad.slice(0, 3)));
ok('no campaign level silently falls back to a procedural arena', campThin === 0,
   campThin + ' of 12 fell back');
ok('every campaign level generates its 4 chests', campChests === 12 * 4, campChests + ' of 48');

// ---- 6. the old placement really did put chests on lava --------------------
// Strip the guard out of the lifted function and run the same seeds. If this passes
// with zero lava chests the test above proves nothing, so it must fail.
const GUARD = 'if (lava[cell[1] * MS + cell[0]]) continue;';
ok('placeSecrets() refuses lava cells in the shipped source',
   need.placeSecrets.includes(GUARD));

const oldText = need.placeSecrets.replace(GUARD, '');
ok('the guard is one removable line (the old code is recoverable)',
   oldText !== need.placeSecrets && !oldText.includes(GUARD));

if (oldText !== need.placeSecrets) {
  const runOld = makeWorld(oldText);
  let oldLava = 0, oldTotal = 0;
  const hit = [];
  for (const size of SIZES) {
    for (const seed of SEEDS) {
      runOld(`arenaSeed = ${seed}; SET.arena = ${size}; MS = 48;`);
      runOld('genMap();');
      const g = runOld('({ MS: MS, secrets: JSON.parse(JSON.stringify(secrets)) })');
      for (const c of g.secrets) {
        oldTotal++;
        const gx = Math.floor(c.x), gz = Math.floor(c.z), idx = gz * g.MS + gx;
        if (runOld(`lava[${idx}] === 1`)) { oldLava++; if (hit.length < 3) hit.push([size, seed >>> 0, c.x, c.z]); }
      }
    }
  }
  ok('the OLD placeSecrets() did place chests on lava (the bug this test catches)',
     oldLava > 0, oldLava + ' of ' + oldTotal + ' chests: ' + JSON.stringify(hit));
}

// ---- 7. the guard lives in the shipped, minified demo too -------------------
// docs/play is what players actually load; a fix that only reaches src/ is not shipped.
// The minifier renames `cell`, so the guard is counted by shape: a lava lookup at
// `[row]*MS+[col]` of the cell under test. There was one such guard before the fix
// (placeProps) and there are two after it (placeProps + placeSecrets).
const GUARD_SHAPE = /lava\[\w+\[1\]\*MS\+\w+\[0\]\]/g;
const playPath = resolve(root, 'docs/play/index.html');
try {
  const play = readFileSync(playPath, 'utf8');
  const guards = (play.match(GUARD_SHAPE) || []).length;
  ok('the shipped demo carries both lava guards (props + chests)', guards >= 2,
     guards + ' guards in ' + play.length + ' B');
} catch (e) {
  ok('docs/play/index.html is readable', false, String(e.message).split('\n')[0]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
