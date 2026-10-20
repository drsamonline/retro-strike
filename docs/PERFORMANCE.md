# ⚡ Performance

[![target](https://img.shields.io/badge/target-~60%20FPS-4ade80.svg?style=flat-square)](#)
[![dependencies](https://img.shields.io/badge/dependencies-0-4ade80.svg?style=flat-square)](#)

The game caps itself at roughly 60 FPS (skipping sub-13 ms frames) and clamps
`dt` to 0.05 s, so physics stay stable on 60/90/120 Hz displays and after a
tab-switch.

## What was optimised (v1.1.0)

| Change | Why it helps |
|---|---|
| **Precomputed wall/lava cell lists** (`indexCells`) | The minimap used to scan the entire 48×48 grid **twice** every frame (~4,600 iterations). It now iterates only real wall/lava cells with a cheap distance cull, and sets `fillStyle` once. |
| **Quantised fog cache** (`shadeCached`) | Collapses per-tile fog maths into a lookup keyed by (base colour, distance bucket), avoiding ~700 string builds per frame. |
| **Sprite atlases** (`spriteCanvas`) | Each bitmap+palette is rasterised once to an offscreen canvas, then blitted with one `drawImage` instead of hundreds of `fillRect`s. |
| **Distance culling** | Particles, bullets, damage numbers and grenades are skipped beyond the fog horizon before a drawable is created. |
| **Hoisted palettes & comparators** | Per-frame inline palette objects and the two `Array.sort` comparator closures are now module-level constants. |
| **Off-screen guard for elite markers** | Skips the ring when the enemy is behind the camera (also a latent-bug fix). |

## Measured effect

Benchmarked headlessly by replaying the render path over a busy scene
(26 enemies, 36 projectiles, 120 particles, 12 pickups):

| | Before | After |
|---|---|---|
| `render()` | ~19.7 ms/call | **~16.7 ms/call** |
| full `update` + `render` frame | ~21.0 ms/call | **~17.4 ms/call** |

That is roughly a **15–17 % reduction** in per-frame CPU work, on top of less
garbage-collector pressure from the removed allocations. In a real browser the
JS share of the frame is smaller, so wall-clock gains are more modest — but the
GC relief and the eliminated full-grid scans are real.

## Known remaining cost

The renderer still allocates one closure per drawable per frame (the
painter's-algorithm draw list). It is fine at the current entity counts; a
future pass could replace it with a flat, pooled command list.

## Tips for low-end devices

- Turn **Scanlines** off (Settings) — it's a full-screen overlay.
- Lower the **FOV** — fewer tiles fall inside the view frustum.
- The **FPS Counter** (Settings) is there to confirm your frame budget.
