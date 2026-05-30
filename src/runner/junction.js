import * as THREE from 'three';
import { floorTexture, wallTexture } from './trackTextures.js';
import { getBiome, biomeIconMaterial } from './GameBiomes.js';

// Junction (90 degree turn) assets + arm/disarm helpers, used by the game's Turn
// system. A junction is a hidden crossroads overlay built into every segment; a
// turn "arms" it (revealing open side roads + destination labels), the corridor
// swings 90 degrees, then the track rebases straight down the new direction.
//
// Kept in its own module so it can import the corridor textures without a circular
// dependency on trackBuilders (which builds the per-segment overlay via
// createJunction and stores it on seg.userData.junction).

const TRACK_WIDTH = 6; // matches trackBuilders

function makeRepeatedTexture(source, repeatX, repeatY) {
  const texture = source.clone();
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

// Shared junction surfaces (one set across all segments). Given a gentle emissive
// lift so the side roads read clearly past the corridor's point lights.
const junctionFloorMat = new THREE.MeshStandardMaterial({
  map: makeRepeatedTexture(floorTexture, 5, 5),
  color: 0xb0b184, roughness: 0.98, emissive: 0x3c4026, emissiveIntensity: 0.55,
});
const junctionWallMat = new THREE.MeshStandardMaterial({
  map: makeRepeatedTexture(wallTexture, 2.2, 1.3),
  color: 0x9a967b, roughness: 0.98, emissive: 0x2a2c1c, emissiveIntensity: 0.45,
});
const junctionRailMat = new THREE.MeshStandardMaterial({
  map: makeRepeatedTexture(wallTexture, 3, 1),
  color: 0x6f7058, roughness: 1, emissive: 0x2a2c1c, emissiveIntensity: 0.5,
});

// Base colours captured so a biome surfaceTint multiplier can be applied/restored.
const junctionTintTargets = [junctionFloorMat, junctionWallMat, junctionRailMat].map(
  (mat) => ({ mat, base: mat.color.clone() })
);

const arrowMat = new THREE.MeshBasicMaterial({
  map: makeArrowTexture(),
  transparent: true, alphaTest: 0.3, color: 0x9dff8c, fog: false, side: THREE.DoubleSide,
});

// Side decoration groups hidden while a junction is armed so the crossroads reads
// as open roads left and right.
const JUNCTION_HIDE_GROUPS = ['wallSets', 'shelves', 'bookStacks', 'banners', 'lanterns', 'archways', 'vineCurtains', 'pillars', 'rails'];

// An OPEN crossroads: a wide crossing floor, two side roads framed by low rails, a
// glowing arrow + destination label on each, and a low end-marker straight ahead.
// Built hidden; revealed by armJunction. The crossing sits at the segment centre
// (local z 0) so it reaches the player pivot (world z 0).
export function createJunction() {
  const group = new THREE.Group();
  group.visible = false;
  const PERP = 14; // side-road length in X
  const railZ = TRACK_WIDTH / 2 - 0.2;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH + 2 * PERP, 0.5, TRACK_WIDTH),
    junctionFloorMat
  );
  floor.position.set(0, -0.25, 0);
  group.add(floor);

  const endMarker = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.2, 1.5, 0.5), junctionWallMat);
  endMarker.position.set(0, 0.75, -TRACK_WIDTH / 2 - 0.2);
  group.add(endMarker);

  const arms = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    for (const rz of [-railZ, railZ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(PERP, 0.6, 0.4), junctionRailMat);
      rail.position.set(side * (TRACK_WIDTH / 2 + PERP / 2), 0.3, rz);
      arm.add(rail);
    }
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), arrowMat.clone());
    arrow.position.set(side * 2.5, 1.7, 0);
    if (side < 0) arrow.scale.x = -1; // mirror to point left
    arm.add(arrow);
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), arrowMat.clone());
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

// Reveal a segment's junction overlay with the given open exits and clear the
// segment's normal decoration so the crossroads reads cleanly. `labels` (optional,
// { left:biomeId, right:biomeId }) shows each open arm's destination biome.
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
  if (seg.userData.heroArchway) seg.userData.heroArchway.visible = false;
}

export function disarmJunction(seg) {
  const j = seg.userData.junction;
  if (j) j.visible = false;
}

// Multiply the shared junction surfaces by a biome surfaceTint (Color). Called from
// TrackGenerator.setBiomeTint so junction roads match the active biome's tint.
export function tintJunctions(tint) {
  for (const t of junctionTintTargets) t.mat.color.copy(t.base).multiply(tint);
}

// A right-pointing chevron on transparent canvas (mirrored for left).
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
