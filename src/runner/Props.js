import * as THREE from 'three';

// Hybrid hero props. For M1 these are procedural placeholders (a temple arch the
// avatar runs under). In M3, replace the body of createPlaceholderProp with a
// GLTFLoader load of a license-safe model (for example a CC0 statue or torch
// from Quaternius or Kenney). The placement slot in TrackGenerator stays the
// same, so swapping art stays local to this file.
//
// M3 swap point:
//   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//   export function loadHeroProp(url) { return a Promise that resolves a Group }

const ARCH_HALF_SPAN = 2.2;

export function createPlaceholderProp() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a8470,
    roughness: 0.75,
    metalness: 0.1,
  });

  const columnGeo = new THREE.BoxGeometry(0.6, 4.2, 0.6);
  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(columnGeo, mat);
    column.position.set(side * ARCH_HALF_SPAN, 2.1, 0);
    group.add(column);
  }

  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(ARCH_HALF_SPAN * 2 + 0.8, 0.7, 0.8),
    mat
  );
  lintel.position.set(0, 4.35, 0);
  group.add(lintel);

  return group;
}
