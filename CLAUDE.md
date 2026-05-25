# Crafty DND Runner

An endless temple-runner built with Three.js + Vite. The 3D environment (floor,
walls, shelves, ceiling, props) is generated and recycled by
`src/runner/TrackGenerator.js`.

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
- `book-covers.png` — 5x3 sprite sheet of book covers, used on the top faces of
  floor books (`coverMaterials`).
- `vines/vine-00.png` … `vine-12.png` — vine sprite alpha cards, kept for the
  ceiling vine *curtains* (`vineTextures` / `vineSpriteMats`).
- `vine-textures.png` — 7x2 sprite sheet of hanging vines, used for the
  archway/ceiling vines as crossed-plane billboards (`vineCardMaterials`).
- `leaf-materials.png` — 4x4 sprite sheet of leaves, scattered flat on the floor
  (`leafMaterials`).

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

Floor stacks and fallen books lie flat, so they show a cover, not a spine.
`book-covers.png` is a 5x3 grid whose cells are NOT evenly spaced, so each cover
is sliced by its detected pixel bounding box (`COVER_COLS_PX` / `COVER_ROWS_PX`
over `COVER_W` x `COVER_H`) rather than a uniform grid. Each flat book is built
with a per-face material array via `bookFaceMaterials(coverMat)`: the cover goes
on the `+y` (top) face, and `bookEdgeMat` on the other five. `bookEdgeMat` is a
patch of `book-textures.png` (the packed spines), so the thin edges read as book
spines from the side rather than plain leather. Box face order is
`[+x, -x, +y, -y, +z, -z]`. Cover slices use `alphaTest: 0.5` for the
transparent background.

All book materials (spines, back panel, covers, edges) carry a low
`emissiveMap` (the same texture, `emissiveIntensity` ~0.4) so the shelves read
in the scene's dark, shadowed side areas instead of going near-black.

### Floor leaves and hanging vines

Both are sliced sprite sheets with `alphaTest` for their transparent
backgrounds, same slicing pattern as the spines.

- **Floor leaves** (`leafMaterials`, from `leaf-materials.png`) lie flat on the
  ground (`rotation.x = -PI/2`). Note: from the low forward camera, flat ground
  decals are seen edge-on and read as subtle slivers — that is inherent to the
  camera angle, not a bug.
- **Hanging vines** (`vineCardMaterials`, from `vine-textures.png`) use
  `makeVineCard(width, height)`, which builds a "billboard cross" (two
  `PlaneGeometry` meshes rotated 90° apart sharing one material, wrapped in a
  Group) so the vine has 3D volume and stays visible from any angle. A single
  flat plane would disappear edge-on as the player passes. `alphaTest` is ~0.55
  to clip the white anti-aliased fringe.

The floor has no crack decorations (removed — the green-tinted crack boxes read
as "green rectangles").

## Exterior biomes (biomes.js + Background.js)

The exterior (sky dome + parallax backdrop) rotates through biomes as the player
travels: **forest → mountains → desert → underwater → (loop)**. The corridor
(TrackGenerator) and all lights are unchanged — backdrop meshes are unlit
`MeshBasicMaterial`, so biome look comes from their own colours + fog, never the
lights. Only the sky dome, fog colour, and `scene.background` crossfade.

- **`biomes.js`** owns the atmosphere: `BIOMES` (ordered palettes:
  `skyTop/skyBottom/fog/background`), `BIOME_DISTANCE` (world-units per biome) and
  `TRANSITION_DISTANCE` (crossfade window), and `resolveBiome(totalDistance)` →
  `{ geomIndex, colors }`. During the transition window at the end of a biome,
  `geomIndex` flips to the next biome (so new clusters arrive as the incoming
  biome) while `colors` lerp from current → next. Cycles via `% BIOMES.length`,
  so adding a biome is just a new `BIOMES` entry + its geometry.
- **`Background.js`** owns the geometry. Each parallax cluster pre-builds one
  subgroup per biome (`cluster.userData.biomeGroups`, indexed in `BIOMES` order)
  and shows only the active one; `redressCluster(cluster, geomIndex)` toggles
  visibility + re-randomises the active subgroup on recycle. Per-biome silhouette
  colours are in `BIOME_MATS`. `setSkyColors()` drives the dome live;
  `setBiome(geomIndex)` dresses all clusters at once (used at startup).
  Geometry must stay outside the corridor (near edge clear of the ~±3.4 walls);
  the new biome factories are pushed out in x accordingly.
- **`CraftyRunner.js`** accumulates `this.totalDistance`, calls
  `resolveBiome` each frame, applies the colours (sky/fog/background), and passes
  `geomIndex` to `background.update(distance, geomIndex)`. Lights stay constant.

## Build / run

- `npm.cmd run dev` — Vite dev server (visual checks happen here).
- `npm.cmd run build` — production build; use it to catch syntax/material errors.
  A "chunks larger than 500 kB" warning is expected and benign.
