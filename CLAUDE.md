# Crafty DND Runner

An endless temple-runner built with Three.js + Vite. The 3D environment (floor,
walls, shelves, ceiling, props) is generated and recycled by
`src/runner/TrackGenerator.js`.

It runs in two modes: the original passive **AMBIENT** visualisation, and a
playable **PLAYING** game (lane runner with jump/slide, Pepsi cans, enemies, and
real 90° turns). See "Game architecture" below. The external `getState` recovery-
data contract (`state.js`) is unchanged by the game.

## Track generation (TrackGenerator.js)

The track uses the **leapfrog pooling** pattern (borrowed from cave-runner, MIT):

- A fixed pool of `SEGMENT_COUNT` (4) segments exists permanently. Nothing is
  created or destroyed per frame, so draw calls stay stable and there is no GC
  stutter.
- Each segment is `SEGMENT_LENGTH` (20) deep. Total covered depth = 80.
- `update(distance)` moves every segment toward the camera by `distance`
  (speed * delta). When a segment passes `RECYCLE_Z` (behind the camera) it
  teleports back one full pool length and is re-decorated by `dressSegment`.
- `createSegment()` builds all geometry once. `dressSegment(seg)` only toggles
  `.visible`, nudges positions, and re-rolls scales/rotations to vary the look on
  recycle. It never adds or removes meshes.

Each segment is a `THREE.Group`. Decoration sub-groups (wall sets, shelves,
book stacks, lanterns, banners, ceiling, archways, vine curtains, pillars) are
stored in `group.userData.<name>` arrays so `dressSegment` can iterate them.
Recyclable items cache their original z in `userData.baseZ` and their side in
`userData.side`.

## Texture loading

All textures live in `public/textures/` and are referenced by absolute URL
(e.g. `/textures/wood-texture.png`) since Vite serves `public/` at the web root.

A single module-scope `THREE.TextureLoader` loads every texture once at module
load, not per segment. Standard setup for a tiling texture:

```js
const tex = textureLoader.load('/textures/<name>.png');
tex.colorSpace = THREE.SRGBColorSpace;        // colour maps must be sRGB
tex.wrapS = THREE.RepeatWrapping;
tex.wrapT = THREE.RepeatWrapping;
tex.magFilter = THREE.LinearFilter;
tex.minFilter = THREE.LinearMipmapLinearFilter;
```

`makeRepeatedTexture(source, repeatX, repeatY)` clones a base texture and sets
its `repeat`, so the same source can tile at different densities on different
meshes. Cloning is safe even before the async image load finishes because
clones share the original's `Source` object.

### Current texture assets

- `floor-texture.png` — floor tiles (`floorTexture`, repeats 1 x 3.35).
- `mossy-stone-wall.png` — walls, rails, caps, pillars (`wallTexture`).
- `wood-texture.png` — shelf boards, ceiling beams, lantern brackets/dark wood
  (`woodTexture`).
- `book-textures.png` — seamless packed-bookshelf, used on the shelf back panel
  (`booksBackTexture` / `booksBackMat`).
- `book-spines.png` — 8x3 sprite sheet of individual book spines.
- `vines/vine-00.png` … `vine-12.png` — vine sprite alpha cards (`vineTextures`).

### Sprite-sheet slicing (book spines)

`book-spines.png` is an 8-column x 3-row grid (`SPINE_COLS` / `SPINE_ROWS`). It
is sliced into 24 materials by cloning the sheet per cell and setting UV
`repeat` + `offset`:

```js
slice.repeat.set(1 / SPINE_COLS, 1 / SPINE_ROWS);
slice.offset.set(col / SPINE_COLS, 1 - (row + 1) / SPINE_ROWS); // v is bottom-up
```

Slices set `generateMipmaps = false` + `LinearFilter` to stop neighbouring
cells bleeding across the slice edge at distance. The materials use
`alphaTest: 0.5` so the transparent gaps between spines clip cleanly. Standing
shelf books pick a random spine material.

Floor stacks and fallen books lie flat (you see a face, not a spine), so they
use `bookCoverMaterials`: a small pool of opaque materials, each sampling a
different patch of `book-textures.png` via `repeat` + `offset`. Opaque (no
`alphaTest`) avoids clipping holes in the flat face. There is no dedicated
book-cover art, so these reuse the packed-spine texture as a leather surface.

## Game architecture (Play mode)

The game is layered on top of the runner without forking the loop.

- **Modes & tuning** — `GameState.js` holds the runtime `MODE`
  (`AMBIENT` | `PLAYING` | `GAME_OVER`), score/cans/distance/lives, the localStorage
  high score, and the **`GAME` block: the single gameplay tuning centre** (lanes,
  jump/slide, lives, speed ramp, scoring, collision band, turn timing, delta clamp).
  This is separate from `state.js` (the external data contract, untouched).
- **One branched loop** — `CraftyRunner.step()` calls `stepAmbient` (byte-identical
  to the original), `stepPlaying`, or `stepGameOver` by mode. All new behaviour is
  gated behind `PLAYING`, so AMBIENT never regresses. `resize()` is mode-aware:
  square 1:1 for AMBIENT, fill-the-container widescreen (`#runner.cr-playing`) while
  playing.
- **worldGroup** — all scrolling corridor content (track + background) is parented
  under `this.worldGroup`, a single rotatable group, so a turn can swing the whole
  corridor about the player pivot. Lights, sky tone, particles and the avatar stay
  on the scene (they must not swing). At identity rotation nothing changes vs before.
- **Player & Input** — `Player.js` is logical lane index → X lerp, jump parabola,
  slide squash, damage (i-frames + hit blink), and drives the avatar each frame; the
  player never moves in Z. `Input.js` maps keyboard + touch-swipe to
  `left/right/jump/slide`, enabled only during a run.
- **Pooled game items** — `Collectibles.js` (Pepsi cans) and `Obstacles.js`
  (low/high/block hazards) own a fixed pool **per segment** (built once, toggled on
  recycle via `TrackGenerator.addRecycleListener`), children of the segment so they
  scroll + swing with it — the same no-per-frame-allocation discipline as the track.
  Collision is a **swept-Z** test (the item's travel interval this frame vs the
  player's hit band at z≈0), gated by lane + clearance, so a stutter at top speed
  can't tunnel an item.
- **90° turns (no-fail biome choice)** — `Turn.js` arms an open-crossroads overlay
  (`createJunction` / `armJunction` in `TrackGenerator.js`) on a recycled segment
  every `JUNCTION_INTERVAL`. Both directions are always open; arming ends the
  corridor's side fences (`rails` etc. are hidden) so two side roads open up. A
  left/right press within the reaction window (`isAwaitingChoice`, gated on
  `TURN_WINDOW_OPEN_Z`) **records** the choice; the swing fires when the crossing
  reaches the pivot, tweening `worldGroup.rotation.y` 0→±90°, then snaps to 0 and
  calls `TrackGenerator.relayoutStraight()` to **rebase** a fresh straight corridor
  (a `Hud.flash()` masks the seam, and the player gets a grace beat). Turns can't
  fail: if no choice is made it auto-turns. The scroll (and hazards/cans/distance)
  freeze only during the swing.
- **HUD** — `Hud.js` is a DOM overlay inside the container (start / live bar /
  game-over / flash); cheaper and crisper than canvas text.

`window.__craftyRunner` is exposed in dev (`main.js`) for poking at
`gameState` / `player` / `turn` from the console.

## Biomes (Play mode)

Runs pass through themed biomes — **Temple** (the original look + start), **Hospital**,
**Highway**, **Forest** — defined declaratively in `src/runner/Biomes.js` (the single
tuning centre for biome look, like `GAME` for gameplay). Each biome has a palette
(absolute `fog`/`sky`; `surfaceTint` multiplier; `light` key + `lightLerp`), three obstacle
defs (sprite + placeholder per clearance role), an `icon`, and a `scenery` id.

- **Current biome** = `gameState.currentBiome` (read at dress time so recycled/relaid
  segments theme correctly). Temple's palette is identity (multiplier white, lightLerp 0),
  so Temple is pixel-identical to before and AMBIENT never changes.
- **Sprite-with-fallback**: `spriteCardMaterial(url, {placeholderTexture, fog})` builds a
  shared alpha-card material starting on a generated placeholder (labelled card / name
  chip) and swaps `.map` to the PNG on load; on 404 it keeps the placeholder and never
  throws. Cached by URL so each biome×role / icon sprite loads once and all pooled
  instances share it. Art lives under `public/sprites/biomes/<id>/<name>.png` (see that
  folder's README).
- **Obstacles** (`Obstacles.js`): each unit has the 3D placeholders (Temple) **and** a
  sprite card per role. `layoutObstacles(seg, biome)` shows the biome's card (themed sprite
  or labelled placeholder) for non-Temple, or the 3D box for Temple. Collision is unchanged.
- **Corridor tint** (`TrackGenerator.setBiome`): multiplies captured base colours of
  floor/wall/cap/rail/pillar (+ shared junction mats) by `surfaceTint`. `dressSegment` hides
  library/temple-only decoration (`TEMPLE_ONLY_GROUPS`) in non-temple biomes.
- **Scene palette** (`CraftyRunner._applyBiome` / `_applyBiomePalette`): fog colour,
  `scene.background`, and lights lerped from their captured base toward `palette.light`.
- **Background** (`Background.setBiome`): each pooled cluster holds a variant per biome
  (temple = original art; others = procedural silhouettes); only the current shows; the sky
  dome uniforms recolour.
- **Junctions = biome choice** (`Turn.js`): `_arm` picks two distinct biomes
  (`pickTwoBiomes`), `armJunction(seg, exits, labels)` labels each arrow (icon + accent
  tint); on the chosen turn `_finishSwing` fires `onBiomeChange` → `CraftyRunner._applyBiome`
  **before** `relayoutStraight()` so the rebuilt corridor comes up in the new biome. Turns
  stay no-fail.

## Build / run

- `npm.cmd run dev` — Vite dev server (visual checks happen here).
- `npm.cmd run build` — production build; use it to catch syntax/material errors.
  A "chunks larger than 500 kB" warning is expected and benign.
