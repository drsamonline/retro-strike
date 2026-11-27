#!/usr/bin/env node
// The ghost's enemies MOVE — the test for the coarse track v1.4.6 records.
//
//   node tools/test-ghost-motion.mjs
//
// v1.4.5 put the wave's spawns in the ghost record, so the replay showed the
// fight's CAST — but each enemy appeared where it was born and vanished six
// seconds later. A marker standing still is not the fight it claims to replay.
// Each recorded enemy now keeps a track: its place on every 0.4s tick it is
// alive (the same clock as the player's path and the spawns), and
// ghostEnemiesAt() answers where the enemy WAS at t, interpolated between the
// two samples that bracket t.
//
// This test lifts the shipped functions OUT of src/retro-strike.html and runs
// them as shipped (not a copy):
//   1. a spawn now carries a one-sample track, on the spawn clock
//   2. recordGhostStep() appends one sample per tick, never rewinds, refuses
//      junk, and stops when the enemy's own GHOST_LIFE is up — which is also
//      what bounds the track, so the save cannot grow without limit
//   3. ghostAt() interpolates between samples and clamps at both ends
//   4. an entry with no track answers its spawn point — an old record still replays
//   5. ghostEnemiesAt() returns each live enemy at its position AT t, keeps the
//      window (before / inside / after) and still answers [] for an old record
//   6. the shipped source really wires it: an enemy keeps its own entry, the
//      update loop steps it, and the draw still asks ghostEnemiesAt()
//   7. the whole record stays inside a stated size bound
//   8. seven mutations of the shipped code are all RED, so the assertions bite
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

const near = (a, b) => Math.abs(a - b) < 1e-9;

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
const F = {
  tick: liftFn(SRC, 'function ghostTick('),
  rec: liftFn(SRC, 'function recordGhostSpawn('),
  spawnFor: liftFn(SRC, 'function ghostSpawnFor('),
  step: liftFn(SRC, 'function recordGhostStep('),
  at: liftFn(SRC, 'function ghostAt('),
  enemies: liftFn(SRC, 'function ghostEnemiesAt(')
};

function build(parts) {
  const ctx = { isFinite, Math, String, Array, console };
  vm.createContext(ctx);
  vm.runInContext(parts.consts + '\n' + parts.tick + '\n' + parts.rec + '\n' + parts.spawnFor + '\n' +
    parts.step + '\n' + parts.at + '\n' + parts.enemies +
    '\nthis.G = { ghostTick, recordGhostSpawn, ghostSpawnFor, recordGhostStep, ghostAt, ghostEnemiesAt, GHOST_DT, GHOST_CAP, GHOST_LIFE };', ctx);
  return ctx.G;
}

ok('the shipped helpers were found',
   !!CONSTS && Object.values(F).every(Boolean),
   [!!CONSTS, ...Object.values(F).map(Boolean)].join('/'));

const G = build({ consts: CONSTS[0], ...F });
const { ghostTick, recordGhostSpawn, ghostSpawnFor, recordGhostStep, ghostAt, ghostEnemiesAt,
        GHOST_DT, GHOST_CAP, GHOST_LIFE } = G;

// ---- 1. a spawn carries a one-sample track --------------------------------
ok('a track can never hold more than the life\'s worth of ticks',
   GHOST_LIFE / GHOST_DT + 1 === 16, (GHOST_LIFE / GHOST_DT + 1) + ' samples at most');
const l1 = [];
recordGhostSpawn(l1, 1.03, 'tank', 3, -4);
ok('a spawn opens a track with its own birth sample',
   l1[0].path.length === 1 && l1[0].path[0].t === l1[0].t && l1[0].path[0].x === 3 && l1[0].path[0].z === -4,
   JSON.stringify(l1[0].path[0]));
ok('the birth sample is on the tick, not the raw time', l1[0].path[0].t === ghostTick(1.03));

// ---- 2. recordGhostStep ---------------------------------------------------
const l2 = [];
const e2 = ghostSpawnFor(l2, 2.0, 'grunt', 0, 0);
ok('ghostSpawnFor hands back the entry it stored', e2 === l2[0]);
recordGhostStep(l2, e2, 2.4, 1, 0);
ok('a step is appended on its tick', e2.path.length === 2 && near(e2.path[1].t, 2.4) && e2.path[1].x === 1,
   JSON.stringify(e2.path[1]));
const n2 = e2.path.length;
recordGhostStep(l2, e2, 2.41, 9, 9);
ok('two calls in one tick store one sample, not two', e2.path.length === n2, n2 + ' -> ' + e2.path.length);
recordGhostStep(l2, e2, 1.6, 9, 9);
ok('a rewind is refused', e2.path.length === n2);
const before = e2.path.length;
recordGhostStep(l2, e2, NaN, 1, 1);
recordGhostStep(l2, e2, 2.8, NaN, 1);
recordGhostStep(l2, e2, 2.8, 1, Infinity);
ok('junk samples are refused, not stored', e2.path.length === before);
ok('a step returns the entry', recordGhostStep(l2, e2, 2.8, 5, 0) === e2);
ok('a null entry is a no-op, not a throw', recordGhostStep(l2, null, 2, 1, 1) === null);
ok('an entry with no track is a no-op (an old record)', (() => {
  const old = { t: 1, type: 'grunt', x: 2, z: 3 };
  recordGhostStep(l2, old, 2, 5, 5);
  return old.path === undefined;
})());
const l3 = [];
const e3 = ghostSpawnFor(l3, 0, 'boss', 0, 0);
for (let i = 1; i < 40; i++) recordGhostStep(l3, e3, i * GHOST_DT, i, 0);
ok('a track stops when the enemy\'s life is up, however long the run goes on',
   e3.path.length === 15, e3.path.length + ' samples');
ok('and its last sample is inside the enemy\'s life',
   e3.path[e3.path.length - 1].t < e3.path[0].t + GHOST_LIFE,
   e3.path[e3.path.length - 1].t + ' < ' + (e3.path[0].t + GHOST_LIFE));
const l4 = [];
const e4 = ghostSpawnFor(l4, 10, 'grunt', 0, 0);
for (let i = 1; i <= 30; i++) recordGhostStep(l4, e4, 10 + i * GHOST_DT, i, 0);
ok('no sample lands at or after GHOST_LIFE',
   e4.path.every(p => p.t < 10 + GHOST_LIFE), 'last=' + e4.path[e4.path.length - 1].t);
ok('the cap refuses the spawn and answers null', (() => {
  const full = [];
  for (let i = 0; i < GHOST_CAP; i++) recordGhostSpawn(full, i * GHOST_DT, 'g', i, i);
  return ghostSpawnFor(full, 99, 'g', 1, 1) === null && full.length === GHOST_CAP;
})());

// ---- 3. ghostAt interpolates ---------------------------------------------
const trk = { t: 2, type: 'grunt', x: 0, z: 0, path: [{ t: 2, x: 0, z: 0 }, { t: 2.4, x: 4, z: 2 }, { t: 2.8, x: 4, z: 6 }] };
ok('at the first sample it is at the first place', near(ghostAt(trk, 2)[0], 0) && near(ghostAt(trk, 2)[1], 0));
ok('midway between two samples it is halfway', near(ghostAt(trk, 2.2)[0], 2) && near(ghostAt(trk, 2.2)[1], 1),
   JSON.stringify(ghostAt(trk, 2.2)));
ok('in the second leg it follows the second leg', near(ghostAt(trk, 2.6)[0], 4) && near(ghostAt(trk, 2.6)[1], 4));
ok('before the track it clamps to the first sample', near(ghostAt(trk, 1)[0], 0) && near(ghostAt(trk, 1)[1], 0));
ok('after the track it clamps to the last sample', near(ghostAt(trk, 9)[0], 4) && near(ghostAt(trk, 9)[1], 6));
ok('a one-sample track answers that sample', ghostAt({ t: 2, x: 7, z: 8, path: [{ t: 2, x: 7, z: 8 }] }, 5)[0] === 7);
ok('an empty track answers the spawn point, not NaN',
   ghostAt({ t: 2, x: 7, z: 8, path: [] }, 5)[0] === 7 && ghostAt({ t: 2, x: 7, z: 8, path: [] }, 5)[1] === 8);
ok('an entry with no track at all answers its spawn point', ghostAt({ t: 2, x: 7, z: 8 }, 5)[0] === 7);

// ---- 4./5. ghostEnemiesAt returns the enemy AT t --------------------------
const gh = { spawns: [
  { t: 2.0, type: 'tank', x: 0, z: 0, path: [{ t: 2.0, x: 0, z: 0 }, { t: 2.4, x: 4, z: 0 }] },
  { t: 4.4, type: 'runner', x: 2, z: 2 },
  { t: 8.0, type: 'boss', x: 3, z: 3 }
] };
ok('before its tick, a spawn is not on the field', ghostEnemiesAt(gh, 1.9).length === 0);
ok('at its tick, a spawn appears', ghostEnemiesAt(gh, 2.0).length === 1);
ok('a live enemy is reported where it HAS MOVED TO, not where it was born',
   (() => { const w = ghostEnemiesAt(gh, 2.2); return w.length === 1 && Math.abs(w[0].x - 2) < 1e-9; })(),
   JSON.stringify(ghostEnemiesAt(gh, 2.2)));
ok('the entry still names its own tick and type', (() => { const w = ghostEnemiesAt(gh, 2.2)[0]; return w.t === 2.0 && w.type === 'tank'; })());
ok('the birth place is still carried', (() => { const w = ghostEnemiesAt(gh, 2.2)[0]; return w.sx === 0 && w.sz === 0; })());
ok('a trackless spawn answers its spawn point (an old record)',
   (() => { const w = ghostEnemiesAt({ spawns: [{ t: 4.4, type: 'runner', x: 2, z: 2 }] }, 4.5);
            return w.length === 1 && w[0].x === 2 && w[0].z === 2; })());
ok('a spawn is visible for GHOST_LIFE seconds', ghostEnemiesAt(gh, 2.0 + GHOST_LIFE - 0.01).length >= 1);
ok('and gone at exactly its expiry', ghostEnemiesAt(gh, 2.0 + GHOST_LIFE).every(s => s.t !== 2.0));
ok('the window catches every spawn that is live at once', ghostEnemiesAt(gh, 5.0).length === 2);
ok('a life override is honoured', ghostEnemiesAt(gh, 7.0, 1).length === 0 && ghostEnemiesAt(gh, 7.0, 10).length === 2);
ok('a record with no spawns answers []', ghostEnemiesAt({ rec: [{ t: 0, x: 0, z: 0 }] }, 1).length === 0);
ok('a null record answers []', ghostEnemiesAt(null, 1).length === 0);

// ---- 6. the shipped source really wires it -------------------------------
ok('the boss keeps its own ghost entry', SRC.includes('.ghost = ghostSpawnFor(ghostWaves, ghostT, bossType, sp[0], sp[1])'));
ok('every grunt of the wave keeps its own ghost entry', SRC.includes('e.ghost = ghostSpawnFor(ghostWaves, ghostT, e.type, e.x, e.z)'));
ok('the enemy update loop steps the ghost entry', SRC.includes('if (en.ghost) recordGhostStep(ghostWaves, en.ghost, ghostT, en.x, en.z)'));
ok('the step is taken after the enemy has moved', (() => {
  const at = SRC.indexOf('if (en.ghost) recordGhostStep(');
  const mv = SRC.lastIndexOf('if (!blocked(en.x, ez, en.r * 0.8)) en.z = ez;', at);
  return at > 0 && mv > 0 && mv < at;
})());
ok('ghostSpawnFor really records through recordGhostSpawn', /function ghostSpawnFor\([\s\S]{0,200}recordGhostSpawn\(list, t, type, x, z\)/.test(SRC));
ok('the ghost draw still asks which enemies are live', SRC.includes('ghostEnemiesAt(GHOST, ghostT)'));
ok('the draw reads the position it is given, not the spawn place', SRC.includes('var gwx = gws[i].x, gwz = gws[i].z;'));
ok('the track is saved with the spawns', /spawns: ghostWaves/.test(SRC));

// ---- 7. the whole record stays inside a stated size bound -----------------
ok('a full record of 900 spawns, each with its whole track, stays under 1 MB', (() => {
  const big = [];
  for (let i = 0; i < GHOST_CAP; i++) {
    const e = ghostSpawnFor(big, i * 0.4, 'grunt', i, -i);
    for (let k = 1; k < 20; k++) recordGhostStep(big, e, i * 0.4 + k * GHOST_DT, i + k * 0.1, -i);
  }
  const bytes = Buffer.byteLength(JSON.stringify({ seed: 1, score: 1, mode: 'endless', day: 1, rec: [], spawns: big }));
  return bytes < 1024 * 1024;
})());

// ---- 8. seven mutations, all red ----------------------------------------
function mutation(label, edit, predicate) {
  const parts = { consts: CONSTS[0], ...F };
  parts[edit.field] = parts[edit.field].replace(edit.find, edit.replace);
  let flipped;
  try {
    const g = build(parts);
    flipped = !predicate(g);
  } catch (e) { flipped = true; }
  ok('mutation is RED: ' + label, flipped);
}

const MID = g => {
  const s = { t: 2, type: 'g', x: 0, z: 0, path: [{ t: 2, x: 0, z: 0 }, { t: 2.4, x: 4, z: 0 }] };
  return Math.abs(g.ghostAt(s, 2.2)[0] - 2) < 1e-9;
};

mutation('the interpolation always answers the first sample',
  { field: 'at', find: 'var f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;', replace: 'var f = 0;' }, MID);

mutation('the interpolation runs past the last sample',
  { field: 'at', find: 'if (f > 1) f = 1;', replace: '' }, g => Math.abs(g.ghostAt(
    { t: 2, x: 0, z: 0, path: [{ t: 2, x: 0, z: 0 }, { t: 2.4, x: 4, z: 0 }] }, 9)[0] - 4) < 1e-9);

mutation('a rewind is accepted',
  { field: 'step', find: 'if (!(tk > last.t)) return entry;', replace: '' },
  g => { const l = [], e = g.ghostSpawnFor(l, 2, 'g', 0, 0); g.recordGhostStep(l, e, 2.4, 1, 0);
         g.recordGhostStep(l, e, 1.6, 9, 9); return e.path.length === 2; });

mutation('two samples land in one tick',
  { field: 'step', find: 'if (!(tk > last.t)) return entry;', replace: 'if (tk < last.t) return entry;' },
  g => { const l = [], e = g.ghostSpawnFor(l, 2, 'g', 0, 0); g.recordGhostStep(l, e, 2.4, 1, 0);
         g.recordGhostStep(l, e, 2.41, 2, 0); return e.path.length === 2; });

mutation('a dead enemy keeps walking',
  { field: 'step', find: 'if (tk >= entry.path[0].t + GHOST_LIFE) return entry;', replace: '' },
  g => { const l = [], e = g.ghostSpawnFor(l, 0, 'g', 0, 0);
         for (let i = 1; i <= 30; i++) g.recordGhostStep(l, e, i * g.GHOST_DT, i, 0);
         return e.path.every(p => p.t < g.GHOST_LIFE); });

mutation('ghostEnemiesAt ignores the track and answers the spawn point',
  { field: 'enemies', find: 'w = ghostAt(s, t);', replace: 'w = [s.x, s.z];' },
  g => { const w = g.ghostEnemiesAt({ spawns: [{ t: 2, type: 'g', x: 0, z: 0, path: [{ t: 2, x: 0, z: 0 }, { t: 2.4, x: 4, z: 0 }] }] }, 2.2);
         return w.length === 1 && Math.abs(w[0].x - 2) < 1e-9; });

mutation('a spawn is stored with no track at all',
  { field: 'rec', find: ', path: [{ t: tk, x: x, z: z }]', replace: '' },
  g => { const l = []; g.recordGhostSpawn(l, 2, 'g', 1, 1); return l[0].path && l[0].path.length === 1; });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
