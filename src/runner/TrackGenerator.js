import * as THREE from 'three';
import { pickRandom, randRange } from './util.js';
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
    new THREE.MeshStandardMaterial({ color: 0x56563e, roughness: 0.95 })
  );
  floor.position.y = -0.25;
  group.add(floor);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3e2b, roughness: 1 });
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x31351f, fog: true });
  const crackMat = new THREE.MeshBasicMaterial({ color: 0x3a431f, fog: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4d6427, roughness: 1 });
  group.userData.floorDetails = createFloorDetails(group, seamMat, crackMat, leafMat);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, SEGMENT_LENGTH),
      railMat
    );
    rail.position.set(side * (TRACK_WIDTH / 2 - 0.2), 0.3, 0);
    group.add(rail);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5f5940, roughness: 0.95 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x45442f, roughness: 1 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.85 });
  const bookMats = [
    new THREE.MeshStandardMaterial({ color: 0x6b3f24, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x21442a, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x6f5b2f, roughness: 0.8 }),
  ];
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x6c7a31, roughness: 1 });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x345624, roughness: 1 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x46341f, roughness: 0.9 });
  const candleMat = new THREE.MeshBasicMaterial({ color: 0xffbf67, fog: true });
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x173b2a, roughness: 0.9 });

  group.userData.wallSets = [];
  group.userData.shelves = [];
  group.userData.ceiling = [];
  group.userData.candles = [];
  group.userData.archways = [];
  group.userData.banners = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -SEGMENT_LENGTH / 2 + 3 + i * 6.2;
      const wallSet = createBrokenWallSet(side, z, wallMat, capMat, mossMat, vineMat, candleMat);
      group.add(wallSet);
      group.userData.wallSets.push(wallSet);
    }

    for (let i = 0; i < 2; i++) {
      const shelf = createShelf(side, -SEGMENT_LENGTH / 2 + 5 + i * 8, shelfMat, bookMats, vineMat);
      group.add(shelf);
      group.userData.shelves.push(shelf);
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

  // Flanking pillars, toggled and resized per segment in dressSegment.
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x7d7860, roughness: 0.8 });
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
    shelf.visible = mode === 'shelf' || Math.random() < 0.35;
    shelf.position.z = shelf.userData.baseZ + randRange(-1.1, 1.1);
    shelf.rotation.y = side * randRange(0.04, 0.12);
  }

  for (const banner of seg.userData.banners) {
    banner.visible = Math.random() < 0.55;
    banner.position.z = banner.userData.baseZ + randRange(-1.5, 1.5);
    banner.scale.y = randRange(0.85, 1.2);
  }

  for (const archway of seg.userData.archways) {
    archway.visible = Math.random() < 0.9;
    archway.position.z = archway.userData.baseZ + randRange(-0.9, 0.9);
    archway.scale.y = randRange(0.85, 1.12);
    for (const vine of archway.userData.vines) {
      vine.visible = Math.random() < 0.75;
      vine.scale.y = randRange(0.7, 1.35);
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

function createFloorDetails(group, seamMat, crackMat, leafMat) {
  const details = [];
  for (let i = 0; i <= 7; i++) {
    const z = -SEGMENT_LENGTH / 2 + i * (SEGMENT_LENGTH / 7);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH - 0.55, 0.025, 0.035), seamMat);
    seam.position.set(0, 0.015, z);
    group.add(seam);
    details.push(seam);
  }
  for (const x of [-1.8, 0, 1.8]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.026, SEGMENT_LENGTH), seamMat);
    seam.position.set(x, 0.018, 0);
    group.add(seam);
    details.push(seam);
  }
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

function createShelf(side, z, shelfMat, bookMats, vineMat) {
  const group = new THREE.Group();
  group.userData.side = side;
  group.userData.baseZ = z;
  group.position.set(side * (TRACK_WIDTH / 2 + 0.52), 1.35, z);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 2.3), shelfMat);
  group.add(back);
  for (let row = 0; row < 3; row++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 2.4), shelfMat);
    shelf.position.y = -0.85 + row * 0.75;
    group.add(shelf);
    for (let b = 0; b < 5; b++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, randRange(0.35, 0.62), 0.18),
        pickRandom(bookMats)
      );
      book.position.set(side * -0.18, shelf.position.y + 0.28, -0.85 + b * 0.38);
      group.add(book);
    }
  }

  const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 2.1, 5), vineMat);
  vine.position.set(side * -0.2, 0.55, randRange(-0.7, 0.7));
  group.add(vine);

  for (let i = 0; i < 3; i++) {
    const fallen = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.06, randRange(0.45, 0.7)),
      pickRandom(bookMats)
    );
    fallen.position.set(side * -0.55, -1.22, randRange(-1.2, 1.2));
    fallen.rotation.y = randRange(-0.6, 0.6);
    group.add(fallen);
  }
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

  for (let i = 0; i < 5; i++) {
    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, randRange(1.1, 2.6), 5), vineMat);
    vine.position.set(randRange(-2.8, 2.8), randRange(3.4, 4.5), 0.16);
    vine.rotation.z = randRange(-0.2, 0.2);
    group.add(vine);
    group.userData.vines.push(vine);
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
