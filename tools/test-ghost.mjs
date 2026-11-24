#!/usr/bin/env node
// Ghost provenance of the FIGHT — the test for what a ghost replay actually shows.
//
//   node tools/test-ghost.mjs
//
// The ghost has always recorded the PLAYER's path and nothing else, so the
// specter walked a fight nobody could see: the enemies it was dodging were not
// on the field, and a "replay of your best run" was a stroll through an empty
// arena. The record now carries the wave's spawns too, on the SAME 0.4s clock
// as the path, so the two streams line up and the replay shows the run it was
// recorded in.
//
// This test lifts the three shipped functions OUT of src/retro-strike.html and
// runs them as shipped (not a copy):
//   1. the spawn clock is the path's clock — 0.4s, the one ghostRec already uses
//   2. ghostTick() quantises, is monotonic, and never returns NaN or a negative
//   3. recordGhostSpawn() refuses junk, defaults the type, and honours the cap
//   4. ghostEnemiesAt() is the right window: before / inside / after, and a life override
//   5. a record from before this build (no `spawns`) answers [] and still replays its path
//   6. the shipped source really wires it: boss + grunts recorded, saved, reset, drawn
//   7. ten mutations of the shipped code are all RED, so the assertions bite
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

// ---- lift the shipped code --------------------------------------------------
function liftFn(src, header) {
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

const CONSTS = SRC.match(/var GHOST_DT = [^\n]*/);
const tickText = liftFn(SRC, 'function ghostTick(');
const recText = liftFn(SRC, 'function recordGhostSpawn(');
const atText = liftFn(SRC, 'function ghostEnemiesAt(');

function build(consts, tick, rec, at) {
  const ctx = { isFinite, Math, String, Array, console };
  vm.createContext(ctx);
  vm.runInContext(consts + '\n' + tick + '\n' + rec + '\n' + at +
    '\nthis.G = { ghostTick, recordGhostSpawn, ghostEnemiesAt, GHOST_DT, GHOST_CAP, GHOST_LIFE };', ctx);
  return ctx.G;
}

ok('the shipped helpers were found',
   !!CONSTS && !!tickText && !!recText && !!atText,
   [!!CONSTS, !!tickText, !!recText, !!atText].join('/'));

const G = build(CONSTS[0], tickText, recText, atText);
const { ghostTick, recordGhostSpawn, ghostEnemiesAt, GHOST_DT, GHOST_CAP, GHOST_LIFE } = G;

// ---- 1. the spawn clock is the path's clock --------------------------------
const pathClock = SRC.match(/ghostT >= ghostRec\.length \* ([\d.]+)/);
ok('the path recorder still steps on its own clock', !!pathClock, pathClock ? pathClock[1] : 'missing');
ok('GHOST_DT is that same 0.4s clock', GHOST_DT === 0.4 && pathClock && Number(pathClock[1]) === GHOST_DT,
   'DT=' + GHOST_DT + ' path=' + (pathClock ? pathClock[1] : '?'));

// ---- 2. ghostTick quantises and is safe ------------------------------------
ok('ghostTick(0) is 0', ghostTick(0) === 0);
ok('ghostTick(-5) is 0, never negative', ghostTick(-5) === 0);
ok('ghostTick(NaN) is 0, never NaN', ghostTick(NaN) === 0);
ok('ghostTick(Infinity) is 0, never Infinity', ghostTick(Infinity) === 0);
ok('two times in one bucket land on the same tick', ghostTick(0.39) === ghostTick(0.41), 'both ' + ghostTick(0.39));
ok('a tick is a whole multiple of GHOST_DT',
   [0, 0.1, 0.4, 1.0, 3.3, 19.99].every(t => Number.isInteger(Math.round(ghostTick(t) / GHOST_DT))));
ok('ghostTick is monotonic', [0.1, 0.5, 0.9, 4.4, 9.9].every((t, i, a) => i === 0 || ghostTick(t) >= ghostTick(a[i - 1])));

// ---- 3. recordGhostSpawn ---------------------------------------------------
let list = [];
recordGhostSpawn(list, 1.03, 'tank', 3, -4);
ok('a spawn is stored on the tick, not the raw time', list.length === 1 && list[0].t === ghostTick(1.03), 't=' + list[0].t);
ok('the spawn keeps its type and its place', list[0].type === 'tank' && list[0].x === 3 && list[0].z === -4);
recordGhostSpawn(list, 2, '', 0, 0);
ok('a missing type defaults to grunt', list[1].type === 'grunt');
const before = list.length;
recordGhostSpawn(list, NaN, 'tank', 1, 1);
recordGhostSpawn(list, 2, 'tank', NaN, 1);
recordGhostSpawn(list, 2, 'tank', 1, Infinity);
ok('junk is refused, not stored', list.length === before, before + ' -> ' + list.length);
const full = [];
for (let i = 0; i < GHOST_CAP + 50; i++) recordGhostSpawn(full, i * 0.4, 'grunt', i, i);
ok('the record is capped at GHOST_CAP', full.length === GHOST_CAP, full.length + '/' + GHOST_CAP);
ok('recordGhostSpawn returns the list it was given', recordGhostSpawn(list, 9, 'grunt', 1, 1) === list);
ok('a null list is a no-op, not a throw', recordGhostSpawn(null, 1, 'grunt', 1, 1) === null);

// ---- 4. ghostEnemiesAt window ---------------------------------------------
const gh = { spawns: [
  { t: 2.0, type: 'tank', x: 1, z: 1 },
  { t: 4.4, type: 'runner', x: 2, z: 2 },
  { t: 8.0, type: 'boss', x: 3, z: 3 }
] };
ok('before its tick, a spawn is not on the field', ghostEnemiesAt(gh, 1.9).length === 0);
ok('at its tick, a spawn appears', ghostEnemiesAt(gh, 2.0).length === 1);
ok('a spawn is visible for GHOST_LIFE seconds', ghostEnemiesAt(gh, 2.0 + GHOST_LIFE - 0.01).length >= 1);
ok('and gone at exactly its expiry', ghostEnemiesAt(gh, 2.0 + GHOST_LIFE).every(s => s.t !== 2.0));
ok('the window catches every spawn that is live at once', ghostEnemiesAt(gh, 5.0).length === 2);
ok('a life override is honoured', ghostEnemiesAt(gh, 7.0, 1).length === 0 && ghostEnemiesAt(gh, 7.0, 10).length === 2,
   ghostEnemiesAt(gh, 7.0, 1).length + '/' + ghostEnemiesAt(gh, 7.0, 10).length);

// ---- 5. an old record still replays ---------------------------------------
ok('a record with no spawns answers []', ghostEnemiesAt({ rec: [{ t: 0, x: 0, z: 0 }] }, 1).length === 0);
ok('a null record answers []', ghostEnemiesAt(null, 1).length === 0);
ok('an empty spawn list answers []', ghostEnemiesAt({ spawns: [] }, 1).length === 0);
const ghostPosText = liftFn(SRC, 'function ghostPos(');
ok('ghostPos() is untouched by this change and still lifts', !!ghostPosText);

// ---- 6. the shipped source really wires it --------------------------------
ok('the boss spawn is recorded', SRC.includes('recordGhostSpawn(ghostWaves, ghostT, bossType, sp[0], sp[1])'));
ok('every grunt of the wave is recorded', SRC.includes('recordGhostSpawn(ghostWaves, ghostT, e.type, e.x, e.z)'));
ok('the record is saved with the spawns', /spawns: ghostWaves/.test(SRC));
ok('the spawns reset with the path on a new run',
   (SRC.match(/ghostWaves = \[\];/g) || []).length === 2,
   (SRC.match(/ghostWaves = \[\];/g) || []).length + ' reset site(s)');
ok('the ghost draw asks which enemies are live', SRC.includes('ghostEnemiesAt(GHOST, ghostT)'));

// ---- 7. ten mutations, all red -------------------------------------------
function mutation(label, edit, predicate) {
  const m = { consts: CONSTS[0], tick: tickText, rec: recText, at: atText };
  const target = edit.field;
  m[target] = m[target].replace(edit.find, edit.replace);
  let flipped;
  try {
    const g = build(m.consts, m.tick, m.rec, m.at);
    flipped = !predicate(g);
  } catch (e) { flipped = true; }
  ok('mutation is RED: ' + label, flipped);
}

mutation('the clock is not 0.4',
  { field: 'consts', find: 'GHOST_DT = 0.4', replace: 'GHOST_DT = 0.5' },
  g => g.GHOST_DT === 0.4);

mutation('ghostTick returns the raw time',
  { field: 'tick', find: 'return Math.round(t / GHOST_DT) * GHOST_DT;', replace: 'return t;' },
  g => g.ghostTick(0.39) === g.ghostTick(0.41));

mutation('ghostTick lets a negative time through',
  { field: 'tick', find: 'if (!isFinite(t) || t < 0) return 0;', replace: 'if (!isFinite(t)) return 0;' },
  g => g.ghostTick(-5) === 0);

mutation('a spawn is stored on the raw time',
  { field: 'rec', find: 't: ghostTick(t)', replace: 't: t' },
  g => { const l = []; g.recordGhostSpawn(l, 1.03, 'tank', 1, 1); return l[0].t === g.ghostTick(1.03); });

mutation('the cap is ignored',
  { field: 'rec', find: 'list.length >= GHOST_CAP', replace: 'false' },
  g => { const l = []; for (let i = 0; i < g.GHOST_CAP + 50; i++) g.recordGhostSpawn(l, i * 0.4, 'g', i, i); return l.length === g.GHOST_CAP; });

mutation('junk coordinates are stored',
  { field: 'rec', find: 'if (!isFinite(t) || !isFinite(x) || !isFinite(z)) return list;', replace: '' },
  g => { const l = []; g.recordGhostSpawn(l, 2, 'g', NaN, 1); return l.length === 0; });

mutation('the window starts a hair late',
  { field: 'at', find: 'if (s.t <= t && t < s.t + L)', replace: 'if (s.t < t && t < s.t + L)' },
  g => g.ghostEnemiesAt({ spawns: [{ t: 2, type: 'g', x: 0, z: 0 }] }, 2).length === 1);

mutation('the window never closes',
  { field: 'at', find: 't < s.t + L', replace: 'true' },
  g => g.ghostEnemiesAt({ spawns: [{ t: 2, type: 'g', x: 0, z: 0 }] }, 2 + g.GHOST_LIFE).length === 0);

mutation('an old record throws instead of answering []',
  { field: 'at', find: 'if (!gh || !gh.spawns || !gh.spawns.length) return [];', replace: 'if (!gh.spawns.length) return [];' },
  g => g.ghostEnemiesAt({ rec: [] }, 1).length === 0);

mutation('the life override is ignored',
  { field: 'at', find: 'var L = (life > 0) ? life : GHOST_LIFE,', replace: 'var L = GHOST_LIFE,' },
  g => g.ghostEnemiesAt({ spawns: [{ t: 2, type: 'g', x: 0, z: 0 }] }, 10, 12).length === 1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
