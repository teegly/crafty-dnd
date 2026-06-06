# Refactor Parity Checklist

Run this checklist before and after behavior-preserving refactor passes.

## Build

- `npm run build`
- Expected: build succeeds. The existing large chunk warning may remain until a separate bundle task.

## Preview URLs

- Default mountains: `http://127.0.0.1:5173/crafty-dnd/`
- Forest: `http://127.0.0.1:5173/crafty-dnd/?distance=1800`
- Desert: `http://127.0.0.1:5173/crafty-dnd/?distance=3600`
- Ocean: `http://127.0.0.1:5173/crafty-dnd/?distance=5400`

## URL Modes

- Low quality: `http://127.0.0.1:5173/crafty-dnd/?quality=low`
- Balanced quality: `http://127.0.0.1:5173/crafty-dnd/?quality=balanced`
- High quality: `http://127.0.0.1:5173/crafty-dnd/?quality=high`
- Paused: `http://127.0.0.1:5173/crafty-dnd/?paused=1`
- Portal preview: `http://127.0.0.1:5173/crafty-dnd/?portal=1`
- Gown outfit: `http://127.0.0.1:5173/crafty-dnd/?outfit=gown`

## Interaction Checks

- Travel button starts portal transition and updates `distance`.
- First aid kit toggles the gown outfit and updates `outfit`.
- Backpack opens and closes the inventory.
- Spare underwear triggers the temporary outfit only while gown mode is active.
- Dev panel opens on localhost with the bottom-right toggle.
- Dev panel zoom, look, biome, layer, copy, play, and pause controls still respond.
- Track runs long enough to recycle segments and decorations still vary.

## Viewport Checks

- Desktop viewport keeps the wide runner framed correctly.
- Mobile viewport keeps inventory, travel, and outfit controls inside the runner.
