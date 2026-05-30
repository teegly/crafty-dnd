import * as THREE from 'three';
import { GAME } from './GameState.js';
import { pickRandom } from './util.js';
import { spriteCardMaterial } from './GameBiomes.js';

// Pepsi-can collectibles. Each track segment owns a fixed pool of can meshes
// (built once, toggled on recycle) so there is no per-frame allocation, matching
// the track's leapfrog discipline. Cans ride their segment (children of it), so
// they scroll toward the player and swing with the corridor during a turn.
//
// Collection uses a swept-Z test: the player sits at world z≈0, and a can is
// collected if its travel interval this frame overlaps the player's hit band and
// it shares the player's lane. Swept (not a fixed band) so a frame-rate stutter at
// top speed can't tunnel a can past the player.
//
// Art: a billboard alpha-card showing the pixel-art can sprite. Until the sprite
// loads (or if it 404s) it shows the procedural cola-can texture as a fallback.

const CANS_PER_SEGMENT = 8;
const SEGMENT_LENGTH = 20; // mirrors TrackGenerator's constant
const CAN_Y = 0.7; // float height (coin-like)
const CAN_SLOT_Z = Array.from(
  { length: CANS_PER_SEGMENT },
  (_, i) => -SEGMENT_LENGTH / 2 + 1.25 + i * ((SEGMENT_LENGTH - 2.5) / (CANS_PER_SEGMENT - 1))
);

// A flat card facing the camera (+z). The can sprite is a SQUARE source (the can
// centred with transparent padding), so the plane is square too or it would stretch.
// One shared material across every pooled can so the async load swaps them all.
const canGeometry = new THREE.PlaneGeometry(0.8, 0.8);
const canMaterial = spriteCardMaterial('/assets/sprites/pepsi-can.png', {
  placeholderTexture: makeCanLabelTexture(),
});

export class Collectibles {
  constructor(track, gameState) {
    this.track = track;
    this.gameState = gameState;
    this.active = false;

    for (const seg of track.segments) {
      this._ensurePool(seg);
      hideCans(seg);
    }
    track.addRecycleListener((seg) => this._onRecycle(seg));
  }

  // Begin a run: lay cans across every current segment.
  activate() {
    this.active = true;
    for (const seg of this.track.segments) layoutCans(seg);
  }

  // Return to ambient: hide all cans.
  deactivate() {
    this.active = false;
    for (const seg of this.track.segments) hideCans(seg);
  }

  _ensurePool(seg) {
    if (seg.userData.cans) return;
    const cans = [];
    for (let i = 0; i < CANS_PER_SEGMENT; i++) {
      const can = new THREE.Mesh(canGeometry, canMaterial);
      can.position.set(0, CAN_Y, CAN_SLOT_Z[i]);
      can.userData = { lane: 1, consumed: false, phase: i * 0.8 };
      can.visible = false;
      seg.add(can);
      cans.push(can);
    }
    seg.userData.cans = cans;
  }

  _onRecycle(seg) {
    this._ensurePool(seg);
    if (this.active) layoutCans(seg);
    else hideCans(seg);
  }

  // distance: world units scrolled this frame. delta/elapsed: for spin + bob.
  update(distance, delta, elapsed, player) {
    if (!this.active) return;
    const half = GAME.COLLISION_Z_HALF;
    for (const seg of this.track.segments) {
      const baseZ = seg.position.z;
      for (const can of seg.userData.cans) {
        if (!can.visible || can.userData.consumed) continue;
        can.position.y = CAN_Y + Math.sin(elapsed * 2 + can.userData.phase) * 0.07;

        // Swept overlap of [worldZ - distance, worldZ] with [-half, +half].
        const worldZ = baseZ + can.position.z;
        if (worldZ >= -half && worldZ - distance <= half && can.userData.lane === player.laneIndex) {
          can.userData.consumed = true;
          can.visible = false;
          this.gameState.addCan();
        }
      }
    }
  }
}

// Lay 0–2 short runs of cans in random lanes; hide the rest.
function layoutCans(seg) {
  const cans = seg.userData.cans;
  for (const can of cans) {
    can.visible = false;
    can.userData.consumed = false;
  }
  const runs = pickRandom([0, 0, 1, 1, 2]); // a bit sparser
  for (let r = 0; r < runs; r++) {
    const lane = Math.floor(Math.random() * GAME.LANE_X.length);
    const start = Math.floor(Math.random() * cans.length);
    const len = 2 + Math.floor(Math.random() * 3); // 2–4 cans
    for (let i = 0; i < len && start + i < cans.length; i++) {
      const can = cans[start + i];
      can.visible = true;
      can.userData.consumed = false;
      can.userData.lane = lane;
      can.position.x = GAME.LANE_X[lane];
    }
  }
}

function hideCans(seg) {
  if (!seg.userData.cans) return;
  for (const can of seg.userData.cans) can.visible = false;
}

// A simple cola-can label drawn to a canvas: blue body, white band, red/white
// roundel. Fallback shown until /assets/sprites/pepsi-can.png loads.
function makeCanLabelTexture() {
  const w = 128;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b3aa0'; // deep blue body
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eef2ff'; // white band across the middle
  ctx.fillRect(0, h * 0.42, w, h * 0.20);
  // Two roundels around the can so one is always facing the camera.
  for (const cx of [w * 0.28, w * 0.78]) {
    const r = h * 0.26;
    const cy = h * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e21f2b'; // red top
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#0b3aa0'; // blue bottom
    ctx.fill();
    ctx.strokeStyle = '#eef2ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
