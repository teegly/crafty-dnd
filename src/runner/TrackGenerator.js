import * as THREE from 'three';
import { randRange } from './util.js';
import { createPlaceholderProp } from './Props.js';

// Endless temple track using the "leapfrog pooling" pattern (borrowed from
// cave-runner, MIT). A fixed pool of segments exists permanently. Each frame all
// segments advance toward the camera; when a segment passes the recycle line
// (behind the camera) it teleports back to the far end and is re-dressed. There
// is no per-frame create or destroy, so draw calls stay stable and there is no
// garbage-collection stutter.

const SEGMENT_LENGTH = 20; // depth (z) of one segment
const SEGMENT_COUNT = 3; // pooled segments (total covered depth = 60)
const TRACK_WIDTH = 6;
const RECYCLE_Z = 14; // once a segment passes this z (behind camera), recycle it

export class TrackGenerator {
  constructor(scene) {
    this.segments = [];
    this.totalLength = SEGMENT_LENGTH * SEGMENT_COUNT;

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = createSegment();
      // Lay segments out ahead of the camera, into -z.
      seg.position.z = RECYCLE_Z - (i + 1) * SEGMENT_LENGTH;
      dressSegment(seg);
      this.segments.push(seg);
      scene.add(seg);
    }
  }

  // distance is speed * delta for this frame (world units to advance).
  update(distance) {
    for (const seg of this.segments) {
      seg.position.z += distance;
      if (seg.position.z > RECYCLE_Z) {
        // Leapfrog: keep uniform spacing by stepping back one full pool length.
        seg.position.z -= this.totalLength;
        dressSegment(seg);
      }
    }
  }
}

function createSegment() {
  const group = new THREE.Group();

  // Floor tile.
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.5, SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x4a3b66, roughness: 0.95 })
  );
  floor.position.y = -0.25;
  group.add(floor);

  // Side rails.
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2e2547, roughness: 1 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, SEGMENT_LENGTH),
      railMat
    );
    rail.position.set(side * (TRACK_WIDTH / 2 - 0.2), 0.3, 0);
    group.add(rail);
  }

  // Flanking pillars, toggled and resized per segment in dressSegment.
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x6b5a8f, roughness: 0.8 });
  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 4, 8);
  const slots = 2;
  group.userData.pillars = [];
  for (let i = 0; i < slots; i++) {
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      const zLocal = -SEGMENT_LENGTH / 2 + (i + 0.5) * (SEGMENT_LENGTH / slots);
      pillar.position.set(side * (TRACK_WIDTH / 2 + 0.6), 2, zLocal);
      group.add(pillar);
      group.userData.pillars.push(pillar);
    }
  }

  // Hybrid hero-prop slot: an optional temple arch at the far edge of a segment.
  const prop = createPlaceholderProp();
  prop.position.set(0, 0, -SEGMENT_LENGTH / 2);
  group.add(prop);
  group.userData.prop = prop;

  return group;
}

// Re-randomise decoration when a segment recycles so the track looks varied.
function dressSegment(seg) {
  for (const pillar of seg.userData.pillars) {
    pillar.visible = Math.random() < 0.6;
    const height = randRange(3, 5);
    pillar.scale.y = height / 4;
    pillar.position.y = height / 2;
  }
  seg.userData.prop.visible = Math.random() < 0.4;
}
