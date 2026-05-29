# Crafty DND Runner — Detailed Changelog

Running log of all changes. Summarised into `changelog.md` at each stage boundary.

---

## Performance pass port (from teegly/main) — v0.3.2

Cherry-picked the self-contained performance work from teegly's diverged `main` into the
game branch, without pulling in her biome/asset/portal divergence.

- `quality.js` (new): `QUALITY_PRESETS` (low/balanced/high) + `resolveQuality()`. Presets set
  `pixelRatioCap`, `antialias`, `targetFps`, and a `density` multiplier for ambient particles.
  `resolveQuality` honours an explicit `?quality=` value, else returns `low` for touch /
  low-memory (`navigator.deviceMemory <= 3`) devices and `high` otherwise. NOTE: upstream
  defaults to `balanced`; we default capable desktops to `high` so the AMBIENT embed stays
  byte-identical — documented inline.
- `CraftyRunner.js`:
  - constructor takes `{ quality }`; falls back to a `high`-equivalent preset.
  - renderer `antialias` = `quality.antialias && !isTouchDevice`; `setPixelRatio` cap from
    `quality.pixelRatioCap` (2 on high = unchanged).
  - `capFps` / `frameInterval` now derive from `quality.targetFps` (was touch-only).
  - Added loop-lifecycle gating: `desiredRunning` / `isInViewport` / `isPageVisible`,
    `syncAnimationLoop()`, `setupViewportObserver()` (IntersectionObserver, threshold 0.05),
    `handleVisibilityChange()` (visibilitychange), and `renderCurrentFrame()` for a correct
    still frame while paused. `start()`/`stop()` route through `syncAnimationLoop()`.
  - `Particles` constructed with `{ density: quality.density }`.
  - `dispose()` removes the visibilitychange listener and disconnects the observer.
- `Particles.js`: counts scale by a `density` option (base 220 motes / 7 wisps at density 1.0,
  so `high` is unchanged); `makeMotes`/`makeWisps` take an explicit count; update loop uses
  `this.moteCount`.
- `index.js` / `main.js`: thread `quality` through; `main.js` resolves it from `?quality=`.
- Verified: `npm.cmd run build` passes (24 modules; benign >500 kB chunk warning).

---

## Game conversion (passive runner → playable game)

Turning the passive temple-runner into a playable browser game: lane switching,
jump/slide, Pepsi-can collectibles, enemies/obstacles, real 90° turns at junctions,
score + game over. Built in phases; the passive AMBIENT visualization is preserved
behind a new Play mode. Plan: `~/.claude/plans/the-following-project-was-luminous-riddle.md`.

### Phase 0 — worldGroup parenting refactor (no behaviour change)
- `CraftyRunner.js`: added `this.worldGroup` (a `THREE.Group`) added to the scene;
  `TrackGenerator` and `Background` now parent under `worldGroup` instead of the scene.
  Particles, lights, sky tone and the avatar remain on the scene (fixed) so they don't
  swing during a turn.
- `TrackGenerator.js`: constructor param renamed `scene` → `parent`; segments added to `parent`.
- `Background.js`: constructor param renamed `scene` → `parent`; sky dome + parallax
  layers added to `parent`; `createLayer` threads the parent through.
- Rationale: at identity rotation every child's world position is unchanged, so AMBIENT is
  byte-identical. This single group is what makes the Phase 5 corner-swing tractable.
- Verified: `npm.cmd run build` clean (the >500 kB chunk warning is expected/benign).

### Phase 1 — Game modes, HUD, widescreen-on-play
- New `src/runner/GameState.js`: runtime `MODE` (AMBIENT/PLAYING/GAME_OVER), score/cans/
  distance/lives, localStorage high score (`crafty.highScore`), and the `GAME` tuning
  block (lanes, jump/slide, lives, speed ramp, scoring, collision, turns, delta clamp) —
  the single gameplay tuning centre, separate from the untouched `state.js` data contract.
- New `src/runner/Hud.js`: DOM overlay (start screen + Play, live score/dist/cans/lives
  bar, game-over screen with final + high score + Play again / Back to ambient). Injects
  its own scoped CSS; `update()` only touches the DOM on value change.
- `CraftyRunner.js`: constructs `GameState` + `Hud`; `step()` now branches into
  `stepAmbient` (unchanged original behaviour), `stepPlaying` (clamped delta, distance
  speed ramp, scoring, HUD), and `stepGameOver` (frozen world). Added `enterPlay()` /
  `endGame()` / `exitToAmbient()` and a mode-aware `resize()` (square in AMBIENT, fill the
  container in PLAYING/GAME_OVER). HUD disposed in `dispose()`.
- `index.html`: `#runner` is now `position: relative` (HUD containing block); new
  `#runner.cr-playing` expands to a fixed, fullscreen, widescreen surface during play.
- Verified in-browser (Playwright): start screen renders in the square embed; Play
  expands to widescreen with a live HUD; forcing game over shows the final/high score;
  Back restores the square ambient embed. Build clean.

### Phase 2 — Player movement + input
- `Avatar.js` rewritten as a small animation state machine: a per-state sheet registry
  (run / strafeLeft / strafeRight / jump / slide / hit / death), textures cached by URL,
  `setTransform(x, y, scaleY)` for position + slide squash, `update(elapsed, state)` with
  loop vs one-shot frame stepping, `setStateSheet()` to drop in real art later. All states
  currently reuse `crafty-run.png`; `update(elapsed)` with no state still plays the run
  loop so AMBIENT is unchanged. `setSheet()` kept as a back-compat alias.
- New `src/runner/Player.js`: logical lane index → X lerp (`LANE_LERP`), jump parabola
  (`y = ground + H·4t(1−t)`), slide squash + grounded feet, `animState`, and `clearsLow` /
  `clearsHigh` clearance getters for upcoming collision. Owns the avatar transform + anim
  each frame. The player never moves in Z.
- New `src/runner/Input.js`: keyboard (Arrows/WASD/Space) + touch-swipe → discrete
  `left/right/jump/slide` actions, enabled only during a run.
- `CraftyRunner.js`: constructs `Player` + `Input`; `_handleAction` routes input to the
  player while PLAYING; `enterPlay` resets the player and enables input; `endGame` /
  `exitToAmbient` disable input (and exit recentres the avatar); `stepPlaying` now drives
  the player (which drives the avatar); `stepGameOver` plays the `death` state.
- Verified in-browser (Playwright): ArrowLeft → lane 0 (x −1.7); jump peaks at y 2.35
  (ground 0.85 + height 1.5) and lands; slide squashes the sprite to 0.55× and ends.
  Build clean.

### Phase 3 — Pepsi-can collectibles, collision, scoring
- `TrackGenerator.js`: added `addRecycleListener(fn)` (fired after `dressSegment` on
  recycle) and `relayoutStraight()` (re-lay + re-dress the whole pool, used to reset a run
  and — Phase 5 — to rebase after a turn). Both fire the recycle listeners so item pools
  stay in lockstep.
- New `src/runner/Collectibles.js`: each segment owns a pool of 8 can meshes (built once,
  toggled on recycle — no per-frame allocation), children of the segment so they scroll +
  swing with it. `layoutCans` lays 0–2 short lane runs; `activate`/`deactivate` show/hide
  for PLAY vs AMBIENT. Collection is a swept-Z overlap test (interval
  `[worldZ−distance, worldZ]` vs `[−half,+half]`) gated by lane, so a stutter at top speed
  can't tunnel a can. Cans spin + bob. Placeholder art: a procedural cola-can label drawn
  to a canvas (swap to `/sprites/pepsi-can.png` later).
- `CraftyRunner.js`: constructs `Collectibles`; `stepPlaying` updates it after the player;
  `enterPlay`/`exitToAmbient` activate/deactivate it.
- Verified in-browser (Playwright): cans render in lanes; locked to lane 0 → 10/10 same-lane
  cans collected, 0 missed (swept-Z reliable), 22 other-lane cans correctly ignored; score
  = distance + cans; high score persists to `localStorage['crafty.highScore']` (6612).
  Build clean.

### Phase 4 — Obstacles, lives, collision game over
- `Player.js`: added damage state — `invulnT` (i-frames: no damage while > 0), `hurtT`
  (brief hit reaction → 'hit' anim + blink), `alive`, `grantGrace()` and `hurt()`. update()
  decrements timers, overrides anim to 'hit' during `hurtT`, and blinks the sprite only
  during the hit reaction (not the silent start grace).
- New `src/runner/Obstacles.js`: 3 pooled slots per segment (built once, toggled on
  recycle), one lane each at spaced depths so a run is always passable. Types: `low`
  (jump over → cleared by `player.clearsLow`), `high` (slide under → `player.clearsHigh`),
  `block` (enemy → dodge by lane only). Swept-Z collision gated by lane + clearance; a hit
  spends a life + grants i-frames; lives ≤ 0 fires `onDeath`. Placeholder art: barrier box,
  beam box, and an enemy figure with glowing eyes.
- `CraftyRunner.js`: constructs `Obstacles` with `onDeath: () => this.endGame()`;
  `stepPlaying` updates hazards before cans; `enterPlay` activates them + grants 1.0s start
  grace; `exitToAmbient` deactivates.
- Verified in-browser (Playwright): enemy renders in lane; steering into every hazard drove
  lives 3→2→1→0 → GAME_OVER with the game-over screen shown. Controlled clearance unit test
  passed all six cases (jump clears low, slide clears high, enemy needs a lane dodge, lane
  gating correct). Build clean.

### Phase 5 — Real 90° turns at junctions
- `TrackGenerator.js`: each segment now carries a hidden junction overlay (`createJunction`)
  — a wide crossroads floor, a back wall that blocks straight-ahead (forcing a turn), two
  perpendicular arms, and glowing chevron arrows. Exported `armJunction(seg, exits)` (reveal
  + hide the segment's normal decoration for a clean crossroads) and `disarmJunction(seg)`.
- New `src/runner/Turn.js`: arms a junction on a recycled segment every `JUNCTION_INTERVAL`
  (3) segments with random open exits. Pressing left/right during the approach RECORDS the
  choice; the swing fires only when the crossing reaches the player pivot, so
  `worldGroup.rotation.y` tweens 0→±90° pivoting at the corner (not sweeping across a wall).
  On completion it snaps rotation to 0 and calls `track.relayoutStraight()` to rebase a
  fresh straight corridor (guarded so the rebase doesn't re-arm). Wrong direction (into a
  wall) or no choice by the pivot → crash → `onCrash`.
- `Hud.js`: added a `flash()` light pulse (`.cr-flash`) to mask the rebase seam mid-turn.
- `CraftyRunner.js`: constructs `Turn` (onCrash → endGame, onSwingStart → hud.flash);
  `_handleAction` routes left/right to the turn while a junction is armed, else to the
  player; `stepPlaying` freezes the scroll while swinging and pauses hazards/cans/distance
  only during the swing; `enterPlay`/`exitToAmbient` activate/deactivate the turn.
- Verified in-browser (Playwright): junctions arm naturally with arrow cues; a correct turn
  swings about the corner pivot, flashes, rebases (rotation → 0), and the run continues with
  distance still scoring; wrong turn and no-choice both crash → GAME_OVER. Mid-swing frame
  reads as rounding a corner. Build clean.
- Note: every junction is currently a forced turn arriving every ~3 segments — frequency and
  difficulty are tunable in Phase 6 (`JUNCTION_INTERVAL`).

### Phase 6 — Tuning, integration playtest, docs
- Tuning: `JUNCTION_INTERVAL` 3 → 5 (running room between forced turns). Run speed already
  ramps with distance (`GameState.playSpeed`, 13 → 40 units/sec) as the main difficulty driver.
- Integration playtest (Playwright autopilot): a single run took a 90° turn, ran 109 m,
  collected 8 cans, then ended on a normal game-over when lives ran out — confirming cans,
  hazards, turns, scoring and game-over all work together in a live run.
- Docs: README gains a two-modes intro, a "Playing the game" section (controls + goal), the
  new module list, and updated milestones. `CLAUDE.md` gains a "Game architecture" section.
  New `SPRITES.md` lists the art to supply with exact drop-in instructions
  (`Avatar.setStateSheet`, can/enemy swap points). New `launch.md` for the launcher hub.
- Version bumped to 0.2.0 (`package.json`); `changelog.md` summarised.
- Art remains placeholder by design (procedural can, simple enemy figures, run-sheet reused
  for all character states); hooks are in place to drop in real sprites.

### 0.2.1 — Playtest bug fixes
- **Lane movement too wide** (`GameState.js`): `LANE_X` ±1.7 → **±1.25** so a lane change is a
  smaller, readable step (verified central at 16:9; the earlier near-square test viewport
  exaggerated it).
- **Input dying before junctions** (`Turn.js`): `isAwaitingChoice()` returned true for the
  whole ~4 s junction approach, so left/right were hijacked as turn choices and lane control
  felt dead. Now it only intercepts within the reaction window (`crossZ >= TURN_WINDOW_OPEN_Z`,
  widened −11 → −14); outside the window left/right are normal lane switches. Also made a
  wrong-direction press **forgiving** (ignored, not an instant crash) — you only crash by
  reaching the pivot with no valid choice. Verified: normal lane switching always responds; a
  far junction doesn't hijack; a near junction does.
- **Character too big / occluded overhead blocks** (`Avatar.js` + `GameState.js`): `RUN_HEIGHT`
  1.7 → **1.4** with `GAME.GROUND_Y` 0.85 → **0.7** (kept = RUN_HEIGHT/2). The smaller sprite
  occludes less of the corridor so oncoming beams/enemies read clearly. Slide/jump clearance
  math re-checked against the new height.
- Build clean; verified in-browser at 1280×720.

### 0.2.2 — Turns are a no-fail biome choice; HUD + lives fixes
- **Turns can no longer fail** (`Turn.js`): junctions now always open **both** directions
  (pick a biome). Removed the crash path entirely — if the player makes no choice by the
  pivot, it **auto-turns** (toward their current lane side). After a turn the player is
  granted ~1.2 s of grace so the freshly-rebuilt road can't clip them at the corner (this
  was the "lose a heart at each corner"). Removed the `onCrash` hook.
- **5 starting lives** (`GameState.js`: `LIVES` 3 → 5).
- **Hearts no longer run off the right edge** (`Hud.js`): the top bar is split into a
  left group (score/dist/cans, which can shrink/clip on tiny screens) and a right-pinned
  lives group, so the hearts can never be pushed off — even when ❤ renders as a wide
  colour emoji. Added `box-sizing: border-box`, trimmed font sizes/gap, and the initial
  markup now shows 5 hearts.
- **Open crossroads, not a closed box** (`TrackGenerator.js`): the junction now ends the
  corridor's side fences/rails (added `rails` to the hide set + stored them in userData),
  drops the tall back wall and the boxy arm walls, and instead frames two open side roads
  with low rails + a glowing arrow each, plus a low biome-end marker straight ahead. The
  junction floor/rails are gently emissive so the side roads read clearly beyond the
  corridor lights. After the swing the rebase builds the new road exactly like the start.
- Verified in-browser (1280×720): no-choice junction auto-turns with lives unchanged
  (5→5), 5 hearts fully visible at the right edge, open crossroads with arrows. Build clean.

### 0.2.3 — Hearts (definitive), spawn spacing, motion blur
- **Hearts truly fixed** (`Hud.js`): the ❤ emoji has platform-dependent width (wide colour
  emoji on Windows) and `#runner` clips overflow, so the row was being cut at the right
  edge. Hearts are now fixed-width inline **SVGs**, so the row width is known and always
  sits inside the padding. Verified: 5 SVG hearts end 16 px inside a 1280-wide viewport.
- **No item ever overlaps another** (`Obstacles.js` + `Collectibles.js`): obstacles are laid
  out after cans (Collectibles registers its recycle listener first), then
  `clearCansOnObstacles` hides any can sharing an obstacle's lane within `CAN_CLEAR_DZ`
  (2.8) — so a Pepsi can is never dropped on a barrier/enemy. Verified 0 overlaps across
  463 frames of recycling play.
- **Less crowded spawns**: `OBSTACLE_CHANCE` 0.5 → 0.4, obstacle slots spread to z −7/0/7,
  can runs sparser (more empty rolls, 2–4 instead of 2–5).
- **Lane-overlap blur** (`Obstacles.js` + `TrackGenerator.js`): narrowed obstacles below the
  ~1.25 lane spacing (low 1.1→1.0, high 1.4→1.05) so a hazard never bleeds into a
  neighbouring lane and z-fights; added `anisotropy = 8` to the floor/wall/wood textures so
  the receding surfaces stay sharp instead of shimmering/blurring in motion.
- Build clean; verified in-browser at 1280×720.

## Themed biomes (Temple / Hospital / Highway / Forest)

Runs now pass through distinct biomes; junctions are a labelled choice of which biome to
enter next. All themed art is sprite-with-fallback. Plan:
`~/.claude/plans/the-following-project-was-luminous-riddle.md`.

### Phase A — Biome data model + sprite-fallback loader
- New `src/runner/Biomes.js`: `BIOME` ids, `BIOMES` defs (palette: absolute `fog`/`sky`,
  `surfaceTint` multiplier, `light` key + `lightLerp`; 3 obstacle defs per biome; `icon`;
  `scenery`), `BIOME_ORDER`, `getBiome`, `pickTwoBiomes`. Loader `spriteCardMaterial(url,
  {placeholderTexture, fog})` — shared alpha-card material, swaps `.map` to the PNG on load,
  keeps a generated placeholder on 404 (never throws), cached by URL. Plus
  `obstacleCardMaterial`, `biomeIconMaterial`, generated `labeledCardTexture`/`chipTexture`.
- `GameState.reset()` sets `currentBiome = BIOME.TEMPLE`.

### Phase B — Corridor tint + scene palette
- `TrackGenerator`: `createSegment` captures `userData.tintTargets` (floor/wall/cap/rail/
  pillar base colours); module `junctionTintTargets`; `setBiome(biome)` multiplies bases by
  `surfaceTint` (Temple's white = identity).
- `CraftyRunner`: captured light refs (`lightTargets`); `_applyBiome(id)` +
  `_applyBiomePalette` (fog, `scene.background`, lights lerped toward `palette.light`);
  `_applyBiome(TEMPLE)` on `enterPlay` + `exitToAmbient`. Lights lerp (not multiply) so
  biomes read strongly while Temple (lightLerp 0) stays exact.

### Phase C — Themed obstacles
- `Obstacles`: `createObstacleUnit` adds a sprite card per role alongside the 3D
  placeholders; `layoutObstacles(seg, biome)` shows the biome's themed card (sprite or
  labelled placeholder) for non-Temple, or the 3D box for Temple. Collision unchanged.

### Phase D — Junction biome choice
- `Turn._arm` picks two distinct biomes (`pickTwoBiomes`), passes labels to
  `armJunction(seg, exits, labels)`; `createJunction` gives each arm a cloned arrow material +
  a destination icon mesh; `armJunction` tints the arrow to the biome accent and sets the icon
  (sprite → name chip). `_finishSwing` fires `onBiomeChange(chosenBiome)` →
  `CraftyRunner._applyBiome` BEFORE `relayoutStraight()` so the rebuilt corridor + re-dressed
  obstacles come up in the new biome. No-fail turn kept.

### Phase E — Per-biome background scenery + temple-decor hide
- `Background`: each pooled cluster holds a variant per biome (temple = original; others
  procedural silhouettes via `makeBiomeSilhouettes`); `setBiome` shows the current variant +
  recolours the sky-dome uniforms.
- `TrackGenerator.dressSegment` hides `TEMPLE_ONLY_GROUPS` (shelves/books/banners/lanterns/
  vines) + the hero prop in non-temple biomes so each biome reads cleanly.

### Phase F — Fallback, docs, version
- Added `public/sprites/biomes/README.md` (full sprite list + folder layout + fallback note).
- Verified in-browser (1280×720): each biome has a distinct mood + background + themed
  obstacle cards; junction arrows labelled with destination biomes (blue "Hospital" /
  green "Forest"); turning switches biome (tint + fog + obstacles) and stays no-fail; Temple
  fully restores; **0 console errors after loading every biome** (missing sprites fall back).
  Docs updated; version bumped to 0.3.0.

### 0.3.1 — Biome scenery overlapping the path
- `Background.makeBiomeSilhouettes`: the per-item X offset (`randRange(2,8)`) wasn't
  multiplied by `side`, so the left-side group (`side*10`) placed buildings/trees at world X
  ≈ −8…−2 — on top of the path (path ±3, walls ±3.35). Fixed: items now sit symmetrically
  around the side group's centre (`randRange(-3,3)`) with the group pushed to `side*11.5`, so
  the closest scenery edge is ~6.1 units from centre (verified) — always clear of the corridor
  on both sides. Build clean; confirmed in highway + forest.
