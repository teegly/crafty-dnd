# Plan: Crafty's Recovery RPG, Temple-Runner Visualisation (three.js)

## Context

Crafty (Twitch streamer, CraftingChaosGaming) is having a full hysterectomy on
Thursday 28 May 2026, with a 6 to 8 week mostly bed-bound recovery. Krusher is
building a recovery-themed DnD character-sheet website at
`dnd.craftingchaosgaming.com`. He is building most of the site himself.

Our single responsibility in this work: the **passive, ambient, endlessly
generated "temple-runner" visualisation** that sits on the page. It is the
richer scene the brief flagged for "later", and we are building it now as a
self-contained, embeddable three.js component.

This is a visualisation, not a game. The avatar auto-runs forward forever, the
camera follows, there is no player input, no scoring, no fail state. Over time
it reflects Crafty's recovery progress (level, items, debuffs) so the community
can watch her "adventure" advance day by day.

Confirmed scope decisions (from the user):
- Avatar: a swappable **2D sprite billboard**. Crafty will draw the real art
  later; we build with a placeholder and a clean swap point. (User explicitly
  said NOT to use the existing `Image References/*.jpg`, those are not final.)
- Interaction: **passive ambient auto-runner**, no controls.
- Data: **self-contained with a stub data API**, `{ level, items, debuffs,
  dayEvent }`, faked now, wired to Krusher's real source later.
- Environment: **hybrid**, procedural temple track now, a few sourced
  license-safe hero props dropped in during polish.

## Research findings (existing projects reviewed before building)

The brief requires reviewing existing GitHub projects before building custom
systems. Three relevant repos were analysed:

- **cave-runner** (tope-olajide, MIT): best pattern. A "two-segment leapfrog"
  pooled track: exactly N segments exist permanently; each frame advance them by
  `speed * delta`; when a segment passes a "behind camera" z-threshold, teleport
  it to `leadSegment.z - segmentLength`. Zero create/destroy. Uses `delta`-time
  movement and `precision: 'mediump'`. Obstacles use a fixed pre-built pool.
- **Boxy-Run** (wanfungchui, Apache 2.0): "world scrolls toward a fixed avatar"
  convention; `THREE.Fog` tightening for atmosphere and to hide pop-in; a
  `sinusoid()` helper for looping billboard motion; primitive factory helpers.
  Caution: it is framerate-dependent (no delta-time), which we will not copy.
- **three-runner** (jinpyojeon, MIT): naive spawn-and-destroy, no pooling. Not a
  model to follow.
- **OpenGame** (the repo the user linked): SKIP. It is a Phaser-based academic
  framework for AI-*generating* games from prompts. No three.js, no runner code,
  nothing reusable here.

We will borrow patterns (all from permissively licensed repos) but build our own
clean, data-driven module rather than fork any of them.

## Recommended approach

Build fresh: **three.js r184 + Vite (npm)** for local dev/preview, with the
runner written as one self-contained ES module exposing a single entry,
`createCraftyRunner({ container, getState })`. Krusher can embed the built bundle
or load it via a three.js importmap. This keeps us unblocked from his stack.

Stack is confirmed available locally: Node 24.11, npm 11.6.2.

## File structure

```
Crafty-DND/
  package.json            three@^0.184, vite (dev)
  index.html              dev page with a square 1:1 viewport container
  src/
    main.js               dev entry: build stub state, call createCraftyRunner
    runner/
      index.js            createCraftyRunner({ container, getState }): public entry
      CraftyRunner.js     scene/camera/renderer, animation loop, square resize,
                          mobile pixelRatio cap + optional 30fps cap, delta-time
      TrackGenerator.js   leapfrog pooled temple track (borrowed cave-runner pattern)
      Avatar.js           2D sprite billboard, placeholder texture, swap point,
                          sinusoid run-bob (borrowed Boxy-Run helper)
      Props.js            hybrid hero-prop slots: procedural placeholders now,
                          documented load points for sourced GLTF props later
      state.js            stub data contract + the ONE place that maps
                          { level, items, debuffs, dayEvent } to visuals
      util.js             sinusoid() and small primitive/material helpers
  public/
    placeholder/          placeholder sprite(s) + README documenting frame size
```

## Key technical patterns

- **Endless track (leapfrog pooling):** keep 3 segment meshes. Compute
  `segmentLength` once via `THREE.Box3().setFromObject`. Each frame advance all
  by `speed * delta`; when `segment.position.z > recycleZ`, set
  `segment.position.z = leadSegment.position.z - segmentLength` and (optionally)
  re-randomise its decorative dressing before it scrolls back into view.
- **Avatar:** `THREE.Sprite` (camera-facing by default) with a placeholder
  `SpriteMaterial` map. Vertical run-bob via `sinusoid(freq, min, max, phase,
  elapsed)`. Real art swaps in by replacing the texture map and (if a sprite
  sheet) advancing UV frames. Frame size documented in `public/placeholder/`.
- **Square viewport:** size renderer to the smaller of container w/h, keep
  `camera.aspect = 1`, recompute on resize. Viewport stays 1:1 per the brief.
- **Mobile performance:** `renderer.setPixelRatio(Math.min(devicePixelRatio,
  2))`; `precision: 'mediump'`; `THREE.Fog` to cull distance and hide pop-in;
  optional 30fps cap via a delta accumulator on coarse-pointer devices. All
  movement uses `delta` so it is framerate-independent.
- **Animation loop:** `renderer.setAnimationLoop` with `THREE.Clock` delta.
- **Data-driven visuals:** `state.js` maps level -> run speed / distance /
  cosmetic tier; items -> collectible props passing by; debuffs -> ambient
  effects (e.g. a "fatigue" fog tint); dayEvent -> optional flavour spawn. This
  mapping is the single tuning surface, kept out of the render code.

## Build milestones

1. **M1, on screen (first session goal):** Vite + three.js scaffold, square
   viewport, scene + follow camera, leapfrog pooled procedural temple track,
   placeholder sprite avatar auto-running with bob, fog atmosphere, mobile
   pixelRatio cap + delta-time. Result: a visibly working endless runner.
2. **M2, data-driven:** wire the stub `{ level, items, debuffs, dayEvent }`
   contract so level changes speed/distance and items/debuffs appear. Document
   the `getState` interface for Krusher.
3. **M3, hybrid polish:** drop in a few sourced license-safe GLTF hero props
   (statues, torches) at the documented prop slots; finalise and document the
   art swap points so Crafty can drop in her real sprite.

## Verification

- `npm run dev` serves the Vite page; open it and confirm: square 1:1 canvas,
  avatar auto-running, track scrolls endlessly with no visible pop-in or gaps,
  no console errors. Watch for 30+ seconds to confirm segments recycle cleanly
  (no drift, no GC stutter).
- Throttle to a mobile profile / coarse pointer in devtools: confirm pixelRatio
  cap and (if enabled) the 30fps cap engage, and motion speed is unchanged
  (delta-time working).
- M2: mutate the stub state values in `main.js` and confirm the visual responds
  (e.g. raise `level`, see speed/distance change; add a debuff, see its effect).
- `npm run build` produces a clean bundle with no errors (embeddability check).

## Notes / open items

- Avatar art format defaults to a **sprite sheet** (documented frame size) so a
  run cycle is possible; a single static frame also works if Crafty prefers.
  Confirm with Crafty when her art is ready; no blocker for M1.
- First execution step after approval: `npm install` in `Crafty-DND/` to
  scaffold Vite + three.js (needs user go-ahead to run, repo is currently empty).
- Sourced props (M3) will be checked for license-safe reuse (e.g.
  Quaternius/Kenney CC0) before inclusion, per the brief.
- The repo `teegly/crafty-dnd` exists but is empty; our scaffold becomes its
  initial commit when the user is ready to push.