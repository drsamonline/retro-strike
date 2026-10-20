# 🏗️ Architecture

[![single file](https://img.shields.io/badge/build-single%20file-94a3b8.svg?style=flat-square)](../src/retro-strike.html)
[![dependencies](https://img.shields.io/badge/dependencies-0-4ade80.svg?style=flat-square)](#)

RETRO STRIKE is one HTML document: a `<style>` block and a single `<script>`.
Everything below lives inside that script and runs on plain web-platform APIs.

## 1. Renderer — a software rasteriser on Canvas 2D

There is no WebGL. The world is drawn by projecting 3D points to a 320×200
backing canvas through a simple pinhole camera and filling polygons.

- **Camera** (`cam`, `updateCam`) — an over-the-shoulder boom arm with a
  smoothed offset so the camera eases around walls but tracks the player
  rigidly. `cam.f` (forward), `cam.r` (right) and `cam.u` (up) form the basis.
- **Projection** (`toCam`, `projC`) — world → camera space → screen. `FOCAL`
  is derived from the FOV setting.
- **Clipping** (`drawQuad`) — polygons are clipped against the near plane
  before projection, so geometry behind the camera never wraps.
- **Depth** — a painter's algorithm. Every visible wall face, floor tile and
  sprite is pushed into a list with a distance, sorted back-to-front, then
  drawn. Stable and cheap at this scale.
- **Fog** — `shadeCached` quantises distance into buckets and lerps toward the
  fog colour, cached per (colour, bucket) so the same string isn't rebuilt
  hundreds of times a frame.
- **Sprites** — pixel-art bitmaps (`*_BMP`) with palettes (`PAL`, skins). Each
  bitmap+palette pair is rendered **once** to a tiny offscreen canvas
  (`spriteCanvas`) and then blitted with a single `drawImage`.

## 2. World generation

- **PRNG** — a seeded **xorshift** (`srand`/`rnd`) makes arenas reproducible
  from a 32-bit seed, which is what powers Daily Challenge, shareable seeds and
  the ghost replay.
- **Procedural arena** (`genMap`) — random blocks with a 1-cell margin (so
  corridors never seal), open plazas, a lava hazard pass, then a flood fill
  (`floodFillCenter`) to compute the reachable set used for all placement.
- **Campaign** (`genCampaignMap`) — 24×24 hand-authored ASCII layouts, padded
  and bordered, with a clear spawn plaza and a fallback to procedural if the
  reachable area is too small.
- **Biomes** (`biomeOf`) — quadrant-based default / ice / lava, each with its
  own floor palette and, for ice, slippery movement physics.

## 3. Game loop

`frame(now)` runs on `requestAnimationFrame` with:

- a **frame-rate cap** (skips sub-13 ms frames) so 90/120 Hz panels don't do
  double work,
- a **`dt` clamp** of 0.05 s so a tab-switch or hitch can't tunnel the player
  through walls,
- frame-rate-independent damping (`Math.exp(-9 * dt)`) for movement decay,
- a top-level `try/catch` so a one-off error can't kill the loop.

`update(dt)` advances the world; `render()` draws it. State is a small string
machine: `title → play ⇄ menu → over`, plus `photo`.

## 4. Entities & systems

- **Player** — position, yaw, velocity, HP, shield, stamina, weapon, ammo,
  throwables, upgrade level, drone flag.
- **Enemies** — a type table drives HP/speed/radius/behaviour: `grunt`,
  `runner`, `tank`, `splitter`, `kami`, `shield`, `sniper`, `healer`, `boss`,
  `summoner`, `dummy`. Elites and gold bounty variants are flags on the same
  objects. A simple separation pass keeps them from stacking. The **Sniper**
  runs a charge timer (`en.charge`) it telegraphs before firing; the **Healer**
  pulses heals to nearby allies on a cooldown; the **Summoner** boss spawns
  grunts when its cooldown fires instead of bursting.
- **Drops** — `dropLoot` routes every pickup through `addDrop` → `openSpot`,
  which snaps loot to the nearest walkable tile so it can never land inside a
  wall.
- **Projectiles** — one bullet list for both sides, with an optional homing
  target (aim assist) and a pierce flag; the player's beam marks each enemy it
  has already scored.
- **Throwables** — grenades (fuse + bounce), proximity mines, and clusters that
  spawn sub-grenades.
- **Pickups, particles, score popups** — pooled arrays, culled by distance.
- **Loot** (`dropLoot`) — weighted tables per enemy class, with guaranteed
  drops for bosses.

## 5. Audio

`initAudio` lazily creates a single `AudioContext` (resumed on the first user
gesture, per browser autoplay rules). `beep` and `musNote` synthesise notes
from oscillators; `noiseSfx` builds short noise buffers. `pumpMusic` is a
procedural chiptune loop whose root note and tempo follow the day/night cycle
and the current wave.

## 6. Persistence

All progress lives in `localStorage` under `retroStrike*` keys — settings,
stats, achievements, leaderboard, daily best, campaign progress, run save and
the ghost replay. **Every** read and write is wrapped in `try/catch`, and
loaded settings are validated and clamped so a corrupt value can't break the
renderer.

## 7. Input

Three schemes feed one shared state:

- **Keyboard + mouse** — Pointer Lock for aim, with a free-mouse fallback for
  embedded previews.
- **Touch** — a virtual joystick on the left, drag-to-aim on the right, and
  button hit-zones; coordinates are mapped from the *canvas* rect so they stay
  correct whatever the layout.
- **Gamepad** — polled each frame (`pollPad`), with edge detection for buttons.

## 8. UI

The menus, HUD, minimap, shop and overlays are all drawn to the canvas with a
tiny monospace bitmap aesthetic. Interactive rows are recorded into `menuRows`
during rendering, and both touch and mouse hit-test against that list.
