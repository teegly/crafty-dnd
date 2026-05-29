# Biome sprites

Drop art here to replace the generated placeholders. **Every file is optional** — if a
PNG is missing or fails to load, the game falls back to a static placeholder (a labelled
colour card for obstacles/icons, procedural silhouettes for scenery) and never breaks.

- Format: **transparent PNG**, a single static frame (these are 2D alpha cards, not
  animated sheets). Pixel-art friendly (drawn with NearestFilter).
- Folder convention: `public/sprites/biomes/<biome>/<name>.png` (served at
  `/sprites/biomes/<biome>/<name>.png`).
- A sprite is shown as a flat billboard sized to its role's footprint, so draw the
  subject upright, filling the frame, facing the camera.

## Obstacles (the themed hazards) — 9 files, ~256×256

Each biome maps its three obstacles to the three avoidance moves:

| Biome | JUMP over (low) | SLIDE under (high) | DODGE by lane (block) |
|---|---|---|---|
| Hospital | `hospital/scalpel.png` | `hospital/needle.png` | `hospital/doctor.png` |
| Highway | `highway/tree.png` | `highway/building.png` | `highway/car.png` |
| Forest | `forest/mushroom.png` | `forest/fairy.png` | `forest/bug.png` |

(The **Temple** biome keeps its generic 3D barrier/beam/figure and needs no obstacle art.)

Footprint hints: the JUMP obstacle sits low to the ground, the SLIDE obstacle hangs up
high (clear underneath), the DODGE obstacle is a full-height figure.

## Biome icons (junction signposts) — 4 files, ~128–256 px square

Shown on the junction arrow that leads to each biome:

- `temple/icon.png` · `hospital/icon.png` · `highway/icon.png` · `forest/icon.png`

(You can turn back into the temple, so it has an icon too. Fallback = a coloured name chip.)

## Background scenery (optional) — up to 3 per biome

The distant backdrop currently uses procedural silhouettes per biome (buildings for
hospital/highway, conifers for forest). Scenery-sprite support is not wired yet, but these
names are reserved for it: `<biome>/scenery-far.png`, `scenery-mid.png`, `scenery-near.png`
(~256×512 → 256×256). Safe to ignore for now.

## Full checklist

```
public/sprites/biomes/
  hospital/  scalpel.png  needle.png  doctor.png  icon.png
  highway/   tree.png     building.png car.png    icon.png
  forest/    mushroom.png fairy.png    bug.png    icon.png
  temple/    icon.png
```
