# Crafty DND Runner

A passive, ambient "temple-runner" visualisation for Crafty's recovery RPG site.
Built with [Three.js](https://threejs.org/) + [Vite](https://vitejs.dev/).

It runs in two modes:

- **Ambient** (the original): the avatar auto-runs forever down an endless
  procedural temple, no input or fail state, reflecting Crafty's recovery progress
  (level, items, debuffs) in a square (1:1) box at `dnd.craftingchaosgaming.com`.
- **Play** (new): a proper endless-runner game. A **Play** button on the ambient
  view starts a run that expands to a widescreen view — switch lanes, jump, slide,
  collect Pepsi cans, dodge enemies, and pick your direction at 90° junctions for a
  high score. On game over you return to the ambient view. The ambient mode and the
  `getState` recovery-data contract are fully preserved.

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

## Playing the game

The game ships inside the same embed — no extra setup. The ambient view shows a
**▶ Play** button; clicking it starts a run.

**Controls**

| Action        | Keyboard            | Touch        |
|---------------|---------------------|--------------|
| Switch lanes  | ← → or A D          | swipe ← / →  |
| Jump          | ↑ / W / Space       | swipe up     |
| Slide         | ↓ / S               | swipe down   |
| Turn at a junction | ← / → (when the arrows show) | swipe ← / → |

**Goal.** Run as far as you can. Score = distance + 25 per Pepsi can. Enemies and
barriers cost a life (3 lives); steering the wrong way at a junction — or missing
the turn — ends the run. The best score is kept in `localStorage`.

All gameplay feel (lane positions, jump height, speed ramp, scoring, lives,
collision, turn timing, junction frequency) is tuned in one place:
`src/runner/GameState.js` (the `GAME` block + `JUNCTION_INTERVAL` in `Turn.js`).

> **Art is placeholder.** The character reuses the run sheet for every animation,
> Pepsi cans are a procedural can, and enemies are simple figures. See
> [`SPRITES.md`](./SPRITES.md) for the list of sprites to supply; the code already
> has the hooks (`Avatar.setStateSheet(...)`) to drop them in.

### Biomes

Runs pass through themed biomes — **Temple** (the start), **Hospital**, **Highway**,
**Forest** — each with its own colour mood, background scenery, and obstacles. At a
junction the two arrows each lead to a different biome (labelled), and turning enters it.
Themed obstacles map to the moves: e.g. Hospital = jump a Scalpel / slide under a Needle /
dodge a Doctor; Highway = Tree / Building / Car; Forest = Mushroom / Fairy / Bug.

Biome art is **sprite-with-fallback**: drop a PNG in the right folder and it appears; if
it's missing, a labelled placeholder card is shown and nothing breaks. The full list +
folder layout is in [`public/sprites/biomes/README.md`](./public/sprites/biomes/README.md).
Biome look/obstacle mapping is defined in `src/runner/Biomes.js`.

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

- **M1 (done):** endless procedural temple track, auto-running placeholder
  avatar, square viewport, fog, mobile performance caps.
- **Game / Play mode (done):** a full endless-runner layered on top of the ambient
  visualisation — lane switching, jump, slide, Pepsi-can collectibles, enemies and
  obstacles, lives, real 90° turns at junctions, score + high score, widescreen
  on play. Ambient mode and the `getState` contract are untouched. Art is still
  placeholder (see [`SPRITES.md`](./SPRITES.md)).
- **Later:** final Crafty sprite art + Pepsi/enemy art, sourced 3D hero props, and
  wiring `items`/`debuffs`/`dayEvent` into the ambient visuals.

The data contract above will not change, so you can build your integration against
it now.

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
      CraftyRunner.js     scene/camera/renderer, animation loop (mode-branched), resize
      TrackGenerator.js   endless recycled temple track + junction overlay
      Avatar.js           the sprite avatar + animation state machine (art swap point)
      Background.js        distant scenery (parented under the rotatable worldGroup)
      Props.js            decorative prop slots
      Particles.js         ambient particle effects
      state.js            THE recovery-data contract + data-to-visual mapping
      GameState.js        runtime game state + the gameplay tuning centre (GAME block)
      Player.js           lane / jump / slide movement, damage, drives the avatar
      Input.js            keyboard + touch-swipe → game actions
      Collectibles.js     pooled Pepsi cans + swept-Z collection
      Obstacles.js        pooled hazards (jump / slide / dodge) + collision
      Turn.js             90° junctions: arm, choice window, swing, rebase, crash
      Hud.js              DOM overlay: start / live HUD / game over / flash
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
