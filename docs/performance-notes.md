# Crafty Runner Performance Notes

## 2026-05-28 Balanced Pass

Goals:
- Reduce runtime GPU and CPU cost without changing the main look.
- Keep the deployed GitHub Pages site static.
- Leave `public/assets/inventory/` untouched for later work.

Implemented:
- Added `?quality=low`, `?quality=balanced`, and `?quality=high`.
- Default quality is now `balanced`, with automatic `low` for touch devices or low memory devices when no `?quality=` preset is requested.
- Pixel ratio caps are now `1` for low, `1.25` for balanced, and `1.75` for high.
- Antialiasing now follows the selected quality preset (`low` disables it, `balanced`/`high` enable it).
- Low quality caps the render loop at 30 FPS; balanced and high target 60 FPS.
- The runner pauses its animation loop when the canvas is off screen or the page is hidden.
- Dev panel now shows FPS, pixel ratio, draw calls, triangles, points, textures, and geometries.
- Portal model and portal textures are loaded on first portal use instead of at startup.
- Bookshelf, stone pillar, and hero archway GLBs defer first load until idle.
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
- Compress or simplify `Old_Dusty_Bookshelf.glb`, currently about `8.4 MB`, if load time remains high.
- Add manual Chrome Performance measurements from the deployed page after this pass is pushed.

## 2026-06-20 Ambient Smoothness And Build Pass

Goals:
- Make the ambient runner feel smoother without adding gameplay systems.
- Reduce first-render contention from decorative models.
- Remove the Vite large-chunk warning and GitHub Actions Node 20 warning.

Implemented:
- Default quality is now `balanced` for desktop, with automatic `low` for touch
  or <=3 GB memory devices.
- Pixel ratio caps are now `1` for low, `1.25` for balanced, and `1.75` for
  high.
- Balanced and high run at 60 FPS; low remains capped at 30 FPS.
- Quality presets now pass renderer `powerPreference`.
- Frame deltas are clamped to reduce visible jumps after tab or viewport
  resumes.
- Portal travel eases in and out more gently, with a softer afterglow.
- Bookshelf, stone pillar, and hero archway GLBs defer first load until idle;
  portal assets remain lazy on first portal use.
- Vite build output is split into app, `three-core`, and `three-addons` chunks;
  the chunk warning limit is `600` KB to account for the known Three core
  vendor chunk.
- GitHub Actions workflows run on Node 24 and current Node 24-compatible
  official actions.

Verification:
- `npm run lint` passes.
- `npm run build` passes without the Vite large-chunk warning.
- GitHub Pages deploy succeeded after the workflow update.
