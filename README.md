# Crafty DND Runner

A passive, ambient Three.js runner scene for Crafty's DND recovery page. Crafty
auto-runs down a shared ivy-covered corridor while the exterior biome rotates
between the active backgrounds.

The biome rotation cycles through four biomes (see `src/runner/biomes.js`):

- `mountains` (also `snow`, `winter`): the default first biome with snowy
  mountains.
- `forest`: forest parallax imagery.
- `desert`: mesas, dunes, and a desert sky.
- `ocean`: underwater/seascape horizon layers.

The ivy corridor is shared across all biomes, so biome names refer to the
outside background and side-floor treatment, not the corridor itself.

## Running Locally

Requires Node.js 24 for parity with CI and deploy workflows.

```bash
npm install
npm run dev
npm run build
npm run lint
```

On Windows, `npm.cmd run dev` / `npm.cmd run build` / `npm.cmd run lint` are
also fine. `lint` runs ESLint with a correctness-only config; merges to main
should have build and lint green. `npm run build` should complete without the
Vite large-chunk warning; Three.js is split into `three-core` and
`three-addons` vendor chunks in `vite.config.js`.

Useful preview URLs (each biome spans `BIOME_DISTANCE` = 1800 world-units):

- Default winter/mountains biome: `http://127.0.0.1:5173/crafty-dnd/`
- Forest biome: `http://127.0.0.1:5173/crafty-dnd/?distance=1800`
- Desert biome: `http://127.0.0.1:5173/crafty-dnd/?distance=3600`
- Ocean biome: `http://127.0.0.1:5173/crafty-dnd/?distance=5400`

## Deployment

The project is configured for GitHub Pages under `/crafty-dnd/`:

```js
base: '/crafty-dnd/'
```

`npm run build` writes the production site to `dist/`. The GitHub Pages workflow
publishes that build output on pushes to `main`. CI and deploy run on Node 24
using current Node 24-compatible GitHub Actions.

Live URL:

https://teegly.github.io/crafty-dnd/

## Project Layout

```text
crafty-dnd-runner/
  index.html
  package.json
  vite.config.js
  src/
    main.js
    runner/
      Avatar.js
      Background.js
      CraftyRunner.js
      Particles.js
      Props.js
      TrackGenerator.js
      biomes.js
      horizonLayers.js
      loaders.js
      portalAmbience.js
      quality.js
      queuedGltfModel.js
      runnerFrame.js
      segmentDressers.js
      state.js
      trackBuilders.js
      trackConstants.js
      trackTextures.js
      util.js
  public/
    assets/
      sprites/
      textures/shared/
      biomes/winter/
      biomes/forest/
      biomes/desert/
      biomes/ocean/
```

## Asset Layout

Only runtime-used assets should live in `public/assets`.

- `public/assets/sprites/`: Crafty and sprite sheets used at runtime.
- `public/assets/textures/shared/`: shared corridor, books, leaves, torches,
  stone, wood, cloud, and sun textures.
- `public/assets/biomes/winter/`: winter/mountains parallax layers and snow
  side-floor texture.
- `public/assets/biomes/forest/`: forest parallax layers and forest side-floor
  texture.
- `public/assets/biomes/desert/`: desert horizon layers.
- `public/assets/biomes/ocean/`: ocean/underwater horizon layers.

Source packs, reference images, and archived biome experiments should stay
outside this app repo in a local workspace path, for example:

```text
../runner-textures
```

Moon, iceberg, old horizon packs, and bird assets are not part of the active
committed runtime asset set.

## Runtime Notes

The public entry point is `createCraftyRunner({ container, getState })` from
`src/runner/index.js`.

The runner polls `getState` every frame. The expected state shape is:

```js
{
  level: 1,
  items: [],
  debuffs: [],
  dayEvent: null,
}
```

Currently `level` drives run speed and distance, and `items` drives the
backpack inventory HUD: entries are `{ id, label }` (label optional) or a bare
id string. Known ids (`cool-stick`, `spare-underwear`, `pepsi-max`) map to
icons; unknown ids show an empty slot with the label; an empty list shows the
defaults. Debuff/day-event visuals are reserved for future work.

All public assets should be loaded with `assetUrl(...)` so Vite's configured
base path works correctly.

## Current Status

- Active biome rotation: `winter -> forest -> desert -> ocean -> repeat`.
- Winter/mountains is the default load.
- Other biomes can be previewed with `?distance=` (see preview URLs above).
- The corridor, vines, shelves, books, torches, particles, and Crafty sprite are
  shared across biomes.
- Default desktop quality is `balanced`; touch or low-memory devices auto-select
  `low`. Use `?quality=low`, `?quality=balanced`, or `?quality=high` to force a
  preset while previewing.
