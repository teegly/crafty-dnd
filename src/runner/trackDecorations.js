import * as THREE from 'three';
import { randRange } from './util.js';
import { createHeroArchway } from './Props.js';
import { BOOKSHELF_INSET, SEGMENT_LENGTH, TRACK_WIDTH, WALL_X } from './trackConstants.js';
import { torchSheet, hangingCreepersMat, loopVineMat } from './trackTextures.js';
import {
  requestBooksModel, requestBookshelfModel, requestStonePillarModel,
} from './loaders.js';
import { createTrackMaterials } from './trackMaterials.js';

export function addTrackDecorations(group) {
  const materials = createTrackMaterials();

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
      const wallSet = createBrokenWallSet(
        side,
        z,
        materials.wallMat,
        materials.capMat,
        materials.vineMat,
        materials.candleMat,
        materials.brokenWallArchMat
      );
      group.add(wallSet);
      group.userData.wallSets.push(wallSet);
    }

    for (let i = 0; i < 3; i++) {
      const shelf = createShelf(side, -SEGMENT_LENGTH / 2 + 2.8 + i * 6.2);
      group.add(shelf);
      group.userData.shelves.push(shelf);
    }

    {
      const stack = createBookStack(side, 0);
      group.add(stack);
      group.userData.bookStacks.push(stack);
    }

    for (let i = 0; i < 3; i++) {
      const lantern = createLantern(side, -SEGMENT_LENGTH / 2 + 4.5 + i * 5.7, materials.darkWoodMat);
      group.add(lantern);
      group.userData.lanterns.push(lantern);
    }

    const banner = createBanner(side, -SEGMENT_LENGTH / 2 + randRange(4, 15), materials.bannerMat, materials.candleMat);
    group.add(banner);
    group.userData.banners.push(banner);
  }

  for (let i = 0; i < 3; i++) {
    const ceiling = createCeilingFragment(-SEGMENT_LENGTH / 2 + 3 + i * 6.5, materials.beamMat, materials.capMat);
    group.add(ceiling);
    group.userData.ceiling.push(ceiling);
  }

  for (let i = 0; i < 2; i++) {
    const archway = createArchway(
      -SEGMENT_LENGTH / 2 + 2.5 + i * 8.5,
      materials.archTrimMat,
      materials.archTrimMat,
      materials.vineMat,
      materials.archColumnMat
    );
    group.add(archway);
    group.userData.archways.push(archway);
  }

  for (let i = 0; i < 3; i++) {
    const curtain = createVineCurtain(-SEGMENT_LENGTH / 2 + 3.2 + i * 6.1, materials.vineMat);
    group.add(curtain);
    group.userData.vineCurtains.push(curtain);
  }

  group.userData.pillars = [];
  for (let i = 0; i < 2; i++) {
    for (const side of [-1, 1]) {
      const pillar = createStonePillar(side, materials.pillarMat);
      const zLocal = -SEGMENT_LENGTH / 2 + (i + 0.5) * (SEGMENT_LENGTH / 2);
      pillar.position.set(side * (TRACK_WIDTH / 2 + 0.62), 0.86, zLocal);
      group.add(pillar);
      group.userData.pillars.push(pillar);
    }
  }

  const heroArchway = createHeroArchway();
  heroArchway.position.set(0, 0, -SEGMENT_LENGTH / 2);
  group.add(heroArchway);
  group.userData.heroArchway = heroArchway;
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
  group.position.set(side * randRange(2.05, 2.45), 0.04, z);
  group.scale.setScalar(randRange(0.85, 1.15));
  group.rotation.y = Math.random() * Math.PI * 2;

  requestBooksModel(group);
  return group;
}

function createLantern(side, z, metalMat) {
  const group = new THREE.Group();
  group.userData.baseZ = z;
  group.userData.side = side;
  group.position.set(side * (WALL_X - 0.28), 2.55, z);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.45), metalMat);
  arm.position.set(side * -0.18, 0.18, 0);
  group.add(arm);

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
