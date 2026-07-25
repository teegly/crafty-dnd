# SPEC

## §G GOAL
Passive ambient Three.js endless temple-runner for Crafty recovery page. No input; host feeds state; exterior biome rotates.

## §C CONSTRAINTS
- Three.js ^0.184 + Vite 6, ESM (`type:module`).
- Node 24 — CI/deploy parity.
- deploy GitHub Pages, base `/crafty-dnd/`.
- passive only — ⊥ gameplay input.
- host drives via `createCraftyRunner({container,getState})`; getState polled / frame.
- ESLint correctness-only; pre-merge gate = build + lint green.
- build ⊥ large-chunk warning (three split `three-core`/`three-addons`, limit 600).
- runtime assets only in `public/assets/`, loaded via `assetUrl(...)`.
- uncompressed originals & source packs ∉ repo (live `../runner-textures/`).

## §I INTERFACES
- api: `createCraftyRunner({container,getState,quality})` → runner. container ! required (⊥ → throw). runner has `.start()`, `.dispose()`.
- state: `getState()` → `{level,items,debuffs,dayEvent}` polled/frame. level ∈ 1..~60 → speed. items → backpack HUD: `{id,label}` | bare id; known ids `cool-stick`/`spare-underwear`/`pepsi-max` → icons; unknown → empty slot+label; empty list → 3 defaults. debuffs/dayEvent reserved (M2).
- runner dev methods: `transitionToDistance(d)`, `previewPortal()`, `setPreviewDistance()`, `stopLoopOnly()`.
- url params (local preview only, env-gated DEV|localhost): `?distance=` biome preview, `?quality=low|balanced|high`, `?paused=1`, `?fov=`, `?portal=1`.
- env: `import.meta.env.BASE_URL` = `/crafty-dnd/`; `window.__craftyRunner` exposed on localhost.
- cmds: `npm run dev|build|preview|lint`.

## §V INVARIANTS
V1: container missing → throw (⊥ silent).
V2: getState polled every frame; mutate returned obj → live visual update.
V3: ∀ JS runtime asset load → `assetUrl(...)` (direct | via `createQueuedGltfModel`). CSS/import → Vite base. ⊥ hardcoded root-relative in JS load() strings.
V4: ⊥ create per frame. track = leapfrog pool SEGMENT_COUNT=4 × SEGMENT_LENGTH=20; recycle + re-dress only.
V5: ONE shared GLTFLoader + DRACOLoader (decoder `public/assets/draco/`). all GLB draco ∴ fresh loader w/o decoder → fail.
V6: biome cycle mountains→forest→desert→ocean→loop. BIOME_DISTANCE=1800, TRANSITION_DISTANCE=420. in window: sky/fog/bg/horizon/side-floor/snow crossfade in step.
V7: preview params (`?distance`,`?quality`,`?paused`,`?fov`,`?portal`) ! env-gated (DEV | localhost). live hosts ignore them and do not write them.
V8: colour maps ! SRGBColorSpace.
V9: speed = min(28, 10 + (level-1)*0.3); level ! ≥ 1.
V10: build ⊥ large-chunk warning. pre-merge ! build+lint green via captured exit code (⊥ trust task notification).
V11: quality default balanced; coarse-pointer | ≤3GB mem → low; `?quality=` overrides.
V12: loop pauses off-viewport | tab hidden; frame delta clamped ∴ ⊥ resume jump.

## §T TASKS
id|status|task|cites
T1|x|core runner scene/camera/loop|V1,V2
T2|x|leapfrog track pool|V4
T3|x|GLB load via shared draco loader|V5
T4|x|biome rotation + crossfade|V6
T5|x|quality presets + adaptive select|V11
T6|x|viewport/visibility pause|V12
T7|x|inventory HUD from state.items|-
T8|.|wire debuffs visuals (M2)|-
T9|.|wire dayEvent flavour spawn (M2)|-
T10|.|add test harness — none exist yet ?|V9
T11|.|audit any remaining ungated dev view params ?|V7

## §B BUGS
id|date|cause|fix
B1|2026-05-27|preview params ungated -> stale preview URLs could override prod runner state on live|V7
