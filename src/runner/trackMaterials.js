import * as THREE from 'three';
import {
  wallTexture, columnStoneTexture, wallBricksTexture,
  pillarSmallStoneTexture, woodTexture, mossTexture,
} from './trackTextures.js';

export function makeRepeatedTexture(source, repeatX, repeatY) {
  const texture = source.clone();
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export function createTrackMaterials() {
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
  const pillarMat = new THREE.MeshStandardMaterial({
    map: pillarSmallStoneTexture,
    roughness: 0.9,
  });

  return {
    wallMat,
    archColumnMat,
    archTrimMat,
    brokenWallArchMat,
    capMat,
    vineMat,
    beamMat,
    darkWoodMat,
    candleMat,
    bannerMat,
    pillarMat,
  };
}
