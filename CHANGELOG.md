# Changelog

All notable changes to **RETRO STRIKE** are documented here.
This project follows [Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/) format.

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
