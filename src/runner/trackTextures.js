import * as THREE from 'three';
import { assetUrl } from './util.js';

// All corridor textures and materials, loaded once at module scope and
// shared across pooled segments. trackBuilders.js consumes these; the
// TrackGenerator class pulls the torch sheet for its flame animation.

const textureLoader = new THREE.TextureLoader();
const floorTexture = textureLoader.load(assetUrl('/assets/textures/shared/floor-texture-2.png'));
floorTexture.colorSpace = THREE.SRGBColorSpace;
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(1, 3.35);
floorTexture.magFilter = THREE.LinearFilter;
floorTexture.minFilter = THREE.LinearMipmapLinearFilter;

const wallTexture = textureLoader.load(assetUrl('/assets/textures/shared/mossy-stone-wall.png'));
wallTexture.colorSpace = THREE.SRGBColorSpace;
wallTexture.wrapS = THREE.RepeatWrapping;
wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.magFilter = THREE.LinearFilter;
wallTexture.minFilter = THREE.LinearMipmapLinearFilter;

// Animated torch sprite sheet (6 columns x 4 rows, 32px frames). One module
// instance shared by every torch; the texture's UV offset is advanced once per
// frame in update() so all torches flicker in sync.
const TORCH_COLS = 6;
const TORCH_ROWS = 4;
const TORCH_ROW = 1; // which row of the sheet to play (0 = bottom in UV space)
const TORCH_FPS = 10;
const torchSheet = textureLoader.load(assetUrl('/assets/textures/shared/torch-sheet.png'));
torchSheet.colorSpace = THREE.SRGBColorSpace;
torchSheet.magFilter = THREE.NearestFilter;
torchSheet.minFilter = THREE.NearestFilter;
torchSheet.generateMipmaps = false;
torchSheet.repeat.set(1 / TORCH_COLS, 1 / TORCH_ROWS);
torchSheet.offset.set(0, TORCH_ROW / TORCH_ROWS);

function loadTilingTexture(path) {
  const t = textureLoader.load(assetUrl(path));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const columnStoneTexture = loadTilingTexture('/assets/textures/shared/column-stone.png');
const wallBricksTexture = loadTilingTexture('/assets/textures/shared/wall-bricks.png');
const pillarSmallStoneTexture = textureLoader.load(assetUrl('/assets/textures/shared/pillar-small-stone.png'));
pillarSmallStoneTexture.colorSpace = THREE.SRGBColorSpace;
pillarSmallStoneTexture.wrapS = THREE.RepeatWrapping;
pillarSmallStoneTexture.wrapT = THREE.ClampToEdgeWrapping;
pillarSmallStoneTexture.repeat.set(1.45, 1);
pillarSmallStoneTexture.magFilter = THREE.NearestFilter;
pillarSmallStoneTexture.minFilter = THREE.NearestFilter;
pillarSmallStoneTexture.generateMipmaps = false;

const woodTexture = textureLoader.load(assetUrl('/assets/textures/shared/wood-texture.png'));
woodTexture.colorSpace = THREE.SRGBColorSpace;
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.magFilter = THREE.LinearFilter;
woodTexture.minFilter = THREE.LinearMipmapLinearFilter;
// Individual leaf sprites (4x4 grid on a transparent background) for scattered
// floor leaves. Lit (MeshStandard) so they stay subtle in shadow like the floor.
const LEAF_COLS = 4;
const LEAF_ROWS = 4;
const leafSheet = textureLoader.load(assetUrl('/assets/textures/shared/leaf-materials.png'));
leafSheet.colorSpace = THREE.SRGBColorSpace;
const leafMaterials = [];
for (let row = 0; row < LEAF_ROWS; row++) {
  for (let col = 0; col < LEAF_COLS; col++) {
    const slice = leafSheet.clone();
    slice.needsUpdate = true;
    slice.generateMipmaps = false;
    slice.magFilter = THREE.LinearFilter;
    slice.minFilter = THREE.LinearFilter;
    slice.repeat.set(1 / LEAF_COLS, 1 / LEAF_ROWS);
    slice.offset.set(col / LEAF_COLS, 1 - (row + 1) / LEAF_ROWS);
    leafMaterials.push(new THREE.MeshStandardMaterial({
      map: slice,
      transparent: true,
      alphaTest: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 1,
    }));
  }
}
function makePixelMossTexture(seed = 1) {
  let s = seed * 1103515245 + 12345;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const W = 64;
  const H = 16;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#213614';
  ctx.fillRect(0, 0, W, H);
  const colors = ['#385d20', '#4d7a2a', '#6da43b', '#91c85c', '#24441b'];
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * H);
    const w = 1 + Math.floor(rnd() * 5);
    const h = 1 + Math.floor(rnd() * 3);
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(x, y, w, h);
  }
  for (let x = 0; x < W; x += 3) {
    const h = 2 + Math.floor(rnd() * 6);
    ctx.fillStyle = rnd() < 0.5 ? '#6da43b' : '#91c85c';
    ctx.fillRect(x, H - h, 1 + Math.floor(rnd() * 2), h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const mossTexture = makePixelMossTexture(7);

const snowTexture = textureLoader.load(assetUrl('/assets/biomes/winter/snow-pixel.png'));
snowTexture.colorSpace = THREE.SRGBColorSpace;
snowTexture.wrapS = THREE.RepeatWrapping;
snowTexture.wrapT = THREE.RepeatWrapping;
snowTexture.magFilter = THREE.NearestFilter;
snowTexture.minFilter = THREE.NearestFilter;
snowTexture.generateMipmaps = false;

const forestGroundTexture = textureLoader.load(assetUrl('/assets/biomes/forest/forest-ground-pixel.png'));
forestGroundTexture.colorSpace = THREE.SRGBColorSpace;
forestGroundTexture.wrapS = THREE.RepeatWrapping;
forestGroundTexture.wrapT = THREE.RepeatWrapping;
forestGroundTexture.magFilter = THREE.NearestFilter;
forestGroundTexture.minFilter = THREE.NearestFilter;
forestGroundTexture.generateMipmaps = false;

const hangingCreepersTexture = textureLoader.load(assetUrl('/assets/sprites/HangingCreepers.png'));
hangingCreepersTexture.colorSpace = THREE.SRGBColorSpace;
hangingCreepersTexture.magFilter = THREE.NearestFilter;
hangingCreepersTexture.minFilter = THREE.NearestFilter;
hangingCreepersTexture.generateMipmaps = false;
const hangingCreepersMat = new THREE.MeshBasicMaterial({
  map: hangingCreepersTexture,
  transparent: true,
  alphaTest: 0.08,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: true,
});

const loopVineTexture = textureLoader.load(assetUrl('/assets/sprites/LoopVine.png'));
loopVineTexture.colorSpace = THREE.SRGBColorSpace;
loopVineTexture.magFilter = THREE.NearestFilter;
loopVineTexture.minFilter = THREE.NearestFilter;
loopVineTexture.generateMipmaps = false;
const loopVineMat = new THREE.MeshBasicMaterial({
  map: loopVineTexture,
  transparent: true,
  alphaTest: 0.08,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: true,
});

export {
  floorTexture, wallTexture, columnStoneTexture, wallBricksTexture,
  pillarSmallStoneTexture, woodTexture, mossTexture, snowTexture,
  forestGroundTexture, torchSheet, leafMaterials,
  hangingCreepersMat, loopVineMat,
  TORCH_FPS, TORCH_COLS,
};
