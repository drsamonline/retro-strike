# Code Audit — RETRO STRIKE (Third-Person Shooter)

**Artifact:** `RETRO-STRIKE-Third-Person-Shooter.html`
**Size:** 3,074 lines / ~129 KB — a single self-contained HTML5 game (CSS + one `<script>` block, no external assets, no network).
**Method:** full read of the source; findings confirmed by extracting the script and running `node --check` (syntax passes) plus targeted grep/line review.
**Date:** 18 Oct 2026

---

## 1. Overall assessment

This is a genuinely impressive single-file game: a custom software 3D renderer (per-face projection + painter's-algorithm depth sort), a seeded procedural map generator with flood-fill reachability, chiptune audio synthesised from oscillators, a full menu/HUD/achievement/save system, and both keyboard+mouse and touch input. It is well structured for its size, and it is **secure** (see §6). It runs clean of syntax errors.

The problems below are concentrated in three areas: a handful of **real gameplay/logic bugs**, **statistics that don't measure what they claim**, and **input handling on desktop** where the canvas click handler is far too aggressive. There is also a structural **mutation-during-iteration** hazard in the enemy update, and allocation-heavy rendering that will cost frames on low-end devices.

Severity key: **H** = high (visible/correctness), **M** = medium, **L** = low / polish.

---

## 2. Functional bugs

### H1 — Drone shadow is drawn at the wrong position (line 2170)
```js
drawShadow(drz2, drz2, 0.15);   // z passed twice
```
The drone's shadow uses its **z coordinate for both x and z**, so it renders at `(z, z)` in world space instead of `(x, z)`. The drone sprite itself is correct; only the shadow is displaced (e.g. a drone at world (10, 5) casts its shadow at (5, 5)).
**Fix:** `drawShadow(drx2, drz2, 0.15);`

### H2 — Kamikaze enemies can delete the *wrong* enemy (line 1741)
```js
} else if (en.type === "kami") {
  ...
  if (edist < 1.3) {
    explodeAt(en.x, en.z, 34, 2.2, true, false);   // may splice enemies[] via die()
    if (enemies.indexOf(en) >= 0) { enemies.splice(i, 1); kills++; }
    continue;
  }
```
`explodeAt()` iterates the enemy list and calls `die(e, i)` for anything it kills, which **splices `enemies`**. By the time control returns, index `i` no longer necessarily points at this kami — the guard checks that the kami still exists, but then splices by the **stale index**, removing an unrelated enemy. Two further issues in the same branch: the kamikaze's own death increments `kills` but **skips `die()` entirely**, so it awards no score, no combo, no loot and no death particles.
**Fix:** splice by identity — `enemies.splice(enemies.indexOf(en), 1)` — or route the self-destruct through `die()`/`killEnemy()` so scoring is consistent.

### H3 — Clicking the canvas starts a new game in *every* non-play state (line 2999)
```js
cv.addEventListener("mousedown", function () {
  initAudio();
  mouseDown = true;
  if (state !== "play") { startGame("endless"); return; }
  ...
```
Because menus are rendered on the canvas and there is **no mouse-click handler for menu rows** (menus respond only to keyboard, touch and gamepad), a desktop mouse user:
- cannot click any menu item at all, and
- clicking anywhere on the canvas while **paused**, in **settings**, on the **leaderboard**, or on the **game-over** screen silently launches a fresh Endless run — discarding the paused run with no save prompt.

**Fix:** gate the quick-start on `state === "title"` (or `"over"`), and add a mouse `click` path that hit-tests `menuRows` the same way `handleTouchStart` does.

### H4 — Number keys do double duty during intermission (lines 2963 and 2976)
```js
if (e.code === "Digit1") switchWeapon("blaster");   // always
...
if (enemies.length === 0 && waveGap > 0) {           // shop open
  var n9 = "1234567890".indexOf(e.key);
  if (n9 >= 0) buy(n9 === 9 ? 9 : n9);
}
```
Both blocks run for the same keypress. During the shop window, pressing **1–4** both switches weapon **and** buys the matching shop slot — so you cannot change weapon between waves without accidentally spending score. There is no `return` after the shop buy.
**Fix:** make the two contexts mutually exclusive (e.g. `else` on the shop branch, or use a modifier for buying).

---

## 3. Statistics & scoring that measure the wrong thing

### M1 — "GRENADE KILLS" counts *hits*, not kills (line 1045)
```js
if (d < rad) {
  ...
  if (byNade) runStat.nadeKills++;     // incremented for every enemy in blast radius
  if (e.hp <= 0) die(e, i);
}
```
`nadeKills` is incremented for every enemy *damaged* by an explosion, regardless of whether it dies. This inflates the displayed "GRENADE KILLS" stat and, worse, can falsely unlock the **DEMOLITION EXPERT** achievement, which triggers at `runStat.nadeKills >= 5`.
**Fix:** only increment inside the `if (e.hp <= 0)` branch.

### M2 — Accuracy can exceed 100%
`stats.shots++` fires once per `shoot()` call (per trigger pull), but `stats.hits++` fires per **hit** — including each of the 5 SPREAD pellets and every enemy a piercing BEAM passes through, plus every drone-companion hit (the drone fires bullets without ever calling `shoot()`, so those hits have no matching shot). Accuracy (`stats.hits / stats.shots`) can therefore read well over 100%.
**Fix:** count shots per pellet spawned, or cap/clarify the metric.

### M3 — Shield absorption still reports damage (line ~944)
`hitEnemy` sets `dmg = 0` when a shield eats the shot, but the floating damage number is still pushed with `String(b.dmg || 12)` — so shielded enemies show a damage figure that was never applied.

---

## 4. Code quality, dead code & robustness

### M4 — Enemy list mutated while iterating it
`explodeAt()` is called from inside the main enemy loop (kamikaze, §H2) and from the bullet loop, and it can call `die()` → `enemies.splice()`. The outer loops then continue with indices that no longer line up, so enemies can be skipped or double-processed. This is the root cause behind H2 and a latent source of other oddities. Consider a "mark dead, sweep once" pattern instead of splicing mid-iteration.

### M5 — Dead / redundant code
- Line 2861: `var joyCut = SET.lefty ? r.width * 0.45 : r.width * 0.45;` — **both branches are identical**; the ternary is pointless (the lefty difference is applied on the next line).
- `waveRifle` (declared line 466, reset lines 706 & 1170) is **never read**.
- `stats.buys` (line 476) is **never written** — only `runStat.buys` is used.
- Line 654: `var dl = daylight;` is assigned and never used.
- Cluster sub-grenades carry a `bom: true` flag (line ~1690) that nothing reads.
- `spawnWave`'s `if (mode === "train") return;` (line ~700) is unreachable — Training Range calls `spawnDummy()`, never `spawnWave()`.

### M6 — Mute level is not persisted (line 2912)
```js
if (SET.vol > 0) { SET.lastVol = SET.vol; SET.vol = 0; ... }
```
`lastVol` is written into `SET` and saved, but it is **not a key of the default `SET` object** — and the load loop only restores keys already present in `SET` (`if (SET[sk0] !== undefined)`) — so `lastVol` is silently dropped on reload. After a refresh, un-muting falls back to `0.8` rather than your previous volume. Add `lastVol: 0.8` to the `SET` initialiser.

### M7 — No validation of persisted settings (line 88)
`SET` values are copied straight from `localStorage` with no range check. A corrupt or hand-edited `retroStrikeSet` (e.g. `fov: 0`, `skin: 99`) yields a `NaN` focal length (breaking all projection) or `SKINS[99].p` → `undefined` (throwing in the render loop). Low likelihood, but a `try/catch` around the render call, or clamping on load, would harden it.

### L1 — "RESET ALL DATA" keeps settings
`resetAll()` (line ~1355) clears hi-score, achievements, stats, board, daily, campaign, save and ghost — but **not** `retroStrikeSet`. Settings survive the reset, which may or may not be intended given the label.

### L2 — Naming drift
The throwable `cluster` sub-objects are created with `bom` and the "SHIELD" pickup is drawn with `MEDKIT_BMP` recoloured; harmless, but worth a comment.

---

## 5. Performance

### M8 — One closure allocated per drawable, per frame
`render()` builds `items` and `tiles` arrays where **every** wall face, floor tile, entity, bullet and particle pushes a freshly-created closure (e.g. `addWall` creates up to 5 per wall tile; see lines ~1810–1860). With a 33×33 tile window plus entities, that is thousands of short-lived closures per frame → steady GC churn. A flat, reusable draw list (or drawing in a pre-sorted pass without closures) would cut allocation sharply.

### M9 — Minimap rescans the whole grid twice per frame
`drawMinimap()` loops the full 48×48 map for walls **and** again for lava every frame (~4,608 iterations) and issues a `fillRect` per visible wall. It could be throttled (e.g. update every 2–3 frames) or limited to the minimap's visible window.

### L3 — Other allocation hot spots
- `noiseSfx()` allocates a fresh `AudioBuffer` on every gunshot/explosion/hit.
- Lava tiles call `shadeC(...)` directly (building a new colour string each frame) while every other tile uses the quantised `fcolCache`; lava could use the same cache.
- Inline palette objects are rebuilt each frame for the mine / shield / upgrade / cluster pickups (lines ~1957, 2042–2045), so `palKey()` re-sorts them every frame (cheap, but avoidable by hoisting them to module scope).
- The enemy separation pass is O(n²); fine at the current cap (~34), worth noting if the cap rises.

---

## 6. Security — clean

No issues found. The file is fully self-contained and offline:
- **No network access** — no `fetch`, `XMLHttpRequest`, `WebSocket`, `import()`, or external `src`/`href` references.
- **No dynamic code execution** — no `eval`, `new Function`, or `document.write`.
- **No DOM-injection surface** — no `innerHTML` / `insertAdjacentHTML`; all drawing is via the Canvas 2D API.
- **Persistence is bounded and guarded** — 23 `localStorage` reads/writes, all inside `try/catch`; `JSON.parse` inputs are the only external data and are never rendered as markup.
- The only data egress is a user-initiated `canvas.toDataURL()` download of the score card — expected behaviour.

The only residual risk is the unvalidated settings/JSON described in §M7, which is a robustness rather than a security concern.

---

## 7. Accessibility & UX

- **L4 — Zoom is disabled.** The viewport meta sets `maximum-scale=1, user-scalable=no`, blocking pinch-zoom (WCAG 1.4.4). The touch controls are generous, but a canvas game with no zoom is hard for low-vision users.
- **L5 — Canvas has no accessible equivalent.** No ARIA roles, live regions, or text alternative; screen readers get nothing. Menus are keyboard-navigable (good), but desktop **pointer** navigation is broken (see §H3).
- **L6 — No explicit "pause on pointer-lock exit."** Pausing relies on `blur`/`visibilitychange`, which is reasonable, but some browsers drop pointer lock without firing either.
- Positive: big-button / left-handed / large-HUD toggles, multiple control schemes, FPS counter, damage numbers, and a settings persistence layer are all thoughtful.

---

## 8. Prioritised fix list

| # | Sev | Item | Where |
|---|-----|------|-------|
| 1 | H | Gate canvas quick-start to title/over; add mouse menu hit-testing | line 2999 |
| 2 | H | Fix drone shadow coordinates | line 2170 |
| 3 | H | Kamikaze: splice by identity / route death through `die()` | line 1741 |
| 4 | H | Stop digit keys buying + switching at once | lines 2963, 2976 |
| 5 | M | Count grenade *kills* only | line 1045 |
| 6 | M | Fix accuracy accounting (per-pellet / exclude drone hits) | `shoot`/`hitEnemy` |
| 7 | M | Sweep dead enemies once instead of splicing mid-loop | `update`/`explodeAt` |
| 8 | M | Persist mute level (`lastVol` in `SET`) | line 2912 |
| 9 | M | Validate/clamp persisted settings on load | line 88 |
| 10 | M | De-closure the render draw list; throttle minimap | `render`, `drawMinimap` |
| 11 | L | Remove dead code (`joyCut` ternary, `waveRifle`, `stats.buys`, `dl`, `bom`) | various |
| 12 | L | Don't show damage numbers for absorbed hits | line ~944 |
| 13 | L | Reconsider `user-scalable=no`; add ARIA/alt text | `<head>` / markup |

---

## 9. What's done well

Worth keeping as-is: the seeded xorshift PRNG for reproducible arenas; flood-fill reachability so nothing spawns in a sealed room; a sprite cache that renders each bitmap+palette once; depth-sorted painter's-algorithm rendering that is stable at this scale; defensive `try/catch` on every storage and audio call; frame-rate-independent movement (`Math.exp(-9*dt)` decay) and a `dt` clamp; a ~60 FPS cap that halves load on 120 Hz panels; and a genuinely complete feature set (campaign, daily seed, ghost replay, save/continue, achievements, leaderboard) with no backend.


---

## 10. Follow-up audit — v1.2.0 (2026-10-20)

The v1.1.0 fixes were re-checked by running the game headlessly against a real
Canvas 2D implementation and capturing every screen. That surfaced a set of
**layout** defects that static review had missed:

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| 1 | H | Settings menu (17 rows) and a full leaderboard overflowed the 320×200 canvas and overlapped the HUD | `drawRows` now scrolls with ▲/▼ indicators |
| 2 | H | The gameplay HUD (status bar, HP bar, weapon bar) was drawn on the title, menu and game-over screens, colliding with their text | HUD is drawn only while `state === "play"` |
| 3 | H | The "ARROWS + ENTER, ESC BACK" footer hint always overlapped the HP bar | Resolved by (2) |
| 4 | M | Title wordmark "STRIKE" overlapped the tagline; the HUD covered the hi-score/achievements lines | Title re-spaced |
| 5 | M | The shop panel opened over the objective message and the wave banner | Shop moved below that band; banner suppressed while the shop is open |
| 6 | L | A corrupt `retroStrikeBoard` / `retroStrikeStats` value could break the leaderboard | Loads are now type-checked (`Array.isArray`, `typeof === "number"`) |

All 32 automated checks (mode/regression harness + layout assertions) pass on
the fixed build.


---

## 11. Follow-up audit — v1.3.0 (2026-10-20)

A player-reported bug: *"items and drops are not collected even when you walk
to them."*

Reproduced and root-caused:

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| 1 | H | Bullet and melee **knockback applied position changes without a collision check**, so enemies could be shoved inside walls. Killed there, their loot dropped **inside geometry**, where the player (radius 0.32, blocked by walls) could never get within pickup range. | Knockback now goes through `blocked()`; a safety net eases any body that still ends up inside geometry back out |
| 2 | H | Loot was placed at the exact death position with no walkability check | All drops route through `addDrop` → `openSpot`, which snaps to the nearest walkable tile |
| 3 | M | Pickup radius was only ~0.77 tiles, so near-misses felt like the item "didn't register" | Widened to ~0.95 tiles |

Regression coverage added: a `pickuptest` that drops 60 items from a kill
*inside a wall* and asserts every one lands on walkable ground and is
collectable, plus the walk-over collection case. All suites (mode harness,
layout, audit, pickup) pass on v1.3.0.
