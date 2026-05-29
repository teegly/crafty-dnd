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
  skyTop: 0x9aae6b, // dappled canopy gold-green (top of dome)
  skyBottom: 0x182011, // deep amber forest-floor shadow (bottom of dome)
  fog: 0x4b4b2e, // soft amber/green; distance fades to this
  castle: 0x32382a, // weathered ruin silhouette
  trees: 0x182617, // darker foliage silhouette
  window: 0xffc06a, // warm amber glow in distant windows
};

// How far the camera can see before fog hides everything (matches CraftyRunner
// fog far). Parallax clusters live just inside this so they fade in/out softly.
const RECYCLE_Z = 16; // once a cluster passes this z (behind camera) it recycles

export class Background {
  // `parent` is the rotatable worldGroup. The sky dome is radially symmetric
  // about the Y axis, so it is unaffected by the turn swing; the parallax
  // silhouettes ride the worldGroup so they swing with the corridor.
  constructor(parent) {
    this.parent = parent;

    this.sky = createSkyDome();
    parent.add(this.sky);

    // Parallax layers. factor < 1 means "moves slower than the track". Each cluster
    // holds one variant per biome (built once, only the current shown); the temple
    // variant is the original art, so Temple looks identical to before.
    this.layers = [
      createLayer(parent, { factor: 0.25, count: 4, spacing: 26, makeTempleVariant: makeRuinCluster, scale: 1.2 }),
      createLayer(parent, { factor: 0.36, count: 5, spacing: 18, makeTempleVariant: makeCanopyCluster, scale: 0.95 }),
      createLayer(parent, { factor: 0.5, count: 6, spacing: 15, makeTempleVariant: makeTreeCluster, scale: 0.7 }),
    ];
  }

  // Swap every parallax cluster + the sky dome to the given biome's scenery.
  setBiome(biome) {
    for (const layer of this.layers) {
      for (const cluster of layer.clusters) cluster.userData.setBiome(biome.scenery);
    }
    const u = this.sky.material.uniforms;
    if (u) {
      u.topColor.value.set(biome.palette.sky.top);
      u.bottomColor.value.set(biome.palette.sky.bottom);
    }
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

function createLayer(parent, { factor, count, spacing, makeTempleVariant, scale }) {
  const totalLength = count * spacing;
  const clusters = [];
  for (let i = 0; i < count; i++) {
    const cluster = makeVariantCluster(makeTempleVariant, scale);
    // Lay clusters out ahead of the camera into -z, evenly spaced.
    cluster.position.z = RECYCLE_Z - (i + 1) * spacing;
    redressCluster(cluster);
    clusters.push(cluster);
    parent.add(cluster);
  }
  return { factor, totalLength, clusters };
}

// A cluster holding one variant group per biome (only the current shown). The temple
// variant is the original art; the others are simple per-biome placeholder silhouettes.
function makeVariantCluster(makeTempleVariant, scale) {
  const group = new THREE.Group();
  const variants = {
    temple: makeTempleVariant(),
    hospital: makeBiomeSilhouettes('hospital', scale),
    highway: makeBiomeSilhouettes('highway', scale),
    forest: makeBiomeSilhouettes('forest', scale),
  };
  for (const id of Object.keys(variants)) {
    variants[id].visible = id === 'temple';
    group.add(variants[id]);
  }
  group.userData.variants = variants;
  group.userData.current = 'temple';
  group.userData.redress = () => {
    const v = variants[group.userData.current];
    if (v && v.userData.redress) v.userData.redress();
  };
  group.userData.setBiome = (id) => {
    const key = variants[id] ? id : 'temple';
    for (const k of Object.keys(variants)) variants[k].visible = k === key;
    group.userData.current = key;
    const v = variants[key];
    if (v.userData.redress) v.userData.redress();
  };
  return group;
}

// Per-biome placeholder backdrop silhouettes, scaled for the layer's depth. Boxes for
// buildings, cones for trees — flanking both sides of the corridor like the ruins.
const SCENERY_COLOR = { hospital: 0xb9c6cf, highway: 0x474b54, forest: 0x1f3a1a };

function makeBiomeSilhouettes(biomeId, scale) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: SCENERY_COLOR[biomeId] || 0x444444, fog: true });
  const items = [];
  const count = biomeId === 'forest' ? 5 : 3;
  for (const side of [-1, 1]) {
    const sideGroup = new THREE.Group();
    for (let i = 0; i < count; i++) {
      let mesh;
      // X offsets are symmetric around the side group's centre (±11.5), so items
      // always sit well outside the corridor (path ±3, walls ±3.35) on both sides.
      if (biomeId === 'forest') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(1.6 * scale, 4.5 * scale, 6), mat);
        mesh.position.set(randRange(-3, 3), 2.2 * scale, randRange(-3, 3));
      } else {
        const h = randRange(6, biomeId === 'highway' ? 14 : 10) * scale;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(randRange(2.4, 4) * scale, h, 2.6 * scale), mat);
        mesh.position.set(randRange(-3, 3), h / 2, randRange(-3, 3));
        mesh.userData.baseH = h;
      }
      sideGroup.add(mesh);
      items.push(mesh);
    }
    sideGroup.position.x = side * 11.5;
    group.add(sideGroup);
  }
  group.userData.redress = () => {
    for (const mesh of items) {
      mesh.scale.set(randRange(0.8, 1.3), randRange(0.8, 1.3), randRange(0.8, 1.3));
    }
  };
  return group;
}

// Re-randomise a cluster's look + side placement each time it recycles, so the
// backdrop never visibly repeats.
function redressCluster(cluster) {
  if (cluster.userData.redress) cluster.userData.redress();
}

// Castle/library ruins on both sides, set well back, with glowing windows and
// broken arch profiles that show through corridor wall gaps.
function makeRuinCluster() {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshBasicMaterial({ color: PALETTE.castle, fog: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.window, fog: true });

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
      // Vary distance/height a little, and which windows are lit.
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
  const leafMat = new THREE.MeshBasicMaterial({ color: 0x263d20, fog: true });
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0x667c33, fog: true });
  const branchMat = new THREE.MeshBasicMaterial({ color: 0x241c12, fog: true });

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
