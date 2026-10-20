# Changelog

All notable changes to **RETRO STRIKE** are documented here.
This project follows [Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/) format.

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
