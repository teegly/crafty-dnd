---
name: Crafty DND Runner
slug: crafty-dnd
type: web-server
mode: on-demand
auto_start: false
platforms: [windows]
description: Three.js endless temple-runner — passive ambient visualisation plus a playable lane-runner game (Pepsi cans, enemies, 90° turns).
tags: [threejs, vite, game, runner]

launch:
  windows:
    cwd: .
    command: npm.cmd run dev
    shell: true
    detached: true

health:
  type: http
  url: http://localhost:5173/

last_verified: 2026-05-27
---

# Crafty DND Runner

## What it is

A Three.js + Vite browser app. It runs in two modes: a passive "temple-runner"
ambient visualisation (driven by recovery-data `getState`), and a playable
endless-runner game (lane switching, jump/slide, Pepsi-can collectibles, enemies,
and real 90° turns at junctions, with a score + high score). The game starts from a
**Play** button on the ambient view and expands to widescreen.

## Prerequisites

- Node.js 18+ (built/tested on Node 24).
- One-time: `npm install` (pulls Three.js + Vite).

## How to run (current best way)

```
npm.cmd run dev
```

Then open the URL it prints (default **http://localhost:5173/**). This is the Vite
dev server with live reload — the way visual checks are done. Click **▶ Play** to
start the game; ← → switch lanes, ↑/Space jump, ↓ slide, and ← / → choose a
direction when the junction arrows appear.

## Where logs / state go

- Dev-server output goes to the terminal (no log file).
- High score is stored in the browser under `localStorage['crafty.highScore']`.

## How to stop

Stop the dev server in its terminal (Ctrl-C), or `taskkill /PID <pid> /T /F` for the
spawned `node`/`vite` process.

## Alternative launch modes

- `npm.cmd run build` — production bundle into `dist/` (use to catch syntax/material
  errors; the ">500 kB chunk" warning is expected and benign).
- `npm.cmd run preview` — serve the built `dist/` locally to sanity-check the
  production build.
