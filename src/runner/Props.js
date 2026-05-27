import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './util.js';

// Hero prop: the temple arch the avatar runs under, now backed by
// Stone_archway.glb. Native bbox ~ x[-1.84, 1.84], y[0, 4.59]. Per-axis scale
// so we can widen the arch without stretching it taller.
const PROP_MODEL_SCALE = { x: 1.6, y: 1.2, z: 1.2 };

const gltfLoader = new GLTFLoader();
let archwayGltfScene = null;
const pendingArchways = [];
gltfLoader.load(assetUrl('/assets/models/Stone_archway.glb'), (gltf) => {
  archwayGltfScene = gltf.scene;
  for (const group of pendingArchways) {
    attachArchwayModel(group);
  }
  pendingArchways.length = 0;
}, undefined, (error) => {
  console.error('Failed to load archway model', error);
  pendingArchways.length = 0;
});

function attachArchwayModel(group) {
  if (!archwayGltfScene) return;
  const clone = archwayGltfScene.clone(true);
  clone.scale.set(PROP_MODEL_SCALE.x, PROP_MODEL_SCALE.y, PROP_MODEL_SCALE.z);
  clone.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
  group.add(clone);
  group.userData.modelInstance = clone;
}

export function createHeroArchway() {
  const group = new THREE.Group();
  if (archwayGltfScene) {
    attachArchwayModel(group);
  } else {
    pendingArchways.push(group);
  }
  return group;
}

// BACKUP: previous procedural 3-block temple arch. Swap the export above to
// call this function body instead if the GLB version doesn't work out.
// eslint-disable-next-line no-unused-vars
function createHeroArchwayProcedural() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a8470,
    roughness: 0.75,
    metalness: 0.1,
  });

  const ARCH_HALF_SPAN = 2.2;
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
