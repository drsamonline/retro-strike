#!/usr/bin/env node
// Daily determinism — the test for what a DAILY CHALLENGE actually is.
//
//   node tools/test-daily.mjs
//
// The daily arena has always been seeded from the day, so the *map* was the same
// for everyone. Its mutators were not: spawnWave() drew them from Math.random(),
// so two players on 2026-11-18 could meet BLACKOUT on wave 3 and SWARM on wave 3,
// and the daily leaderboard compared two different games.
//
// dailyMutIndex(day, wave, count) is the fix — a pure function, so it is lifted
// out of src/retro-strike.html and tested here as the shipped function:
//   1. it is deterministic: same day + wave => same answer, every call
//   2. it does not read Math.random() — proved by poisoning Math.random
//   3. its answer is always -1 or a real index into MUTS
//   4. waves before 3 never carry a mutator, and no mutator is unreachable
//   5. the rate stays near the 30% per wave endless uses (not 0%, not 100%)
//   6. the OLD random path really did disagree between two players on one day
//   7. the shipped spawnWave() routes mode === "daily" through it, and the menu
//      shows the day's first mutator wave
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
function liftArray(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return null;
  const end = src.indexOf('];', at);
  return end < 0 ? null : src.slice(at, end + 2);
}

const mutsText = liftArray(SRC, 'var MUTS = [');
const fnText = liftFn(SRC, 'function dailyMutIndex(');
const planText = liftFn(SRC, 'function dailyMutPlan(');

ok('MUTS is in the shipped source', !!mutsText);
ok('dailyMutIndex() is in the shipped source', !!fnText);
ok('dailyMutPlan() is in the shipped source', !!planText);
if (!mutsText || !fnText || !planText) { console.log('\n0 passed, ' + (fail + 1) + ' failed'); process.exit(1); }

// Math.random is poisoned in the sandbox the functions run in: if either one
// reaches for it, the call throws and the assertions below fail loudly.
const ctx = vm.createContext({
  Math: Object.assign(Object.create(Math), {
    random() { throw new Error('dailyMutIndex() must not read Math.random()'); }
  })
});
vm.runInContext(mutsText, ctx);
vm.runInContext(fnText, ctx);
vm.runInContext(planText, ctx);
const MUTS = vm.runInContext('MUTS', ctx);
const dailyMutIndex = vm.runInContext('dailyMutIndex', ctx);
const dailyMutPlan = vm.runInContext('dailyMutPlan', ctx);

ok('MUTS lifted', Array.isArray(MUTS) && MUTS.length >= 2, MUTS.length + ' mutators');
ok('dailyMutIndex() is a function', typeof dailyMutIndex === 'function');
ok('dailyMutPlan() is a function', typeof dailyMutPlan === 'function');

const N = MUTS.length;
const DAY = Math.floor(Date.UTC(2026, 10, 18) / 86400000);   // 2026-11-18

// ---- 1. deterministic -------------------------------------------------------
let same = true;
for (let w = 1; w <= 60; w++) {
  const a = dailyMutIndex(DAY, w, N), b = dailyMutIndex(DAY, w, N), c = dailyMutIndex(DAY, w, N);
  if (a !== b || b !== c) same = false;
}
ok('same day + wave always gives the same answer', same);
ok('two players on one day share the whole plan',
  JSON.stringify(dailyMutPlan(DAY, 20)) === JSON.stringify(dailyMutPlan(DAY, 20)));

// ---- 2. does not read Math.random (the sandbox throws if it does) ----------
let touchedRandom = false;
try { dailyMutIndex(DAY, 5, N); dailyMutPlan(DAY, 20); } catch (e) { touchedRandom = true; }
ok('neither function reads Math.random()', !touchedRandom);

// ---- 3. range ---------------------------------------------------------------
let inRange = true, values = new Set();
for (let d = DAY - 400; d <= DAY + 400; d++) {
  for (let w = 1; w <= 25; w++) {
    const i = dailyMutIndex(d, w, N);
    if (i !== -1 && !(Number.isInteger(i) && i >= 0 && i < N)) inRange = false;
    if (i >= 0) values.add(i);
  }
}
ok('every answer is -1 or a real index into MUTS', inRange);
ok('every mutator is reachable', values.size === N, values.size + '/' + N);

// ---- 4. no mutator before wave 3 -------------------------------------------
let early = null;
for (let d = DAY - 400; d <= DAY + 400; d++) {
  for (let w = 1; w <= 2; w++) if (dailyMutIndex(d, w, N) !== -1) early = d + '/' + w;
}
ok('waves 1-2 never carry a mutator', early === null, early || 'clean');

// ---- 5. the rate ------------------------------------------------------------
let hits = 0, total = 0;
for (let d = DAY - 500; d <= DAY + 500; d++) {
  for (let w = 3; w <= 22; w++) { total++; if (dailyMutIndex(d, w, N) !== -1) hits++; }
}
const rate = hits / total;
ok('mutator rate stays near the 30% endless uses', rate > 0.25 && rate < 0.35, (rate * 100).toFixed(1) + '%');

// ---- 6. the old path really did disagree between two players ---------------
// Reconstructed: the old expression in spawnWave() was
//   if (wave >= 3 && Math.random() < 0.3) waveMut = MUTS[Math.floor(Math.random()*MUTS.length)]
// Two players = two independent PRNG streams.
function lcg(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
function oldPlan(seed) {
  const r = lcg(seed), out = [];
  for (let w = 1; w <= 20; w++) {
    if (w >= 3 && r() < 0.3) out.push({ w, n: MUTS[Math.floor(r() * N)].n });
  }
  return JSON.stringify(out);
}
let disagreed = 0;
for (let s = 1; s <= 200; s++) if (oldPlan(s) !== oldPlan(s + 9000)) disagreed++;
ok('the old random path did disagree between players', disagreed > 150, disagreed + '/200 seed pairs differ');
ok('the new path agrees for the same day', dailyMutPlan(DAY, 20).length >= 0 &&
  JSON.stringify(dailyMutPlan(DAY, 20)) === JSON.stringify(dailyMutPlan(DAY, 20)));

// ---- 7. the shipped code actually uses it ----------------------------------
const spawn = liftFn(SRC, 'function spawnWave(');
ok('spawnWave() is in the shipped source', !!spawn);
if (spawn) {
  ok('spawnWave() branches on mode === "daily"', /mode === "daily"/.test(spawn));
  ok('the daily branch calls dailyMutIndex()', /mode === "daily"\)\s*\{[\s\S]*?dailyMutIndex\(/.test(spawn));
  // the random pick must no longer be the only path: it must sit in an else
  ok('the Math.random() pick is the non-daily path',
    /else if \(wave >= 3 && Math\.random\(\) < 0\.3\)/.test(spawn));
}
ok('the menu shows the day\'s mutator wave', /dailyMutPlan\(dayNow, 20\)/.test(SRC));

// ---- 8. the seeded stream: types, elites, objective, bonus ----------------
// The mutators were only half of a daily run. These four draws were still
// Math.random(), so two players on one day fought different waves. They now
// come from dailyRand(day, wave, salt) — same day, same wave, same slot, same
// number for everybody. Math.random is poisoned in this context, so any call
// that reaches for it throws and the assertions below fail.
const randText = liftFn(SRC, 'function dailyRand(');
const typeText = liftFn(SRC, 'function enemyTypeFor(');
ok('dailyRand() is in the shipped source', !!randText);
ok('enemyTypeFor() is in the shipped source', !!typeText);
if (!randText || !typeText) { console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); }
vm.runInContext(randText, ctx);
vm.runInContext(typeText, ctx);
const dailyRand = vm.runInContext('dailyRand', ctx);
const enemyTypeFor = vm.runInContext('enemyTypeFor', ctx);

let inUnit = true, touched = false;
try {
  for (let d = DAY - 300; d <= DAY + 300; d++)
    for (let w = 1; w <= 20; w++)
      for (let s = 0; s < 30; s++) {
        const v = dailyRand(d, w, s);
        if (!(typeof v === 'number' && v >= 0 && v < 1)) inUnit = false;
      }
} catch (e) { touched = true; }
ok('dailyRand() never reads Math.random()', !touched);
ok('dailyRand() always answers inside [0,1)', inUnit);

// determinism: the same question always gets the same answer
let stable = true;
for (let w = 1; w <= 20; w++) {
  if (dailyRand(DAY, w, 100) !== dailyRand(DAY, w, 100)) stable = false;
}
ok('same day + wave + slot always gives the same number', stable);

// the salts are independent streams, not one shifted stream
const bySalt = [];
for (let s = 0; s < 50; s++) bySalt.push(dailyRand(DAY, 7, s));
ok('different slots draw different numbers', new Set(bySalt).size === bySalt.length, new Set(bySalt).size + '/50');
const mean = bySalt.reduce((a, b) => a + b, 0) / bySalt.length;
ok('the stream is not stuck near 0 or 1', mean > 0.3 && mean < 0.7, mean.toFixed(3));

// uniform enough that no bucket starves: 10 buckets over many draws
const buckets = new Array(10).fill(0);
let draws = 0;
for (let d = DAY - 200; d <= DAY + 200; d++)
  for (let w = 1; w <= 20; w++)
    for (let s = 0; s < 10; s++) { buckets[Math.floor(dailyRand(d, w, s) * 10)]++; draws++; }
ok('the stream is roughly uniform across ten buckets',
  buckets.every(b => b / draws > 0.06 && b / draws < 0.14),
  buckets.map(b => (b * 100 / draws).toFixed(1)).join('/'));

// ---- 9. one day, one wave: the same enemies -------------------------------
// Composition, exactly as spawnWave() draws it for a daily run.
function composition(day, saltBase) {
  const out = [];
  for (let w = 1; w <= 20; w++) {
    const mi = dailyMutIndex(day, w, N);
    const mut = mi >= 0 ? MUTS[mi].n : null;
    let n = Math.min(5 + w * 2, 26);
    if (mut === 'SWARM') n = Math.min(34, Math.floor(n * 1.8));
    if (w % 5 === 0) n = Math.floor(n / 2);
    const types = [], elites = [];
    for (let i = 0; i < n; i++) {
      types.push(enemyTypeFor(dailyRand(day, w, (saltBase || 0) + 100 + i), w));
      elites.push(w >= 4 && dailyRand(day, w, (saltBase || 0) + 600 + i) < 0.12);
    }
    out.push({ w, mut, obj: w >= 2 && dailyRand(day, w, 7) < 0.35, bonus: dailyRand(day, w, 8) < 0.5 ? 'speed' : 'flawless', types, elites });
  }
  return JSON.stringify(out);
}
ok('two players on one day fight the same waves', composition(DAY) === composition(DAY));
ok('two players on different days do not', composition(DAY) !== composition(DAY + 1));

// the old path really did disagree: types drawn from Math.random per player
function oldComposition(seed) {
  const r = lcg(seed), out = [];
  for (let w = 1; w <= 10; w++) {
    const types = [];
    for (let i = 0; i < 15; i++) {
      const v = r();
      types.push(w >= 5 && v < 0.07 ? 'sniper' : w >= 5 && v < 0.13 ? 'healer' : w >= 3 && v < 0.22 ? 'splitter'
        : w >= 3 && v < 0.32 ? 'kami' : w >= 3 && v < 0.40 ? 'shield' : w >= 2 && v < 0.58 ? 'tank'
        : w >= 2 && v < 0.74 ? 'runner' : 'grunt');
    }
    out.push(types.join(','));
  }
  return JSON.stringify(out);
}
let typeDisagreed = 0;
for (let s = 1; s <= 200; s++) if (oldComposition(s) !== oldComposition(s + 9000)) typeDisagreed++;
ok('the old random enemy draw did disagree between players', typeDisagreed > 150, typeDisagreed + '/200');

// ---- 10. the type table itself -------------------------------------------
ok('wave 1 has no specialists', enemyTypeFor(0, 1) === 'grunt' && enemyTypeFor(0.2, 1) === 'grunt');
ok('a low roll at wave 5 is a sniper', enemyTypeFor(0.05, 5) === 'sniper');
ok('the next band at wave 5 is a healer', enemyTypeFor(0.10, 5) === 'healer');
ok('wave 3 bands: splitter / kami / shield',
  enemyTypeFor(0.20, 3) === 'splitter' && enemyTypeFor(0.30, 3) === 'kami' && enemyTypeFor(0.35, 3) === 'shield');
ok('wave 2 bands: tank / runner / grunt',
  enemyTypeFor(0.50, 2) === 'tank' && enemyTypeFor(0.70, 2) === 'runner' && enemyTypeFor(0.90, 2) === 'grunt');

// a day's waves must actually use the table: variety, and elites by wave 4
const dayTypes = new Set(), dayElites = [];
for (let w = 1; w <= 20; w++) {
  for (let i = 0; i < 20; i++) {
    dayTypes.add(enemyTypeFor(dailyRand(DAY, w, 100 + i), w));
    if (w >= 4) dayElites.push(dailyRand(DAY, w, 600 + i) < 0.12);
  }
}
ok('a day draws at least four enemy types', dayTypes.size >= 4, dayTypes.size + ' types');
ok('elites appear on some later waves', dayElites.some(Boolean), dayElites.filter(Boolean).length + ' of ' + dayElites.length);

// ---- 11. the shipped spawnWave() routes the daily draws through it ---------
if (spawn) {
  ok('the daily enemy type comes from dailyRand()', /mode === "daily" \? dailyRand\(dseed, wave, 100 \+ i\)/.test(spawn));
  ok('the daily elite roll comes from dailyRand()', /mode === "daily" \? dailyRand\(dseed, wave, 600 \+ i\)/.test(spawn));
  ok('the daily wave objective comes from dailyRand()', /mode === "daily" \? dailyRand\(dseed, wave, 7\)/.test(spawn));
  ok('the daily bonus comes from dailyRand()', /mode === "daily" \? dailyRand\(dseed, wave, 8\)/.test(spawn));
  ok('the mutator and the rest share one day seed', /var dseed = mode === "daily" \? Math\.floor\(Date\.now\(\) \/ 86400000\) : 0/.test(spawn));
  ok('the type thresholds live in enemyTypeFor() alone', /type = enemyTypeFor\(r, wave\)/.test(spawn) &&
    !/r < 0\.07/.test(spawn));
}

// ---- 12. one day, one arena: the same spawns ------------------------------
// The waves were the day's but the spawn POSITIONS were not: findSpot() walks
// rnd() (the shared world-gen stream) and accepts the first cell inside the
// distance band of the LIVE player, so the cell a wave lands on depended on
// where the player stood, and every call left the shared stream somewhere else.
// Two players on one day therefore met the same waves from different sides.
// dailySpot() takes the candidate order from the day and keeps the distance
// rule as a filter. Math.random is poisoned in this context and `rnd` below
// throws, so a placement that reached for either fails loudly.
const spotText = liftFn(SRC, 'function dailySpot(');
const spotForText = liftFn(SRC, 'function spotFor(');
ok('dailySpot() is in the shipped source', !!spotText);
ok('spotFor() is in the shipped source', !!spotForText);
if (!spotText) { console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); }
vm.runInContext('function rnd() { throw new Error("dailySpot() must not walk the world-gen stream"); }', ctx);
vm.runInContext(spotText, ctx);
const dailySpot = vm.runInContext('dailySpot', ctx);

// a reachable-cell list, shaped like reachList: a 24x24 open grid
const CELLS = [];
for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) CELLS.push([x, z]);
const START = 12;   // every run starts at the arena centre

let spotThrew = false;
try { dailySpot(DAY, 3, 200, 10, 24, START, START, CELLS); } catch (e) { spotThrew = true; }
ok('dailySpot() reads neither Math.random() nor rnd()', !spotThrew);

let spotStable = true;
for (let w = 1; w <= 20; w++) {
  const a = dailySpot(DAY, w, 200, 10, 24, START, START, CELLS);
  const b = dailySpot(DAY, w, 200, 10, 24, START, START, CELLS);
  if (JSON.stringify(a) !== JSON.stringify(b)) spotStable = false;
}
ok('same day + wave + slot always lands on the same cell', spotStable);

// the band is still the rule: a cell is never closer than minD or further than maxD
let inBand = true, outOfBand = 0, empty = 0;
for (let d = DAY - 100; d <= DAY + 100; d++)
  for (let w = 1; w <= 20; w++)
    for (const px of [START, 4, 19]) {
      const p = dailySpot(d, w, 200, 10, 24, px, px, CELLS);
      if (!p) { empty++; continue; }
      const dist = Math.hypot(p[0] - px, p[1] - px);
      if (dist < 10 || dist > 24) { inBand = false; outOfBand++; }
    }
ok('every placement sits inside the [10,24] band', inBand, outOfBand + ' outside');
ok('a dense arena never falls back to null', empty === 0, empty + ' empty');

// the golden-ratio walk spreads over the list instead of clustering on one cell
const cellsUsed = new Set();
for (let w = 1; w <= 20; w++)
  for (let i = 0; i < 20; i++) {
    const p = dailySpot(DAY, w, 200 + i, 10, 24, START, START, CELLS);
    if (p) cellsUsed.add(p[0] + ',' + p[1]);
  }
ok('a day\'s spawns use many cells, not one', cellsUsed.size >= 20, cellsUsed.size + ' cells');
ok('two different days place the same wave differently',
  JSON.stringify(dailySpot(DAY, 6, 200, 10, 24, START, START, CELLS)) !==
  JSON.stringify(dailySpot(DAY + 1, 6, 200, 10, 24, START, START, CELLS)));

// two players standing in the same place on the same day get the same spawns
function spawns(day, px, pz) {
  const out = [];
  for (let w = 1; w <= 20; w++) {
    out.push(dailySpot(day, w, 5, 9, 14, px, pz, CELLS));
    for (let i = 0; i < 20; i++) out.push(dailySpot(day, w, 200 + i, 10, 24, px, pz, CELLS));
  }
  return JSON.stringify(out);
}
ok('two players on one day get the same spawns', spawns(DAY, START, START) === spawns(DAY, START, START));
ok('a different day places them differently', spawns(DAY, START, START) !== spawns(DAY + 1, START, START));

// the OLD path: findSpot() as it shipped — rnd() walk + the live player's distance
function xorshift(s) { return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function oldSpot(rand, minD, maxD, px, pz) {
  for (let t = 0; t < 120; t++) {
    const cell = CELLS[Math.floor(rand() * CELLS.length)];
    const x = cell[0] + 0.5, z = cell[1] + 0.5;
    const d = Math.hypot(x - px, z - pz);
    if (d >= minD && d <= maxD) return [x, z];
  }
  return [px + 2, pz + 2];
}
// two players, one day, one arena: the same world-gen stream, but each stands
// somewhere different, and each accepted cell advances the stream by a different
// number of draws — so wave 2 already starts from a different place.
const p1 = xorshift(0x9e3779b9), p2 = xorshift(0x9e3779b9);
let oldDisagreed = 0, oldTotal = 0;
for (let w = 1; w <= 10; w++) {
  for (let i = 0; i < 8; i++) {
    const a = oldSpot(p1, 10, 24, START, START);
    const b = oldSpot(p2, 10, 24, 6, 17);   // the second player is elsewhere on the map
    oldTotal++;
    if (JSON.stringify(a) !== JSON.stringify(b)) oldDisagreed++;
  }
}
ok('the old path did place the same wave differently for two players',
  oldDisagreed > oldTotal * 0.6, oldDisagreed + '/' + oldTotal);

// ---- 13. the shipped spawnWave() uses it ---------------------------------
if (spawn) {
  ok('the daily boss spot comes from the day', /sp = spotFor\(dseed, wave, 5, 9, 14\)/.test(spawn));
  ok('the daily enemy spot comes from the day', /sp = spotFor\(dseed, wave, 200 \+ i, 10, 24\)/.test(spawn));
  ok('no daily spawn still walks findSpot() directly', !/sp = findSpot\(/.test(spawn));
  ok('the daily enemy cooldown comes from dailyRand()', /cd: mode === "daily" \? 1 \+ dailyRand\(dseed, wave, 900 \+ i\)/.test(spawn));
  ok('the daily enemy wobble comes from dailyRand()', /wob: mode === "daily" \? dailyRand\(dseed, wave, 950 \+ i\)/.test(spawn));
}
if (spotForText) {
  ok('spotFor() routes the daily run through dailySpot()', /mode === "daily"[\s\S]*?dailySpot\(dseed, wave, slot, minD, maxD, player\.x, player\.z, reachList\)/.test(spotForText));
  ok('spotFor() keeps findSpot() for the other modes', /return findSpot\(minD, maxD\)/.test(spotForText));
  // and it does it for real: in a daily run findSpot() is never reached
  const ctx2 = vm.createContext({
    mode: 'daily', player: { x: START, z: START }, reachList: CELLS, dailySpot: dailySpot,
    findSpot: function () { throw new Error('a daily wave must not walk findSpot()'); }
  });
  vm.runInContext(spotForText, ctx2);
  const spotFor = vm.runInContext('spotFor', ctx2);
  let dailyThrew = false, dailySpot_;
  try { dailySpot_ = spotFor(DAY, 7, 200, 10, 24); } catch (e) { dailyThrew = true; }
  ok('a daily wave is placed without findSpot()', !dailyThrew &&
    JSON.stringify(dailySpot_) === JSON.stringify(dailySpot(DAY, 7, 200, 10, 24, START, START, CELLS)));
  ctx2.mode = 'endless';
  let endlessUsedFind = false;
  try { spotFor(0, 7, 200, 10, 24); } catch (e) { endlessUsedFind = true; }
  ok('an endless wave still walks findSpot()', endlessUsedFind);
}

// ---- 14. the ghost replay: it must belong to the run it is replayed in -----
// The record carried the arena seed alone, so a daily best could be replayed
// into a fight whose draws had changed. It now names its mode and its day.
const gmText = liftFn(SRC, 'function ghostMatches(');
const lgText = liftFn(SRC, 'function loadGhost(');
const sgText = liftFn(SRC, 'function saveGhost(');
ok('ghostMatches() is in the shipped source', !!gmText);
ok('loadGhost() is in the shipped source', !!lgText);
ok('saveGhost() is in the shipped source', !!sgText);
if (gmText) {
  vm.runInContext(gmText, ctx);
  const ghostMatches = vm.runInContext('ghostMatches', ctx);
  const rec = [{ t: 0, x: 1, z: 1, yaw: 0 }, { t: 0.4, x: 2, z: 2, yaw: 0 }];
  const dailyGh = { seed: 1234, score: 900, mode: 'daily', day: DAY, rec };
  const endlessGh = { seed: 1234, score: 900, mode: 'endless', day: DAY, rec };
  const oldGh = { seed: 1234, score: 900, rec };   // a record from before this build

  ok('a daily best replays in the same day\'s daily run', ghostMatches(dailyGh, 1234, 'daily', DAY) === true);
  ok('a daily best from another day does not replay', ghostMatches(dailyGh, 1234, 'daily', DAY + 1) === false);
  ok('a daily best does not replay into an endless run', ghostMatches(dailyGh, 1234, 'endless', DAY) === false);
  ok('an endless best does not replay into a daily run', ghostMatches(endlessGh, 1234, 'daily', DAY) === false);
  ok('an endless best replays on its own arena', ghostMatches(endlessGh, 1234, 'endless', DAY + 9) === true);
  ok('a ghost from another arena does not replay', ghostMatches(endlessGh, 999, 'endless', DAY) === false);
  ok('a continue run counts as the endless run it continues',
    ghostMatches({ ...endlessGh, mode: 'cont' }, 1234, 'endless', DAY) === true &&
    ghostMatches(endlessGh, 1234, 'cont', DAY) === true);
  ok('a record with no mode still replays into endless (back-compat)', ghostMatches(oldGh, 1234, 'endless', DAY) === true);
  ok('a record with no mode never replays into a daily run', ghostMatches(oldGh, 1234, 'daily', DAY) === false);
  ok('a one-sample or missing path is never a ghost',
    ghostMatches({ ...endlessGh, rec: [{ t: 0, x: 1, z: 1, yaw: 0 }] }, 1234, 'endless', DAY) === false &&
    ghostMatches({ ...endlessGh, rec: null }, 1234, 'endless', DAY) === false &&
    ghostMatches(null, 1234, 'endless', DAY) === false);
}
if (lgText && sgText) {
  ok('loadGhost() decides with ghostMatches()', /ghostMatches\(gh, arenaSeed, mode, Math\.floor\(Date\.now\(\) \/ 86400000\)\)/.test(lgText));
  ok('saveGhost() records its mode', /mode: mode === "cont" \? "endless" : mode/.test(sgText));
  ok('saveGhost() records its day', /day: Math\.floor\(Date\.now\(\) \/ 86400000\)/.test(sgText));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
