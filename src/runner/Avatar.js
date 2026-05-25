import * as THREE from 'three';

// Crafty's avatar: a 2D sprite billboard (a Sprite always faces the camera).
// Plays a horizontal run-cycle sprite sheet by stepping the texture offset over
// time. Swap art by replacing the sheet PNG and updating FRAME_COUNT, or call
// setSheet(url, frameCount).

const GROUND_Y = 0; // top surface of the track floor
const RUN_HEIGHT = 1.7; // sprite world height in units (frames are square)
const RUN_SHEET = '/sprites/crafty-run.png'; // back-view run cycle
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
    this.sprite.scale.set(RUN_HEIGHT, RUN_HEIGHT, 1); // square frames
    this.baseY = GROUND_Y + RUN_HEIGHT * 0.5;
    this.sprite.position.set(0, this.baseY, 0);
  }

  get object3d() {
    return this.sprite;
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
