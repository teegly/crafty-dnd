// Runtime game state + the single tuning centre for gameplay feel.
//
// This is internal play state, deliberately separate from state.js (which is the
// external recovery-data contract: { level, items, debuffs, dayEvent } and stays
// untouched). Mirroring the state.js convention, ALL gameplay tuning lives here in
// the GAME block so the render/logic code stays clean.

import { BIOME } from './Biomes.js';

export const MODE = {
  AMBIENT: 'AMBIENT', // the original passive visualisation (no input, no fail)
  PLAYING: 'PLAYING', // active game run
  GAME_OVER: 'GAME_OVER', // run ended, showing the score
};

export const GAME = {
  // --- Lanes (world X). Floor is safe to ~±2.4; rails sit at ±2.8. Lanes are
  // kept fairly central so a lane change is a small, readable step. ---
  LANE_X: [-1.25, 0, 1.25],
  LANE_LERP: 13, // higher = snappier lane changes

  // --- Vertical moves ---
  GROUND_Y: 0.7, // avatar centre at rest (must equal Avatar RUN_HEIGHT / 2)
  JUMP_HEIGHT: 1.5,
  JUMP_DURATION: 0.6,
  SLIDE_DURATION: 0.55,
  SLIDE_SQUASH: 0.55, // sprite scale.y while sliding

  // --- Lives / damage ---
  LIVES: 5,
  INVULN_TIME: 1.1, // i-frames after a non-fatal hit (seconds)

  // --- Run speed (units/sec). Ramps with distance, floored by recovery level. ---
  PLAY_BASE_SPEED: 13,
  PLAY_SPEED_RAMP: 0.012, // +units/sec per world unit travelled
  PLAY_MAX_SPEED: 40,

  // --- Scoring ---
  DIST_POINTS: 1, // points per world unit
  CAN_POINTS: 25, // points per Pepsi can

  // --- Collision (player sits at z≈0) ---
  COLLISION_Z_HALF: 0.7, // half-depth of the player's hit band
  CLEAR_JUMP_Y: 0.7, // player centre above this clears a LOW obstacle
  CLEAR_SLIDE_Y: 1.15, // a HIGH obstacle is cleared while sliding under it

  // --- Turns (Phase 5) ---
  TURN_DURATION: 0.5,
  TURN_WINDOW_OPEN_Z: -14, // junction z at which a left/right press counts as the turn choice
  TURN_COMMIT_Z: 0, // junction z at which the choice locks (crash if none made)

  // Clamp per-frame delta so a tab-switch can't teleport the player through hazards.
  MAX_DELTA: 0.05,
};

const HS_KEY = 'crafty.highScore';

export class GameState {
  constructor() {
    this.mode = MODE.AMBIENT;
    this.highScore = loadHighScore();
    this.reset();
  }

  reset() {
    this.score = 0;
    this.cans = 0;
    this.distance = 0;
    this.lives = GAME.LIVES;
    this.speed = GAME.PLAY_BASE_SPEED;
    this.newHighScore = false;
    this.currentBiome = BIOME.TEMPLE; // every run starts in the temple
  }

  startPlay() {
    this.reset();
    this.mode = MODE.PLAYING;
  }

  endGame() {
    this.mode = MODE.GAME_OVER;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.newHighScore = true;
      saveHighScore(this.score);
    }
  }

  toAmbient() {
    this.mode = MODE.AMBIENT;
  }

  // Recompute the derived score from distance + cans.
  _recomputeScore() {
    this.score = Math.floor(this.distance * GAME.DIST_POINTS) + this.cans * GAME.CAN_POINTS;
  }

  addDistance(d) {
    this.distance += d;
    this._recomputeScore();
  }

  addCan(n = 1) {
    this.cans += n;
    this._recomputeScore();
  }

  // Run speed ramps with distance, but never drops below the recovery-level speed.
  playSpeed(levelSpeed) {
    const ramped = GAME.PLAY_BASE_SPEED + this.distance * GAME.PLAY_SPEED_RAMP;
    this.speed = Math.min(GAME.PLAY_MAX_SPEED, Math.max(levelSpeed, ramped));
    return this.speed;
  }
}

function loadHighScore() {
  try {
    return parseInt(localStorage.getItem(HS_KEY), 10) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    localStorage.setItem(HS_KEY, String(score));
  } catch {
    /* private mode / unavailable — high score just won't persist */
  }
}
