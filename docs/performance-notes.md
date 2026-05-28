# Crafty Runner Performance Notes

## 2026-05-28 Balanced Pass

Goals:
- Reduce runtime GPU and CPU cost without changing the main look.
- Keep the deployed GitHub Pages site static.
- Leave `public/assets/inventory/` untouched for later work.

Implemented:
- Added `?quality=low`, `?quality=balanced`, and `?quality=high`.
- Default quality is `balanced`, with automatic `low` for touch devices or low memory devices.
- Pixel ratio caps are now `1` for low, `1.5` for balanced, and `2` for high.
- Touch devices disable antialiasing.
- Balanced and low quality cap the render loop at 30 FPS.
- The runner pauses its animation loop when the canvas is off screen or the page is hidden.
- Dev panel now shows FPS, pixel ratio, draw calls, triangles, points, textures, and geometries.
- Portal model and portal textures are loaded on first portal use instead of at startup.
- Non-starting biome horizon textures are deferred until idle time or first use.
- Particle counts were reduced:
  - Dust motes: `220` to `120`
  - Wisps: `7` to `4`
  - Snow points: `350` to `180`
- Corridor micro-clutter was reduced:
  - Floor leaves: `12` to `8` per segment
  - Broken-wall stone chips: `9` to `5` per wall set
  - Small vine card counts reduced on wall sets, archways, and vine curtains

Verification:
- `npm.cmd run build` passes.
- Local preview returned HTTP `200` at `http://127.0.0.1:5173/crafty-dnd/?quality=balanced`.
- In-app browser automation was unavailable because the local browser runtime failed with `windows sandbox failed: spawn setup refresh`.

Follow-up candidates:
- Convert large non-transparent PNGs to WebP once a WebP encoder is available.
- Compress or simplify `Old_Dusty_Bookshelf.glb`, currently about `8.4 MB`, if load time remains high.
- Add manual Chrome Performance measurements from the deployed page after this pass is pushed.
