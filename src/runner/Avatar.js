import * as THREE from 'three';
import { assetUrl } from './util.js';

// Crafty's avatar: a 2D sprite billboard (a Sprite always faces the camera).
// Plays a horizontal run-cycle sprite sheet by stepping the texture offset over
// time. Swap art by replacing the sheet PNG and updating FRAME_COUNT, or call
// setSheet(url, frameCount).

const GROUND_Y = 0; // top surface of the track floor
const RUN_HEIGHT = 1.7; // sprite world height in units (frames are square)
const RUN_SHEET = assetUrl('/assets/sprites/crafty-run.png'); // back-view run cycle
const FRAME_COUNT = 9; // number of frames in the strip
const FRAME_FPS = 12; // playback speed of the run cycle

export class Avatar {
  constructor() {
    this.frameCount = FRAME_COUNT;
    this.fps = FRAME_FPS;
    this.texture = this._loadSheet(RUN_SHEET, FRAME_COUNT);

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.renderOrder = 12;
    this.sprite.scale.set(RUN_HEIGHT, RUN_HEIGHT, 1); // square frames
    // Sprite art has roughly 15% empty padding at the bottom of each frame.
    // Lower the sprite so the visible boots sit on the floor rather than
    // hovering above it.
    this.baseY = GROUND_Y + RUN_HEIGHT * 0.5 - 0.18;
    this.sprite.position.set(0, this.baseY, 0);

    // Soft shadow under Crafty. Uses a radial-gradient procedural texture so the
    // edges fade out (rather than a hard ellipse cutout which reads as "she's
    // hovering above a black puddle"). Sits just above the floor with depthWrite
    // off so it never occludes anything. Wider than before so it visually
    // extends under her whole body, not just a small disc beneath her feet.
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

  // Swap the run sheet (e.g. when Crafty updates her art).
  setSheet(url, frameCount) {
    this.frameCount = frameCount;
    const tex = this._loadSheet(url, frameCount);
    this.texture = tex;
    this.sprite.material.map = tex;
    this.sprite.material.needsUpdate = true;
  }

  _loadSheet(url, frameCount) {
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Nearest filtering keeps the pixel art crisp when scaled onto the billboard.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    // Window the texture to a single frame; offset.x is advanced in update().
    tex.repeat.set(1 / frameCount, 1);
    tex.offset.set(0, 0);
    return tex;
  }

  update(elapsed) {
    const frame = Math.floor(elapsed * this.fps) % this.frameCount;
    this.texture.offset.x = frame / this.frameCount;
  }
}

// Build a soft radial-gradient shadow texture procedurally so we don't ship a
// PNG just for this. Black at the centre, transparent at the edges.
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
