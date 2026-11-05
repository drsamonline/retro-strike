#!/usr/bin/env node
// Save hygiene — the test for what the app does when the SAVE is wrong.
//
//   node tools/test-save.mjs
//
// A save lives in localStorage: written by an older build, edited by hand, or cut
// short by a full disk. continueRun() used to hand it straight to the game
// (`player = s.player`, then `player.x`), so a file without a player — or with a
// string where a number belongs — threw on CONTINUE, and kept throwing, because the
// save is only cleared by QUIT TO TITLE. That is a bricked app: the only way out is
// "reset all data", which the player has no reason to find.
//
// cleanSave() is the gate. This test lifts it OUT of src/retro-strike.html (so it
// tests the shipped function, not a copy) and runs it against hostile input:
//   1. a save that is not a save is refused, and the caller is told to start clean
//   2. everything the game reads is a number the game can use — no NaN, no strings
//   3. the player's position is inside the arena it will be restored into
//   4. the OLD path really did throw on the same input, so this is a fix, not a story
//   5. the source still routes continueRun() through cleanSave() and saveQuit()
//      still refuses to look like a successful save
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

// ---- lift cleanSave() out of the shipped source -----------------------------
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

const fnText = lift(SRC, 'function cleanSave(');
ok('cleanSave() is in the shipped source', !!fnText);
if (!fnText) { console.log('\n0 passed, ' + (fail + 1) + ' failed'); process.exit(1); }

const ctx = vm.createContext({});
vm.runInContext(fnText, ctx);
const cleanSave = vm.runInContext('cleanSave', ctx);
ok('cleanSave() is a function', typeof cleanSave === 'function');

// A number the game can use is a finite number — anything else is a bug waiting
// for the render loop, so scan the whole cleaned save for one.
function nonFinite(node, path = '', out = []) {
  if (typeof node === 'number') { if (!Number.isFinite(node)) out.push(path); return out; }
  if (Array.isArray(node)) { node.forEach((v, i) => nonFinite(v, path + '[' + i + ']', out)); return out; }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) nonFinite(node[k], path ? path + '.' + k : k, out);
  }
  return out;
}

// ---- 1. things that are not a save are refused ------------------------------
const notSaves = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'retroStrikeSave'],
  ['a number', 42],
  ['an array', []],
  ['an empty object', {}],
  ['player: null', { player: null }],
  ['player: []', { player: [] }],
  ['player: "x"', { player: 'x' }],
  ['a string x', { player: { x: '12', z: 3 } }],
  ['NaN x', { player: { x: NaN, z: 3 } }],
  ['Infinity z', { player: { x: 3, z: Infinity } }],
  ['a missing x', { player: { z: 3 } }]
];
for (const [name, value] of notSaves) {
  let got, threw = null;
  try { got = cleanSave(value, 48); } catch (e) { threw = e; }
  ok('refuses ' + name, threw === null && got === null, threw ? 'threw ' + threw.message : 'got ' + JSON.stringify(got));
}

// ---- 2. a real save comes back usable --------------------------------------
const good = {
  arenaSeed: 123456, diff: 2, time: 91.5, score: 4200, kills: 37, wave: 6,
  secretsFound: 1, secretsFoundFlags: [true, false],
  deadBarrels: [0, 1, 1],
  enemies: [{ x: 10, z: 12, type: 'tank', hp: 80, maxhp: 80, speed: 0.95, r: 0.55, cd: 1.2, hitT: 0, spawnT: 0, wob: 3, charge: 0, shield: 0 }],
  bullets: [{ x: 1, y: 1, z: 1 }], pickups: [{ x: 2, z: 2, kind: 'hp' }], nades: [], mines: [],
  runStat: { buys: 2, nadeKills: 1, maxCombo: 5 },
  player: {
    x: 24.5, z: 24.5, yaw: 1.2, hp: 62, maxhp: 100, weapon: 'rifle',
    owned: { blaster: true, spread: true, rifle: true },
    ammo: { shells: 4, cells: 18, cores: 0 },
    nades: 2, mines: 1, cluster: 0, shield: 25, stam: 0.7, up: 1, drone: true
  }
};
const c = cleanSave(good, 48);
ok('a real save survives', !!c);
ok('  score / kills / wave kept', c.score === 4200 && c.kills === 37 && c.wave === 6, c.score + '/' + c.kills + '/' + c.wave);
ok('  player position kept', c.player.x === 24.5 && c.player.z === 24.5);
ok('  hp and maxhp kept', c.player.hp === 62 && c.player.maxhp === 100);
ok('  equipped weapon kept', c.player.weapon === 'rifle');
ok('  ammo kept', c.player.ammo.shells === 4 && c.player.ammo.cells === 18);
ok('  enemy kept, type kept', c.enemies.length === 1 && c.enemies[0].type === 'tank');
ok('  secrets / barrels kept', c.secretsFoundFlags.length === 2 && c.deadBarrels.length === 3);
ok('  runStat kept', c.runStat.buys === 2 && c.runStat.maxCombo === 5);
ok('a real save has no non-finite number', nonFinite(c).length === 0, nonFinite(c).join(', '));

// ---- 3. hostile values are clamped, not carried ----------------------------
const hostile = {
  arenaSeed: 1e30, diff: 99, time: -5, score: -1, kills: 'many', wave: 0,
  secretsFound: null, secretsFoundFlags: 'nope', deadBarrels: { a: 1 },
  enemies: [
    { x: 1, z: 1, hp: 'dead', maxhp: 50 },        // hp is not a number
    null,                                          // not an enemy
    { x: NaN, z: 2, hp: 10 },                      // cannot be placed
    { z: 3, hp: 10 },                              // no x
    { x: 5, z: 5, hp: 999, maxhp: 50, type: 'nuke' } // hp over max, unknown type
  ],
  bullets: 'nope', pickups: [null, { x: 1, z: 1 }], nades: null, mines: {},
  runStat: 'nope',
  player: {
    x: 999, z: -40, yaw: 1e9, hp: 5000, maxhp: 'big', weapon: 'nuke',
    owned: 'everything', ammo: 'full', nades: 1e6, mines: -3, cluster: null,
    shield: 900, stam: 5, up: 99, drone: 'yes'
  }
};
let h, hThrew = null;
try { h = cleanSave(hostile, 48); } catch (e) { hThrew = e; }
ok('a hostile save does not throw', hThrew === null, hThrew ? hThrew.message : 'ok');
ok('  diff clamped into 0..2', h.diff === 2, String(h.diff));
ok('  wave floored at 1', h.wave === 1, String(h.wave));
ok('  time floored at 0', h.time === 0, String(h.time));
ok('  score floored at 0', h.score === 0, String(h.score));
ok('  position pulled inside the 48 arena', h.player.x === 47 && h.player.z === 1, h.player.x + ',' + h.player.z);
ok('  hp clamped to maxhp', h.player.hp === 100 && h.player.maxhp === 100, h.player.hp + '/' + h.player.maxhp);
ok('  unknown weapon falls back to blaster', h.player.weapon === 'blaster');
ok('  a broken owned map still owns the blaster', h.player.owned.blaster === true && Object.keys(h.player.owned).length === 1);
ok('  a broken ammo block reads as empty', h.player.ammo.shells === 0 && h.player.ammo.cells === 0 && h.player.ammo.cores === 0);
ok('  nades / mines / shield clamped', h.player.nades === 99 && h.player.mines === 0 && h.player.shield === 50);
ok('  unplaceable enemies dropped, 2 kept', h.enemies.length === 2, String(h.enemies.length));
ok('  an enemy over maxhp is pulled back to maxhp', h.enemies[1].hp === 50 && h.enemies[1].maxhp === 50, h.enemies[1].hp + '/' + h.enemies[1].maxhp);
ok('  an unknown enemy type reads as grunt', h.enemies[1].type === 'grunt');
ok('  a non-array secrets list reads as empty', Array.isArray(h.secretsFoundFlags) && h.secretsFoundFlags.length === 0);
ok('  a broken runStat reads as zeros', h.runStat.buys === 0 && h.runStat.nadeKills === 0);
ok('  a hostile save has no non-finite number', nonFinite(h).length === 0, nonFinite(h).join(', '));

// ---- 4. the arena the save is restored into -------------------------------
const wide = cleanSave({ player: { x: 70, z: 70 } }, 80);
ok('a 64/80 arena keeps a far position', wide.player.x === 70 && wide.player.z === 70);
const junk = cleanSave({ player: { x: 70, z: 70 } }, 'huge');
ok('an unreadable arena size falls back to 48', junk.player.x === 47 && junk.player.z === 47, junk.player.x + ',' + junk.player.z);

// ---- 5. this is a FIX: the old path really did throw ----------------------
// The old continueRun() body, verbatim where it matters.
function oldContinueRun(save) {
  var player = save.player;
  var blocked = function (x, z) { return !(x > 0 && z > 0); };
  if (blocked(player.x, player.z, 0.32)) { return 'moved'; }
  return 'ok';
}
let oldThrew = 0;
for (const [, value] of notSaves) {
  try { oldContinueRun(value); } catch (e) { oldThrew++; }
}
ok('the old continueRun() threw on the refused saves', oldThrew > 0, oldThrew + ' of ' + notSaves.length + ' threw');
let newThrew = 0;
for (const [, value] of notSaves) {
  try { const r = cleanSave(value, 48); if (!r) throw new Error('refused'); } catch (e) { newThrew++; }
}
ok('cleanSave() refuses all of them instead of throwing', newThrew === notSaves.length, newThrew + '/' + notSaves.length);

// ---- 6. the shipped code still uses the gate ------------------------------
ok('continueRun() routes the save through cleanSave()',
   /function continueRun\(\)[\s\S]{0,400}cleanSave\(s, MS\)/.test(SRC));
ok('an unreadable save is cleared, not kept for the next crash',
   /cleanSave\(s, MS\)[\s\S]{0,300}clearSave\(\)[\s\S]{0,200}SAVE UNREADABLE/.test(SRC));
ok('saveQuit() does not quit when the save failed',
   /function saveQuit\(\)[\s\S]{0,300}if \(!saveRun\(\)\)[\s\S]{0,120}return;/.test(SRC));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
