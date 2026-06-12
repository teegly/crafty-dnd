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
    this.biomeKey = '';

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

  // Show/fade the per-biome side-floor planes. Takes the full resolveBiome()
  // state so the ground crossfades in step with the sky and horizon art during
  // a transition instead of snapping at the midpoint. Ocean (3) has no ground
  // treatment, so its opacity contribution is simply zero.
  setBiome({ geomIndex = 0, fromIndex = geomIndex, toIndex = geomIndex, transition = 0 } = {}) {
    const key = `${geomIndex}|${fromIndex}|${toIndex}|${transition.toFixed(3)}`;
    if (key === this.biomeKey) return;
    this.biomeKey = key;

    const isTransitioning = transition > 0 && fromIndex !== toIndex;
    const opacityFor = (biomeIndex) => {
      if (!isTransitioning) return geomIndex === biomeIndex ? 1 : 0;
      if (fromIndex === biomeIndex) return 1 - transition;
      if (toIndex === biomeIndex) return transition;
      return 0;
    };
    const grounds = [
      { listKey: 'snowEdges', opacity: opacityFor(0) },
      { listKey: 'forestGroundEdges', opacity: opacityFor(1) },
      { listKey: 'desertGroundEdges', opacity: opacityFor(2) },
    ];
    for (const seg of this.segments) {
      for (const { listKey, opacity } of grounds) {
        for (const mesh of seg.userData[listKey]) {
          mesh.material.transparent = opacity > 0 && opacity < 1;
          mesh.material.opacity = opacity;
          mesh.visible = opacity > 0.001;
        }
      }
    }
  }
}
