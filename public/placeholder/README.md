# Avatar art swap point

The runner currently draws a labelled **placeholder** tiefling silhouette on a
canvas (see `src/runner/Avatar.js`, `createPlaceholderTexture`). No binary image
ships yet, so there is nothing to delete here.

## When Crafty's real art is ready

The avatar is a 2D sprite billboard (it always faces the camera). To drop in
real art:

1. Export the art as a PNG with a **transparent background**.
2. Put it in this folder, for example `public/placeholder/crafty.png` (or move
   it somewhere tidier like `public/art/crafty.png`).
3. In `src/main.js`, after creating the runner, call:
   ```js
   const runner = createCraftyRunner({ container, getState: () => state });
   runner.avatar.setTexture('/placeholder/crafty.png');
   ```
   (Vite serves anything under `public/` from the site root, so `/placeholder/...`.)

## Recommended format

- **Single frame (simplest):** one side-on PNG of Crafty mid-stride. Works
  today with `setTexture`. The runner adds a gentle vertical bob so a single
  frame still reads as "running".
- **Sprite-sheet run cycle (nicer, optional later):** a horizontal strip of
  equal-width frames (for example 6 frames of 256x384 each). Frame stepping is
  not wired up yet; add it in `Avatar.js` by offsetting the texture
  `map.offset` / `map.repeat` over time. Document the frame count and pixel
  size here when you choose one.

## Aspect ratio

The sprite is scaled to roughly **0.66 wide : 1 tall** (`SPRITE_ASPECT` in
`Avatar.js`). Draw the art around that ratio (for example 256x384) so it is not
stretched, or adjust `SPRITE_ASPECT` to match the real art.
