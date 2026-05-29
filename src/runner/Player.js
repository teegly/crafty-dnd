import { GAME } from './GameState.js';

// The player: logical lane/jump/slide state. The player never moves in Z (the
// world scrolls toward them); they shift between lanes in X, hop in Y, or squash
// to slide. Player owns the avatar's transform + animation each frame.
//
// Clearance for collision (used from Phase 4): `feetY` is how far the feet are off
// the floor (only while jumping); `sliding` lowers the player's top so high
// obstacles pass over. Lanes are mutually exclusive; jump and slide cannot overlap.

export class Player {
  constructor(avatar) {
    this.avatar = avatar;
    this.reset();
  }

  reset() {
    this.laneIndex = 1; // centre lane
    this.x = GAME.LANE_X[1];
    this.y = GAME.GROUND_Y;
    this.jumping = false;
    this.sliding = false;
    this.jumpT = 0;
    this.slideT = 0;
    this.feetY = 0; // feet height above floor (jump clearance)
    this.invulnT = 0; // i-frames: no damage while > 0 (post-hit + start grace)
    this.hurtT = 0; // brief hit-reaction window (drives blink + hit anim)
    this.alive = true;
    this.animState = 'run';
    if (this.avatar) {
      this.avatar.setTransform(this.x, this.y, 1);
      this.avatar.object3d.visible = true;
      this.avatar.state = 'run';
    }
  }

  // Grant temporary invulnerability without the hit reaction (e.g. start grace).
  grantGrace(seconds) {
    this.invulnT = Math.max(this.invulnT, seconds);
  }

  // Took a non-fatal hit: flash + i-frames so the next obstacle can't double-hit.
  hurt() {
    this.invulnT = GAME.INVULN_TIME;
    this.hurtT = 0.4;
  }

  // Discrete intent from Input: 'left' | 'right' | 'jump' | 'slide'.
  input(action) {
    if (action === 'left') this.laneIndex = Math.max(0, this.laneIndex - 1);
    else if (action === 'right') this.laneIndex = Math.min(GAME.LANE_X.length - 1, this.laneIndex + 1);
    else if (action === 'jump') this._startJump();
    else if (action === 'slide') this._startSlide();
  }

  _startJump() {
    if (this.jumping || this.sliding) return;
    this.jumping = true;
    this.jumpT = 0;
  }

  _startSlide() {
    if (this.jumping || this.sliding) return;
    this.sliding = true;
    this.slideT = 0;
  }

  // Currently clearing a LOW obstacle (jumped high enough)?
  get clearsLow() {
    return this.feetY >= GAME.CLEAR_JUMP_Y;
  }

  // Currently ducked under a HIGH obstacle?
  get clearsHigh() {
    return this.sliding;
  }

  update(delta, elapsed) {
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - delta);
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - delta);

    // Horizontal: ease toward the target lane (snappy but smooth).
    const targetX = GAME.LANE_X[this.laneIndex];
    this.x += (targetX - this.x) * Math.min(1, GAME.LANE_LERP * delta);

    // Vertical: jump arc or slide squash (mutually exclusive).
    let scaleY = 1;
    let groundY = GAME.GROUND_Y;
    let jumpOffset = 0;
    if (this.jumping) {
      this.jumpT += delta;
      const t = this.jumpT / GAME.JUMP_DURATION;
      if (t >= 1) this.jumping = false;
      else jumpOffset = GAME.JUMP_HEIGHT * 4 * t * (1 - t); // 0 → peak → 0 parabola
    } else if (this.sliding) {
      this.slideT += delta;
      if (this.slideT >= GAME.SLIDE_DURATION) this.sliding = false;
      else {
        scaleY = GAME.SLIDE_SQUASH;
        groundY = GAME.GROUND_Y * GAME.SLIDE_SQUASH; // keep feet on the floor
      }
    }
    this.y = groundY + jumpOffset;
    this.feetY = jumpOffset;

    // Animation state from current motion (a recent hit overrides it).
    const remaining = targetX - this.x;
    if (this.hurtT > 0) this.animState = 'hit';
    else if (this.jumping) this.animState = 'jump';
    else if (this.sliding) this.animState = 'slide';
    else if (Math.abs(remaining) > 0.05) this.animState = remaining < 0 ? 'strafeLeft' : 'strafeRight';
    else this.animState = 'run';

    this.avatar.setTransform(this.x, this.y, scaleY);
    // Blink only during the brief hit reaction (not the longer i-frame grace).
    this.avatar.object3d.visible = this.hurtT > 0 ? Math.floor(elapsed * 14) % 2 === 0 : true;
    this.avatar.update(elapsed, this.animState);
  }
}
