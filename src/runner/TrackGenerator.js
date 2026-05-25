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
const floorTexture = textureLoader.load(assetUrl('/textures/floor-texture.png'));
floorTexture.colorSpace = THREE.SRGBColorSpace;
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(1, 3.35);
floorTexture.magFilter = THREE.LinearFilter;
floorTexture.minFilter = THREE.LinearMipmapLinearFilter;

const wallTexture = textureLoader.load(assetUrl('/textures/mossy-stone-wall.png'));
wallTexture.colorSpace = THREE.SRGBColorSpace;
wallTexture.wrapS = THREE.RepeatWrapping;
wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.magFilter = THREE.LinearFilter;
wallTexture.minFilter = THREE.LinearMipmapLinearFilter;

const woodTexture = textureLoader.load(assetUrl('/textures/wood-texture.png'));
woodTexture.colorSpace = THREE.SRGBColorSpace;
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.magFilter = THREE.LinearFilter;
woodTexture.minFilter = THREE.LinearMipmapLinearFilter;

// Seamless packed-bookshelf texture for the wall behind the standing books.
const booksBackTexture = textureLoader.load(assetUrl('/textures/book-textures.png'));
booksBackTexture.colorSpace = THREE.SRGBColorSpace;
booksBackTexture.wrapS = THREE.RepeatWrapping;
booksBackTexture.wrapT = THREE.RepeatWrapping;
booksBackTexture.magFilter = THREE.LinearFilter;
booksBackTexture.minFilter = THREE.LinearMipmapLinearFilter;

// Sprite sheet of individual book spines, sliced into an 8x3 grid so each
// standing book can show a distinct spine.
const SPINE_COLS = 8;
const SPINE_ROWS = 3;
const spineSheet = textureLoader.load(assetUrl('/textures/book-spines.png'));
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
const coverSheet = textureLoader.load(assetUrl('/textures/book-covers.png'));
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

const vineTextures = Array.from({ length: 13 }, (_, index) => {
  const texture = textureLoader.load(assetUrl(`/textures/vines/vine-${String(index).padStart(2, '0')}.png`));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
});

// Individual leaf sprites (4x4 grid on a transparent background) for scattered
// floor leaves. Lit (MeshStandard) so they stay subtle in shadow like the floor.
const LEAF_COLS = 4;
const LEAF_ROWS = 4;
const leafSheet = textureLoader.load(assetUrl('/textures/leaf-materials.png'));
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

// New hanging-vine sprite sheet (7x2 grid, transparent) for the ceiling and
// archway vines, replacing the old bare cylinder "sticks".
const VINE_CARD_COLS = 7;
const VINE_CARD_ROWS = 2;
const vineCardSheet = textureLoader.load(assetUrl('/textures/vine-textures.png'));
vineCardSheet.colorSpace = THREE.SRGBColorSpace;
const vineCardMaterials = [];
for (let row = 0; row < VINE_CARD_ROWS; row++) {
  for (let col = 0; col < VINE_CARD_COLS; col++) {
    const slice = vineCardSheet.clone();
    slice.needsUpdate = true;
    slice.generateMipmaps = false;
    slice.magFilter = THREE.LinearFilter;
    slice.minFilter = THREE.LinearFilter;
    slice.repeat.set(1 / VINE_CARD_COLS, 1 / VINE_CARD_ROWS);
    slice.offset.set(col / VINE_CARD_COLS, 1 - (row + 1) / VINE_CARD_ROWS);
    vineCardMaterials.push(new THREE.MeshBasicMaterial({
      map: slice,
      transparent: true,
      alphaTest: 0.55,
      depthWrite: true,
      side: THREE.DoubleSide,
      fog: true,
    }));
  }
}

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

  // Floor tile: mossy flagstone.
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.5, SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({
      map: floorTexture,
      color: 0xb0b184,
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

  const wallMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(wallTexture, 1.0, 1.3),
    color: 0x9a967b,
    roughness: 0.98,
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
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x4c6f2a, roughness: 1, emissive: 0x0d1808, emissiveIntensity: 0.25 });
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
  const vineSpriteMats = vineTextures.map((map) => new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    alphaTest: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0xdceab6,
    fog: true,
  }));

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
      const wallSet = createBrokenWallSet(side, z, wallMat, capMat, vineMat, candleMat);
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
    const archway = createArchway(-SEGMENT_LENGTH / 2 + 2.5 + i * 8.5, wallMat, capMat, vineMat);
    group.add(archway);
    group.userData.archways.push(archway);
  }

  for (let i = 0; i < 3; i++) {
    const curtain = createVineCurtain(-SEGMENT_LENGTH / 2 + 3.2 + i * 6.1, vineMat, vineSpriteMats);
    group.add(curtain);
    group.userData.vineCurtains.push(curtain);
  }

  // Flanking pillars, toggled and resized per segment in dressSegment.
  const pillarMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(wallTexture, 0.9, 1.8),
    color: 0x9a9272,
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

function createBrokenWallSet(side, z, wallMat, capMat, vineMat, candleMat) {
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

  const archTop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 2.2), capMat);
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
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.45), capMat);
  bracket.position.set(side * (WALL_X - 0.28), 2.0, 0.95);
  sconce.add(bracket);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), candleMat);
  flame.position.set(side * (WALL_X - 0.45), 2.15, 0.95);
  flame.scale.y = 1.6;
  sconce.add(flame);
  group.add(sconce);

  const vines = [];
  for (let i = 0; i < 3; i++) {
    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, randRange(1.2, 2.4), 5), vineMat);
    vine.position.set(side * (WALL_X - 0.3), randRange(2.4, 3.8), randRange(-1.1, 1.1));
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

  const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 2.1, 5), vineMat);
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

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.6), metalMat);
  arm.position.set(side * -0.18, 0.18, 0);
  group.add(arm);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.24), metalMat);
  body.position.set(side * -0.44, -0.15, 0);
  group.add(body);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), glowMat);
  glow.position.copy(body.position);
  glow.scale.y = 1.25;
  group.add(glow);
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

function createArchway(z, wallMat, capMat, vineMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.vines = [];
  group.position.z = z;

  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.55), wallMat);
    column.position.set(side * (TRACK_WIDTH / 2 + 0.15), 2.2, 0);
    group.add(column);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.32, 0.7), capMat);
    cap.position.set(side * (TRACK_WIDTH / 2 + 0.15), 4.45, 0);
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

function createVineCurtain(z, vineMat, vineSpriteMats) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.strands = [];
  group.userData.spriteVines = [];
  group.position.set(0, 4.35, z);

  const mossLine = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.7, 0.12, 0.1), vineMat);
  mossLine.position.y = 0.35;
  group.add(mossLine);

  for (let i = 0; i < 8; i++) {
    const sideBias = Math.random() < 0.5 ? -1 : 1;
    const material = pickRandom(vineSpriteMats);
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.9), material);
    sprite.position.set(sideBias * randRange(1.05, 3.2), randRange(-0.75, -0.2), randRange(-0.04, 0.14));
    sprite.scale.set(randRange(0.42, 0.72), randRange(1.1, 1.8), 1);
    sprite.rotation.z = randRange(-0.12, 0.12);
    group.add(sprite);
    group.userData.spriteVines.push(sprite);
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
  for (let i = 0; i < 14; i++) {
    const sideBias = Math.random() < 0.5 ? -1 : 1;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(randRange(0.08, 0.16), randRange(0.08, 0.18), 0.035), vineMat);
    leaf.position.set(sideBias * randRange(1.0, 3.25), randRange(-0.8, 0.3), randRange(-0.1, 0.1));
    leaf.rotation.z = randRange(-0.4, 0.4);
    group.add(leaf);
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
