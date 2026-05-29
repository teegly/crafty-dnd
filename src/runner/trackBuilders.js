import * as THREE from 'three';
import { pickRandom, randRange } from './util.js';
import { createHeroArchway } from './Props.js';
import {
  floorTexture, wallTexture, columnStoneTexture, wallBricksTexture,
  pillarSmallStoneTexture, woodTexture, mossTexture, snowTexture,
  forestGroundTexture, torchSheet, leafMaterials,
  hangingCreepersMat, loopVineMat,
} from './trackTextures.js';
import {
  requestBooksModel, requestBookshelfModel, requestStonePillarModel,
} from './loaders.js';

// Corridor geometry constants (shared by createSegment and the builders).
export const SEGMENT_LENGTH = 20; // depth (z) of one segment
const TRACK_WIDTH = 6;
const WALL_X = TRACK_WIDTH / 2 + 0.35;
const SHELF_Z_SLOTS = [-SEGMENT_LENGTH / 2 + 2.8, -SEGMENT_LENGTH / 2 + 9.0, -SEGMENT_LENGTH / 2 + 15.2];
const SHELF_RAIL_CLEARANCE = 2.3;
const BOOKSHELF_INSET = 0.62;

export function createSegment() {
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
    for (const rail of createSideRailSections(side, railMat)) {
      group.add(rail);
    }
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
      const shelf = createShelf(side, -SEGMENT_LENGTH / 2 + 2.8 + i * 6.2);
      group.add(shelf);
      group.userData.shelves.push(shelf);
    }

    // One stack slot per side per segment; dressSegment scatters z widely and
    // hides ~half so the result reads as random.
    {
      const stack = createBookStack(side, 0);
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
  const slots = 2;
  group.userData.pillars = [];
  for (let i = 0; i < slots; i++) {
    for (const side of [-1, 1]) {
      const pillar = createStonePillar(side, pillarMat);
      const zLocal = -SEGMENT_LENGTH / 2 + (i + 0.5) * (SEGMENT_LENGTH / slots);
      pillar.position.set(side * (TRACK_WIDTH / 2 + 0.62), 0.86, zLocal);
      group.add(pillar);
      group.userData.pillars.push(pillar);
    }
  }

  // Hero archway at the far edge of each segment (Stone_archway GLB).
  const heroArchway = createHeroArchway();
  heroArchway.position.set(0, 0, -SEGMENT_LENGTH / 2);
  group.add(heroArchway);
  group.userData.heroArchway = heroArchway;

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

function createSideRailSections(side, railMat) {
  const sections = [];
  let cursor = -SEGMENT_LENGTH / 2;
  const shelfGaps = SHELF_Z_SLOTS
    .map((z) => ({
      start: Math.max(-SEGMENT_LENGTH / 2, z - SHELF_RAIL_CLEARANCE / 2),
      end: Math.min(SEGMENT_LENGTH / 2, z + SHELF_RAIL_CLEARANCE / 2),
    }))
    .filter((gap) => gap.end > gap.start)
    .sort((a, b) => a.start - b.start);

  for (const gap of shelfGaps) {
    if (gap.start > cursor) {
      sections.push(createRailSection(side, cursor, gap.start, railMat));
    }
    cursor = Math.max(cursor, gap.end);
  }

  if (cursor < SEGMENT_LENGTH / 2) {
    sections.push(createRailSection(side, cursor, SEGMENT_LENGTH / 2, railMat));
  }

  return sections;
}

function createRailSection(side, zStart, zEnd, railMat) {
  const length = zEnd - zStart;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, length), railMat);
  rail.position.set(side * (TRACK_WIDTH / 2 - 0.2), 0.3, zStart + length / 2);
  return rail;
}

// Re-randomise decoration when a segment recycles so the track looks varied.
export function dressSegment(seg) {
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
    stack.visible = Math.random() < 0.55;
    // Wide z jitter across most of the segment so adjacent segments don't
    // line up into an even row down the rail.
    stack.position.z = stack.userData.baseZ + randRange(-7, 7);
    stack.rotation.y = Math.random() * Math.PI * 2;
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
  }
  dressArchwayCreepers(seg.userData.archways);

  for (const curtain of seg.userData.vineCurtains) {
    curtain.visible = Math.random() < 0.82;
    curtain.position.z = curtain.userData.baseZ + randRange(-0.75, 0.75);
  }

  for (const ceiling of seg.userData.ceiling) {
    ceiling.visible = Math.random() < 0.32;
    ceiling.position.z = ceiling.userData.baseZ + randRange(-1, 1);
    ceiling.rotation.z = randRange(-0.12, 0.12);
    ceiling.scale.x = randRange(0.75, 1.25);
  }

  for (const pillar of seg.userData.pillars) {
    pillar.visible = Math.random() < 0.45;
    pillar.scale.setScalar(randRange(0.88, 1.08));
  }
  seg.userData.heroArchway.visible = Math.random() < 0.4;
}

function createFloorDetails(group) {
  const details = [];
  for (let i = 0; i < 8; i++) {
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

function dressArchwayCreepers(archways) {
  let previousSide = 0;
  let sameSideRun = 0;

  for (const archway of archways) {
    let mode = Math.random() < 0.32 ? (Math.random() < 0.28 ? 3 : (Math.random() < 0.5 ? -1 : 1)) : 0;
    if (mode !== 0 && mode !== 3 && mode === previousSide && sameSideRun >= 1) {
      mode = Math.random() < 0.55 ? -mode : 0;
    }

    const leftVisible = mode === -1 || mode === 3;
    const rightVisible = mode === 1 || mode === 3;
    setArchwayCreeper(archway.userData.creepersLeft, leftVisible, -1);
    setArchwayCreeper(archway.userData.creepersRight, rightVisible, 1);
    setArchwayLoop(archway.userData.loopLeft, !leftVisible && Math.random() < 0.16, -1);
    setArchwayLoop(archway.userData.loopRight, !rightVisible && Math.random() < 0.16, 1);

    if (mode === previousSide && mode !== 0 && mode !== 3) sameSideRun++;
    else sameSideRun = mode === 0 || mode === 3 ? 0 : 1;
    previousSide = mode === 3 ? 0 : mode;
  }
}

function setArchwayCreeper(creeper, visible, side) {
  creeper.visible = visible;
  if (!visible) return;
  const flip = Math.random() < 0.5 ? -1 : 1;
  creeper.scale.set(flip * randRange(0.52, 0.72), randRange(0.52, 0.72), 1);
  creeper.position.x = side * randRange(1.65, 2.35);
  creeper.position.y = randRange(3.35, 3.58);
}

function setArchwayLoop(loop, visible, side) {
  loop.visible = visible;
  if (!visible) return;
  const flip = side < 0 ? -1 : 1;
  loop.scale.set(flip * randRange(0.48, 0.62), randRange(0.48, 0.62), 1);
  loop.position.x = side * randRange(1.75, 2.35);
  loop.position.y = randRange(3.65, 3.9);
  loop.rotation.z = side * randRange(-0.06, 0.08);
}

function makeHangingCreepers(width) {
  const height = width * (55 / 77);
  const creepers = new THREE.Mesh(new THREE.PlaneGeometry(width, height), hangingCreepersMat);
  creepers.renderOrder = 10;
  return creepers;
}

function makeLoopVine(width) {
  const height = width * (50 / 146);
  const loop = new THREE.Mesh(new THREE.PlaneGeometry(width, height), loopVineMat);
  loop.renderOrder = 9;
  return loop;
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
  for (let i = 0; i < 5; i++) {
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

  group.userData.parts = { lower, topLeft, topRight, archTop, moss, stoneChips, sconce };
  return group;
}

function dressWallSet(group, mode) {
  const { lower, topLeft, topRight, archTop, moss, stoneChips, sconce } = group.userData.parts;
  group.visible = mode !== 'gap' || Math.random() < 0.45;
  lower.visible = mode !== 'gap';
  topLeft.visible = mode === 'arch' || mode === 'wall' || Math.random() < 0.45;
  topRight.visible = mode === 'arch' || mode === 'wall' || Math.random() < 0.45;
  archTop.visible = mode === 'arch' || Math.random() < 0.25;
  moss.visible = Math.random() < 0.75;
  for (const chip of stoneChips) {
    chip.visible = mode !== 'gap' && Math.random() < 0.8;
  }
  sconce.visible = mode !== 'gap' && Math.random() < 0.5;
  group.position.z = group.userData.baseZ + randRange(-0.8, 0.8);
  group.scale.y = randRange(0.9, 1.15);
}

function createShelf(side, z) {
  const group = new THREE.Group();
  group.userData.side = side;
  group.userData.baseZ = z;
  group.position.set(side * (TRACK_WIDTH / 2 + 0.42 - BOOKSHELF_INSET), 1.35, z);

  requestBookshelfModel(group);

  return group;
}

function createStonePillar(side, fallbackMat) {
  const group = new THREE.Group();
  group.userData.side = side;

  const fallback = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4, 8), fallbackMat);
  fallback.position.y = 0;
  group.add(fallback);
  group.userData.fallback = fallback;

  requestStonePillarModel(group);

  return group;
}

function createBookStack(side, z) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.side = side;
  // Rails run at x=±2.8 (extent 2.6→3.0), top surface y=0.6. Sit books on top
  // of the rail rather than the corridor floor.
  group.position.set(side * randRange(2.05, 2.45), 0.04, z);
  group.scale.setScalar(randRange(0.85, 1.15));
  group.rotation.y = Math.random() * Math.PI * 2;

  requestBooksModel(group);
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

  const creepersLeft = makeHangingCreepers(TRACK_WIDTH + 0.2);
  creepersLeft.position.set(-2, 3.45, 0.24);
  const creepersRight = makeHangingCreepers(TRACK_WIDTH + 0.2);
  creepersRight.position.set(2, 3.45, 0.24);
  group.add(creepersLeft, creepersRight);
  group.userData.creepersLeft = creepersLeft;
  group.userData.creepersRight = creepersRight;

  const loopLeft = makeLoopVine(TRACK_WIDTH + 0.4);
  loopLeft.position.set(-2, 3.75, 0.22);
  const loopRight = makeLoopVine(TRACK_WIDTH + 0.4);
  loopRight.position.set(2, 3.75, 0.22);
  group.add(loopLeft, loopRight);
  group.userData.loopLeft = loopLeft;
  group.userData.loopRight = loopRight;

  return group;
}

function createVineCurtain(z, vineMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.position.set(0, 4.35, z);

  const mossLine = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.7, 0.12, 0.1), vineMat);
  mossLine.position.y = 0.35;
  group.add(mossLine);

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
