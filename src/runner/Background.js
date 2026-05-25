import * as THREE from 'three';
import { randRange } from './util.js';

// The background has two parts:
//
//  A) A gradient sky dome for tone (cheap: one large inward-facing sphere with a
//     vertical-gradient shader, unaffected by fog so it stays a clean backdrop).
//  B) Parallax depth layers: pooled clusters of distant silhouettes (castle
//     ruins with faint glowing windows, then nearer tree silhouettes) that scroll
//     SLOWER than the track. Slower scroll is what reads as depth/parallax. Each
//     layer reuses the same leapfrog pooling as TrackGenerator, so nothing is
//     created or destroyed per frame, and everything fades into the fog at the
//     far edge.
//
// Aesthetic: enchanted elven library ruins overgrown by forest. The parallax
// layers are meant to be glimpsed THROUGH the broken corridor (low rails now,
// arched wall gaps once the corridor is restructured).

// Shared palette so CraftyRunner can match fog + lighting to the backdrop.
export const PALETTE = {
  skyTop: 0x6c7a44, // dappled canopy gold-green (top of dome)
  skyBottom: 0x141b12, // deep forest-floor shadow (bottom of dome)
  fog: 0x2b3622, // mossy mid-tone; distance fades to this
  castle: 0x232c20, // weathered ruin silhouette
  trees: 0x18241a, // darker foliage silhouette
  window: 0xffc06a, // warm amber glow in distant windows
};

// How far the camera can see before fog hides everything (matches CraftyRunner
// fog far). Parallax clusters live just inside this so they fade in/out softly.
const RECYCLE_Z = 16; // once a cluster passes this z (behind camera) it recycles

export class Background {
  constructor(scene) {
    this.scene = scene;

    this.sky = createSkyDome();
    scene.add(this.sky);

    // Two parallax layers. factor < 1 means "moves slower than the track".
    // Far layer barely moves (distant), mid layer moves a bit more.
    this.layers = [
      createLayer(scene, {
        factor: 0.25,
        count: 4,
        spacing: 26,
        makeCluster: makeCastleCluster,
      }),
      createLayer(scene, {
        factor: 0.5,
        count: 6,
        spacing: 15,
        makeCluster: makeTreeCluster,
      }),
    ];
  }

  // distance is the track's world-units-this-frame (speed * delta). Each layer
  // scales it down by its own factor to parallax.
  update(distance) {
    for (const layer of this.layers) {
      const step = distance * layer.factor;
      for (const cluster of layer.clusters) {
        cluster.position.z += step;
        if (cluster.position.z > RECYCLE_Z) {
          cluster.position.z -= layer.totalLength;
          redressCluster(cluster);
        }
      }
    }
  }
}

// --- Sky dome (part A) ---------------------------------------------------------

function createSkyDome() {
  const top = new THREE.Color(PALETTE.skyTop);
  const bottom = new THREE.Color(PALETTE.skyBottom);

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, // we view it from the inside
    depthWrite: false, // never occlude scene geometry
    fog: false, // the backdrop itself must not be fogged
    uniforms: {
      topColor: { value: top },
      bottomColor: { value: bottom },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      void main() {
        // Blend top->bottom over a sensible vertical span of the dome.
        float h = clamp((vWorldPos.y + 40.0) / 130.0, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
      }
    `,
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 16), material);
  dome.renderOrder = -1;
  return dome;
}

// --- Parallax layers (part B) --------------------------------------------------

function createLayer(scene, { factor, count, spacing, makeCluster }) {
  const totalLength = count * spacing;
  const clusters = [];
  for (let i = 0; i < count; i++) {
    const cluster = makeCluster();
    // Lay clusters out ahead of the camera into -z, evenly spaced.
    cluster.position.z = RECYCLE_Z - (i + 1) * spacing;
    redressCluster(cluster);
    clusters.push(cluster);
    scene.add(cluster);
  }
  return { factor, totalLength, clusters };
}

// Re-randomise a cluster's look + side placement each time it recycles, so the
// backdrop never visibly repeats.
function redressCluster(cluster) {
  if (cluster.userData.redress) cluster.userData.redress();
}

// Castle ruins on both sides, set well back, with a few glowing windows.
function makeCastleCluster() {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshBasicMaterial({ color: PALETTE.castle, fog: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.window, fog: true });

  const sides = [];
  for (const side of [-1, 1]) {
    const sideGroup = new THREE.Group();
    // A broken tower: a tall block plus a couple of crenellation teeth.
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 3), stoneMat);
    tower.position.y = 6;
    sideGroup.add(tower);
    for (let t = -1; t <= 1; t += 1) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 3), stoneMat);
      tooth.position.set(t * 1.3, 12.7, 0);
      sideGroup.add(tooth);
    }
    // A few windows that we light up in redress().
    const windows = [];
    for (let w = 0; w < 3; w++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), glowMat);
      win.position.set(randRange(-1, 1), randRange(3, 9), 1.55);
      sideGroup.add(win);
      windows.push(win);
    }
    sideGroup.userData.windows = windows;
    sideGroup.position.x = side * 11;
    group.add(sideGroup);
    sides.push(sideGroup);
  }

  group.userData.redress = () => {
    for (const sideGroup of sides) {
      // Vary distance/height a little, and which windows are lit.
      sideGroup.position.x = (sideGroup.position.x < 0 ? -1 : 1) * randRange(9, 14);
      sideGroup.scale.y = randRange(0.8, 1.25);
      for (const win of sideGroup.userData.windows) {
        win.visible = Math.random() < 0.6;
      }
    }
  };
  return group;
}

// Tree silhouettes flanking the corridor, nearer than the castle.
function makeTreeCluster() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshBasicMaterial({ color: PALETTE.castle, fog: true });
  const leafMat = new THREE.MeshBasicMaterial({ color: PALETTE.trees, fog: true });

  const trees = [];
  for (const side of [-1, 1]) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), trunkMat);
      trunk.position.y = 1.5;
      tree.add(trunk);
      // Stacked cones make a simple conifer silhouette.
      for (let c = 0; c < 3; c++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6 - c * 0.35, 2, 7), leafMat);
        cone.position.y = 3 + c * 1.3;
        tree.add(cone);
      }
      tree.position.x = side * randRange(5, 12);
      group.add(tree);
      trees.push(tree);
    }
  }

  group.userData.redress = () => {
    for (const tree of trees) {
      const side = tree.position.x < 0 ? -1 : 1;
      tree.position.x = side * randRange(5, 12);
      tree.scale.setScalar(randRange(0.8, 1.4));
    }
  };
  return group;
}
