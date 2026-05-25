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
shelf books pick a random spine material; floor stacks and fallen books keep
flat leather colours (`bookMats`).

## Build / run

- `npm.cmd run dev` — Vite dev server (visual checks happen here).
- `npm.cmd run build` — production build; use it to catch syntax/material errors.
  A "chunks larger than 500 kB" warning is expected and benign.
