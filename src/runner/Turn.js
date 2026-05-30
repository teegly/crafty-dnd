import { GAME } from './GameState.js';
import { armJunction, disarmJunction } from './TrackGenerator.js';
import { pickTwoBiomes } from './GameBiomes.js';

// Real 90° turns.
//
// Approach: the whole corridor lives under a single `worldGroup`. A junction is a
// crossroads overlay armed on a recycled segment; its crossing sits at local z 0,
// so it scrolls to the player pivot (world z 0). When the player commits to an open
// exit, we freeze the scroll and tween `worldGroup.rotation.y` 0 → ±90° about the
// pivot — the chosen arm swings into the forward view. At the end we snap rotation
// back to 0 and `relayoutStraight()` rebases a fresh straight corridor down the new
// direction, so the endless-scroll math never has to understand corners. Missing
// the turn (no choice by the player plane) or steering into a wall crashes the run.
//
// Sign convention (rotation about +Y): left turn = −90° brings the −X (left) arm
// forward; right turn = +90° brings the +X (right) arm forward.

const JUNCTION_INTERVAL = 5; // segments recycled between junctions (running room between turns)
const CROSS_LOCAL_Z = 0; // crossing depth within a segment

export class Turn {
  // hooks: { onCrash, onSwingStart, onComplete }
  constructor(track, worldGroup, gameState, player, hooks = {}) {
    this.track = track;
    this.worldGroup = worldGroup;
    this.gameState = gameState;
    this.player = player;
    this.hooks = hooks;

    this.active = false;
    this.phase = 'none'; // 'none' | 'armed' | 'swinging'
    this.armedSeg = null;
    this.exits = { left: false, right: false };
    this.committedDir = null; // chosen during the window; swing fires at the pivot
    this.sinceJunction = 0;
    this.swing = { t: 0, from: 0, to: 0 };
    this._rebasing = false;

    track.addRecycleListener((seg) => this._onRecycle(seg));
  }

  activate() {
    this.active = true;
    this.phase = 'none';
    this.armedSeg = null;
    this.sinceJunction = 0;
    this.worldGroup.rotation.y = 0;
    // Clear any junction left visible from a previous (crashed) run.
    for (const seg of this.track.segments) {
      disarmJunction(seg);
      seg.userData.isJunction = false;
    }
  }

  deactivate() {
    this.active = false;
    this.phase = 'none';
    this.armedSeg = null;
    this.worldGroup.rotation.y = 0;
    for (const seg of this.track.segments) {
      disarmJunction(seg);
      seg.userData.isJunction = false;
    }
  }

  isSwinging() {
    return this.phase === 'swinging';
  }

  // Only intercept left/right as a turn choice once the junction is within the
  // reaction window. Before that, left/right stay normal lane switches — otherwise
  // lane control would be dead for the whole ~several-second approach.
  isAwaitingChoice() {
    if (this.phase !== 'armed' || !this.armedSeg) return false;
    const crossZ = this.armedSeg.position.z + CROSS_LOCAL_Z;
    return crossZ >= GAME.TURN_WINDOW_OPEN_Z;
  }

  _onRecycle(seg) {
    disarmJunction(seg);
    seg.userData.isJunction = false;
    if (!this.active || this._rebasing) return; // don't arm during a rebase pass
    this.sinceJunction += 1;
    if (this.phase === 'none' && !this.armedSeg && this.sinceJunction >= JUNCTION_INTERVAL) {
      this._arm(seg);
      this.sinceJunction = 0;
    }
  }

  _arm(seg) {
    // Both directions are always open: a junction is a no-fail choice of which new
    // biome to head into, not an obstacle. Each arm leads to a different biome.
    const exits = { left: true, right: true };
    this.exits = exits;
    const two = pickTwoBiomes(this.gameState.currentBiome);
    this.leftBiome = two.left;
    this.rightBiome = two.right;
    this.armedSeg = seg;
    this.committedDir = null;
    this.committedBiome = null;
    seg.userData.isJunction = true;
    armJunction(seg, exits, { left: this.leftBiome, right: this.rightBiome });
    // Clear hazards/cans on the junction segment so the crossroads is clean.
    if (seg.userData.obstacles) for (const o of seg.userData.obstacles) o.visible = false;
    if (seg.userData.cans) for (const c of seg.userData.cans) c.visible = false;
    this.phase = 'armed';
  }

  // Pressed left/right during the choice window. We only RECORD the choice here;
  // the actual swing fires when the crossing reaches the pivot (see update), so the
  // rotation always pivots at the corner rather than sweeping across a wall.
  tryCommit(dir) {
    if (this.phase !== 'armed') return false;
    // Pressing toward a wall is simply ignored (forgiving); you only crash if you
    // reach the pivot without having chosen an open exit (see update).
    if (!this.exits[dir]) return false;
    this.committedDir = dir;
    return true;
  }

  update(delta) {
    if (!this.active) return;

    if (this.phase === 'swinging') {
      this.swing.t += delta;
      const k = Math.min(1, this.swing.t / GAME.TURN_DURATION);
      const e = smoothstep(k);
      this.worldGroup.rotation.y = this.swing.from + (this.swing.to - this.swing.from) * e;
      if (k >= 1) this._finishSwing();
      return;
    }

    if (this.phase === 'armed' && this.armedSeg) {
      const crossZ = this.armedSeg.position.z + CROSS_LOCAL_Z;
      if (crossZ >= GAME.TURN_COMMIT_Z) {
        // Crossing reached the player pivot: turn the chosen way. If the player never
        // chose, auto-turn (toward their current lane side) — turns can't fail.
        const dir = this.committedDir
          || (this.player.laneIndex >= 2 ? 'right' : this.player.laneIndex <= 0 ? 'left' : (Math.random() < 0.5 ? 'left' : 'right'));
        this._startSwing(dir);
      }
    }
  }

  _startSwing(dir) {
    this.phase = 'swinging';
    this.swing.t = 0;
    this.swing.from = this.worldGroup.rotation.y;
    this.swing.to = dir === 'left' ? -Math.PI / 2 : Math.PI / 2;
    this.committedBiome = dir === 'left' ? this.leftBiome : this.rightBiome;
    this.player.laneIndex = 1; // exit the corner centred
    this.hooks.onSwingStart?.();
  }

  _finishSwing() {
    this.worldGroup.rotation.y = 0;
    if (this.armedSeg) this.armedSeg.userData.isJunction = false;
    this.armedSeg = null;
    this.phase = 'none';
    this.sinceJunction = 0;
    // Switch to the chosen biome BEFORE the rebase so the freshly relaid pool (and its
    // re-dressed obstacles/scenery) come up in the new biome.
    if (this.committedBiome) this.hooks.onBiomeChange?.(this.committedBiome);
    // Rebase: re-lay the pool straight down the new direction (re-dresses items too).
    this._rebasing = true;
    this.track.relayoutStraight();
    this._rebasing = false;
    // Fresh road, fresh start: a beat of grace so the newly-built first segment's
    // hazards can't clip the player the instant they round the corner.
    this.player.grantGrace(1.2);
    this.hooks.onComplete?.();
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
