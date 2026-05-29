# Sprites to supply

The game is fully playable with placeholder art today (the character reuses the run
sheet for every animation, Pepsi cans are a procedural can, enemies are simple
figures). Supplying the art below upgrades the look with **no code changes needed** —
the hooks already exist.

## Convention (match the existing `crafty-run.png`)

- **Horizontal strip**, equal-width **square** frames, transparent **PNG**.
- Pixel-art friendly: drawn with `NearestFilter`, no mipmaps.
- Character is **back view** (the camera is behind Crafty). Enemies are **front view**
  (they face the player). Frames are drawn at a fixed world height, so keep them square.
- Drop files in `public/sprites/` (served at `/sprites/...`).

## Character — Crafty (`public/sprites/`)

| File | Frames | Purpose | Priority |
|---|---|---|---|
| `crafty-run.png` *(exists)* | 9 | Forward run cycle | have it |
| `crafty-strafe-left.png` | 3–4 (or 1 lean) | Lean while moving to the left lane | must |
| `crafty-strafe-right.png` | 3–4 (or 1 lean) | Lean while moving to the right lane | must |
| `crafty-jump.png` | 4–6 | Crouch → launch → airborne → land | must |
| `crafty-slide.png` | 3–4 | Duck / slide under high obstacles | must |
| `crafty-hit.png` | 3–4 | Stumble on losing a life | should |
| `crafty-death.png` | 4–6 | Wipeout on game over | should |
| `crafty-turn-left.png` / `-right.png` | 3–4 | Bank into a corner (optional flourish) | nice |
| `crafty-idle.png` / `crafty-cheer.png` | 2–6 | Start screen / new-best celebration | nice |

## Collectibles (`public/sprites/`)

| File | Frames | Purpose | Priority |
|---|---|---|---|
| `pepsi-can.png` | 1, or 6–8 spin strip | The coin/gem collectible (a spin strip glints like a coin) | must |
| `pepsi-can-big.png`, `powerup-*.png` | 1 each | Bonus can, magnet, shield, ×2 multiplier | nice |

## Enemies / obstacles (`public/sprites/`)

| File | View | Frames | Purpose | Priority |
|---|---|---|---|---|
| `enemy-01.png` | front | 4–6 | Lane-blocking enemy you dodge | must |
| `enemy-02.png` (+more) | front | 4–6 | Variety at higher speed | nice |
| `obstacle-low.png` | — | 1 | Low barrier to **jump** | should |
| `obstacle-high.png` | — | 1 | High beam to **slide** under | should |

## Effects + HUD art (optional; the HUD itself is DOM/CSS)

| File | Frames | Purpose |
|---|---|---|
| `fx-collect.png` | 3–4 | Sparkle pop on can pickup |
| `fx-impact.png` | 3–4 | Dust puff on a hit |
| `icon-can.png`, `icon-heart.png`, `logo.png` | 1 each | HUD counter / lives / title |

**Minimum for a great-looking build:** `pepsi-can.png`, `enemy-01.png`,
`crafty-jump.png`, `crafty-slide.png`, `crafty-strafe-left/right.png`.

## How to drop art in

**Character animation states** — `src/runner/Avatar.js` exposes:

```js
avatar.setStateSheet(name, url, frames, fps = 12, loop = true);
// e.g. once at startup:
avatar.setStateSheet('jump',  '/sprites/crafty-jump.png',  6, 14, false);
avatar.setStateSheet('slide', '/sprites/crafty-slide.png', 4, 14, false);
avatar.setStateSheet('strafeLeft',  '/sprites/crafty-strafe-left.png',  4);
avatar.setStateSheet('strafeRight', '/sprites/crafty-strafe-right.png', 4);
avatar.setStateSheet('hit',   '/sprites/crafty-hit.png',   4, 16, false);
avatar.setStateSheet('death', '/sprites/crafty-death.png', 6, 12, false);
```

State names used by the game: `run`, `strafeLeft`, `strafeRight`, `jump`, `slide`,
`hit`, `death`. Use `loop: false` for one-shot states (jump/slide/hit/death) so they
hold the last frame.

**Pepsi cans** — replace the procedural can in `src/runner/Collectibles.js`
(`canGeometry` / `canMaterial`, or swap to a `PlaneGeometry` alpha card pointing at
`/sprites/pepsi-can.png`, the same technique the vines use).

**Enemies** — replace the placeholder figure in `src/runner/Obstacles.js`
(`createObstacleUnit`'s `block` group) with an alpha-card sprite using
`/sprites/enemy-01.png`.
