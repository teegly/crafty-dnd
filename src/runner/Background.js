import * as THREE from 'three';
import { randRange, assetUrl, pickRandom } from './util.js';
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
// Biomes: each cluster pre-builds one subgroup per active biome (mountains /
// forest) and shows only the active one. When a cluster recycles it adopts the
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
    mesa: 0x9f7b56,
    mesaShade: 0x7f6246,
    dune: 0xbe9a6b,
    cactus: 0x3f6a44,
    rock: 0x8b7051,
  },
};

const RECYCLE_Z = 16; // once a cluster passes this z (behind camera) it recycles

// Cloud sprite sets per biome.
// Cloud sprites — illustrated cloud PNGs from the same vertical-parallax pack
// as the horizon layers. One set used by every cloud-bearing biome (the per-
// biome tint comes from the sun colour + sky gradient, not the clouds).
const CLOUD_KEYS = ['frosty', 'sunny'];
const cloudSprites = (() => {
  const loader = new THREE.TextureLoader();
  const shared = [2, 3, 4, 5].map((n) => {
    const tex = loader.load(assetUrl(`/assets/textures/shared/clouds/cloud-${n}.png`));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.y = 0.22;
    tex.offset.y = 0.16;
    return tex;
  });
  const sets = {};
  for (const k of CLOUD_KEYS) sets[k] = shared;
  return sets;
})();

// Sky props: sun (1 disc, tinted per biome).
const _skyLoader = new THREE.TextureLoader();
function loadSkyTex(path) {
  const t = _skyLoader.load(assetUrl(path));
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; // tiny pixel sprites, keep crisp
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
const sunTexture = loadSkyTex('/assets/textures/shared/sun.png');

// Per sky type sun tint, matching CLOUD_KEYS.
const SUN_TINTS = [0xeaf2ff, 0xfff2b0];

// Procedural fish silhouettes for the underwater biome. Each variant is a
// canvas-drawn body+tail; we render dark teal-grey so they read as distant
// fish-shaped shadows in the deep.
function makeFishTexture(variant) {
  const w = 64, h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a2a30';
  // Body: oval
  ctx.beginPath();
  ctx.ellipse(w * 0.42, h * 0.5, w * 0.32, h * (0.28 + variant * 0.04), 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail: triangle
  ctx.beginPath();
  ctx.moveTo(w * 0.72, h * 0.5);
  ctx.lineTo(w * 0.98, h * 0.18);
  ctx.lineTo(w * 0.98, h * 0.82);
  ctx.closePath();
  ctx.fill();
  // Top fin
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * (0.22 - variant * 0.02));
  ctx.lineTo(w * 0.52, h * 0.06);
  ctx.lineTo(w * 0.6, h * 0.4);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
const fishTextures = [0, 1, 2, 3].map(makeFishTexture);

// Procedural bubble texture: small soft circle with a highlight.
function makeBubbleTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size * 0.4, size * 0.4, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(220,240,255,0.9)');
  grad.addColorStop(0.6, 'rgba(140,190,220,0.35)');
  grad.addColorStop(1, 'rgba(80,140,180,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const bubbleTexture = makeBubbleTexture();

// Pine tree sprite sheet. Trees aren't on a uniform column grid — pixel-scan
// shows 5 full trees at 93px wide separated by 28px-wide stumps. Each pine
// material clones the sheet and windows it to one tree's exact pixel range.
const PINE_SHEET_W = 672;
// Tight per-tree pixel ranges found by detecting crown tops in the top 60 rows
// (avoids adjacent stumps and bare trunks the sheet packs between trees).
const PINE_TREES_PX = [
  { x: 22, w: 50 },   // green pine A
  { x: 114, w: 60 },  // green pine B
  { x: 242, w: 60 },  // red/autumn pine
  { x: 342, w: 56 },  // yellow pine
  { x: 466, w: 60 },  // snowy pine
];
const _pineSheet = (() => {
  const tex = _skyLoader.load(assetUrl('/assets/sprites/pine-trees.png'));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
})();
const PINE_SHEET_H = 192;
function makePineMaterial(treeIndex) {
  const t = PINE_TREES_PX[treeIndex];
  const tex = _pineSheet.clone();
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.repeat.set(t.w / PINE_SHEET_W, 1);
  tex.offset.set(t.x / PINE_SHEET_W, 0);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.5,
    fog: false,
  });
  // Aspect = artwork-width / artwork-height; used at the call site to scale
  // the sprite quad so the painted tree isn't horizontally stretched.
  mat.userData.aspect = t.w / PINE_SHEET_H;
  return mat;
}
// Two green pines for the standard biomes; red/yellow/snowy available for
// season variants later.
const pineMaterials = [0, 1].map(makePineMaterial);

// Nature kit textures — painterly 3D-style PBR textures, used here on flat
// backdrop geometry with NearestFilter to chunk them down into a pixel-school
// look that matches the rest of the runner.
function loadNatureTex(path, repeatX = 1, repeatY = 1) {
  const tex = _skyLoader.load(assetUrl(path));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}
const rockTexture = loadNatureTex('/assets/textures/shared/wall-stone.png', 2, 2);
const desertRockTexture = loadNatureTex('/assets/textures/shared/mossy-stone-wall.png', 2, 2);

// Horizon parallax layers — biome-themed PNGs wrapped behind the corridor.
// Tall vertical-format source images (1900x3450) that get UV-scrolled over time
// so the scenery "rises" as Crafty walks forward.
function loadHorizonTex(path) {
  const tex = _skyLoader.load(assetUrl(path));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
// Per-biome horizon layer configs. Each layer = one tall vertical PNG placed
// in the scene as a wide plane. Layers are arranged front-to-back; scrollY is
// how fast the texture scrolls vertically as Crafty walks forward (closer
// layers scroll faster for parallax).
const HORIZON_LAYER_SETS = {
  forest: {
    folder: 'forest/square cropped',
    aspect: 1,
    layers: [
      { file: 'crop_5_forest_sky.png', radius: 106, arc: 1.344, bottom: -80, opacity: 1, driftX: 0.00005, flat: true },
      { file: 'crop_4_forest_mountain.png', radius: 94, arc: 1.35, bottom: -68, opacity: 1, driftX: 0.00016, flat: true },
      { file: 'crop_3_forest_back.png', radius: 82, arc: 1.5, bottom: -71, opacity: 1, driftX: 0.00028, flat: true },
      { file: 'crop_2_forest_mid.png', radius: 70, arc: 1.3104, bottom: -50, opacity: 1, driftX: 0.00046, flat: true },
      { file: 'crop_1_forest_short.png', radius: 61, arc: 1.6168, bottom: -46, opacity: 1, driftX: 0.00062, flat: true },
      { file: 'crop_0_forest_long.png', radius: 52, arc: 2.0056, bottom: -44, opacity: 1, driftX: 0.00072, flat: true },
    ],
  },
  mountains: {
    folder: 'winter',
    aspect: 3800 / 1200,
    layers: [
      { file: '4-sky.png', radius: 112, arc: 2.2, bottom: -52, opacity: 1, driftX: 0.00004, scale: 1.7 },
      { file: '3-backmountain.png', radius: 88, arc: 1.55, bottom: -31, opacity: 0.74, driftX: 0.00015, scale: 2.85 },
      { file: '2-midmountain.png', radius: 76, arc: 1.35, bottom: -31, opacity: 0.66, driftX: 0.0003, scale: 1.9 },
      { file: '1-midforest.png', radius: 62, arc: 1.15, bottom: -31, opacity: 0.54, driftX: 0.00055, scale: 1.18 },
    ],
  },
  desert: {
    folder: 'desert',
    layers: [
      { file: '5_desert_sky.png', aspect: 1900 / 1000, radius: 106, arc: 1.344, bottom: -14, opacity: 1, driftX: 0.00005, flat: true },
      { file: '4_desert_moon.png', aspect: 3800 / 2400, radius: 94, arc: 1.35, bottom: -56, opacity: 1, driftX: 0.00013, flat: true, scale: 1.19 },
      { file: '3_desert_cloud.png', aspect: 1900 / 1000, radius: 84, arc: 1.45, bottom: -13, opacity: 1, driftX: 0.0002, flat: true },
      { file: '2_desert_mountain.png', aspect: 3800 / 1000, radius: 74, arc: 1.42, bottom: 3, opacity: 1, driftX: 0.00032, flat: true, scale: 1.29 },
      { file: '1_desert_dunemid.png', aspect: 1900 / 1000, radius: 64, arc: 1.58, bottom: -5, opacity: 1, driftX: 0.0005, flat: true, scale: 1.17 },
      { file: '0_desert_dunefrontt.png', aspect: 3800 / 1000, radius: 54, arc: 1.9, bottom: -3, opacity: 1, driftX: 0.00068, flat: true, scale: 0.86 },
    ],
  },
  ocean: {
    folder: 'ocean',
    layers: [
      { file: '6 ocean sky and sun.png', aspect: 3800 / 1200, radius: 112, arc: 1.6, bottom: -4, opacity: 1, driftX: 0.00004, flat: true, scale: 1.19 },
      { file: '5 ocean clouds.png', aspect: 3800 / 1200, radius: 102, arc: 1.55, bottom: 9, opacity: 1, driftX: 0.00008, flat: true },
      { file: '4 ocean back mountain.png', aspect: 3800 / 1200, radius: 92, arc: 1.5, bottom: -5, opacity: 1, driftX: 0.00016, flat: true, scale: 1.28 },
      { file: '3ocean sun light.png', aspect: 3800 / 1200, radius: 82, arc: 1.48, bottom: 17, opacity: 1, driftX: 0.00024, flat: true, scale: 0.58 },
      { file: '2 ocean sand.png', aspect: 3800 / 1200, radius: 72, arc: 1.55, bottom: 8, opacity: 1, driftX: 0.00034, flat: true },
      { file: '1 ocean sea.png', aspect: 3800 / 1200, radius: 62, arc: 1.7, bottom: -4, opacity: 1, driftX: 0.00052, flat: true },
      { file: '0 ocean wave.png', aspect: 3800 / 1200, radius: 52, arc: 1.9, bottom: -4, opacity: 1, driftX: 0.0007, flat: true },
    ],
  },
};

const _horizonCache = {};
function getHorizonTex(folder, file) {
  const key = `${folder}/${file}`;
  if (!_horizonCache[key]) {
    _horizonCache[key] = loadHorizonTex(`/assets/biomes/${folder}/${file}`);
  }
  return _horizonCache[key];
}

// (Legacy) Procedural mountain silhouette — kept around in case we want to
// fall back to a pure-canvas horizon later.
function makeMountainHorizonTexture(variant) {
  // variant: 0 = far/hazy, 1 = mid, 2 = near/dark
  const W = 1024;
  const H = 346;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Palette per layer — atmospheric perspective: distant peaks are pale &
  // cool, near peaks are darker.
  const palettes = [
    { peak: '#8a9aab', face: '#7689a0', snow: '#dde6ee' }, // far
    { peak: '#5d6e83', face: '#48586c', snow: '#c4d2dd' }, // mid
    { peak: '#3a4658', face: '#2a3441', snow: '#a4b4c4' }, // near
  ];
  const pal = palettes[variant];

  // Number of peaks and base height per variant.
  const peakCounts = [3, 5, 8];
  const baseHeights = [0.55, 0.65, 0.75]; // fraction of H from the bottom
  const variance = [0.18, 0.22, 0.18];
  const count = peakCounts[variant];
  const baseY = H * (1 - baseHeights[variant]);

  // Build peak X positions (evenly spread + jittered).
  const peaks = [];
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * (W / count) + (Math.random() - 0.5) * (W / count) * 0.3;
    const height = H * baseHeights[variant] * (0.6 + Math.random() * variance[variant] * 4);
    peaks.push({ x, height });
  }

  // Draw peaks as triangle silhouettes from bottom upward.
  ctx.fillStyle = pal.face;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, baseY);
  for (const p of peaks) {
    const halfBase = (W / count) * 0.7;
    ctx.lineTo(p.x - halfBase, baseY);
    ctx.lineTo(p.x, baseY - p.height);
    ctx.lineTo(p.x + halfBase, baseY);
  }
  ctx.lineTo(W, baseY);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Snow caps at the top of each peak.
  ctx.fillStyle = pal.snow;
  for (const p of peaks) {
    const capW = 12 + Math.random() * 8;
    const capH = 18 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(p.x, baseY - p.height);
    ctx.lineTo(p.x - capW, baseY - p.height + capH);
    ctx.lineTo(p.x + capW, baseY - p.height + capH);
    ctx.closePath();
    ctx.fill();
  }

  // Highlight ridge on the lit side of each peak.
  ctx.strokeStyle = pal.peak;
  ctx.lineWidth = 2;
  for (const p of peaks) {
    const halfBase = (W / count) * 0.7;
    ctx.beginPath();
    ctx.moveTo(p.x - halfBase, baseY);
    ctx.lineTo(p.x, baseY - p.height);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}


export class Background {
  constructor(scene) {
    this.scene = scene;

    this.sky = createSkyDome();
    scene.add(this.sky);

    // Horizon parallax silhouettes — biome-themed PNG layers wrapped behind
    // the corridor. One group per biome, only the active one is visible.
    this.horizons = createHorizons(scene);

    // Four parallax layers (far -> near). The active backdrop is handled by
    // createHorizons, so these pooled clusters stay empty.
    this.layers = [
      createLayer(scene, {
        factor: 0.12,
        count: 5,
        spacing: 28,
        biomeFactories: BIOMES.map(() => makeEmptyCluster),
      }),
      createLayer(scene, {
        factor: 0.25,
        count: 4,
        spacing: 26,
        biomeFactories: BIOMES.map(() => makeEmptyCluster),
      }),
      createLayer(scene, {
        factor: 0.36,
        count: 5,
        spacing: 18,
        biomeFactories: BIOMES.map(() => makeEmptyCluster),
      }),
      createLayer(scene, {
        factor: 0.5,
        count: 6,
        spacing: 15,
        biomeFactories: BIOMES.map(() => makeEmptyCluster),
      }),
    ];
  }

  // distance is the track's world-units-this-frame (speed * delta). geomIndex is
  // the biome whose geometry newly recycled clusters should adopt.
  update(distance, geomIndex = 0, biomeState = null) {
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
    this.horizons.setBlend(biomeState || { fromIndex: geomIndex, toIndex: geomIndex, transition: 0 });
    this.horizons.tickScroll(distance);
  }

  // Live-update the sky dome gradient (called each frame by the biome crossfade).
  setSkyColors(topHex, bottomHex) {
    const u = this.sky.material.uniforms;
    u.topColor.value.set(topHex);
    u.bottomColor.value.set(bottomHex);
  }

  getForestLayerTuning() {
    return this.getLayerTuning(1);
  }

  setForestLayerTuning(layerIndex, tuning) {
    this.setLayerTuning(1, layerIndex, tuning);
  }

  getLayerTuning(groupIndex = 1) {
    return this.horizons.getLayerTuning(groupIndex);
  }

  setLayerTuning(groupIndex, layerIndex, tuning) {
    this.horizons.setLayerTuning(groupIndex, layerIndex, tuning);
  }

  // Instantly dress every cluster to one biome (used at startup so the initial
  // geometry matches the starting biome rather than always defaulting to forest).
  setBiome(geomIndex) {
    for (const layer of this.layers) {
      for (const cluster of layer.clusters) {
        redressCluster(cluster, geomIndex);
      }
    }
    this.horizons.setBlend({ fromIndex: geomIndex, toIndex: geomIndex, transition: 0 });
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
      const g = make(i);
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

function makeEmptyCluster() {
  return new THREE.Group();
}

// --- Forest geometry -----------------------------------------------------------

// Castle/library ruins on both sides, set well back, with glowing windows.
function makeRuinCluster() {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.ruinStone, fog: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.ruinGlow, fog: false });

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
  const leafMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.canopyLeaf, fog: false });
  const highlightMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.canopyHighlight, fog: false });
  const branchMat = new THREE.MeshBasicMaterial({ color: BIOME_MATS.forest.canopyBranch, fog: false });

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
  const trees = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const mat = pickRandom(pineMaterials);
      const tree = new THREE.Sprite(mat);
      const th = randRange(4.5, 6.0);
      tree.scale.set(th * mat.userData.aspect, th, 1);
      tree.position.set(side * randRange(5, 12), th / 2, 0);
      group.add(tree);
      trees.push(tree);
    }
  }

  group.userData.redress = () => {
    for (const tree of trees) {
      const side = tree.position.x < 0 ? -1 : 1;
      tree.position.x = side * randRange(5, 12);
      const m = pickRandom(pineMaterials);
      tree.material = m;
      const th = randRange(4.5, 6.0);
      tree.scale.set(th * m.userData.aspect, th, 1);
      tree.position.y = th / 2;
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
  const rockMat = new THREE.MeshBasicMaterial({ map: rockTexture, color: BIOME_MATS.mountains.ridge, fog: true });

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

// Near: boulders plus the occasional pine billboard. Pines now use the
// painted Gandalf pine-tree sprite sheet rather than cone+cylinder geometry.
function makeMountainNear() {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshBasicMaterial({ map: rockTexture, color: BIOME_MATS.mountains.boulder, fog: true });

  const boulders = [];
  const pines = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(randRange(0.6, 1.3), 0), rockMat);
      boulder.position.set(side * randRange(6, 11), randRange(0.3, 0.9), randRange(-3, 3));
      boulder.rotation.set(randRange(0, Math.PI), randRange(0, Math.PI), 0);
      group.add(boulder);
      boulders.push(boulder);
    }

    const pmat = pickRandom(pineMaterials);
    const pine = new THREE.Sprite(pmat);
    const ph = randRange(4.0, 5.5);
    pine.scale.set(ph * pmat.userData.aspect, ph, 1);
    pine.position.set(side * randRange(7, 12), ph / 2, 0);
    pine.userData.baseHeight = ph;
    group.add(pine);
    pines.push(pine);
  }

  group.userData.redress = () => {
    for (const b of boulders) {
      const side = b.position.x < 0 ? -1 : 1;
      b.position.x = side * randRange(6, 12);
      b.scale.setScalar(randRange(0.8, 1.3));
    }
    for (const p of pines) {
      const side = p.position.x < 0 ? -1 : 1;
      p.position.x = side * randRange(7, 12);
      const m = pickRandom(pineMaterials);
      p.material = m;
      const ph = randRange(4.0, 5.5);
      p.scale.set(ph * m.userData.aspect, ph, 1);
      p.position.y = ph / 2;
    }
  };
  return group;
}

// --- Desert geometry -----------------------------------------------------------

// Far: flat-topped mesas/buttes plus a low dune silhouette.
function makeDesertMesas() {
  const group = new THREE.Group();
  const mesaMat = new THREE.MeshBasicMaterial({ map: desertRockTexture, color: BIOME_MATS.desert.mesa, fog: true });
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

// --- Cloud band ----------------------------------------------------------------

// One sky cluster per biome — clouds (biome-palette) + sun (biome-tinted) + a
// few drifting bird silhouettes. Sits high in the sky on the farthest, slowest
// parallax layer.
function makeCloudCluster(biomeKey, clusterIndex = 0) {
  const group = new THREE.Group();
  const sprites = cloudSprites[biomeKey];
  const items = [];

  // Fewer, more spread-out clouds per cluster so they don't visually stack.
  for (let i = 0; i < 3; i++) {
    const tex = sprites[Math.floor(Math.random() * sprites.length)];
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.05,
      fog: false, // skip biome fog so painted cloud colours stay visible
      depthWrite: false,
    });
    const w = randRange(10, 18);
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.45), mat);
    cloud.position.set(randRange(-40, 40), randRange(24, 44), randRange(-8, 8));
    group.add(cloud);
    items.push(cloud);
  }

  // Sun, biome-tinted. Only the lead cluster gets one so the sky never repeats
  // multiple suns across the visible cloud band.
  const biomeIndex = CLOUD_KEYS.indexOf(biomeKey);
  let sun = null;
  if (clusterIndex === 0) {
    const sunMat = new THREE.MeshBasicMaterial({
      map: sunTexture,
      color: SUN_TINTS[biomeIndex],
      transparent: true,
      alphaTest: 0.05,
      fog: false, // celestial body, don't fade with fog
      depthWrite: false,
    });
    sun = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), sunMat);
    sun.position.set(randRange(-18, 18), randRange(30, 42), -6);
    group.add(sun);
  }

  group.userData.redress = () => {
    for (const c of items) {
      c.material.map = sprites[Math.floor(Math.random() * sprites.length)];
      c.position.x = randRange(-40, 40);
      c.position.y = randRange(24, 44);
      const w = randRange(10, 18);
      c.geometry.dispose();
      c.geometry = new THREE.PlaneGeometry(w, w * 0.45);
    }
    if (sun) {
      sun.position.x = randRange(-18, 18);
      sun.position.y = randRange(30, 42);
    }
  };
  return group;
}

// --- Horizon backdrops --------------------------------------------------------

function createHorizons(scene) {
  const biomeOrder = BIOMES.map((biome) => biome.name);
  const groups = biomeOrder.map((key) => {
    const group = new THREE.Group();
    group.userData.layers = [];
    if (!key || !HORIZON_LAYER_SETS[key]) return group;

    const set = HORIZON_LAYER_SETS[key];
    for (let i = 0; i < set.layers.length; i++) {
      const layer = set.layers[i];
      const aspect = layer.aspect || set.aspect;
      const scale = layer.scale || 1;
      const arc = layer.arc * scale;
      const arcLength = layer.radius * arc;
      const height = arcLength / aspect;
      const tex = getHorizonTex(layer.folder || set.folder, layer.file).clone();
      tex.needsUpdate = true;
      if (layer.offsetX) tex.offset.x = layer.offsetX;

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.05,
        opacity: layer.opacity,
        fog: false,
        depthWrite: false,
        side: layer.flat ? THREE.DoubleSide : THREE.BackSide,
      });
      const geometry = layer.flat
        ? new THREE.PlaneGeometry(arcLength, height)
        : new THREE.CylinderGeometry(
          layer.radius,
          layer.radius,
          height,
          64,
          1,
          true,
          Math.PI - arc / 2,
          arc
        );
      const band = new THREE.Mesh(geometry, mat);
      // Keep the lower edge fixed so larger art grows upward into the sky.
      band.position.y = layer.bottom + height / 2;
      if (layer.flat) band.position.z = -layer.radius;
      band.renderOrder = -20 + i;
      group.add(band);
      group.userData.layers.push({
        tex,
        mat,
        mesh: band,
        file: layer.file,
        driftX: layer.driftX,
        opacity: layer.opacity,
        baseWidth: arcLength,
        baseHeight: height,
        baseBottom: layer.bottom,
        tuneScale: 1,
        tuneBottom: layer.bottom,
      });
    }
    return group;
  });
  for (const group of groups) scene.add(group);

  let visibleGroups = [0];
  setGroupOpacity(0, 1);
  for (let i = 1; i < groups.length; i++) {
    groups[i].visible = false;
    setGroupOpacity(i, 0);
  }

  function setGroupOpacity(idx, amount) {
    const group = groups[idx];
    group.visible = amount > 0.001;
    for (const layer of group.userData.layers) {
      layer.mat.opacity = layer.opacity * amount;
    }
  }

  return {
    setBiome(idx) {
      this.setBlend({ fromIndex: idx, toIndex: idx, transition: 0 });
    },
    setBlend({ fromIndex = 0, toIndex = fromIndex, transition = 0 }) {
      const activeIndex = transition < 0.5 ? fromIndex : toIndex;
      visibleGroups = [activeIndex];
      for (let i = 0; i < groups.length; i++) {
        setGroupOpacity(i, i === activeIndex ? 1 : 0);
      }
    },
    tickScroll(distance) {
      for (const groupIndex of visibleGroups) {
        const layers = groups[groupIndex].userData.layers;
        for (const layer of layers) {
          layer.tex.offset.x = (layer.tex.offset.x + distance * layer.driftX) % 1;
        }
      }
    },
    getLayerTuning(groupIndex = 1) {
      return groups[groupIndex].userData.layers.map((layer, index) => ({
        index,
        file: layer.file,
        scale: layer.tuneScale,
        bottom: layer.tuneBottom,
      }));
    },
    setLayerTuning(groupIndex, layerIndex, { scale, bottom }) {
      const layer = groups[groupIndex]?.userData.layers[layerIndex];
      if (!layer) return;
      if (Number.isFinite(scale)) layer.tuneScale = Math.min(2.4, Math.max(0.45, scale));
      if (Number.isFinite(bottom)) layer.tuneBottom = Math.min(20, Math.max(-80, bottom));
      layer.mesh.scale.setScalar(layer.tuneScale);
      layer.mesh.position.y = layer.tuneBottom + (layer.baseHeight * layer.tuneScale) / 2;
    },
  };
}

// Underwater sky cluster: fish silhouettes drifting at various depths plus
// scattered bubble specks. No sun, no clouds — replaces the cloud-band content
// for the underwater biome on the same slow-drift parallax layer.
function makeUnderwaterSkyCluster() {
  const group = new THREE.Group();
  const fish = [];
  const bubbles = [];

  const fishCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < fishCount; i++) {
    const tex = fishTextures[Math.floor(Math.random() * fishTextures.length)];
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.2,
      fog: true,
      depthWrite: false,
    });
    const w = randRange(2.5, 5.5);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), mat);
    f.position.set(randRange(-24, 24), randRange(8, 38), randRange(-4, 4));
    // Random horizontal flip so they don't all face the same way.
    if (Math.random() < 0.5) f.scale.x = -1;
    group.add(f);
    fish.push(f);
  }

  const bubbleCount = 8 + Math.floor(Math.random() * 6);
  for (let i = 0; i < bubbleCount; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: bubbleTexture,
      transparent: true,
      alphaTest: 0.05,
      fog: true,
      depthWrite: false,
    });
    const s = randRange(0.4, 1.0);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
    b.position.set(randRange(-26, 26), randRange(4, 36), randRange(-4, 4));
    group.add(b);
    bubbles.push(b);
  }

  group.userData.redress = () => {
    for (const f of fish) {
      f.material.map = fishTextures[Math.floor(Math.random() * fishTextures.length)];
      f.position.x = randRange(-24, 24);
      f.position.y = randRange(8, 38);
      f.scale.x = Math.random() < 0.5 ? -1 : 1;
    }
    for (const b of bubbles) {
      b.position.x = randRange(-26, 26);
      b.position.y = randRange(4, 36);
    }
  };
  return group;
}
