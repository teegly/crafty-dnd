import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { pickRandom, assetUrl } from './util.js';

// GLB prop loaders for the corridor (book stacks, bookshelf, stone pillar).
// Each model loads once at module scope; groups created before a load
// resolves are queued and populated retroactively. Builders enqueue via the
// request* functions exported at the bottom.

// Single GLB load for the floor book stack model. Loaded once at module scope,
// then cloned per stack. Async — stacks built before load resolves get
// populated retroactively via pendingBookStacks below.
//
// Native bbox is ~6 x 2.4 x 3.3 with the origin offset to one side (x from
// -1 to +5). BOOKS_MODEL_BASE_SCALE applies a 2x scale so it fits alongside the
// corridor.
// BOOKS_MODEL_OFFSET recenters the cloned scene at the stack origin.
const BOOKS_MODEL_BASE_SCALE = 2.0;
// Rendered bbox at scale 1 is ~0.4 x 0.137 x 0.381, centered at
// (-0.22, -2.41, 0) in clone-local space. After BASE_SCALE the model's base
// sits at y = -2.48 * BASE_SCALE; offset Y lifts it to the floor. Offset X
// recenters the asymmetric model so the stack appears at the slot position.
const BOOKS_MODEL_OFFSET = new THREE.Vector3(
  +0.22 * BOOKS_MODEL_BASE_SCALE,
  +2.48 * BOOKS_MODEL_BASE_SCALE,
  0
);
// Per-stack tint palette for the GLB cover material. Native is bright red
// (#c53720); these are muted library-shelf tones.
const BOOK_COVER_COLORS = [0x2d4a2b, 0x6a1b1b, 0x1d2b4a, 0x5a3a1f, 0x8a6a1a, 0x4a1a2a, 0x1a4a4a];

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(assetUrl('/assets/draco/'));
gltfLoader.setDRACOLoader(dracoLoader);
let booksGltfScene = null;
const pendingBookStacks = [];
gltfLoader.load(assetUrl('/assets/models/books.glb'), (gltf) => {
  booksGltfScene = gltf.scene;
  for (const stack of pendingBookStacks) {
    attachBooksModelToStack(stack);
  }
  pendingBookStacks.length = 0;
}, undefined, (error) => {
  console.error('Failed to load books model', error);
  pendingBookStacks.length = 0;
});

function attachBooksModelToStack(stack) {
  if (!booksGltfScene) return;
  const clone = booksGltfScene.clone(true);
  clone.position.copy(BOOKS_MODEL_OFFSET);
  clone.scale.setScalar(BOOKS_MODEL_BASE_SCALE);
  const coverColor = pickRandom(BOOK_COVER_COLORS);
  clone.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = false;
      // The GLB has two materials: the larger "cover" mesh (Cube007, 300 verts)
      // is the red cover, the smaller (Cube007_1, 36 verts) is the cream pages.
      // Clone the material so per-stack tinting doesn't bleed across instances.
      if (node.material && node.material.color && node.material.color.getHex() === 0xc53720) {
        node.material = node.material.clone();
        // Faded/aged-leather look: darken via multiplyScalar after setHex.
        node.material.color.setHex(coverColor).multiplyScalar(0.55);
      }
    }
  });
  stack.add(clone);
  stack.userData.modelInstance = clone;
}

const BOOKSHELF_MODEL_SCALE = 1.65;
const BOOKSHELF_MODEL_OFFSET = new THREE.Vector3(0, -1.75, 0);
const BOOKSHELF_ROW_Z_OFFSETS = [-0.72, 0, 0.72];

const STONE_PILLAR_MODEL_SCALE = 0.46;
const STONE_PILLAR_MODEL_OFFSET = new THREE.Vector3(0, -0.76, 0);
let bookshelfGltfScene = null;
let stonePillarGltfScene = null;
const pendingShelves = [];
const pendingStonePillars = [];
gltfLoader.load(assetUrl('/assets/models/Old_Dusty_Bookshelf.glb'), (gltf) => {
  bookshelfGltfScene = gltf.scene;
  for (const shelf of pendingShelves) {
    attachBookshelfModel(shelf);
  }
  pendingShelves.length = 0;
});
gltfLoader.load(assetUrl('/assets/models/stone-pillar.glb'), (gltf) => {
  stonePillarGltfScene = gltf.scene;
  for (const pillar of pendingStonePillars) {
    attachStonePillarModel(pillar);
  }
  pendingStonePillars.length = 0;
});

function attachBookshelfModel(group) {
  if (!bookshelfGltfScene || group.userData.modelInstance) return;
  const row = new THREE.Group();
  for (const zOffset of BOOKSHELF_ROW_Z_OFFSETS) {
    const clone = bookshelfGltfScene.clone(true);
    clone.position.copy(BOOKSHELF_MODEL_OFFSET);
    clone.position.z += zOffset;
    clone.rotation.y = group.userData.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    clone.scale.setScalar(BOOKSHELF_MODEL_SCALE);
    clone.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = false;
        node.receiveShadow = true;
        node.renderOrder = 6;
      }
    });
    row.add(clone);
  }
  group.add(row);
  group.userData.modelInstance = row;
}

function attachStonePillarModel(group) {
  if (!stonePillarGltfScene || group.userData.modelInstance) return;
  const clone = stonePillarGltfScene.clone(true);
  clone.position.copy(STONE_PILLAR_MODEL_OFFSET);
  clone.scale.setScalar(STONE_PILLAR_MODEL_SCALE);
  clone.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = true;
      if (node.material) {
        node.material = node.material.clone();
        node.material.color.multiplyScalar(0.58);
        node.material.roughness = Math.min(1, (node.material.roughness ?? 0.75) + 0.2);
        node.material.metalness = 0;
      }
    }
  });
  group.add(clone);
  group.userData.modelInstance = clone;
  if (group.userData.fallback) {
    group.userData.fallback.visible = false;
  }
}

// Attach the model now if it has loaded, otherwise queue the group so the
// load callback populates it when the GLB resolves.
export function requestBooksModel(group) {
  if (booksGltfScene) attachBooksModelToStack(group);
  else pendingBookStacks.push(group);
}

export function requestBookshelfModel(group) {
  if (bookshelfGltfScene) attachBookshelfModel(group);
  else pendingShelves.push(group);
}

export function requestStonePillarModel(group) {
  if (stonePillarGltfScene) attachStonePillarModel(group);
  else pendingStonePillars.push(group);
}
