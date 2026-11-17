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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
