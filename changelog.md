# Changelog

## 0.3.2 — Adaptive render quality + off-screen pause

Ported the performance pass from teegly's `main` (PR #9–#10 era) into the game branch.

- **Quality presets** (`quality.js`): `low` / `balanced` / `high` control pixel-ratio cap,
  antialiasing, target FPS, and ambient particle density. Auto-detected — `high` on desktop,
  `low` on touch / low-memory devices — and overridable with `?quality=low|balanced|high`.
- **Loop lifecycle**: the render loop now pauses when the canvas scrolls off-screen
  (`IntersectionObserver`) or the tab is hidden (`visibilitychange`), and resumes on return —
  no CPU/GPU burned by a background or scrolled-away embed.
- **AMBIENT is byte-identical by default**: the desktop default (`high`) keeps the original
  pixel ratio (2), antialiasing, uncapped 60fps, and full particle counts. Quality only steps
  *down* on touch/low-memory or when forced via `?quality=`.

New module: `quality.js`.

- Fixed forest/highway background scenery (trees/buildings) overlapping the path on the
  left side; items now sit clear of the corridor on both sides.

## 0.3.0 — Themed biomes

Runs now travel through distinct biomes — **Temple** (the start), **Hospital**, **Highway**,
**Forest** — each with its own colour/lighting mood, background scenery, and themed obstacles.

- **Junctions are a biome choice**: the two arrows each lead to (and are labelled with) a
  different biome; turning that way enters it. Still no-fail.
- **Themed obstacles** mapped to the moves — Hospital: Scalpel (jump) / Needle (slide) /
  Doctor (dodge); Highway: Tree / Building / Car; Forest: Mushroom / Fairy / Bug. Temple keeps
  the generic placeholders.
- **Per-biome look**: colour/lighting tint + swapped background silhouettes; temple-only
  decoration (books/vines/etc.) is hidden in other biomes so each reads cleanly.
- **Sprite-with-fallback**: drop a PNG in `public/sprites/biomes/<biome>/<name>.png` and it
  appears; if missing, a labelled placeholder is shown and nothing breaks. See that folder's
  README for the full list. Biome data lives in `src/runner/Biomes.js`.

New module: `Biomes.js`.

## 0.2.3 — Hearts fix, spawn spacing, sharper textures

- **Hearts** are now fixed-width SVGs (not the ❤ emoji), so the lives row can no longer
  be clipped off the right edge on any platform.
- **Spawns never overlap**: a Pepsi can is never placed on a barrier/enemy, and items
  spawn a little less densely / more spread out.
- **Less motion blur**: obstacles narrowed so they don't bleed into neighbouring lanes,
  and anisotropic filtering added so the floor/walls stay sharp while moving.

## 0.2.2 — No-fail turns, HUD + lives fixes

- Junctions are now a **no-fail biome choice**: both directions always open, no crash,
  auto-turn if you don't pick, and a grace beat after each turn so you can't be clipped
  rounding the corner.
- **5 starting lives** (was 3).
- Fixed the **hearts running off the right edge** — lives are pinned in their own
  right-aligned group so they can't be pushed off, even when ❤ renders as a wide emoji.
- **Redesigned the junction** as an open crossroads: the side fences end, two side roads
  open left/right (framed by low rails, lit so they read clearly) with arrow cues and a
  low biome-end marker ahead — no more closed-box look. The new road builds up after the
  turn just like the starting road.

## 0.2.1 — Playtest fixes

- Lane changes are smaller / more central (lane spacing ±1.7 → ±1.25).
- Fixed left/right "stopping working": a junction no longer hijacks lane controls for
  its whole approach — only within the short reaction window at the corner. Wrong-way
  presses at a junction are now ignored rather than an instant crash.
- Shrunk the character (height 1.7 → 1.4) so it occludes less of the oncoming corridor
  and overhead beams/enemies are easier to see.

## 0.2.0 — Playable game (Play mode)

Turned the passive temple-runner into a playable browser game, layered on top of the
original ambient visualisation (which is preserved, along with the `getState`
recovery-data contract).

- **Two modes.** A **Play** button on the square ambient view starts a run that
  expands to a widescreen surface; game over returns to ambient.
- **Movement.** Three lanes (← →), jump (↑/Space), slide (↓) — keyboard or touch swipe.
- **Collectibles.** Pepsi cans in lane runs; swept-Z collection; score = distance + cans.
- **Hazards.** Low barriers (jump), high beams (slide), and enemies (dodge by lane);
  3 lives with brief invulnerability; collision ends the run at 0 lives.
- **Real 90° turns.** Junctions arm with arrow cues; pick left/right; the corridor
  swings about the corner pivot and rebases into a fresh straight run; a wrong/missed
  turn crashes.
- **Score + HUD.** Live score/cans/distance/lives DOM overlay; game-over screen; high
  score persisted to `localStorage`.
- **Engine.** All scrolling content parented under a rotatable `worldGroup`; pooled
  per-segment cans/obstacles/junctions keep the leapfrog "no per-frame allocation"
  discipline; speed ramps with distance.
- **Art is placeholder** (procedural can, simple enemy figures, run-sheet reused for all
  character states). See `SPRITES.md` for the art to supply and how to drop it in.

New modules: `GameState`, `Player`, `Input`, `Collectibles`, `Obstacles`, `Turn`, `Hud`.

## 0.1.0 — Ambient runner (M1)

Endless procedural temple track (leapfrog pooling), auto-running placeholder avatar,
square 1:1 viewport, fog, parallax background, ambient particles, mobile performance
caps, and the `getState` data contract (`level` → run speed).
