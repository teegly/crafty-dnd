# Crafty DND Runner

A passive, ambient endless temple-runner built with Three.js + Vite for
Crafty's recovery page. Crafty auto-runs down a shared ivy corridor while the
exterior biome rotates. There is no gameplay input; the host page feeds state
via `createCraftyRunner({ container, getState })` (see `src/runner/index.js`).

## Module map (src/)

- `main.js` — dev entry: builds the runner, mounts UI widgets, debug params.
- `uiWidgets.js` — DOM overlay: Travel button, outfit toggle, inventory HUD
  (driven by `state.items`, see "State contract").
- `devPanel.js` / `devPanelControls.js` — local-only dev panel (`?` params and
  layer tuning). Mounted only when `import.meta.env.DEV` or localhost.
- `runner/CraftyRunner.js` — scene, camera, renderer, animation loop, portal
  transitions, quality/FPS capping, viewport+visibility pausing.
- `runner/runnerFrame.js` — `applyBiomeFrame`: per-frame application of the
  resolved biome (colours, track, background, particles, avatar, portal).
- `runner/TrackGenerator.js` + `runner/trackBuilders.js` +
  `runner/segmentDressers.js` + `runner/trackConstants.js` — the corridor.
- `runner/trackTextures.js` — corridor textures/materials, module scope.
- `runner/loaders.js` + `runner/queuedGltfModel.js` — GLB prop loading.
- `runner/Background.js` + `runner/biomes.js` + `runner/horizonLayers.js` —
  sky dome, horizon parallax layers, biome palettes and resolution.
- `runner/Particles.js` — dust motes, wisps, biome-gated snow.
- `runner/Avatar.js` — Crafty sprite billboard + run-cycle sheet playback.
- `runner/Props.js` + `runner/portalAmbience.js` — hero archway, portal model,
  portal swirl/ambience shaders.

## State contract (state.js)

`getState` is polled every frame. Shape: `{ level, items, debuffs, dayEvent }`.
`level` drives run speed (`mapStateToParams`). `items` drives the inventory
HUD: entries are `{ id, label }` (label optional) or a bare id string; known
ids map to icons in `uiWidgets.js` `INVENTORY_ITEM_TYPES`, unknown ids render
as an empty slot with an accessible label, and an empty list falls back to the
three defaults. `debuffs` / `dayEvent` are reserved.

## Track generation

The track uses the **leapfrog pooling** pattern (borrowed from cave-runner,
MIT): a fixed pool of `SEGMENT_COUNT` (4) segments, each `SEGMENT_LENGTH` (20)
deep, recycled behind the camera and re-dressed by `dressSegment` (visibility
toggles + position/scale re-rolls only; nothing is created per frame).

Decoration sub-groups live in `group.userData.<name>` arrays. Recyclable items
cache `userData.baseZ` and `userData.side`.

Large props are GLB models, loaded once at module scope through
`createQueuedGltfModel` (groups built before the async load resolves are
queued and populated retroactively):

- `Old_Dusty_Bookshelf.glb` — shelf rows (3 clones per shelf slot).
- `books.glb` — floor book stacks; per-stack cover tint detects the native
  red cover material by `color.getHex() === 0xc53720`, then clones it.
- `stone-pillar.glb` — flanking pillars (cylinder fallback until loaded).
- `Stone_archway.glb` — hero archway (Props.js).
- `portal.glb` — travel portal (Props.js, lazy: loads on first portal use).

ONE shared `GLTFLoader` (exported from `loaders.js`) has the `DRACOLoader`
wired (decoder in `public/assets/draco/`). All GLBs are Draco-compressed:
loading any of them through a fresh GLTFLoader without that decoder fails.

## Assets and textures

All runtime assets live in `public/assets/` and are loaded with
`assetUrl(...)` (`runner/util.js`) so the Vite `base` sub-path
(`/crafty-dnd/` on GitHub Pages) works. Never hardcode root-relative asset
URLs in runtime strings.

Corridor textures load once at module scope in `trackTextures.js`. Tiling
textures use `RepeatWrapping` + `makeRepeatedTexture(source, rx, ry)` (clones
share the source image, so cloning before the async load finishes is safe).
Colour maps must be `SRGBColorSpace`.

Sprite-sheet slicing (UV `repeat` + `offset` per cell, `generateMipmaps =
false`, `alphaTest` to clip transparent backgrounds) is used for: the torch
flame sheet (`torch-sheet.png`, all torches share one animated texture), the
floor leaves (`leaf-materials.png`, 4x4 grid), and Crafty's run cycle
(`Avatar.js`). The hanging creepers / loop vines are single-image alpha cards.

Asset budget: GLBs and large PNGs are compressed (gltf-transform: texture
resize + webp + draco; Pillow for PNGs). Keep `public/` lean; uncompressed
originals are archived outside the repo in `../runner-textures/originals/`.
Source packs and reference art stay in `../runner-textures/`.

## Exterior biomes and crossfade

Cycle: mountains/winter -> forest -> desert -> ocean -> loop (`BIOMES` in
`biomes.js`). `BIOME_DISTANCE` = 1800 world-units per biome,
`TRANSITION_DISTANCE` = 420 crossfade window. `resolveBiome(totalDistance)`
returns `{ geomIndex, fromIndex, toIndex, transition, colors }`.

During the window EVERYTHING crossfades in step:

- Sky dome gradient, fog colour/near/far, `scene.background` (lerped colours
  from `resolveBiome`).
- Horizon layer groups (`Background.js` `setBlend`): both groups visible and
  UV-scrolling, outgoing fades out, incoming fades in. The incoming group gets
  a higher renderOrder base (-10 vs -20) so it composites on top; this only
  matters within the transparent pass (the dome is opaque-list and corridor
  sprites sit at renderOrder 0+).
- Side-floor ground planes (`TrackGenerator.setBiome(biomeState)`): snow (0),
  forest (1), desert (2) fade material opacity; `transparent` is toggled on
  only mid-fade. Ocean has no ground treatment.
- Snow particles (`Particles.setBiome(biomeState)`): opacity scales off the
  authored 0.85 baseline.

Backdrop meshes are unlit `MeshBasicMaterial`, so biome looks come from their
own colours; the lit corridor (`MeshStandardMaterial` + fixed lights) is
untouched by biome changes. Non-default biome horizon textures lazy-load via
`requestIdleCallback` (hydrated on demand if a fade reaches them first).

## Portal travel

The Travel button picks a random different biome and calls
`runner.transitionToDistance(distance)`: a portal GLB spawns ahead, scrolls in
with the world, and on pass-through `totalDistance` jumps to the target. The
full-screen swirl overlay (`portalAmbience.js`) ramps with portal proximity
plus a short afterglow. `?portal=1` previews the portal; `previewPortal()` and
`setPreviewDistance()` are dev helpers on the runner.

## Quality and loop control

`quality.js` presets (low/balanced/high) cap pixel ratio, antialias, FPS, and
particle density; auto-picks low for coarse pointers or <=3 GB device memory;
`?quality=` overrides. The loop pauses when the container leaves the viewport
or the tab hides (`syncAnimationLoop`). `stopLoopOnly()` is a deliberate
dev/console freeze helper; `window.__craftyRunner` is exposed on localhost.

## Build / run / lint

- `npm.cmd run dev` — Vite dev server (visual checks happen here).
- `npm.cmd run build` — production build; catches syntax/material errors. The
  "chunks larger than 500 kB" warning is expected and benign.
- `npm.cmd run lint` — ESLint, correctness-only flat config. Pre-merge gate is
  build + lint with captured exit codes.

Pushes to `main` auto-deploy to GitHub Pages via the Actions workflow.
