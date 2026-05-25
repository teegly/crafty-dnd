# Crafty DND Runner

A passive, ambient "temple-runner" visualisation for Crafty's recovery RPG site.
Built with [Three.js](https://threejs.org/) + [Vite](https://vitejs.dev/).

The avatar (a 2D sprite) auto-runs forward forever down an endless procedural
temple. There is no player input, no scoring, no fail state. Over time the visual
reflects Crafty's recovery progress (level, items, debuffs) so the community can
watch her adventure advance day by day. It is designed to live in a square (1:1)
box on the page at `dnd.craftingchaosgaming.com`.

This README is for Krusher: it covers how to run it, how to embed it in the site,
and how to feed it Crafty's real recovery data.

---

## TL;DR for Krusher

1. `npm install`
2. `npm run build` produces a `dist/` folder.
3. Upload the **contents** of `dist/` to your web root, OR embed the runner as a
   module (see "Option B" below) into a page you already control.
4. Replace the placeholder data source with your real recovery data by passing a
   `getState` function (see "Feeding it real data").
5. The runner needs its `/textures/` and `/sprites/` assets served from the site
   **root** by default. If you deploy under a sub-path, see "Asset paths" below.

---

## Running it locally

You need [Node.js](https://nodejs.org/) 18+ installed (built and tested on Node 24).

```bash
npm install        # one time, pulls Three.js + Vite
npm run dev        # starts a local dev server, open the URL it prints
npm run build      # produces a production bundle in dist/
npm run preview    # serves the built dist/ locally to sanity-check it
```

`npm run dev` is the live-reload dev server: edit a file, the page updates.
`npm run build` is what you ship.

> On Windows you may need `npm.cmd run dev` instead of `npm run dev`.

---

## How to embed it in your site

The runner mounts into any square-ish container element you give it. Two ways to
integrate, depending on how your site is built.

### Option A: ship the built site (simplest)

`npm run build` writes a self-contained site to `dist/`:

```
dist/
  index.html                 demo page (square viewport)
  assets/index-XXXX.js       the bundled runner + Three.js
  textures/                  all environment textures
  sprites/                   the avatar sprite sheet(s)
  placeholder/README.md      notes on sprite frame sizing
```

If `dnd.craftingchaosgaming.com` can serve a static folder, upload the
**contents of `dist/`** to the web root and you are done. The included
`index.html` shows the runner full-bleed in a centred square box. You can copy
the markup/CSS for `#runner` from it into your own page.

### Option B: embed the module into a page you control

If you already have your own page and just want the runner in a `<div>`, import
the public entry point and call `createCraftyRunner`:

```html
<div id="runner" style="width: min(90vmin, 640px); aspect-ratio: 1 / 1;"></div>

<script type="module">
  import { createCraftyRunner } from './runner/index.js';

  const runner = createCraftyRunner({
    container: document.getElementById('runner'),
    getState: () => myRecoveryState, // your data, see below
  });
</script>
```

`createCraftyRunner` is the only function you call. It takes:

| Option      | Required | What it is                                                        |
|-------------|----------|-------------------------------------------------------------------|
| `container` | yes      | The DOM element the canvas mounts into. Size it square in CSS.     |
| `getState`  | no       | A function returning the current recovery data (see next section). |

It returns a `runner` instance with these methods:

| Method              | What it does                                              |
|---------------------|----------------------------------------------------------|
| `runner.dispose()`  | Tears everything down and frees GPU memory. Call on unmount. |
| `runner.stop()`     | Pauses the animation loop.                                |
| `runner.start()`    | Resumes it (already started for you on create).           |
| `runner.resize()`   | Re-fits the canvas to the container (auto-runs on window resize). |

---

## Feeding it real data

The runner polls your `getState` function **every frame**, so whenever you update
the object it returns, the visual updates live. No re-mount needed.

`getState` must return an object with this exact shape:

```js
{
  level: 1,       // 1 to ~60. Gains 1 per day. Drives run speed and distance.
  items: [],      // collectibles shown along the track (wired up in milestone M2)
  debuffs: [],    // ambient effects / obstacles (wired up in M2)
  dayEvent: null, // optional flavour spawn for the day (wired up in M2)
}
```

Right now only `level` is wired to a visible effect: higher level means the
avatar runs faster and further. `items`, `debuffs`, and `dayEvent` are part of
the contract so the shape never has to change, but their visuals are still being
built (milestone M2). You can start sending them now; they will simply do nothing
visible yet.

Example wiring to your own recovery data:

```js
// Your app keeps the current recovery state somewhere:
let recoveryState = { level: 1, items: [], debuffs: [], dayEvent: null };

const runner = createCraftyRunner({
  container: document.getElementById('runner'),
  getState: () => recoveryState,
});

// Later, when your backend says she levelled up, just mutate the object.
// The runner picks it up on the next frame, no extra calls needed.
recoveryState.level = 12;
```

All the data-to-visual mapping (e.g. how `level` becomes run speed) lives in one
file: `src/runner/state.js`, in `mapStateToParams`. That is the single place to
tune the feel. You do not need to touch the render code.

---

## Asset paths (important for deployment)

The build references textures, sprites, and its own JS by **absolute paths from
the site root**:

```
/assets/index-XXXX.js
/textures/...
/sprites/...
```

So by default the runner expects to be served from the **root** of a domain or
subdomain (e.g. `https://dnd.craftingchaosgaming.com/`). If you deploy it there,
nothing extra to do.

If you need to serve it from a **sub-path** (e.g. `example.com/crafty/`), set
Vite's `base` before building so the paths resolve. Create a `vite.config.js`:

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/crafty/', // match the sub-path you deploy under
});
```

Then `npm run build` again. (There is no `vite.config.js` in the repo today
because it currently assumes root deployment.)

---

## Swapping in Crafty's real avatar art

The avatar is a sprite sheet: one horizontal strip of equal-width square frames
that play as a run cycle. The current placeholder lives at
`public/sprites/crafty-run.png`.

To swap in final art, you have two options:

1. **Replace the file** at `public/sprites/crafty-run.png` with the new strip.
   If the new strip has a different number of frames, update `FRAME_COUNT` at the
   top of `src/runner/Avatar.js` to match. Then rebuild.
2. **Swap at runtime** by calling `runner` internals is not needed; the avatar
   exposes `setSheet(url, frameCount)` for a hot swap if you ever want to change
   art without a rebuild.

Frame sizing notes are in `public/placeholder/README.md`. Frames are square and
the sprite is drawn at a fixed world height, so keep new frames square to avoid
stretching.

---

## What's done vs still coming

The build plan has three milestones:

- **M1 (done):** endless procedural temple track, auto-running placeholder
  avatar, square viewport, fog, mobile performance caps. This is what you see now.
- **M2 (in progress):** wiring `items`, `debuffs`, and `dayEvent` to visible
  effects (collectibles passing by, ambient debuff effects, daily flavour spawns).
- **M3 (later):** a few sourced, license-safe 3D hero props (statues, torches)
  dropped into the scene for polish, plus Crafty's finalised sprite art.

The data contract above will not change between milestones, so you can build your
integration against it now.

---

## Project layout (for reference)

```
crafty-dnd-runner/
  index.html              dev page (square viewport)
  package.json            scripts + Three.js dependency
  src/
    main.js               dev entry: builds stub state, calls createCraftyRunner
    runner/
      index.js            createCraftyRunner(): the public entry point
      CraftyRunner.js     scene/camera/renderer, animation loop, resize, dispose
      TrackGenerator.js   endless recycled temple track
      Avatar.js           the auto-running sprite avatar (art swap point)
      Background.js        distant scenery
      Props.js            decorative prop slots
      Particles.js         ambient particle effects
      state.js            THE data contract + data-to-visual mapping
      util.js             small helpers
  public/
    textures/             environment textures (served at /textures/)
    sprites/              avatar sprite sheets (served at /sprites/)
    placeholder/          sprite frame-size notes
```

`CLAUDE.md` in this folder has deeper notes on how the track generation and
texture loading work internally, if you want to dig in.

---

## Questions

The single integration surface is: call `createCraftyRunner({ container,
getState })`, keep returning fresh recovery data from `getState`, and serve the
`/textures` and `/sprites` assets. Everything else is internal. If a level change
should look or feel different, that is all tuned in `src/runner/state.js`.
