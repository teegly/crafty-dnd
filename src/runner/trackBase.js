import * as THREE from 'three';
import { pickRandom, randRange } from './util.js';
import {
  SEGMENT_LENGTH, SHELF_RAIL_CLEARANCE, SHELF_Z_SLOTS,
  TRACK_WIDTH,
} from './trackConstants.js';
import {
  floorTexture, wallTexture, snowTexture, forestGroundTexture,
  desertGroundTexture, leafMaterials,
} from './trackTextures.js';
import { makeRepeatedTexture } from './trackMaterials.js';

export function addTrackBase(group) {
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

  addBiomeGroundEdges(group);
}

function addBiomeGroundEdges(group) {
  group.userData.snowEdges = [];
  group.userData.forestGroundEdges = [];
  group.userData.desertGroundEdges = [];

  const snowMat = new THREE.MeshBasicMaterial({
    map: makeRepeatedTexture(snowTexture, 22.6, 7.0),
    color: 0xffffff,
    transparent: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const forestGroundMat = new THREE.MeshBasicMaterial({
    map: makeRepeatedTexture(forestGroundTexture, 23, 7.4),
    color: 0xffffff,
    transparent: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const desertGroundMat = new THREE.MeshBasicMaterial({
    map: makeRepeatedTexture(desertGroundTexture, 23, 7.4),
    color: 0xffffff,
    transparent: false,
    fog: false,
    side: THREE.DoubleSide,
  });

  for (const side of [-1, 1]) {
    const snowField = new THREE.Mesh(new THREE.PlaneGeometry(40, SEGMENT_LENGTH + 3.2), snowMat);
    snowField.rotation.x = -Math.PI / 2;
    snowField.position.set(side * 22.8, 0.08, 0);
    snowField.visible = false;
    group.add(snowField);
    group.userData.snowEdges.push(snowField);

    const forestGroundField = new THREE.Mesh(new THREE.PlaneGeometry(40, SEGMENT_LENGTH + 3.8), forestGroundMat);
    forestGroundField.rotation.x = -Math.PI / 2;
    forestGroundField.position.set(side * 22.8, -0.42, 0);
    forestGroundField.visible = false;
    group.add(forestGroundField);
    group.userData.forestGroundEdges.push(forestGroundField);

    const desertGroundField = new THREE.Mesh(new THREE.PlaneGeometry(40, SEGMENT_LENGTH + 3.8), desertGroundMat);
    desertGroundField.rotation.x = -Math.PI / 2;
    desertGroundField.position.set(side * 22.8, -0.42, 0);
    desertGroundField.visible = false;
    group.add(desertGroundField);
    group.userData.desertGroundEdges.push(desertGroundField);
  }
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

function createFloorDetails(group) {
  const details = [];
  for (let i = 0; i < 8; i++) {
    const size = randRange(0.26, 0.46);
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(size, size), pickRandom(leafMaterials));
    leaf.rotation.x = -Math.PI / 2;
    leaf.rotation.z = randRange(0, Math.PI * 2);
    leaf.position.set(randRange(-2.8, 2.8), 0.04, randRange(-SEGMENT_LENGTH / 2, SEGMENT_LENGTH / 2));
    group.add(leaf);
    details.push(leaf);
  }
  return details;
}
