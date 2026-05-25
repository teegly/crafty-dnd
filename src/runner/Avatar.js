import * as THREE from 'three';
import { sinusoid } from './util.js';

// Crafty's avatar: a 2D sprite billboard (a Sprite always faces the camera).
// For now it uses a procedurally drawn placeholder texture so we need no binary
// asset. When Crafty's real art is ready, call avatar.setTexture(url).
// See public/placeholder/README.md for the expected art format.

const GROUND_Y = 0; // top surface of the track floor
const RUN_HEIGHT = 1.6; // sprite world height in units
const SPRITE_ASPECT = 0.66; // width / height of the art
const BOB_MIN = 0.0; // vertical bob range added to the base height
const BOB_MAX = 0.22;
const BOB_FREQUENCY = 2.4; // bobs per second

export class Avatar {
  constructor() {
    const texture = createPlaceholderTexture();
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(RUN_HEIGHT * SPRITE_ASPECT, RUN_HEIGHT, 1);
    this.baseY = GROUND_Y + RUN_HEIGHT * 0.5;
    this.sprite.position.set(0, this.baseY, 0);
  }

  get object3d() {
    return this.sprite;
  }

  // Swap in Crafty's real art later. A single image maps to one frame.
  // (A sprite-sheet run cycle can be added here in a later pass.)
  setTexture(url) {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.sprite.material.map = tex;
      this.sprite.material.needsUpdate = true;
    });
  }

  update(elapsed) {
    // Vertical run-bob so the static placeholder reads as "running".
    const bob = sinusoid(BOB_FREQUENCY, BOB_MIN, BOB_MAX, 0, elapsed);
    this.sprite.position.y = this.baseY + bob;
  }
}

// Draw a simple tiefling-flavoured runner silhouette on a canvas.
// Purely a placeholder, clearly labelled, replaced by Crafty's art via setTexture.
function createPlaceholderTexture() {
  const w = 256;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const cx = w / 2;

  // Cloak / body.
  ctx.fillStyle = '#5a3b8c';
  ctx.beginPath();
  ctx.moveTo(cx - 60, h - 28);
  ctx.lineTo(cx - 40, 168);
  ctx.quadraticCurveTo(cx, 128, cx + 40, 168);
  ctx.lineTo(cx + 60, h - 28);
  ctx.closePath();
  ctx.fill();

  // Legs.
  ctx.fillStyle = '#3a2a5c';
  ctx.fillRect(cx - 34, h - 96, 24, 70);
  ctx.fillRect(cx + 10, h - 96, 24, 70);

  // Head.
  ctx.fillStyle = '#b06ad6';
  ctx.beginPath();
  ctx.arc(cx, 122, 46, 0, Math.PI * 2);
  ctx.fill();

  // Horns (tiefling nod).
  ctx.fillStyle = '#e8d8a0';
  ctx.beginPath();
  ctx.moveTo(cx - 40, 92);
  ctx.lineTo(cx - 62, 38);
  ctx.lineTo(cx - 20, 86);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 40, 92);
  ctx.lineTo(cx + 62, 38);
  ctx.lineTo(cx + 20, 86);
  ctx.closePath();
  ctx.fill();

  // Glowing eyes.
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(cx - 16, 122, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 16, 122, 6, 0, Math.PI * 2);
  ctx.fill();

  // Label so nobody mistakes this for final art.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PLACEHOLDER', cx, h - 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
