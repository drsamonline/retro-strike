# Changelog

All notable changes to **RETRO STRIKE** are documented here.
This project follows [Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/) format.

## [1.4.4] — 2026-11-22

The daily challenge is now the same ARENA, not just the same waves.

### Fixed
- 🐛 **Two players on one day met the same waves from different sides.** v1.4.3 made the waves the day's and stopped there: `spawnWave()` still placed every enemy with `findSpot()`, which walks `rnd()` — the shared world-gen stream — and accepts the first cell inside the distance band **of the live player**. So the cell a wave landed on depended on where that player happened to be standing, and every accepted cell left the shared stream somewhere else for the next one. The waves were identical and the fight was not, which is exactly what a daily leaderboard compares. `dailySpot(day, wave, slot, …)` takes the candidate *order* from the day (a seeded start, then a golden-ratio stride over the reachable cells) and keeps `findSpot()`'s distance rule as the filter, so the order is everybody's and only the filter is personal — nobody gets a spawn on top of them. The boss spot and every enemy spot go through it via `spotFor()`, and the enemy's first-fire cooldown and wobble phase come from `dailyRand()` too, so a daily wave is the day's down to the spawn.
- 🐛 **A ghost replay could replay a run it did not belong to.** The record carried the arena seed alone, so a best run from any mode on that arena could be replayed into any other — including a daily best recorded before the daily waves became the day's, whose path runs through draws that no longer exist. The record now names its mode and its day, and `ghostMatches()` decides whether it may be replayed: same arena, same mode, and for a daily run the same day. A record from before this build has no mode, so it is treated as endless — the only mode whose random seed it could have matched — and an old daily best is retired rather than replayed into a fight it was not recorded in.

### Added
- 🧪 `tools/test-daily.mjs` grew from 44 to **80 assertions**: `dailySpot()` is proved pure (both `Math.random` and `rnd` throw inside it), deterministic, inside the band on 4,200 placements, spread over 177 distinct cells in a day, and identical for two players standing in the same place — against the old path, which placed 78 of 80 spawns differently for two players standing apart. `ghostMatches()` is proved to refuse a ghost from another mode, another day, another arena, and a pre-1.4.4 record in a daily run, while still accepting one in endless. `spotFor()` is proved to place a daily wave without ever calling `findSpot()`, and the wiring is pinned so a daily spawn cannot quietly go back to the world-gen stream. Five mutations of the new code each turn the suite red.

### Notes
- The distance rule still reads the live player, by design: it is what stops an enemy spawning on top of you. Two players standing in the same place therefore get byte-identical spawns; a player who has moved gets the day's next candidate that respects the rule, which is the same rule everyone is held to.

## [1.4.3] — 2026-11-20

The daily challenge is now the same RUN, not just the same rules.

### Fixed
- 🐛 **Two players on one day fought different waves.** v1.4.2 seeded the mutators and stopped there: `spawnWave()` still drew the enemy mix with `Math.random()`, so on the same day one player met four snipers on wave 6 and another met four grunts, and the elite roll, the wave objective and the speed/flawless bonus were random too. Those four draws now come from `dailyRand(day, wave, slot)` — a pure hash of the day, the wave and the draw's slot — so the same day produces the same waves for everybody. Endless and campaign keep their random draw.
- 🐛 **The spawn thresholds had two homes waiting to disagree.** The `r < 0.07 … sniper` ladder lived inline in `spawnWave()`; it is now `enemyTypeFor(roll, wave)`, the one place the bands are defined, called by both paths.

### Added
- 🧪 `tools/test-daily.mjs` grew from 20 to **44 assertions**: the seeded stream is checked for range, determinism, independent slots and a uniform spread over ten buckets; two players' full 20-wave composition is compared for equality (and against the old random path, which disagreed 200/200); the type bands are asserted at their boundaries; and the wiring is pinned so a daily draw cannot quietly go back to `Math.random()`.

### Notes
- Still not identical run to run: enemy *spawn positions* depend on where the player is standing and on `findSpot()`'s random walk, which is a property of the arena rather than of the day. The waves — what spawns, where it comes from in the table, which are elite, what the objective and bonus are — are now the day's.

## [1.4.2] — 2026-11-18

The daily challenge was only half daily.

### Fixed
- 🐛 **The DAILY CHALLENGE was not the same game for two players.** Its arena was seeded from the day, but `spawnWave()` picked the wave mutators with `Math.random()` — so on the same day one player met **BLACKOUT** on wave 3 and another met **SWARM** on wave 3, while the daily best-score table compared the two as if they were the same run. The schedule now comes from `dailyMutIndex(day, wave, count)`, a pure function of the day and the wave: same day, same mutators, same waves, for everybody. Endless and campaign keep their random draw.
- 🐛 **You could not see what the day held.** The title-screen row now reads `DAILY CHALLENGE  W3 SWARM` — the first mutator wave of the day — so a run can be planned instead of discovered.

### Added
- 🧪 `tools/test-daily.mjs` — 20 assertions, in CI. It lifts `dailyMutIndex()`/`dailyMutPlan()` out of the shipped source, runs them in a sandbox where `Math.random()` **throws**, and checks determinism, range, reachability of all five mutators, the 30% per-wave rate, and that the old random path really did disagree between players. It also asserts `spawnWave()` still branches on `mode === "daily"`, so the wiring cannot be quietly removed.

### Notes
- Still not deterministic: enemy types, elite rolls and wave objectives are drawn from `Math.random()`, so a daily run is *fair in its modifiers*, not yet identical run to run. That is the next honest step, not a claim this release makes.

## [1.4.1] — 2026-11-05

A saved run is data, and the game used to trust it.

### Fixed
- 🐛 **A bad save bricked CONTINUE.** `continueRun()` handed the file straight to the game — `player = s.player`, then `player.x` — so a save written by an older build, edited by hand, or cut short by a full disk threw on the CONTINUE click, and kept throwing, because the save is only cleared by QUIT TO TITLE. The only way out was "reset all data", which a player has no reason to find. `cleanSave()` is now the one gate: it rebuilds a save the game can actually run — position inside the arena it is restored into, hp inside maxhp, a real weapon, numbers that are numbers — or refuses the file, throws it away and says **SAVE UNREADABLE — NEW RUN**.
- 🐛 **"SAVE & QUIT" could silently throw the run away.** When storage was full, `saveRun()` returned false and the game quit to the title anyway, with no message. It now says **COULD NOT SAVE — RUN KEPT** and leaves you in the run, so the run is only lost if you choose to lose it.

### Added
- 🧪 `tools/test-save.mjs` — 49 assertions, in CI. It lifts `cleanSave()` out of the shipped source (so it tests the real function, not a copy) and runs it against 13 hostile saves, then scans the cleaned result for any non-finite number. It also asserts the old code path *did* throw on the same input, so the bug stays in the record rather than in a memory.

## [1.4.0] — 2026-10-20

The whole remaining roadmap, implemented. Still single-player only — no servers, ever.

### Added
- 🗺️ **Campaign chapters 9–12** — four new hand-crafted layouts (**Foundry**, **Labyrinth**, **Citadel**, **Overlord**) with new objectives; the campaign is now 12 levels and the unlock chain runs the full way.
- 📖 **Bestiary / codex** — a title-screen screen listing all 11 enemies and bosses with a live sprite, stats and a tactic line each.
- 🎮 **Controller remapping** — rebind **fire / swap / throw / pause** to any gamepad button, with a press-a-button capture screen and reset-to-defaults.
- 👁️ **Colour-vision palettes** — red-green-safe and blue-yellow-safe enemy palettes, applied in-game and in the bestiary.
- 🖥️ **Variable arena size** — Standard / Large / Huge (48 / 64 / 80 tiles) for Endless, Daily and Training.
- ♿ **Three-step HUD scale** (Normal / Large / Huge), replacing the old on-off toggle.

### Fixed
- 🐛 **Gamepad edge detection was wrong.** Menu navigation compared each button against the wrong "previous frame" slot, so holding a button could repeat or miss actions. Polling now keeps a correct per-button snapshot, so a held button fires exactly once.
- 🐛 **Saving mid-run could restore you inside a wall** (e.g. after changing arena size). The restored position is now snapped to walkable ground.
- 🐛 The campaign map generator assumed a fixed arena size; it now centres any size.

### Changed
- 📐 Objective panel now sizes itself to its text, so large HUD scales no longer overflow it.
- 🎨 Bestiary and controller screens re-spaced so nothing overlaps.

## [1.3.0] — 2026-10-20

### Added — single-player content
- 🎯 **Sniper enemy** — keeps its distance and charges a **telegraphed** long-range shot (a laser sight gives you time to break line of sight). Appears from wave 5.
- 💚 **Healer enemy** — a fragile support unit that **pulses health to nearby allies** inside a visible aura. Kill it first or the pack out-sustains you. Appears from wave 5.
- 👹 **Summoner boss** — an alternate boss on every other boss wave (10, 20, …) that **calls in grunts** during the fight.
- 🎲 **Custom arena seed** — a "CUSTOM SEED" entry on the title screen; type a seed and play that exact arena.

### Fixed — loot you could not pick up
- 🐛 **Drops landing inside walls.** Bullet and melee **knockback ignored collision**, so enemies could be shoved into geometry and die there — dropping loot inside a wall where it could never be reached. Knockback now respects walls, and any body that still ends up inside geometry is eased back out.
- 🐛 **Loot is now snapped to walkable ground** (`openSpot`) before it drops, so it can always be collected.
- 🐛 **Pickup radius widened** (~0.77 → ~0.95 tiles) so walking over an item reliably collects it.

### Notes
- 🧍 Roadmap is now **single-player only, permanently** — no servers or networking, ever.

## [1.2.0] — 2026-10-20

A second pass after rendering the game headlessly and inspecting every screen.
All of these were visible layout bugs; no gameplay logic changed.

### Fixed
- 🖼️ **Overflowing menus.** The Settings screen (17 rows) and a full Leaderboard
  ran off the bottom of the canvas and collided with the HUD. `drawRows` now
  scrolls to keep the selected item visible and shows ▲/▼ indicators.
- 🖼️ **HUD drawn on non-gameplay screens.** The bottom status bar, HP bar and
  weapon bar were rendered on the title, menu and game-over screens, overlapping
  their text and the "ARROWS + ENTER" footer hint. The gameplay HUD is now drawn
  only while playing.
- 🖼️ **Title screen overlap.** The "STRIKE" wordmark collided with the
  "BOSSES · BIOMES · …" tagline, and the bottom HUD covered the hi-score and
  achievements lines. The title layout was re-spaced.
- 🖼️ **Shop panel overlap.** The shop opened over the objective message and the
  wave banner. It now sits below that band, and the wave banner is suppressed
  while the shop is open.
- 🛠️ Hardened the persisted **leaderboard** and **stats** loads (a corrupt value
  can no longer break the board).

### Verified
- Full mode/regression harness plus 12 new layout assertions (all menu rows stay
  on-canvas, no HUD on the title, etc.) — 32/32 passing.

## [1.1.0] — 2026-10-18

The "audit" release: correctness fixes, a real mobile layout, and a performance pass.
Full write-up in [`docs/AUDIT.md`](docs/AUDIT.md).

### Fixed
- 🛠️ **Drone companion shadow** was drawn at `(z, z)` instead of `(x, z)`.
- 🛠️ **Kamikaze enemies** could remove the *wrong* enemy from the list (stale-index splice after the blast mutated the array); they now remove by identity and award score/loot consistently.
- 🛠️ **Mouse input** — clicking the canvas in *any* non-play state silently started a new run. Menus are now mouse-clickable, and clicks in pause / settings / game-over no longer discard your run.
- 🛠️ **Number keys** both switched weapon *and* bought shop items during intermission — now mutually exclusive.
- 🛠️ **"Grenade kills"** statistic counted hits, not kills (and could falsely unlock an achievement).
- 🛠️ **Accuracy** could exceed 100% (shots were counted per trigger pull, hits per pellet/pierce target, plus uncounted drone hits) — now one hit per projectile.
- 🛠️ Damage numbers no longer appear for shield-absorbed hits.
- 🛠️ Mute level is now persisted (`lastVol`).
- 🛠️ Persisted settings are validated/clamped so a corrupt or tampered save can't break rendering.
- 🛠️ Off-screen elite marker could draw a runaway ellipse.

### Changed
- 📱 **Mobile layout rebuilt** — the canvas keeps its 16:10 aspect and letterboxes instead of stretching; touch coordinates now map exactly to the canvas.
- 📱 Added a **rotate-to-landscape** hint for portrait phones, and safe-area insets for notches / home bars.
- 🔒 The frame loop is guarded so a one-off error can't freeze the game.
- 🧹 "RESET ALL DATA" now asks for confirmation.

### Performance
- ⚡ Precomputed wall/lava cell lists — the minimap no longer scans the whole grid twice per frame.
- ⚡ Distance-culled particles, bullets and damage numbers.
- ⚡ Hoisted per-frame palettes and sort comparators.
- ⚡ Measured: render **~19.7 → 16.7 ms/call**, full frame **~21.0 → 17.4 ms**.

### Removed
- 🧹 Dead code: `waveRifle`, unused `stats.buys`, a redundant ternary and an unused local.

## [1.0.0] — 2026-10-18

### Added
- 🎉 Initial public release — single-file HTML5 third-person shooter.
- 🔫 Four weapons with upgrade tiers, throwables, melee and dash.
- 👾 Seven enemy types, elite/gold variants and multi-phase bosses.
- 🌍 Seeded procedural arenas, ice & lava biomes, explosive barrels and secret chests.
- 🗺️ Eight-level hand-crafted campaign, Daily Challenge and Training Range.
- 👻 Ghost replay, leaderboard, 14 achievements, lifetime stats.
- 🛒 Between-wave shop, five wave mutators, day/night cycle and weather.
- 🕹️ Keyboard + mouse, touch and gamepad input.
