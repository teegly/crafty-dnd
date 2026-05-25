import * as THREE from 'three';
import { randRange } from './util.js';
import { BIOMES } from './biomes.js';

// The background has two parts:
//
//  A) A gradient sky dome for tone (cheap: one large inward-facing sphere with a
//     vertical-gradient shader, unaffected by fog so it stays a clean backdrop).
//     Its colours are driven live by the biome crossfade (see setSkyColors).
//  B) Parallax depth layers: pooled clusters of distant silhouettes that scroll
//     SLOWER than the track. Each layer reuses the leapfrog pooling from
//     TrackGenerator, so nothing is created or destroyed per frame.
//
// Biomes: each cluster pre-builds one subgroup per biome (forest / mountains /
// desert) and shows only the active one. When a cluster recycles it adopts the
// current biome's geometry, so the backdrop swaps biome gradually as the player
// crosses a boundary while the sky/fog colours crossfade (CraftyRunner).
//
// All backdrop meshes are unlit MeshBasicMaterial, so their look comes from
// their own colours + fog, NOT the scene lights. That is why biome restyling
// never touches the lighting (and the lit corridor stays unchanged).

// Per-biome material colours for the backdrop geometry. The atmosphere palette
// (sky/fog/background) lives in biomes.js; these are the silhouette colours.
const BIOME_MATS = {
  forest: {
    ruinStone: 0x32382a,
    ruinGlow: 0xffc06a,
    canopyLeaf: 0x263d20,
    canopyHighlight: 0x667c33,
    canopyBranch: 0x241c12,
    treeTrunk: 0x32382a,
    treeLeaf: 0x182617,
  },
  mountains: {
    peak: 0x4a5560,
    peakSnow: 0xd7dde2,
    ridge: 0x39424b,
    boulder: 0x474f56,
    pineLeaf: 0x1d2a22,
    pineTrunk: 0x2b2620,
  },
  desert: {
    mesa: 0xb07a47,
    mesaShade: 0x8a5d34,
    dune: 0xcaa56a,
    cactus: 0x55793f,
    rock: 0x7d5a3a,
  },
  underwater: {
    spire: 0x24414a,
    rock: 0x2d4a52,
    kelp: 0x2f6b4a,
    kelpDark: 0x224f3a,
    frond: 0x3a7d6a,
    coral: 0xa86a5c,
  },
};

const RECYCLE_Z = 16; // once a cluster passes this z (behind camera) it recycles

export class Background {
  constructor(scene) {
    this.scene = scene;

    this.sky = createSkyDome();
    scene.add(this.sky);

    // Three parallax layers (far -> near). Each provides a geometry factory per
    // biome, in the BIOMES order [forest, mountains, desert].
    this.layers = [
      createLayer(scene, {
        factor: 0.25,
        count: 4,
        spacing: 26,
        biomeFactories: [makeRuinCluster, makeMountainPeaks, makeDesertMesas, makeUnderwaterFar],
      }),
      createLayer(scene, {
        factor: 0.36,
        count: 5,
        spacing: 18,
        biomeFactories: [makeCanopyCluster, makeMountainRidge, makeDesertDunes, makeUnderwaterMid],
      }),
      createLayer(scene, {
        factor: 0.5,
        count: 6,
        spacing: 15,
        biomeFactories: [makeTreeCluster, makeMountainNear, makeDesertNear, makeUnderwaterNear],
      }),
    ];
  }

  // distance is the track's world-units-this-frame (speed * delta). geomIndex is
  // the biome whose geometry newly recycled clusters should adopt.
  update(distance, geomIndex = 0) {
    for (const layer of this.layers) {
      const step = distance * layer.factor;
      for (const cluster of layer.clusters) {
        cluster.position.z += step;
        if (cluster.position.z > RECYCLE_Z) {
          cluster.position.z -= layer.totalLength;
          redressCluster(cluster, geomIndex);
        }
      }
    }
  }

  // Live-update the sky dome gradient (called each frame by the biome crossfade).
  setSkyColors(topHex, bottomHex) {
    const u = this.sky.material.uniforms;
    u.topColor.value.set(topHex);
    u.bottomColor.value.set(bottomHex);
  }

  // Instantly dress every cluster to one biome (used at startup so the initial
  // geometry matches the starting biome rather than always defaulting to forest).
  setBiome(geomIndex) {
    for (const layer of this.layers) {
      for (const cluster of layer.clusters) {
        redressCluster(cluster, geomIndex);
      }
    }
  }
}

// --- Sky dome (part A) ---------------------------------------------------------

function createSkyDome() {
  const forest = BIOMES[0].palette;
  const top = new THREE.Color(forest.skyTop);
  const bottom = new THREE.Color(forest.skyBottom);

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

function createLayer(scene, { factor, count, spacing, biomeFactories }) {
  const totalLength = count * spacing;
  const clusters = [];
  for (let i = 0; i < count; i++) {
    const cluster = new THREE.Group();
    // Pre-build every biome variant for this layer; only the active one is shown.
    const biomeGroups = biomeFactories.map((make) => {
      const g = make();
      cluster.add(g);
      return g;
    });
    cluster.userData.biomeGroups = biomeGroups;
    cluster.position.z = RECYCLE_Z - (i + 1) * spacing;
    redressCluster(cluster, 0);
    clusters.push(cluster);
    scene.add(cluster);
  }
  return { factor, totalLength, clusters };
}

// Show the active biome's subgroup, hide the others, and re-randomise its look.
function redressCluster(cluster, geomIndex) {
  const groups = cluster.userData.biomeGroups;
  for (let i = 0; i < groups.length; i++) {
    groups[i].visible = i === geomIndex;
  }
  const active = groups[geomIndex];
  if (active && active.userData.redress) active.userData.redress();
}

// --- Forest geometry -----------------------------------------------------------

// Castle/library ruins on both sides, set well back, with glowing windows.
function makeRuinCluster() {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.ruinStone, fog: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.ruinGlow, fog: true });

  const sides = [];
  for (const side of [-1, 1]) {
    const sideGroup = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.4, 11, 2.8), stoneMat);
    tower.position.set(-1.2, 5.5, 0);
    sideGroup.add(tower);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.35, 4.2, 5), stoneMat);
    spire.position.set(-1.2, 13.0, 0);
    sideGroup.add(spire);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(5.8, 6.5, 2.2), stoneMat);
    wall.position.set(1.8, 3.25, -0.4);
    sideGroup.add(wall);

    const archCut = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), glowMat);
    archCut.position.set(1.8, 3.1, 0.72);
    archCut.scale.y = 1.2;
    sideGroup.add(archCut);

    for (let t = -1; t <= 1; t += 1) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 3), stoneMat);
      tooth.position.set(-1.2 + t * 1.15, 11.7 + Math.random() * 0.8, 0);
      sideGroup.add(tooth);
    }
    const windows = [];
    for (let w = 0; w < 5; w++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(randRange(0.35, 0.8), randRange(0.75, 1.25)), glowMat);
      win.position.set(randRange(-2.6, 3.2), randRange(2.6, 8.5), 1.45);
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
      sideGroup.position.x = (sideGroup.position.x < 0 ? -1 : 1) * randRange(9, 14);
      sideGroup.scale.y = randRange(0.8, 1.25);
      sideGroup.rotation.y = randRange(-0.08, 0.08);
      for (const win of sideGroup.userData.windows) {
        win.visible = Math.random() < 0.45;
      }
    }
  };
  return group;
}

// High canopy masses and broken roof silhouettes above the corridor.
function makeCanopyCluster() {
  const group = new THREE.Group();
  const leafMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.canopyLeaf, fog: true });
  const highlightMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.canopyHighlight, fog: true });
  const branchMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.canopyBranch, fog: true });

  const clumps = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const clump = new THREE.Mesh(
        new THREE.BoxGeometry(randRange(1.2, 2.8), randRange(0.45, 1.05), randRange(1.2, 2.8)),
        Math.random() < 0.25 ? highlightMat : leafMat
      );
      clump.position.set(side * randRange(3.6, 8.2), randRange(5.6, 8.4), randRange(-2.5, 2.5));
      clump.rotation.set(randRange(-0.12, 0.12), randRange(-0.4, 0.4), randRange(-0.18, 0.18));
      group.add(clump);
      clumps.push(clump);
    }

    for (let b = 0; b < 2; b++) {
      const branch = new THREE.Mesh(new THREE.BoxGeometry(randRange(3.5, 6), 0.16, 0.22), branchMat);
      branch.position.set(side * randRange(1.8, 4.4), randRange(5.4, 7.0), randRange(-2.6, 2.6));
      branch.rotation.set(0, side * randRange(0.2, 0.7), randRange(-0.35, 0.35));
      group.add(branch);
    }
  }

  group.userData.redress = () => {
    for (const clump of clumps) {
      const side = clump.position.x < 0 ? -1 : 1;
      clump.position.x = side * randRange(3.6, 8.4);
      clump.position.y = randRange(5.6, 8.6);
      clump.scale.set(randRange(0.8, 1.25), randRange(0.75, 1.15), randRange(0.8, 1.25));
    }
  };

  return group;
}

// Conifer tree silhouettes flanking the corridor, nearer than the castle.
function makeTreeCluster() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.treeTrunk, fog: true });
  const leafMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.treeLeaf, fog: true });

  const trees = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), trunkMat);
      trunk.position.y = 1.5;
      tree.add(trunk);
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

// --- Mountain geometry ---------------------------------------------------------

// Far: tall jagged snow-capped peaks.
function makeMountainPeaks() {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.mountains.peak, fog: true });
  const snowMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.mountains.peakSnow, fog: true });

  const peaks = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const peak = new THREE.Group();
      const h = randRange(14, 22);
      const base = new THREE.Mesh(new THREE.ConeGeometry(randRange(5, 8), h, 5), rockMat);
      base.position.y = h / 2;
      peak.add(base);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(randRange(1.6, 2.6), h * 0.3, 5), snowMat);
      cap.position.y = h * 0.82;
      peak.add(cap);
      peak.position.x = side * randRange(15, 24);
      group.add(peak);
      peaks.push(peak);
    }
  }

  group.userData.redress = () => {
    for (const peak of peaks) {
      const side = peak.position.x < 0 ? -1 : 1;
      peak.position.x = side * randRange(15, 24);
      peak.scale.set(randRange(0.85, 1.2), randRange(0.85, 1.25), randRange(0.85, 1.2));
      peak.rotation.y = randRange(0, Math.PI);
    }
  };
  return group;
}

// Mid: angular rocky ridge masses flanking the corridor.
function makeMountainRidge() {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.mountains.ridge, fog: true });

  const masses = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(randRange(2, 3.5), randRange(5, 9), 4), rockMat);
      m.position.set(side * randRange(9, 15), randRange(2, 5), randRange(-2.5, 2.5));
      m.rotation.y = randRange(0, Math.PI);
      group.add(m);
      masses.push(m);
    }
  }

  group.userData.redress = () => {
    for (const m of masses) {
      const side = m.position.x < 0 ? -1 : 1;
      m.position.x = side * randRange(9, 15);
      m.position.y = randRange(2, 5);
      m.scale.set(randRange(0.8, 1.3), randRange(0.8, 1.4), randRange(0.8, 1.3));
      m.rotation.y = randRange(0, Math.PI);
    }
  };
  return group;
}

// Near: boulders plus the occasional dark sparse pine.
function makeMountainNear() {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.mountains.boulder, fog: true });
  const pineLeafMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.mountains.pineLeaf, fog: true });
  const pineTrunkMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.mountains.pineTrunk, fog: true });

  const items = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(randRange(0.6, 1.3), 0), rockMat);
      boulder.position.set(side * randRange(6, 11), randRange(0.3, 0.9), randRange(-3, 3));
      boulder.rotation.set(randRange(0, Math.PI), randRange(0, Math.PI), 0);
      group.add(boulder);
      items.push(boulder);
    }

    const pine = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6), pineTrunkMat);
    trunk.position.y = 1.2;
    pine.add(trunk);
    for (let c = 0; c < 3; c++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2 - c * 0.3, 1.7, 7), pineLeafMat);
      cone.position.y = 2.4 + c * 1.0;
      pine.add(cone);
    }
    pine.position.x = side * randRange(7, 12);
    group.add(pine);
    items.push(pine);
  }

  group.userData.redress = () => {
    for (const it of items) {
      const side = it.position.x < 0 ? -1 : 1;
      it.position.x = side * randRange(6, 12);
      it.scale.setScalar(randRange(0.8, 1.3));
    }
  };
  return group;
}

// --- Desert geometry -----------------------------------------------------------

// Far: flat-topped mesas/buttes plus a low dune silhouette.
function makeDesertMesas() {
  const group = new THREE.Group();
  const mesaMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.desert.mesa, fog: true });
  const mesaShadeMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.desert.mesaShade, fog: true });

  const items = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const h = randRange(5, 11);
      const mesa = new THREE.Mesh(
        new THREE.BoxGeometry(randRange(4, 7), h, randRange(3, 5)),
        Math.random() < 0.5 ? mesaMat : mesaShadeMat
      );
      mesa.position.set(side * randRange(11, 18), h / 2, randRange(-2, 2));
      group.add(mesa);
      items.push(mesa);
    }
    const dune = new THREE.Mesh(new THREE.ConeGeometry(randRange(4, 6), randRange(2, 3.5), 6), mesaMat);
    dune.position.set(side * randRange(13, 19), 0.5, randRange(-3, 3));
    dune.rotation.y = randRange(0, Math.PI);
    group.add(dune);
    items.push(dune);
  }

  group.userData.redress = () => {
    for (const it of items) {
      const side = it.position.x < 0 ? -1 : 1;
      it.position.x = side * randRange(11, 18);
      it.scale.set(randRange(0.85, 1.25), randRange(0.8, 1.3), randRange(0.85, 1.25));
    }
  };
  return group;
}

// Mid: rolling dune humps (flattened half-domes).
function makeDesertDunes() {
  const group = new THREE.Group();
  const sandMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.desert.dune, fog: true });

  const humps = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const hump = new THREE.Mesh(
        new THREE.SphereGeometry(randRange(2.5, 4), 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        sandMat
      );
      hump.position.set(side * randRange(10, 16), 0, randRange(-3, 3));
      hump.scale.y = randRange(0.3, 0.5);
      group.add(hump);
      humps.push(hump);
    }
  }

  group.userData.redress = () => {
    for (const hump of humps) {
      const side = hump.position.x < 0 ? -1 : 1;
      hump.position.x = side * randRange(10, 16);
      hump.scale.set(randRange(0.8, 1.2), randRange(0.3, 0.55), randRange(0.8, 1.2));
    }
  };
  return group;
}

// Near: saguaro cacti plus small rocks.
function makeDesertNear() {
  const group = new THREE.Group();
  const cactusMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.desert.cactus, fog: true });
  const rockMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.desert.rock, fog: true });

  const items = [];
  for (const side of [-1, 1]) {
    const cactus = new THREE.Group();
    const th = randRange(2.5, 3.8);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, th, 7), cactusMat);
    trunk.position.y = th / 2;
    cactus.add(trunk);
    const arms = Math.random() < 0.5 ? 2 : 1;
    for (let a = 0; a < arms; a++) {
      const armSide = a === 0 ? 1 : -1;
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, randRange(0.9, 1.4), 6), cactusMat);
      elbow.position.set(armSide * 0.4, th * randRange(0.5, 0.65), 0);
      elbow.rotation.z = armSide * 1.2;
      cactus.add(elbow);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, randRange(0.6, 1.0), 6), cactusMat);
      upper.position.set(armSide * 0.72, th * randRange(0.62, 0.78), 0);
      cactus.add(upper);
    }
    cactus.position.x = side * randRange(6, 11);
    group.add(cactus);
    items.push(cactus);

    for (let i = 0; i < 2; i++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(randRange(0.3, 0.6), 0), rockMat);
      rock.position.set(side * randRange(6, 11), 0.25, randRange(-3, 3));
      group.add(rock);
      items.push(rock);
    }
  }

  group.userData.redress = () => {
    for (const it of items) {
      const side = it.position.x < 0 ? -1 : 1;
      it.position.x = side * randRange(6, 11);
      it.scale.setScalar(randRange(0.85, 1.25));
    }
  };
  return group;
}

// --- Underwater geometry -------------------------------------------------------

// Far: dark rock spires and tall kelp columns rising from the deep.
function makeUnderwaterFar() {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.underwater.spire, fog: true });
  const kelpMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.underwater.kelpDark, fog: true });

  const items = [];
  for (const side of [-1, 1]) {
    const h = randRange(10, 18);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(randRange(2, 3.2), h, 5), rockMat);
    spire.position.set(side * randRange(12, 20), h / 2, randRange(-2, 2));
    group.add(spire);
    items.push(spire);

    const kelp = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const kh = randRange(8, 14);
      const strand = new THREE.Mesh(new THREE.BoxGeometry(0.5, kh, 0.5), kelpMat);
      strand.position.set(randRange(-1.2, 1.2), kh / 2, randRange(-1, 1));
      strand.rotation.z = randRange(-0.25, 0.25);
      kelp.add(strand);
    }
    kelp.position.x = side * randRange(13, 20);
    group.add(kelp);
    items.push(kelp);
  }

  group.userData.redress = () => {
    for (const it of items) {
      const side = it.position.x < 0 ? -1 : 1;
      it.position.x = side * randRange(12, 20);
      it.scale.set(randRange(0.85, 1.2), randRange(0.85, 1.3), randRange(0.85, 1.2));
      it.rotation.y = randRange(0, Math.PI);
    }
  };
  return group;
}

// Mid: floating coral cones and suspended seaweed fronds.
function makeUnderwaterMid() {
  const group = new THREE.Group();
  const coralMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.underwater.coral, fog: true });
  const frondMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.underwater.frond, fog: true });

  const items = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const coral = new THREE.Mesh(new THREE.ConeGeometry(randRange(1.2, 2.2), randRange(2, 4), 6), coralMat);
      coral.position.set(side * randRange(9, 15), randRange(1.5, 4.5), randRange(-2.5, 2.5));
      group.add(coral);
      items.push(coral);
    }
    for (let i = 0; i < 2; i++) {
      const fh = randRange(3, 6);
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.4, fh, 0.4), frondMat);
      frond.position.set(side * randRange(9, 14), randRange(2, 5), randRange(-2.5, 2.5));
      frond.rotation.z = randRange(-0.3, 0.3);
      group.add(frond);
      items.push(frond);
    }
  }

  group.userData.redress = () => {
    for (const it of items) {
      const side = it.position.x < 0 ? -1 : 1;
      it.position.x = side * randRange(9, 15);
      it.position.y = randRange(1.5, 5);
      it.scale.set(randRange(0.8, 1.3), randRange(0.8, 1.3), randRange(0.8, 1.3));
    }
  };
  return group;
}

// Near: swaying kelp strands, small coral, and sea rocks on the seabed.
function makeUnderwaterNear() {
  const group = new THREE.Group();
  const kelpMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.underwater.kelp, fog: true });
  const coralMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.underwater.coral, fog: true });
  const rockMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.underwater.rock, fog: true });

  const items = [];
  for (const side of [-1, 1]) {
    const kh = randRange(3.5, 6);
    const kelp = new THREE.Mesh(new THREE.BoxGeometry(0.4, kh, 0.4), kelpMat);
    kelp.position.set(side * randRange(6, 12), kh / 2, randRange(-3, 3));
    kelp.rotation.z = side * randRange(0.05, 0.25);
    group.add(kelp);
    items.push(kelp);

    const coral = new THREE.Mesh(new THREE.ConeGeometry(randRange(0.4, 0.8), randRange(0.8, 1.6), 6), coralMat);
    coral.position.set(side * randRange(6, 11), 0.6, randRange(-3, 3));
    group.add(coral);
    items.push(coral);

    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(randRange(0.4, 0.8), 0), rockMat);
    rock.position.set(side * randRange(6, 11), 0.3, randRange(-3, 3));
    group.add(rock);
    items.push(rock);
  }

  group.userData.redress = () => {
    for (const it of items) {
      const side = it.position.x < 0 ? -1 : 1;
      it.position.x = side * randRange(6, 12);
      it.scale.setScalar(randRange(0.85, 1.25));
    }
  };
  return group;
}
