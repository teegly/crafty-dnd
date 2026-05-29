import { createSegment, dressSegment, SEGMENT_LENGTH } from './trackBuilders.js';
import { torchSheet, TORCH_COLS, TORCH_FPS } from './trackTextures.js';

// Endless temple track using the "leapfrog pooling" pattern (borrowed from
// cave-runner, MIT). A fixed pool of segments exists permanently. Each frame all
// segments advance toward the camera; when a segment passes the recycle line
// (behind the camera) it teleports back to the far end and is re-dressed. There
// is no per-frame create or destroy, so draw calls stay stable and there is no
// garbage-collection stutter.

const SEGMENT_COUNT = 4; // pooled segments (total covered depth = 80)
const RECYCLE_Z = 14; // once a segment passes this z (behind camera), recycle it

export class TrackGenerator {
  constructor(scene) {
    this.segments = [];
    this.totalLength = SEGMENT_LENGTH * SEGMENT_COUNT;
    this.biomeIndex = -1;

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = createSegment();
      // Lay segments out ahead of the camera, into -z.
      seg.position.z = RECYCLE_Z - (i + 1) * SEGMENT_LENGTH;
      dressSegment(seg);
      this.segments.push(seg);
      scene.add(seg);
    }
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
      }
    }
    // Advance the shared torch sprite sheet (all sconces flicker in unison).
    const frame = Math.floor(elapsed * TORCH_FPS) % TORCH_COLS;
    torchSheet.offset.x = frame / TORCH_COLS;
  }

  setBiome(geomIndex = 0) {
    if (geomIndex === this.biomeIndex) return;
    this.biomeIndex = geomIndex;
    const showSnow = geomIndex === 0;
    const showForestGround = geomIndex === 1;
    for (const seg of this.segments) {
      for (const snow of seg.userData.snowEdges) {
        snow.visible = showSnow;
      }
      for (const ground of seg.userData.forestGroundEdges) {
        ground.visible = showForestGround;
      }
    }
  }
}
