import * as THREE from 'three';
import { pickRandom, randRange, assetUrl } from './util.js';
import { createPlaceholderProp } from './Props.js';

// Endless temple track using the "leapfrog pooling" pattern (borrowed from
// cave-runner, MIT). A fixed pool of segments exists permanently. Each frame all
// segments advance toward the camera; when a segment passes the recycle line
// (behind the camera) it teleports back to the far end and is re-dressed. There
// is no per-frame create or destroy, so draw calls stay stable and there is no
// garbage-collection stutter.

const SEGMENT_LENGTH = 20; // depth (z) of one segment
const SEGMENT_COUNT = 4; // pooled segments (total covered depth = 80)
const TRACK_WIDTH = 6;
const RECYCLE_Z = 14; // once a segment passes this z (behind camera), recycle it
const WALL_X = TRACK_WIDTH / 2 + 0.35;

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
const wallStoneTexture = loadTilingTexture('/assets/textures/shared/wall-stone.png');

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

// Seamless packed-bookshelf texture for the wall behind the standing books.
const booksBackTexture = textureLoader.load(assetUrl('/assets/textures/shared/book-textures.png'));
booksBackTexture.colorSpace = THREE.SRGBColorSpace;
booksBackTexture.wrapS = THREE.RepeatWrapping;
booksBackTexture.wrapT = THREE.RepeatWrapping;
booksBackTexture.magFilter = THREE.LinearFilter;
booksBackTexture.minFilter = THREE.LinearMipmapLinearFilter;

// Sprite sheet of individual book spines, sliced into an 8x3 grid so each
// standing book can show a distinct spine.
const SPINE_COLS = 8;
const SPINE_ROWS = 3;
const spineSheet = textureLoader.load(assetUrl('/assets/textures/shared/book-spines.png'));
spineSheet.colorSpace = THREE.SRGBColorSpace;
const spineMaterials = [];
for (let row = 0; row < SPINE_ROWS; row++) {
  for (let col = 0; col < SPINE_COLS; col++) {
    const slice = spineSheet.clone();
    slice.needsUpdate = true;
    slice.generateMipmaps = false;
    slice.magFilter = THREE.LinearFilter;
    slice.minFilter = THREE.LinearFilter;
    slice.repeat.set(1 / SPINE_COLS, 1 / SPINE_ROWS);
    // Texture v runs bottom-up, so row 0 (top of the sheet) sits at the top.
    slice.offset.set(col / SPINE_COLS, 1 - (row + 1) / SPINE_ROWS);
    spineMaterials.push(new THREE.MeshStandardMaterial({ map: slice, roughness: 0.8, alphaTest: 0.5, emissiveMap: slice, emissive: 0xffffff, emissiveIntensity: 0.45 }));
  }
}

// Book cover sprites (5x3 grid on a transparent background) for the top faces
// of floor books. The cells are not evenly spaced, so each is sliced by its
// detected pixel bounding box rather than a uniform grid.
const COVER_W = 1536;
const COVER_H = 1024;
const COVER_COLS_PX = [[72, 298], [324, 562], [592, 853], [892, 1149], [1178, 1471]];
const COVER_ROWS_PX = [[51, 316], [351, 617], [653, 909]];
const coverSheet = textureLoader.load(assetUrl('/assets/textures/shared/book-covers.png'));
coverSheet.colorSpace = THREE.SRGBColorSpace;
const coverMaterials = [];
for (const [ry0, ry1] of COVER_ROWS_PX) {
  for (const [cx0, cx1] of COVER_COLS_PX) {
    const slice = coverSheet.clone();
    slice.needsUpdate = true;
    slice.generateMipmaps = false;
    slice.magFilter = THREE.LinearFilter;
    slice.minFilter = THREE.LinearFilter;
    slice.repeat.set((cx1 - cx0) / COVER_W, (ry1 - ry0) / COVER_H);
    slice.offset.set(cx0 / COVER_W, 1 - ry1 / COVER_H); // texture v is bottom-up
    coverMaterials.push(new THREE.MeshStandardMaterial({ map: slice, roughness: 0.78, alphaTest: 0.5 }));
  }
}

// Shared spine-detail material (a patch of the packed-books texture) for the
// thin edges of a flat book, so floor books read as spines from the side.
const bookEdgeTexture = booksBackTexture.clone();
bookEdgeTexture.needsUpdate = true;
bookEdgeTexture.repeat.set(0.6, 0.5);
bookEdgeTexture.offset.set(0.15, 0.3);
const bookEdgeMat = new THREE.MeshStandardMaterial({ map: bookEdgeTexture, roughness: 0.85 });

// Box face order is [+x, -x, +y, -y, +z, -z]; a flat book shows its cover on
// the +y (top) face and spine detail on the rest.
function bookFaceMaterials(coverMat) {
  return [bookEdgeMat, bookEdgeMat, coverMat, bookEdgeMat, bookEdgeMat, bookEdgeMat];
}

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

// Procedural hanging-vine textures. Canvas-drawn so we get a stem-with-leaves
// look rather than the chunky-pixel cards from the old sprite sheet. Each
// variant has a slightly different curve, leaf density, and shade.
function makeVineTexture(seed) {
  // Deterministic per-variant random so each call gives a stable result.
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const W = 32;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Per-variant palette — slight hue and brightness drift across the 8 vines.
  const hue = 100 + Math.floor(rnd() * 24); // 100..124 (deep yellow-green to teal-green)
  const sat = 34 + Math.floor(rnd() * 22);
  const light = 12 + Math.floor(rnd() * 9);
  const outlineColor = `hsl(${hue - 4}, ${sat + 6}%, ${Math.max(6, light - 6)}%)`;
  const stemColor = `hsl(${hue}, ${sat}%, ${light}%)`;
  const leafShadow = `hsl(${hue + 2}, ${sat + 12}%, ${light + 3}%)`;
  const leafColor = `hsl(${hue + 5}, ${sat + 12}%, ${light + 10}%)`;
  const leafHi = `hsl(${hue + 10}, ${sat + 20}%, ${light + 22}%)`;

  // Stem: a wiggly vertical line from top to bottom, ending in a slight curl.
  const cx = W / 2;
  const amp = 6 + rnd() * 6;
  const freq = 1.4 + rnd() * 1.4;
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let lastX = cx, lastY = 0;
  ctx.moveTo(lastX, lastY);
  const steps = 64;
  const stemPath = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = t * H * 0.96;
    const x = cx + Math.sin(t * Math.PI * freq) * amp * (0.4 + 0.6 * t);
    ctx.lineTo(x, y);
    stemPath.push([x, y]);
  }
  ctx.stroke();

  ctx.strokeStyle = stemColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  for (const [x, y] of stemPath) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Leaves along the stem: alternating left/right, small pointed teardrops at
  // high frequency for an ivy-like density rather than blob clusters.
  const leafCount = 14 + Math.floor(rnd() * 8);
  for (let i = 0; i < leafCount; i++) {
    const t = 0.05 + (i / (leafCount - 1)) * 0.9;
    const idx = Math.floor(t * (stemPath.length - 1));
    const [sx, sy] = stemPath[idx];
    const side = i % 2 === 0 ? -1 : 1;
    const lw = 2 + rnd() * 1.8;   // small leaf width
    const lh = 4 + rnd() * 2.2;   // slightly taller than wide
    const angle = side * (0.55 + rnd() * 0.45);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    // Teardrop leaf: pointed tip outward, rounded base at stem. Path goes
    // from the stem-attachment point out to the tip and back.
    ctx.fillStyle = outlineColor;
    ctx.beginPath();
    const tip = side * (lw + lh * 0.6);
    ctx.moveTo(side * -0.3, 0);
    ctx.quadraticCurveTo(side * (lw + 0.9), -lh * 0.72, tip + side * 0.8, 0);
    ctx.quadraticCurveTo(side * (lw + 0.9), lh * 0.72, side * -0.3, 0);
    ctx.fill();

    ctx.fillStyle = leafColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * lw, -lh * 0.6, tip, 0);
    ctx.quadraticCurveTo(side * lw, lh * 0.6, 0, 0);
    ctx.fill();

    // Shadow side: chunky lower pixels keep the leaf from reading as flat.
    ctx.fillStyle = leafShadow;
    ctx.beginPath();
    ctx.moveTo(side * lw * 0.15, 0.25);
    ctx.quadraticCurveTo(side * lw * 0.85, lh * 0.36, tip - side * 0.45, 0.15);
    ctx.quadraticCurveTo(side * lw * 0.55, lh * 0.56, side * lw * 0.1, 0.6);
    ctx.fill();

    // Highlight: a few blocky facets near the upper edge and tip.
    ctx.fillStyle = leafHi;
    ctx.beginPath();
    ctx.moveTo(side * lw * 0.35, -0.35);
    ctx.quadraticCurveTo(side * lw * 0.9, -lh * 0.36, tip - side * 0.75, -0.12);
    ctx.quadraticCurveTo(side * lw * 0.8, -lh * 0.05, side * lw * 0.35, 0.05);
    ctx.fill();

    const px = side * (lw * (0.55 + rnd() * 0.28));
    ctx.fillRect(Math.round(px), Math.round(-lh * 0.24), side, 1);
    if (rnd() > 0.45) {
      ctx.fillRect(Math.round(side * lw * 0.95), Math.round(-lh * 0.06), side, 1);
    }

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tip - side * 0.8, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Terminal bud at the bottom.
  const [bx, by] = stemPath[stemPath.length - 1];
  ctx.fillStyle = outlineColor;
  ctx.beginPath();
  ctx.ellipse(bx, by, 3.4, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = leafColor;
  ctx.beginPath();
  ctx.ellipse(bx, by, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = leafHi;
  ctx.fillRect(Math.round(bx - 1), Math.round(by - 2), 1, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
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

const vineCardMaterials = [];
for (let i = 0; i < 8; i++) {
  vineCardMaterials.push(new THREE.MeshBasicMaterial({
    map: makeVineTexture(i + 1),
    transparent: true,
    alphaTest: 0.3,
    depthWrite: true,
    side: THREE.DoubleSide,
    fog: true,
  }));
}

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

function createSegment() {
  const group = new THREE.Group();

  // Floor tile: mossy flagstone.
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.5, SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({
      map: floorTexture,
      color: 0xb89880,
      roughness: 0.98,
    })
  );
  floor.position.y = -0.25;
  group.add(floor);

  const railTexture = makeRepeatedTexture(wallTexture, 1.4, 5.5);
  const railMat = new THREE.MeshStandardMaterial({ map: railTexture, color: 0x6f7058, roughness: 1 });
  group.userData.floorDetails = createFloorDetails(group);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, SEGMENT_LENGTH),
      railMat
    );
    rail.position.set(side * (TRACK_WIDTH / 2 - 0.2), 0.3, 0);
    group.add(rail);
  }

  group.userData.snowEdges = [];
  group.userData.forestGroundEdges = [];
  const snowMat = new THREE.MeshBasicMaterial({
    map: makeRepeatedTexture(snowTexture, 6.5, 7.0),
    color: 0xffffff,
    transparent: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const forestGroundMat = new THREE.MeshBasicMaterial({
    map: makeRepeatedTexture(forestGroundTexture, 9.5, 7.4),
    color: 0xffffff,
    transparent: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const snowField = new THREE.Mesh(new THREE.PlaneGeometry(11.5, SEGMENT_LENGTH + 3.2), snowMat);
    snowField.rotation.x = -Math.PI / 2;
    snowField.position.set(side * (TRACK_WIDTH / 2 + 5.7), 0.08, 0);
    snowField.visible = false;
    group.add(snowField);
    group.userData.snowEdges.push(snowField);

    const forestGroundField = new THREE.Mesh(new THREE.PlaneGeometry(16.5, SEGMENT_LENGTH + 3.8), forestGroundMat);
    forestGroundField.rotation.x = -Math.PI / 2;
    forestGroundField.position.set(side * (TRACK_WIDTH / 2 + 8.0), -0.42, 0);
    forestGroundField.visible = false;
    group.add(forestGroundField);
    group.userData.forestGroundEdges.push(forestGroundField);
  }

  const wallMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(wallTexture, 1.0, 1.3),
    color: 0x9a967b,
    roughness: 0.98,
  });
  const archColumnMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(columnStoneTexture, 1.0, 3.2),
    color: 0x8a8678,
    roughness: 0.95,
  });
  const archTrimMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(wallBricksTexture, 1.5, 0.8),
    color: 0x7a7566,
    roughness: 0.95,
  });
  const brokenWallArchMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(wallBricksTexture, 1.6, 0.6),
    roughness: 0.95,
  });
  const capMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(wallTexture, 0.75, 0.75),
    color: 0x77745d,
    roughness: 1,
  });
  const shelfMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(woodTexture, 1.2, 1.6),
    color: 0x9a6740,
    roughness: 0.88,
  });
  const booksBackTex = makeRepeatedTexture(booksBackTexture, 1, 1);
  const booksBackMat = new THREE.MeshStandardMaterial({
    map: booksBackTex,
    emissiveMap: booksBackTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.4,
    roughness: 0.85,
  });
  const mossTex = mossTexture.clone();
  mossTex.needsUpdate = true;
  mossTex.repeat.set(3.5, 1);
  const vineMat = new THREE.MeshStandardMaterial({
    map: mossTex,
    emissiveMap: mossTex,
    emissive: 0x10200a,
    emissiveIntensity: 0.18,
    roughness: 1,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(woodTexture, 2.2, 0.55),
    color: 0x8a5833,
    roughness: 0.92,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(woodTexture, 0.75, 0.75),
    color: 0x5b351f,
    roughness: 0.9,
  });
  const candleMat = new THREE.MeshBasicMaterial({ color: 0xffbf67, fog: true });
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x173b2a, roughness: 0.9 });
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffb45f, fog: true });
  group.userData.wallSets = [];
  group.userData.shelves = [];
  group.userData.ceiling = [];
  group.userData.candles = [];
  group.userData.archways = [];
  group.userData.banners = [];
  group.userData.lanterns = [];
  group.userData.bookStacks = [];
  group.userData.vineCurtains = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = -SEGMENT_LENGTH / 2 + 2.2 + i * 5.0;
      const wallSet = createBrokenWallSet(side, z, wallMat, capMat, vineMat, candleMat, brokenWallArchMat);
      group.add(wallSet);
      group.userData.wallSets.push(wallSet);
    }

    for (let i = 0; i < 3; i++) {
      const shelf = createShelf(side, -SEGMENT_LENGTH / 2 + 2.8 + i * 6.2, shelfMat, vineMat, booksBackMat);
      group.add(shelf);
      group.userData.shelves.push(shelf);
    }

    for (let i = 0; i < 3; i++) {
      const stack = createBookStack(side, -SEGMENT_LENGTH / 2 + 1.6 + i * 6.5);
      group.add(stack);
      group.userData.bookStacks.push(stack);
    }

    for (let i = 0; i < 3; i++) {
      const lantern = createLantern(side, -SEGMENT_LENGTH / 2 + 4.5 + i * 5.7, darkWoodMat, lanternMat);
      group.add(lantern);
      group.userData.lanterns.push(lantern);
    }

    const banner = createBanner(side, -SEGMENT_LENGTH / 2 + randRange(4, 15), bannerMat, candleMat);
    group.add(banner);
    group.userData.banners.push(banner);
  }

  for (let i = 0; i < 3; i++) {
    const ceiling = createCeilingFragment(-SEGMENT_LENGTH / 2 + 3 + i * 6.5, beamMat, capMat);
    group.add(ceiling);
    group.userData.ceiling.push(ceiling);
  }

  for (let i = 0; i < 2; i++) {
    const archway = createArchway(-SEGMENT_LENGTH / 2 + 2.5 + i * 8.5, archTrimMat, archTrimMat, vineMat, archColumnMat);
    group.add(archway);
    group.userData.archways.push(archway);
  }

  for (let i = 0; i < 3; i++) {
    const curtain = createVineCurtain(-SEGMENT_LENGTH / 2 + 3.2 + i * 6.1, vineMat);
    group.add(curtain);
    group.userData.vineCurtains.push(curtain);
  }

  // Flanking pillars, toggled and resized per segment in dressSegment.
  const pillarMat = new THREE.MeshStandardMaterial({
    map: pillarSmallStoneTexture,
    roughness: 0.9,
  });
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

function makeRepeatedTexture(source, repeatX, repeatY) {
  const texture = source.clone();
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

// Re-randomise decoration when a segment recycles so the track looks varied.
function dressSegment(seg) {
  const patterns = [
    { left: 'arch', right: 'shelf' },
    { left: 'gap', right: 'arch' },
    { left: 'shelf', right: 'gap' },
    { left: 'wall', right: 'arch' },
  ];
  const pattern = pickRandom(patterns);

  for (const wallSet of seg.userData.wallSets) {
    const side = wallSet.userData.side;
    const mode = side < 0 ? pattern.left : pattern.right;
    dressWallSet(wallSet, mode);
  }

  for (const shelf of seg.userData.shelves) {
    const side = shelf.userData.side;
    const mode = side < 0 ? pattern.left : pattern.right;
    shelf.visible = mode === 'shelf' || Math.random() < 0.72;
    shelf.position.z = shelf.userData.baseZ + randRange(-0.8, 0.8);
    shelf.rotation.y = side * randRange(0.04, 0.12);
  }

  for (const stack of seg.userData.bookStacks) {
    stack.visible = Math.random() < 0.8;
    stack.position.z = stack.userData.baseZ + randRange(-1.1, 1.1);
    stack.rotation.y = randRange(-0.25, 0.25);
  }

  for (const lantern of seg.userData.lanterns) {
    lantern.visible = Math.random() < 0.62;
    lantern.position.z = lantern.userData.baseZ + randRange(-0.8, 0.8);
    lantern.scale.setScalar(randRange(0.72, 0.95));
  }

  for (const banner of seg.userData.banners) {
    banner.visible = Math.random() < 0.55;
    banner.position.z = banner.userData.baseZ + randRange(-1.5, 1.5);
    banner.scale.y = randRange(0.85, 1.2);
  }

  for (const archway of seg.userData.archways) {
    archway.visible = Math.random() < 0.95;
    archway.position.z = archway.userData.baseZ + randRange(-0.9, 0.9);
    archway.scale.y = randRange(0.85, 1.12);
    for (const vine of archway.userData.vines) {
      vine.visible = Math.random() < 0.75;
      vine.scale.y = randRange(0.7, 1.35);
    }
  }

  for (const curtain of seg.userData.vineCurtains) {
    curtain.visible = Math.random() < 0.82;
    curtain.position.z = curtain.userData.baseZ + randRange(-0.75, 0.75);
    for (const sprite of curtain.userData.spriteVines) {
      sprite.visible = Math.random() < 0.88;
      sprite.scale.set(randRange(0.42, 0.72), randRange(1.1, 1.8), 1);
      sprite.position.y = randRange(-0.75, -0.2);
      sprite.rotation.z = randRange(-0.12, 0.12);
    }
    for (const strand of curtain.userData.strands) {
      strand.visible = Math.random() < 0.78;
      strand.scale.y = randRange(0.55, 1.05);
    }
  }

  for (const ceiling of seg.userData.ceiling) {
    ceiling.visible = Math.random() < 0.32;
    ceiling.position.z = ceiling.userData.baseZ + randRange(-1, 1);
    ceiling.rotation.z = randRange(-0.12, 0.12);
    ceiling.scale.x = randRange(0.75, 1.25);
  }

  for (const pillar of seg.userData.pillars) {
    pillar.visible = Math.random() < 0.45;
    const height = randRange(3, 5);
    pillar.scale.y = height / 4;
    pillar.position.y = height / 2;
  }
  seg.userData.prop.visible = Math.random() < 0.4;
}

function createFloorDetails(group) {
  const details = [];
  for (let i = 0; i < 12; i++) {
    const size = randRange(0.26, 0.46);
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(size, size), pickRandom(leafMaterials));
    leaf.rotation.x = -Math.PI / 2; // lie flat on the ground
    leaf.rotation.z = randRange(0, Math.PI * 2); // random facing
    leaf.position.set(randRange(-2.8, 2.8), 0.04, randRange(-SEGMENT_LENGTH / 2, SEGMENT_LENGTH / 2));
    group.add(leaf);
    details.push(leaf);
  }
  return details;
}

// A hanging vine built from two crossed planes (a "billboard cross") so it has
// 3D volume and stays visible from any angle, instead of a flat card.
function makeVineCard(width, height) {
  const group = new THREE.Group();
  const material = pickRandom(vineCardMaterials);
  const planeA = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  const planeB = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  planeB.rotation.y = Math.PI / 2;
  group.add(planeA, planeB);
  return group;
}

function createBrokenWallSet(side, z, wallMat, capMat, vineMat, candleMat, archMat) {
  const group = new THREE.Group();
  group.userData.side = side;
  group.userData.baseZ = z;
  group.position.z = z;

  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 3.5), wallMat);
  lower.position.set(side * WALL_X, 0.95, 0);
  group.add(lower);

  const topLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.75), wallMat);
  topLeft.position.set(side * WALL_X, 2.95, -1.35);
  group.add(topLeft);

  const topRight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.15, 0.75), wallMat);
  topRight.position.set(side * WALL_X, 2.7, 1.35);
  group.add(topRight);

  const archTop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 2.2), archMat);
  archTop.position.set(side * WALL_X, 4.0, 0);
  group.add(archTop);

  const moss = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.6), vineMat);
  moss.position.set(side * (WALL_X - 0.25), 1.65, 0);
  group.add(moss);

  const stoneChips = [];
  for (let i = 0; i < 9; i++) {
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.06, randRange(0.12, 0.35), randRange(0.12, 0.42)), capMat);
    chip.position.set(side * (WALL_X - 0.28), randRange(0.8, 3.9), randRange(-1.6, 1.6));
    group.add(chip);
    stoneChips.push(chip);
  }

  const sconce = new THREE.Group();
  const torchMat = new THREE.SpriteMaterial({
    map: torchSheet,
    transparent: true,
    fog: true,
    depthWrite: false,
  });
  const torch = new THREE.Sprite(torchMat);
  torch.scale.set(0.65, 0.65, 1);
  torch.position.set(side * (WALL_X - 0.35), 2.25, 0.95);
  sconce.add(torch);
  group.add(sconce);

  const vines = [];
  for (let i = 0; i < 3; i++) {
    const vh = randRange(1.2, 2.4);
    const vine = makeVineCard(0.24, vh);
    vine.position.set(side * (WALL_X - 0.3), randRange(2.4, 3.8) - vh / 2, randRange(-1.1, 1.1));
    vine.rotation.z = side * randRange(0.03, 0.12);
    group.add(vine);
    vines.push(vine);
  }

  group.userData.parts = { lower, topLeft, topRight, archTop, moss, vines, stoneChips, sconce };
  return group;
}

function dressWallSet(group, mode) {
  const { lower, topLeft, topRight, archTop, moss, vines, stoneChips, sconce } = group.userData.parts;
  group.visible = mode !== 'gap' || Math.random() < 0.45;
  lower.visible = mode !== 'gap';
  topLeft.visible = mode === 'arch' || mode === 'wall' || Math.random() < 0.45;
  topRight.visible = mode === 'arch' || mode === 'wall' || Math.random() < 0.45;
  archTop.visible = mode === 'arch' || Math.random() < 0.25;
  moss.visible = Math.random() < 0.75;
  for (const vine of vines) {
    vine.visible = Math.random() < 0.65;
    vine.scale.y = randRange(0.7, 1.25);
  }
  for (const chip of stoneChips) {
    chip.visible = mode !== 'gap' && Math.random() < 0.8;
  }
  sconce.visible = mode !== 'gap' && Math.random() < 0.5;
  group.position.z = group.userData.baseZ + randRange(-0.8, 0.8);
  group.scale.y = randRange(0.9, 1.15);
}

function createShelf(side, z, shelfMat, vineMat, booksBackMat) {
  const group = new THREE.Group();
  group.userData.side = side;
  group.userData.baseZ = z;
  group.position.set(side * (TRACK_WIDTH / 2 + 0.42), 1.35, z);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.38, 2.8, 2.8), booksBackMat);
  group.add(back);
  for (let row = 0; row < 4; row++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 2.9), shelfMat);
    shelf.position.y = -1.08 + row * 0.72;
    group.add(shelf);
    for (let b = 0; b < 7; b++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, randRange(0.35, 0.62), 0.18),
        pickRandom(spineMaterials)
      );
      book.position.set(side * -0.2, shelf.position.y + 0.28, -1.12 + b * 0.36);
      group.add(book);
    }
  }

  const vine = makeVineCard(0.24, 2.1);
  vine.position.set(side * -0.2, 0.55, randRange(-0.7, 0.7));
  group.add(vine);

  for (let i = 0; i < 3; i++) {
    const fallen = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.06, randRange(0.45, 0.7)),
      bookFaceMaterials(pickRandom(coverMaterials))
    );
    fallen.position.set(side * -0.55, -1.22, randRange(-1.2, 1.2));
    fallen.rotation.y = randRange(-0.6, 0.6);
    group.add(fallen);
  }
  return group;
}

function createBookStack(side, z) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.side = side;
  group.position.set(side * randRange(2.45, 3.05), 0.42, z);

  for (let i = 0; i < 5; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(randRange(0.46, 0.72), 0.1, randRange(0.34, 0.58)),
      bookFaceMaterials(pickRandom(coverMaterials))
    );
    book.position.y = i * 0.11;
    book.rotation.y = randRange(-0.22, 0.22);
    group.add(book);
  }
  return group;
}

function createLantern(side, z, metalMat, glowMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.side = side;
  group.position.set(side * (WALL_X - 0.28), 2.55, z);

  // Short metal arm so the torch reads as wall-mounted on a bracket.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.45), metalMat);
  arm.position.set(side * -0.18, 0.18, 0);
  group.add(arm);

  // Animated torch sprite (shares the corridor's torchSheet so it flickers in
  // sync with the broken-wall sconces).
  const torchMat = new THREE.SpriteMaterial({
    map: torchSheet,
    transparent: true,
    fog: true,
    depthWrite: false,
  });
  const torch = new THREE.Sprite(torchMat);
  torch.scale.set(0.7, 0.7, 1);
  torch.position.set(side * -0.42, 0.05, 0);
  group.add(torch);

  return group;
}

function createCeilingFragment(z, beamMat, stoneMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.position.set(0, 4.6, z);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 0.36), beamMat);
  beam.rotation.z = randRange(-0.08, 0.08);
  group.add(beam);

  const brokenSlab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 0.8), stoneMat);
  brokenSlab.position.set(randRange(-1.4, 1.4), -0.12, randRange(-0.2, 0.2));
  brokenSlab.rotation.y = randRange(-0.15, 0.15);
  group.add(brokenSlab);

  return group;
}

function createArchway(z, wallMat, capMat, vineMat, columnMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.vines = [];
  group.position.z = z;

  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.85), capMat);
    base.position.set(side * (TRACK_WIDTH / 2 + 0.15), 0.175, 0);
    group.add(base);

    const column = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.0, 0.65), columnMat);
    column.position.set(side * (TRACK_WIDTH / 2 + 0.15), 2.35, 0);
    group.add(column);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.8), capMat);
    cap.position.set(side * (TRACK_WIDTH / 2 + 0.15), 4.6, 0);
    group.add(cap);
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.8, 0.55, 0.62), wallMat);
  lintel.position.set(0, 4.75, 0);
  group.add(lintel);

  for (let i = 0; i < 7; i++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.68), capMat);
    block.position.set(-2.4 + i * 0.8, 4.42 + Math.sin(i / 6 * Math.PI) * 0.62, 0.04);
    block.rotation.z = randRange(-0.06, 0.06);
    group.add(block);
  }

  const moss = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.2, 0.08, 0.12), vineMat);
  moss.position.set(0, 4.95, 0.08);
  group.add(moss);

  for (let i = 0; i < 9; i++) {
    const vh = randRange(1.6, 3.0);
    const vine = makeVineCard(0.6, vh);
    vine.position.set(randRange(-2.8, 2.8), randRange(4.2, 4.7) - vh / 2, 0.16);
    vine.rotation.z = randRange(-0.15, 0.15);
    group.add(vine);
    group.userData.vines.push(vine);
  }

  return group;
}

function createVineCurtain(z, vineMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.strands = [];
  group.userData.spriteVines = [];
  group.position.set(0, 4.35, z);

  const mossLine = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.7, 0.12, 0.1), vineMat);
  mossLine.position.y = 0.35;
  group.add(mossLine);

  for (let i = 0; i < 10; i++) {
    const sideBias = Math.random() < 0.5 ? -1 : 1;
    const sh = randRange(1.2, 2.6);
    const vine = makeVineCard(0.34, sh);
    vine.position.set(sideBias * randRange(1.05, 3.2), 0.22 - sh / 2, randRange(-0.04, 0.14));
    vine.rotation.z = randRange(-0.12, 0.12);
    group.add(vine);
    group.userData.strands.push(vine);
  }

  for (let i = 0; i < 12; i++) {
    const sideBias = Math.random() < 0.5 ? -1 : 1;
    const sh = randRange(0.9, 2.2);
    const strand = makeVineCard(0.4, sh);
    strand.position.set(sideBias * randRange(1.1, 3.2), 0.2 - sh / 2, randRange(-0.08, 0.08));
    strand.rotation.z = randRange(-0.18, 0.18);
    group.add(strand);
    group.userData.strands.push(strand);
  }
  return group;
}

function createBanner(side, z, bannerMat, accentMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.side = side;
  group.position.set(side * (WALL_X - 0.36), 2.9, z);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.9, 0.78), bannerMat);
  group.add(cloth);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.0), accentMat);
  rod.position.y = 1.0;
  group.add(rod);
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.08), accentMat);
  mark.position.set(side * -0.03, 0.1, 0);
  group.add(mark);
  return group;
}
