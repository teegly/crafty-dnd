import * as THREE from 'three';
import { pickRandom, randRange } from './util.js';
import { createPlaceholderProp } from './Props.js';
import { getBiome, biomeIconMaterial } from './Biomes.js';

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
const floorTexture = textureLoader.load('/textures/floor-texture.png');
floorTexture.colorSpace = THREE.SRGBColorSpace;
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(1, 3.35);
floorTexture.magFilter = THREE.LinearFilter;
floorTexture.minFilter = THREE.LinearMipmapLinearFilter;
floorTexture.anisotropy = 8; // sharpen the receding floor; stops blur/shimmer in motion

const wallTexture = textureLoader.load('/textures/mossy-stone-wall.png');
wallTexture.colorSpace = THREE.SRGBColorSpace;
wallTexture.wrapS = THREE.RepeatWrapping;
wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.magFilter = THREE.LinearFilter;
wallTexture.minFilter = THREE.LinearMipmapLinearFilter;
wallTexture.anisotropy = 8;

const woodTexture = textureLoader.load('/textures/wood-texture.png');
woodTexture.colorSpace = THREE.SRGBColorSpace;
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.magFilter = THREE.LinearFilter;
woodTexture.minFilter = THREE.LinearMipmapLinearFilter;
woodTexture.anisotropy = 8;

// Seamless packed-bookshelf texture for the wall behind the standing books.
const booksBackTexture = textureLoader.load('/textures/book-textures.png');
booksBackTexture.colorSpace = THREE.SRGBColorSpace;
booksBackTexture.wrapS = THREE.RepeatWrapping;
booksBackTexture.wrapT = THREE.RepeatWrapping;
booksBackTexture.magFilter = THREE.LinearFilter;
booksBackTexture.minFilter = THREE.LinearMipmapLinearFilter;

// Sprite sheet of individual book spines, sliced into an 8x3 grid so each
// standing book can show a distinct spine.
const SPINE_COLS = 8;
const SPINE_ROWS = 3;
const spineSheet = textureLoader.load('/textures/book-spines.png');
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
    spineMaterials.push(new THREE.MeshStandardMaterial({ map: slice, roughness: 0.8, alphaTest: 0.5 }));
  }
}

// Opaque leather-book materials sampled from different patches of the packed
// books texture. Used for floor stacks and fallen books, which show a flat face
// (so they stay opaque, unlike the alpha-clipped standing spines).
const bookCoverMaterials = [
  [0.0, 0.0], [0.4, 0.22], [0.18, 0.52], [0.58, 0.4], [0.08, 0.74], [0.62, 0.06],
].map(([offsetX, offsetY]) => {
  const map = booksBackTexture.clone();
  map.needsUpdate = true;
  map.repeat.set(0.32, 0.32);
  map.offset.set(offsetX, offsetY);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.82 });
});

const vineTextures = Array.from({ length: 13 }, (_, index) => {
  const texture = textureLoader.load(`/textures/vines/vine-${String(index).padStart(2, '0')}.png`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
});

// --- Junction (90° turn) assets -------------------------------------------------
// Shared materials + an arrow cue, used by the per-segment junction overlay that a
// turn arms. The crossroads floor is wide in X so that after the worldGroup swings
// ±90° the chosen arm becomes the corridor straight ahead.
// The side roads extend well past the corridor's point lights, so the junction
// surfaces are given a gentle emissive lift to stay readable as open roads.
const junctionFloorMat = new THREE.MeshStandardMaterial({
  map: makeRepeatedTexture(floorTexture, 5, 5),
  color: 0xb0b184,
  roughness: 0.98,
  emissive: 0x3c4026,
  emissiveIntensity: 0.55,
});
const junctionWallMat = new THREE.MeshStandardMaterial({
  map: makeRepeatedTexture(wallTexture, 2.2, 1.3),
  color: 0x9a967b,
  roughness: 0.98,
  emissive: 0x2a2c1c,
  emissiveIntensity: 0.45,
});
const junctionRailMat = new THREE.MeshStandardMaterial({
  map: makeRepeatedTexture(wallTexture, 3, 1),
  color: 0x6f7058,
  roughness: 1,
  emissive: 0x2a2c1c,
  emissiveIntensity: 0.5,
});

// Shared junction materials tinted per biome by a surfaceTint multiplier (base
// colours captured once so Temple's white multiplier restores them exactly).
const junctionTintTargets = [junctionFloorMat, junctionWallMat, junctionRailMat].map(
  (mat) => ({ mat, base: mat.color.clone() })
);
const arrowMat = new THREE.MeshBasicMaterial({
  map: makeArrowTexture(),
  transparent: true,
  alphaTest: 0.3,
  color: 0x9dff8c,
  fog: false,
  side: THREE.DoubleSide,
});

// Side decoration groups hidden while a junction is armed, so the side fences/walls
// end and the crossroads reads as open roads left and right.
const JUNCTION_HIDE_GROUPS = ['wallSets', 'shelves', 'bookStacks', 'banners', 'lanterns', 'archways', 'vineCurtains', 'pillars', 'rails'];

// Library/temple-flavoured decoration hidden in non-temple biomes so each biome
// reads cleanly (the structural walls/rails/arches stay, tinted). Set by setBiome.
const TEMPLE_ONLY_GROUPS = ['shelves', 'bookStacks', 'banners', 'lanterns', 'vineCurtains'];
let currentBiomeId = 'temple';

// Reveal a segment's junction overlay with the given open exits, and clear the
// segment's normal decoration so the crossroads reads cleanly. `labels` (optional,
// { left:biomeId, right:biomeId }) shows each open arm's destination biome via an
// icon + tints its arrow to the biome accent.
export function armJunction(seg, exits, labels = null) {
  const j = seg.userData.junction;
  if (!j) return;
  j.visible = true;
  for (const side of ['left', 'right']) {
    const arm = j.userData.arms[side];
    arm.visible = !!exits[side];
    const biomeId = labels && labels[side];
    if (arm.visible && biomeId) {
      const biome = getBiome(biomeId);
      arm.userData.icon.material = biomeIconMaterial(biome);
      arm.userData.icon.visible = true;
      arm.userData.arrow.material.color.set(biome.accent);
    } else {
      arm.userData.icon.visible = false;
    }
  }
  for (const key of JUNCTION_HIDE_GROUPS) {
    const arr = seg.userData[key];
    if (arr) for (const o of arr) o.visible = false;
  }
  if (seg.userData.prop) seg.userData.prop.visible = false;
}

export function disarmJunction(seg) {
  const j = seg.userData.junction;
  if (j) j.visible = false;
}

export class TrackGenerator {
  // `parent` is the rotatable worldGroup (so the whole corridor can swing
  // through a 90° turn), not the scene directly.
  constructor(parent) {
    this.segments = [];
    this.totalLength = SEGMENT_LENGTH * SEGMENT_COUNT;
    // Listeners fired when a segment recycles, so game-item managers (cans,
    // obstacles) can re-dress their per-segment pools in lockstep with the track.
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

  // distance is speed * delta for this frame (world units to advance).
  update(distance) {
    for (const seg of this.segments) {
      seg.position.z += distance;
      if (seg.position.z > RECYCLE_Z) {
        // Leapfrog: keep uniform spacing by stepping back one full pool length.
        seg.position.z -= this.totalLength;
        dressSegment(seg);
        for (const fn of this.recycleListeners) fn(seg);
      }
    }
  }

  // Re-lay the whole pool straight ahead and re-dress it. Used after a 90° turn
  // (Phase 5) to rebase the corridor down the new direction; also handy to reset
  // to a clean run start. Fires recycle listeners so item pools re-dress too.
  relayoutStraight() {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.position.z = RECYCLE_Z - (i + 1) * SEGMENT_LENGTH;
      dressSegment(seg);
      for (const fn of this.recycleListeners) fn(seg);
    }
  }

  // Tint the corridor's structural surfaces (floor/wall/cap/rail/pillar + the shared
  // junction surfaces) for the given biome. A multiplier over each material's base
  // colour, so Temple's white multiplier restores the original look exactly. Only a
  // biome CHANGE calls this; recycles within a biome keep their tint for free.
  setBiome(biome) {
    currentBiomeId = biome.id;
    const tint = _tintColor.set(biome.palette.surfaceTint);
    for (const seg of this.segments) {
      const targets = seg.userData.tintTargets;
      if (!targets) continue;
      for (const t of targets) t.mat.color.copy(t.base).multiply(tint);
    }
    for (const t of junctionTintTargets) t.mat.color.copy(t.base).multiply(tint);
  }
}

const _tintColor = new THREE.Color();

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
  const crackMat = new THREE.MeshBasicMaterial({ color: 0x3a431f, fog: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4d6427, roughness: 1 });
  group.userData.floorDetails = createFloorDetails(group, crackMat, leafMat);

  group.userData.rails = [];
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, SEGMENT_LENGTH),
      railMat
    );
    rail.position.set(side * (TRACK_WIDTH / 2 - 0.2), 0.3, 0);
    group.add(rail);
    group.userData.rails.push(rail); // hidden at a junction so the side opens up
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
  const booksBackMat = new THREE.MeshStandardMaterial({
    map: makeRepeatedTexture(booksBackTexture, 1, 1),
    roughness: 0.85,
  });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x6c7a31, roughness: 1, emissive: 0x111800, emissiveIntensity: 0.2 });
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
      const wallSet = createBrokenWallSet(side, z, wallMat, capMat, mossMat, vineMat, candleMat);
      group.add(wallSet);
      group.userData.wallSets.push(wallSet);
    }

    for (let i = 0; i < 3; i++) {
      const shelf = createShelf(side, -SEGMENT_LENGTH / 2 + 2.8 + i * 6.2, shelfMat, vineMat, booksBackMat);
      group.add(shelf);
      group.userData.shelves.push(shelf);
    }

    for (let i = 0; i < 3; i++) {
      const stack = createBookStack(side, -SEGMENT_LENGTH / 2 + 1.6 + i * 6.5, mossMat);
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
    const ceiling = createCeilingFragment(-SEGMENT_LENGTH / 2 + 3 + i * 6.5, beamMat, mossMat);
    group.add(ceiling);
    group.userData.ceiling.push(ceiling);
  }

  for (let i = 0; i < 2; i++) {
    const archway = createArchway(-SEGMENT_LENGTH / 2 + 2.5 + i * 8.5, wallMat, capMat, mossMat, vineMat);
    group.add(archway);
    group.userData.archways.push(archway);
  }

  for (let i = 0; i < 3; i++) {
    const curtain = createVineCurtain(-SEGMENT_LENGTH / 2 + 3.2 + i * 6.1, vineMat, mossMat, vineSpriteMats);
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

  // Hidden junction overlay (crossroads), revealed when a turn is armed. The
  // crossing sits at the segment centre (local z 0) so it reaches the player pivot.
  const junction = createJunction();
  group.add(junction);
  group.userData.junction = junction;

  // Structural surfaces tinted per biome (multiplier over the captured base colour).
  group.userData.tintTargets = [floor.material, wallMat, capMat, railMat, pillarMat].map(
    (mat) => ({ mat, base: mat.color.clone() })
  );

  return group;
}

// An OPEN crossroads: a wide crossing floor with the corridor's side fences ended
// (hidden by armJunction), two side roads (left/right) framed by low rails, a glowing
// arrow on each, and a low marker straight ahead (the biome ends — turn). No tall
// enclosing walls, so it doesn't read as a closed box. Built hidden; after the
// worldGroup swings ±90° the chosen side road faces forward and the track rebases.
function createJunction() {
  const group = new THREE.Group();
  group.visible = false;
  const PERP = 14; // side-road length in X
  const railZ = TRACK_WIDTH / 2 - 0.2; // 2.8: matches the main road rails

  // Wide crossing + perpendicular floor (the side roads' surface).
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH + 2 * PERP, 0.5, TRACK_WIDTH),
    junctionFloorMat
  );
  floor.position.set(0, -0.25, 0);
  group.add(floor);

  // Low biome-end marker straight ahead: the road ends here, so turn. Low enough not
  // to feel like a box; the player turns before reaching it (turns can't fail).
  const endMarker = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.2, 1.5, 0.5), junctionWallMat);
  endMarker.position.set(0, 0.75, -TRACK_WIDTH / 2 - 0.2);
  group.add(endMarker);

  const arms = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    // Low rails framing the side road (running along X over the arm only, leaving the
    // central crossing open). After the swing these become the new road's rails.
    for (const rz of [-railZ, railZ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(PERP, 0.6, 0.4), junctionRailMat);
      rail.position.set(side * (TRACK_WIDTH / 2 + PERP / 2), 0.3, rz);
      arm.add(rail);
    }
    // Glowing arrow cue pointing toward the open side road. Per-arm material clone so
    // each arm's arrow can be tinted to its destination biome independently.
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), arrowMat.clone());
    arrow.position.set(side * 2.5, 1.7, 0);
    if (side < 0) arrow.scale.x = -1; // mirror to point left
    arm.add(arrow);
    // Destination-biome label (set per arming via armJunction); hidden by default.
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), arrowMat.clone());
    icon.position.set(side * 2.5, 3.0, 0);
    icon.visible = false;
    arm.add(icon);
    arm.userData = { arrow, icon };
    arm.visible = false;
    group.add(arm);
    arms[side < 0 ? 'left' : 'right'] = arm;
  }
  group.userData.arms = arms;
  return group;
}

// A right-pointing chevron drawn on transparent canvas (mirrored for left).
function makeArrowTexture() {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.32, s * 0.2);
  ctx.lineTo(s * 0.7, s * 0.5);
  ctx.lineTo(s * 0.32, s * 0.8);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  seg.userData.prop.visible = currentBiomeId === 'temple' && Math.random() < 0.4;

  // In non-temple biomes, hide the library/temple-flavoured clutter so the biome
  // reads cleanly; the structural walls/rails/arches remain (tinted per biome).
  if (currentBiomeId !== 'temple') {
    for (const key of TEMPLE_ONLY_GROUPS) {
      const arr = seg.userData[key];
      if (arr) for (const o of arr) o.visible = false;
    }
  }
}

function createFloorDetails(group, crackMat, leafMat) {
  const details = [];
  for (let i = 0; i < 26; i++) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(randRange(0.22, 0.9), 0.03, 0.035), crackMat);
    crack.position.set(randRange(-2.4, 2.4), 0.035, randRange(-SEGMENT_LENGTH / 2, SEGMENT_LENGTH / 2));
    crack.rotation.y = randRange(-0.75, 0.75);
    group.add(crack);
    details.push(crack);
  }
  for (let i = 0; i < 22; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(randRange(0.08, 0.18), 0.025, randRange(0.12, 0.28)), leafMat);
    leaf.position.set(randRange(-2.8, 2.8), 0.05, randRange(-SEGMENT_LENGTH / 2, SEGMENT_LENGTH / 2));
    leaf.rotation.y = randRange(0, Math.PI);
    group.add(leaf);
    details.push(leaf);
  }
  return details;
}

function createBrokenWallSet(side, z, wallMat, capMat, mossMat, vineMat, candleMat) {
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

  const moss = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.6), mossMat);
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
      pickRandom(bookCoverMaterials)
    );
    fallen.position.set(side * -0.55, -1.22, randRange(-1.2, 1.2));
    fallen.rotation.y = randRange(-0.6, 0.6);
    group.add(fallen);
  }
  return group;
}

function createBookStack(side, z, mossMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.side = side;
  group.position.set(side * randRange(2.45, 3.05), 0.42, z);

  for (let i = 0; i < 5; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(randRange(0.46, 0.72), 0.1, randRange(0.34, 0.58)),
      i === 4 && Math.random() < 0.35 ? mossMat : pickRandom(bookCoverMaterials)
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

function createCeilingFragment(z, beamMat, mossMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.position.set(0, 4.6, z);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 0.36), beamMat);
  beam.rotation.z = randRange(-0.08, 0.08);
  group.add(beam);

  const brokenSlab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 0.8), mossMat);
  brokenSlab.position.set(randRange(-1.4, 1.4), -0.12, randRange(-0.2, 0.2));
  brokenSlab.rotation.y = randRange(-0.15, 0.15);
  group.add(brokenSlab);

  return group;
}

function createArchway(z, wallMat, capMat, mossMat, vineMat) {
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

  const moss = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.2, 0.08, 0.12), mossMat);
  moss.position.set(0, 4.95, 0.08);
  group.add(moss);

  for (let i = 0; i < 9; i++) {
    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, randRange(1.1, 2.6), 5), vineMat);
    vine.position.set(randRange(-2.8, 2.8), randRange(3.4, 4.5), 0.16);
    vine.rotation.z = randRange(-0.2, 0.2);
    group.add(vine);
    group.userData.vines.push(vine);
  }

  return group;
}

function createVineCurtain(z, vineMat, mossMat, vineSpriteMats) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.strands = [];
  group.userData.spriteVines = [];
  group.position.set(0, 4.35, z);

  const mossLine = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.7, 0.12, 0.1), mossMat);
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
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, randRange(0.6, 2.1), 5), vineMat);
    strand.position.set(sideBias * randRange(1.1, 3.2), randRange(-0.45, 0.22), randRange(-0.08, 0.08));
    strand.rotation.z = randRange(-0.18, 0.18);
    group.add(strand);
    group.userData.strands.push(strand);
  }
  for (let i = 0; i < 14; i++) {
    const sideBias = Math.random() < 0.5 ? -1 : 1;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(randRange(0.08, 0.16), randRange(0.08, 0.18), 0.035), mossMat);
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
