import * as THREE from 'three';
import { assetUrl } from './util.js';

// Crafty's avatar: a 2D sprite billboard (a Sprite always faces the camera) with
// a small animation state machine. Each state maps to a horizontal run-cycle
// sheet; until dedicated art exists every state reuses the run sheet, and the
// visible jump/slide/strafe feedback comes from Player driving position + squash.
// AMBIENT mode just calls update(elapsed), which keeps the original run cycle.
// Swap art with setSheet(url, frames) (the outfit toggle) or per-state via
// setStateSheet(name, url, frames, fps, loop).

const GROUND_Y = 0; // top surface of the track floor
const RUN_HEIGHT = 1.7; // sprite world height in units (frames are square)
// ~15% empty padding at the bottom of each frame; lower the sprite by this so
// the visible boots sit on the floor. Shared by the ambient rest pose and the
// game's setTransform so play and ambient line up at the same foot height.
const FOOT_PAD = 0.18;
const RUN = { url: assetUrl('/assets/sprites/crafty-run.png'), frames: 9, fps: 12, loop: true };
// Every state defaults to the run sheet; replace per state via setStateSheet().
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
    this.sprite.renderOrder = 12;
    this.sprite.scale.set(RUN_HEIGHT, RUN_HEIGHT, 1); // square frames
    this.baseY = GROUND_Y + RUN_HEIGHT * 0.5 - FOOT_PAD;
    this.sprite.position.set(0, this.baseY, 0);

    // Soft shadow under Crafty (radial-gradient texture so the edges fade out).
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.5),
      new THREE.MeshBasicMaterial({
        map: makeShadowTexture(),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        fog: false,
      })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, GROUND_Y + 0.02, 0);

    this.group = new THREE.Group();
    this.group.add(this.shadow);
    this.group.add(this.sprite);
  }

  get object3d() {
    return this.group;
  }

  // Position the billboard (game mode). y is the logical standing/jump centre;
  // scaleY < 1 squashes it for a slide. The shadow tracks x but stays on the floor.
  setTransform(x, y, scaleY = 1) {
    this.sprite.position.x = x;
    this.sprite.position.y = y - FOOT_PAD;
    this.sprite.scale.set(RUN_HEIGHT, RUN_HEIGHT * scaleY, 1);
    this.shadow.position.x = x;
  }

  // Register art for one animation state (when Crafty's sprites are supplied).
  setStateSheet(name, url, frames, fps = 12, loop = true) {
    this.states[name] = { url, frames, fps, loop };
    if (name === this.state) this._applyTexture(name);
  }

  // Swap the forward run sheet (used by the outfit toggle and the embed docs).
  setSheet(url, frameCount) {
    this.setStateSheet('run', url, frameCount);
  }

  // elapsed: total seconds. state: which animation to play (defaults to run, so
  // the passive AMBIENT call update(elapsed) behaves exactly as before).
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

// Build a soft radial-gradient shadow texture procedurally. Black centre, fading
// to transparent at the edges.
function makeShadowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.95)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
