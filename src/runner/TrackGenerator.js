import * as THREE from 'three';
import { createSegment, dressSegment, SEGMENT_LENGTH } from './trackBuilders.js';
import { torchSheet, TORCH_COLS, TORCH_FPS } from './trackTextures.js';
import { tintJunctions } from './junction.js';

// Re-exported so the game's Turn system can arm/disarm a segment's junction
// overlay without importing the builder modules directly.
export { armJunction, disarmJunction } from './junction.js';

const _tintColor = new THREE.Color();

// Endless temple track using the "leapfrog pooling" pattern (borrowed from
// cave-runner, MIT). A fixed pool of segments exists permanently. Each frame all
// segments advance toward the camera; when a segment passes the recycle line
// (behind the camera) it teleports back to the far end and is re-dressed. There
// is no per-frame create or destroy, so draw calls stay stable and there is no
// garbage-collection stutter.

const SEGMENT_COUNT = 4; // pooled segments (total covered depth = 80)
const RECYCLE_Z = 14; // once a segment passes this z (behind camera), recycle it

export class TrackGenerator {
  // `parent` is the scene in AMBIENT, or the rotatable worldGroup in game mode (so
  // the whole corridor can swing through a 90-degree turn). It just receives the
  // pooled segments.
  constructor(parent) {
    this.segments = [];
    this.totalLength = SEGMENT_LENGTH * SEGMENT_COUNT;
    this.biomeIndex = -1;
    // Fired when a segment recycles, so game-item managers (cans, obstacles, turns)
    // can re-dress their per-segment pools in lockstep with the track.
    this.recycleListeners = [];

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = createSegment();
      // Lay segments out ahead of the camera, into -z.
      seg.position.z = RECYCLE_Z - (i + 1) * SEGMENT_LENGTH;
      dressSegment(seg);
      this.segments.push(seg);
      parent.add(seg);
    }
  }

  addRecycleListener(fn) {
    this.recycleListeners.push(fn);
  }

  // distance is speed * delta for this frame (world units to advance). elapsed
  // is total seconds, used to drive the shared torch flame animation.
  update(distance, elapsed = 0) {
    for (const seg of this.segments) {
      seg.position.z += distance;
      if (seg.position.z > RECYCLE_Z) {
        // Leapfrog: keep uniform spacing by stepping back one full pool length.
        seg.position.z -= this.totalLength;
        dressSegment(seg);
        for (const fn of this.recycleListeners) fn(seg);
      }
    }
    // Advance the shared torch sprite sheet (all sconces flicker in unison).
    const frame = Math.floor(elapsed * TORCH_FPS) % TORCH_COLS;
    torchSheet.offset.x = frame / TORCH_COLS;
  }

  // Re-lay the whole pool straight ahead and re-dress it. Used after a 90-degree
  // turn to rebase the corridor down the new direction. Fires recycle listeners so
  // item pools re-dress too.
  relayoutStraight() {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.position.z = RECYCLE_Z - (i + 1) * SEGMENT_LENGTH;
      dressSegment(seg);
      for (const fn of this.recycleListeners) fn(seg);
    }
  }

  // Tint the corridor's structural surfaces (and the shared junction surfaces) for a
  // game biome: a multiplier over each material's base colour, so Temple's white
  // multiplier restores the original look exactly. Separate from setBiome (which
  // toggles the ambient side-floors); only a game biome CHANGE calls this.
  setBiomeTint(biome) {
    const tint = _tintColor.set(biome.palette.surfaceTint);
    for (const seg of this.segments) {
      const targets = seg.userData.tintTargets;
      if (!targets) continue;
      for (const t of targets) t.mat.color.copy(t.base).multiply(tint);
    }
    tintJunctions(tint);
  }

  setBiome(geomIndex = 0) {
    if (geomIndex === this.biomeIndex) return;
    this.biomeIndex = geomIndex;
    const showSnow = geomIndex === 0;
    const showForestGround = geomIndex === 1;
    const showDesertGround = geomIndex === 2;
    for (const seg of this.segments) {
      for (const snow of seg.userData.snowEdges) {
        snow.visible = showSnow;
      }
      for (const ground of seg.userData.forestGroundEdges) {
        ground.visible = showForestGround;
      }
      for (const sand of seg.userData.desertGroundEdges) {
        sand.visible = showDesertGround;
      }
    }
  }
}
