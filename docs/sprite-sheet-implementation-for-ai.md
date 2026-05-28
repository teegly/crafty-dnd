# Sprite Sheet Implementation Notes For AI Agents

Purpose: use this file when adding, replacing, tuning, or debugging sprite sheets, texture atlases, frame strips, and packed pixel art assets in this runner.

## Core Model

1. A sprite sheet is one image containing multiple sprite regions.
2. A frame is a rectangle inside that image.
3. Rendering a frame means sampling only that rectangle, then drawing it at the desired destination size.
4. A uniform grid sheet can derive frames from column, row, frame width, and frame height.
5. A packed atlas should use metadata, usually JSON, because frames may have different sizes, offsets, trims, and rotations.

## Canvas 2D

Use `drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)` when drawing one frame from a sheet.

1. `sx`, `sy`, `sw`, `sh` are the source rectangle inside the sheet.
2. `dx`, `dy`, `dw`, `dh` are the destination rectangle on the canvas.
3. Never guess source rectangles if atlas metadata exists.
4. For pixel art, disable smoothing on the drawing context with `imageSmoothingEnabled = false`.
5. Validate that source width and source height are nonzero before drawing.

## Three.js Texture Atlases

Three.js texture atlas frame selection is usually done with cloned `Texture` instances using `repeat` and `offset`.

1. Load the sheet once with `TextureLoader`.
2. For each independent sprite frame, clone the loaded texture.
3. Set `texture.repeat.x = frameWidth / sheetWidth`.
4. Set `texture.repeat.y = frameHeight / sheetHeight`.
5. Set `texture.offset.x = frameX / sheetWidth`.
6. Set `texture.offset.y = 1 - (frameY + frameHeight) / sheetHeight`, because Three.js UV coordinates count from the bottom.
7. Set `texture.needsUpdate = true` after cloning and configuring a texture.
8. If each sprite animates independently, each sprite needs its own cloned texture or material. Shared texture offset changes affect every material using that same texture.

## Pixel Art Settings

1. Use nearest filtering for crisp pixel art:

```js
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
```

2. Use linear filtering only when the source art is painterly or intentionally smooth.
3. Keep sprite dimensions stable. Do not resize one frame differently from the others unless metadata explicitly includes trim offsets.
4. Avoid fractional destination positions for pixel art if jitter or shimmer appears.

## Atlas Padding And Bleed

Texture bleeding happens when GPU sampling catches neighboring pixels from another frame.

1. Prefer at least 1 to 2 pixels of padding between frames.
2. Prefer extrusion when using packed atlases. Extrusion duplicates edge pixels around each sprite so sampling near the border still returns the same sprite color.
3. Padding separates sprites. Extrusion protects sprite edges.
4. Disable mipmaps for tiny pixel art unless the art is designed for mipmapped distance rendering.
5. If sprites still bleed, increase padding, add extrusion, or use tighter UVs with a small inset.

## Packed Atlas Metadata

If a sheet comes with JSON metadata, preserve and use it. Do not convert it to a guessed grid.

Important fields to preserve:

1. Frame rectangle: `x`, `y`, `w`, `h`.
2. Source size: original untrimmed width and height.
3. Sprite source offset: trim offset inside the original frame.
4. Rotation flag: some packers rotate frames to save space.
5. Pivot or anchor if provided.

If frames are trimmed, reconstruct layout using the trim offset. Without this, animations will wobble because each frame has a different visual origin.

## Animation

1. Store animation state per instance, not globally, unless every sprite should animate in sync.
2. A frame timer should accumulate delta time, then advance by `fps`.
3. Use modulo wrapping for looping animations.
4. For one shot animations, clamp at the final frame and expose a completion flag.
5. Keep animation data declarative:

```js
const animation = {
  name: 'run',
  fps: 10,
  frames: [0, 1, 2, 3, 4, 5],
  loop: true,
};
```

## Applying To This Runner

1. Existing Three.js sprite sheets in this repo should follow the local pattern in `src/runner/TrackGenerator.js`.
2. Use `assetUrl(...)` for public asset paths so Vite base path keeps working.
3. For each frame slice, clone the texture, set `repeat`, set `offset`, set filters, then build a material from that clone.
4. Use `SpriteMaterial` for always camera facing sprites.
5. Use `MeshBasicMaterial` or `MeshStandardMaterial` on `PlaneGeometry` when a sprite should sit in world space, be angled, or receive scene lighting.
6. Use `alphaTest` for cutout pixel sprites. Use `transparent` only when semitransparent pixels need to render.
7. Set `depthWrite: false` for soft overlays, wisps, clouds, and vines that should not block later transparent sprites.
8. Use stable dimensions and aspect ratios. Do not stretch sprite sheets unless intentional.
9. Keep source packs outside the repo. Commit only runtime sheets and metadata that the app actually loads.

## User Interface Sprite Sheets

Use this section when implementing UI atlases, icon sheets, button states, frames, borders, cursors, HUD pieces, menus, panels, or inventory-style item icons.

### Prefer Semantic UI First

1. Do not use a sprite sheet just because an asset pack contains one.
2. Use normal HTML, CSS, SVG, or icon components when the UI element needs accessibility, text, dynamic layout, hover states, focus rings, or scalable vector rendering.
3. Use a UI sprite sheet when the visual language depends on pixel art, hand-painted raster icons, fixed-frame decorations, game HUDs, or packed inventory icons.
4. UI sprites need labels and controls outside the sprite. A bitmap icon alone is not an accessible button.

### UI Atlas Frame Data

For UI, metadata quality matters more than for scenery. Store or derive these fields per frame:

```js
{
  name: 'button_primary_hover',
  x: 128,
  y: 64,
  w: 48,
  h: 16,
  sourceW: 48,
  sourceH: 16,
  pivotX: 0.5,
  pivotY: 0.5,
  role: 'button-state'
}
```

Required for reliable UI:

1. Stable frame names, not only numeric indices.
2. Frame rectangles.
3. Untrimmed source size if frames were trimmed.
4. State naming convention, such as `button_default`, `button_hover`, `button_pressed`, `button_disabled`.
5. DPI or scale target, such as `1x`, `2x`, or pixel-art integer scale.

### UI States

A button or control sprite usually needs separate frames for:

1. Default.
2. Hover.
3. Pressed or active.
4. Disabled.
5. Focused, if focus is visual and not supplied by CSS.
6. Selected, if the control is toggleable.

Do not fake these states with opacity alone unless the art direction allows it. For pixel UI, authored state frames usually look better.

### Nine-Slice And Stretching

Do not stretch pixel-art panels, frames, or buttons uniformly unless distortion is acceptable.

Use nine-slice behavior for scalable UI panels:

1. Corners remain fixed size.
2. Edges stretch or tile in one axis.
3. Center stretches or tiles in both axes.
4. Text and icons sit above the nine-slice background, not baked into the image.

If the runtime has no nine-slice helper, implement the panel from nine quads or nine CSS background regions. For pixel art, tiled edges often look better than stretched edges.

### CSS UI Sprites

For DOM UI, use background positioning only when the sprite is decorative or when accessibility is handled by real text or ARIA.

```css
.icon {
  width: 24px;
  height: 24px;
  background-image: url('/assets/ui/icons.png');
  background-position: -48px -24px;
  background-size: 192px 96px;
  image-rendering: pixelated;
}
```

Rules:

1. Use fixed width and height matching the frame.
2. Use `background-size` when serving scaled atlases.
3. Use `image-rendering: pixelated` for pixel art UI.
4. Do not put meaningful text inside the bitmap.
5. Real buttons still need `<button>` elements, keyboard focus, disabled state, and accessible labels.

### Three.js UI Sprites

For in-scene UI or diegetic HUD elements:

1. Use cloned textures per independently changing frame.
2. Use `SpriteMaterial` for camera-facing icons.
3. Use `PlaneGeometry` for panels or signs that live in world space.
4. Set `depthTest: false` for overlay HUD sprites that must always be visible.
5. Set `depthWrite: false` for transparent UI layers.
6. Use render order deliberately for stacked UI.

Example:

```js
const material = new THREE.SpriteMaterial({
  map: frameTexture,
  transparent: true,
  alphaTest: 0.1,
  depthTest: false,
  depthWrite: false,
});
sprite.renderOrder = 100;
```

### Hit Areas

Never infer clickable area only from nontransparent pixels unless that is explicitly intended.

1. Use generous rectangular hit targets for buttons.
2. Keep hit target independent from visual frame.
3. Minimum comfortable pointer target is usually larger than the tiny pixel icon.
4. Preserve keyboard navigation and focus order for DOM UI.
5. For canvas UI, store hit boxes next to sprite frame metadata.

### DPI And Scaling

UI sprites are more sensitive to scaling than scenery.

1. Decide the authored base scale: `1x`, `2x`, or fixed pixel-art scale.
2. Scale pixel art by integer multiples where possible.
3. Avoid fractional scale for icons with one-pixel outlines.
4. For high-DPI displays, either serve higher-resolution atlases or render the canvas at device pixel ratio while preserving integer logical scaling.
5. If text must remain crisp, render text as real text, not as part of the sprite sheet.

### Common UI Sprite Bugs

1. Wrong state frame: check naming and state transitions.
2. Blurry UI: check CSS scaling, canvas backing resolution, filtering, and fractional transform values.
3. One-pixel seams: check padding, extrusion, and background-position math.
4. Stretched button corners: use nine-slice.
5. Inaccessible icons: add text labels, `aria-label`, or visible text.
6. Hover works but keyboard focus does not: wire focus state separately.
7. Disabled state still clickable: disable behavior, not only appearance.
8. Icon reads too small: increase hit target and possibly visual size, do not rely on browser zoom.

### AI Decision Rule For UI Sprite Sheets

If the user asks for UI spritesheet implementation:

1. Identify whether UI is DOM, Canvas, or Three.js overlay.
2. Look for atlas metadata before slicing manually.
3. Preserve state names and untrimmed sizes.
4. Use real controls for interaction.
5. Add visible or accessible labels for bitmap-only icons.
6. Use nine-slice for scalable panels.
7. Verify at 1x and high-DPI scale.
8. Screenshot the UI and inspect for blur, seams, clipped text, wrong state, and inaccessible hit targets.

## Debug Checklist

1. If a sprite shows the wrong frame, verify `offset.y` uses bottom origin math.
2. If all sprites animate together accidentally, check for shared texture or material instances.
3. If pixel art looks blurry, check smoothing, filters, mipmaps, CSS scaling, and device pixel ratio.
4. If edges show neighbor colors, check padding, extrusion, mipmaps, and UV insets.
5. If an animation wobbles, check trim metadata and anchor consistency.
6. If the sprite is invisible, verify image path, alpha test threshold, material side, depth write, camera facing, and render order.
7. If the sheet is distorted, verify frame aspect ratio and destination geometry aspect ratio.

## Source Links

1. MDN Canvas `drawImage`: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
2. MDN Canvas image usage tutorial: https://developer.mozilla.org/docs/Web/API/Canvas_API/Tutorial/Using_images
3. Three.js textures manual: https://threejs.org/manual/en/textures.html
4. Three.js `Texture` API: https://threejs.org/docs/api/en/textures/Texture.html
5. PixiJS spritesheet API example: https://pixijs.download/v7.4.0/docs/PIXI.Spritesheet.html
6. TexturePacker texture settings: https://www.codeandweb.com/texturepacker/documentation/texture-settings
7. TexturePacker extrusion note: https://www.codeandweb.com/texturepacker/knowledgebase/sprite-extrude
