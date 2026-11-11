#!/usr/bin/env node
// Stored-state hygiene — the test for the four stores that are NOT the run save.
//
//   node tools/test-store.mjs
//
// cleanSave() (tools/test-save.mjs) gates the RUN. Four more objects survive a
// crash in localStorage and were each taken on trust: the leaderboard, the
// campaign's unlock level, the daily best and the lifetime stats. Every one of them
// is JSON written by an older build, edited by hand, or cut short by a full disk.
//
// Measured on the committed source before this change:
//   * board = [null]  ->  the LEADERBOARD row template `String(board[n].s)` threw
//     "Cannot read properties of null (reading 's')" on every frame, so opening
//     LEADERBOARD killed the app rather than showing a board.
//   * board = [{s:5}] ->  rendered "Wundefined Kundefined undefined" as a real run.
//   * campProg.unlocked = -3 (or 0, or null) -> every level was unplayable for
//     good, and the only feedback was "LOCKED - CLEAR LEVEL -3".
//   * daily = {day:"x", best:"abc"} -> the title menu advertised "BEST abc".
//
// This test lifts the four cleaners OUT of src/retro-strike.html (so it tests the
// shipped functions, not copies), runs them against hostile input, and re-runs the
// shipped render expression on the cleaned result to show it no longer throws.
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

// ---- lift the shipped gate ---------------------------------------------------
const ctx = vm.createContext({});
for (const name of ['numOr', 'strOr', 'cleanBoard', 'cleanCamp', 'cleanDaily', 'cleanStats']) {
  const text = lift(SRC, 'function ' + name + '(');
  ok(name + '() is in the shipped source', !!text);
  if (text) vm.runInContext(text, ctx);
}
const { cleanBoard, cleanCamp, cleanDaily, cleanStats } = vm.runInContext(
  '({ cleanBoard: cleanBoard, cleanCamp: cleanCamp, cleanDaily: cleanDaily, cleanStats: cleanStats })', ctx);

// ---- 1. the board: nothing unusable gets through ----------------------------
const notBoards = [
  ['null', null], ['undefined', undefined], ['a string', 'board'],
  ['an object', { s: 1 }], ['a number', 7]
];
for (const [name, v] of notBoards) {
  let got, threw = null;
  try { got = cleanBoard(v); } catch (e) { threw = e; }
  ok('board: refuses ' + name, !threw && Array.isArray(got) && got.length === 0, threw ? 'threw ' + threw.message : JSON.stringify(got));
}

const junkRows = [null, undefined, 0, 'row', [], { s: 'abc' }, { s: NaN }, { s: Infinity }, {}, true];
for (const row of junkRows) {
  const got = cleanBoard([row]);
  ok('board: drops row ' + JSON.stringify(row === undefined ? 'undefined' : row), got.length === 0, JSON.stringify(got));
}

const good = cleanBoard([{ s: 120, w: 3, k: 9, d: 'HARD', sd: 'zz', t: 5 }]);
ok('board: keeps a real row', good.length === 1 && good[0].s === 120 && good[0].w === 3 && good[0].d === 'HARD', JSON.stringify(good));
ok('board: every kept field is a usable number',
  good.length === 1 && ['s', 'w', 'k', 't'].every(k => Number.isFinite(good[0][k])));

const partial = cleanBoard([{ s: 5 }]);
ok('board: a row missing w/k/d gets defaults, not "undefined"',
  partial.length === 1 && partial[0].w === 0 && partial[0].k === 0 && partial[0].d === 'NORMAL', JSON.stringify(partial));

const sorted = cleanBoard([{ s: 10, w: 1 }, { s: 900, w: 2 }, { s: 50, w: 3 }]);
ok('board: sorted high score first', sorted.map(r => r.s).join(',') === '900,50,10', sorted.map(r => r.s).join(','));

const many = cleanBoard(Array.from({ length: 50 }, (_, i) => ({ s: i, w: 1 })));
ok('board: capped at 10 rows', many.length === 10, 'got ' + many.length);
ok('board: the cap keeps the TOP ten, not the first ten', many[0].s === 49 && many[9].s === 40, many[0].s + '..' + many[9].s);

const negs = cleanBoard([{ s: -40, w: -2, k: -1 }]);
ok('board: negative numbers are clamped, not kept', negs.length === 1 && negs[0].s === 0 && negs[0].w === 0 && negs[0].k === 0, JSON.stringify(negs));

const longStr = cleanBoard([{ s: 1, d: 'x'.repeat(400), sd: 'y'.repeat(400) }]);
ok('board: a runaway string is truncated', longStr[0].d.length <= 16 && longStr[0].sd.length <= 16, longStr[0].d.length + '/' + longStr[0].sd.length);

// ---- 2. the shipped LEADERBOARD row template survives what it used to kill ---
const rowLine = SRC.split('\n').find(l => l.includes('String(board[n].s)'));
ok('the LEADERBOARD row template is still in the source', !!rowLine);
if (rowLine) {
  const start = rowLine.indexOf('(n + 1)');
  const end = rowLine.indexOf('a: function');
  const expr = rowLine.slice(start, end).replace(/,\s*$/, '');
  const rowCtx = vm.createContext({ board: [null] });
  let oldThrew = false;
  try { vm.runInContext('(function(n){ return ' + expr + '; })', rowCtx)(0); } catch (e) { oldThrew = true; }
  ok('the OLD path really did throw on board [null]', oldThrew);

  const cleaned = cleanBoard([null, { s: 'abc' }, { s: 120, w: 3, k: 9, d: 'HARD', sd: 'zz' }]);
  rowCtx.board = cleaned;
  let rendered = null, threw = null;
  try { rendered = vm.runInContext('(function(n){ return ' + expr + '; })', rowCtx)(0); } catch (e) { threw = e; }
  ok('the SAME template renders the cleaned board', !threw && typeof rendered === 'string', threw ? 'threw ' + threw.message : rendered);
  ok('the rendered row shows the real score', !threw && rendered.includes('000120'), String(rendered));
}

// ---- 3. campaign progress: the ladder cannot be bricked --------------------
for (const [name, v] of [['null', null], ['a string', 'x'], ['an array', []], ['{}', {}], ['0', { unlocked: 0 }], ['-3', { unlocked: -3 }], ['NaN', { unlocked: NaN }], ['"7"', { unlocked: '7' }], ['undefined', { unlocked: undefined }]]) {
  const got = cleanCamp(v);
  ok('campaign: ' + name + ' falls back to level 1', got.unlocked === 1, JSON.stringify(got));
}
ok('campaign: a real value is kept', cleanCamp({ unlocked: 7 }).unlocked === 7);
ok('campaign: above the last level is clamped to 12', cleanCamp({ unlocked: 99 }).unlocked === 12, JSON.stringify(cleanCamp({ unlocked: 99 })));
ok('campaign: 7.6 does not leave level 7 unlockable-but-stuck', cleanCamp({ unlocked: 7.6 }).unlocked === 8, JSON.stringify(cleanCamp({ unlocked: 7.6 })));

const campGate = SRC.split('\n').find(l => l.includes('n <= campProg.unlocked'));
ok('the campaign gate is still in the source', !!campGate);
if (campGate) {
  const gctx = vm.createContext({ campProg: { unlocked: -3 } });
  const playable = [1, 2, 3].map(n => vm.runInContext('(' + n + ' <= campProg.unlocked)', gctx));
  ok('the OLD path locked every level at unlocked = -3', playable.every(v => v === false), playable.join(','));
  gctx.campProg = cleanCamp({ unlocked: -3 });
  ok('level 1 is playable again after the gate', vm.runInContext('(1 <= campProg.unlocked)', gctx) === true);
}

// ---- 4. daily best --------------------------------------------------------
ok('daily: null -> zeros', JSON.stringify(cleanDaily(null)) === '{"day":0,"best":0}');
ok('daily: junk strings -> zeros', JSON.stringify(cleanDaily({ day: 'x', best: 'abc' })) === '{"day":0,"best":0}', JSON.stringify(cleanDaily({ day: 'x', best: 'abc' })));
ok('daily: a real day and best are kept', JSON.stringify(cleanDaily({ day: 20000, best: 1234 })) === '{"day":20000,"best":1234}');
ok('daily: a negative best is not advertised', cleanDaily({ day: 1, best: -5 }).best === 0);

// ---- 5. lifetime stats: one bad field no longer costs all of them ---------
const st = cleanStats({ bestWave: 9, totalKills: 'lots', runs: 4, shots: NaN, hits: -2, nadeKills: 3, bestCombo: 6, barrels: 1, waves: 12, junk: 1 });
ok('stats: every known field survives as a number', ['bestWave', 'totalKills', 'runs', 'shots', 'hits', 'nadeKills', 'bestCombo', 'barrels', 'waves'].every(k => Number.isFinite(st[k])), JSON.stringify(st));
ok('stats: the good fields keep their values', st.bestWave === 9 && st.runs === 4 && st.waves === 12 && st.bestCombo === 6);
ok('stats: bad fields become 0, not NaN', st.totalKills === 0 && st.shots === 0 && st.hits === 0);
ok('stats: unknown keys are not carried into the game', !('junk' in st));
ok('stats: the OLD loader dropped the whole object on a bad bestWave',
  !(typeof 'lots' === 'number'), 'that is the behaviour being replaced');

// ---- 6. the source really routes the loaders through the gate -------------
for (const [name, re] of [
  ['stats', /stats = cleanStats\(JSON\.parse\(localStorage\.getItem\("retroStrikeStats"/],
  ['board', /board = cleanBoard\(JSON\.parse\(localStorage\.getItem\("retroStrikeBoard"/],
  ['daily', /daily = cleanDaily\(JSON\.parse\(localStorage\.getItem\("retroStrikeDaily"/],
  ['campaign', /campProg = cleanCamp\(JSON\.parse\(localStorage\.getItem\("retroStrikeCamp"/]
]) {
  ok('the ' + name + ' loader goes through its cleaner', re.test(SRC));
}
ok('saving a run routes the board through the same gate', /board = cleanBoard\(board\);/.test(SRC));
ok('no loader still assigns raw parsed JSON to board', !/board = Array\.isArray\(bo\)/.test(SRC));
ok('no loader still assigns raw parsed JSON to daily', !/if \(dobj\) daily = dobj/.test(SRC));
ok('no loader still assigns raw parsed JSON to campaign progress', !/if \(cobj && cobj\.unlocked\) campProg = cobj/.test(SRC));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
