import * as THREE from 'three';

// Crafty's avatar: a 2D sprite billboard (a Sprite always faces the camera) with
// a tiny animation state machine. Each state maps to a horizontal run-cycle sheet.
//
// Until dedicated art is supplied, every state reuses the run sheet; the visible
// feedback for jump/slide/strafe comes from Player driving position + squash. Drop
// in real art later with setStateSheet('jump', '/sprites/crafty-jump.png', 6, 12, false).

const GROUND_Y = 0; // top surface of the track floor
// Sprite world height in units (frames are square). Kept fairly small so the
// avatar doesn't occlude oncoming overhead beams / obstacles. GAME.GROUND_Y in
// GameState.js must stay equal to RUN_HEIGHT / 2 (the standing centre height).
const RUN_HEIGHT = 1.4;

const RUN = { url: '/sprites/crafty-run.png', frames: 9, fps: 12, loop: true };
// All states default to the run sheet; replace per-state via setStateSheet().
const DEFAULT_STATES = {
  run: RUN,
  strafeLeft: RUN,
  strafeRight: RUN,
  jump: RUN,
  slide: RUN,
  hit: RUN,
  death: RUN,
};

export class Avatar {
  constructor() {
    this.height = RUN_HEIGHT;
    this.states = {};
    for (const [name, cfg] of Object.entries(DEFAULT_STATES)) this.states[name] = { ...cfg };
    this.textures = {}; // cached by url so states sharing a sheet share one texture
    this.state = 'run';
    this._stateStart = 0;

    this.texture = this._textureFor('run');
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.baseY = GROUND_Y + RUN_HEIGHT * 0.5; // 0.85: centre when standing, feet at 0
    this.sprite.scale.set(RUN_HEIGHT, RUN_HEIGHT, 1);
    this.sprite.position.set(0, this.baseY, 0);
  }

  get object3d() {
    return this.sprite;
  }

  // Position the billboard. scaleY < 1 squashes it (slide); Player computes the
  // logical centre (x, y) so the feet stay grounded.
  setTransform(x, y, scaleY = 1) {
    this.sprite.position.x = x;
    this.sprite.position.y = y;
    this.sprite.scale.set(RUN_HEIGHT, RUN_HEIGHT * scaleY, 1);
  }

  // Register art for one animation state (call when Crafty's sprites are supplied).
  setStateSheet(name, url, frames, fps = 12, loop = true) {
    this.states[name] = { url, frames, fps, loop };
    if (name === this.state) this._applyTexture(name);
  }

  // Back-compat alias used by the embed docs: swap the forward run sheet.
  setSheet(url, frameCount) {
    this.setStateSheet('run', url, frameCount);
  }

  // elapsed: total seconds. state: which animation to play (defaults to run, so the
  // passive AMBIENT call `update(elapsed)` behaves exactly as before).
  update(elapsed, state = 'run') {
    if (state !== this.state && this.states[state]) {
      this.state = state;
      this._stateStart = elapsed;
      this._applyTexture(state);
    }
    const cfg = this.states[this.state];
    if (!this.texture) return;
    const frame = cfg.loop
      ? Math.floor(elapsed * cfg.fps) % cfg.frames
      : Math.min(cfg.frames - 1, Math.floor((elapsed - this._stateStart) * cfg.fps));
    this.texture.offset.x = frame / cfg.frames;
  }

  _applyTexture(name) {
    this.texture = this._textureFor(name);
    this.sprite.material.map = this.texture;
    this.sprite.material.needsUpdate = true;
  }

  _textureFor(name) {
    const cfg = this.states[name];
    if (this.textures[cfg.url]) return this.textures[cfg.url];
    const tex = new THREE.TextureLoader().load(cfg.url);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Nearest filtering keeps the pixel art crisp when scaled onto the billboard.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    // Window the texture to a single frame; offset.x is advanced in update().
    tex.repeat.set(1 / cfg.frames, 1);
    tex.offset.set(0, 0);
    this.textures[cfg.url] = tex;
    return tex;
  }
}
