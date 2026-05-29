import * as THREE from 'three';
import { assetUrl } from './util.js';
import { BIOMES } from './biomes.js';

// The background has two parts:
//
//  A) A gradient sky dome for tone (cheap: one large inward-facing sphere with a
//     vertical-gradient shader, unaffected by fog so it stays a clean backdrop).
//     Its colours are driven live by the biome crossfade (see setSkyColors).
//  B) Horizon parallax layers: per-biome sets of tall PNGs wrapped behind the
//     corridor (one group per biome, only the active one visible). They are
//     UV-scrolled so the scenery drifts as Crafty walks forward, and crossfade
//     between biomes. See createHorizons.
//
// All backdrop meshes are unlit MeshBasicMaterial, so their look comes from
// their own colours, NOT the scene lights. That is why biome restyling never
// touches the lighting (and the lit corridor stays unchanged).

// Horizon parallax layers — biome-themed PNGs wrapped behind the corridor.
// Tall vertical-format source images that get UV-scrolled over time so the
// scenery "rises"/drifts as Crafty walks forward.
const _skyLoader = new THREE.TextureLoader();
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
// in the scene as a wide plane. Layers are arranged front-to-back; driftX is
// how fast the texture scrolls as Crafty walks forward (closer layers scroll
// faster for parallax).
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
      { file: '4_desert_moon.png', aspect: 3800 / 2400, radius: 94, arc: 1.35, bottom: -56, opacity: 1, driftX: 0.00013, flat: true, scale: 1.19, single: true },
      { file: '3_desert_cloud.png', aspect: 1900 / 1000, radius: 84, arc: 1.45, bottom: -13, opacity: 1, driftX: 0.0002, flat: true },
      { file: '2_desert_mountain.png', aspect: 3800 / 1000, radius: 74, arc: 1.42, bottom: 3, opacity: 1, driftX: 0.00032, flat: true, scale: 1.29 },
      { file: '1_desert_dunemid.png', aspect: 1900 / 1000, radius: 64, arc: 1.58, bottom: -5, opacity: 1, driftX: 0.0005, flat: true, scale: 1.17 },
      { file: '0_desert_dunefrontt.png', aspect: 3800 / 1000, radius: 54, arc: 1.9, bottom: -3, opacity: 1, driftX: 0.00068, flat: true, scale: 0.86 },
    ],
  },
  ocean: {
    folder: 'ocean',
    layers: [
      { file: '6 ocean sky and sun.png', aspect: 3800 / 1200, radius: 112, arc: 1.6, bottom: -9, opacity: 1, driftX: 0.00004, flat: true, scale: 1.33, single: true },
      { file: '5 ocean clouds.png', aspect: 3800 / 1200, radius: 102, arc: 1.55, bottom: 9, opacity: 1, driftX: 0.00008, flat: true, scale: 1.04 },
      { file: '4 ocean back mountain.png', aspect: 3800 / 1200, radius: 92, arc: 1.5, bottom: -5, opacity: 1, driftX: 0.00016, flat: true, scale: 1.28 },
      { file: '3ocean sun light.png', aspect: 3800 / 1200, radius: 82, arc: 1.48, bottom: -57, opacity: 1, driftX: 0.00024, flat: true, scale: 0.58, single: true },
      { file: '2 ocean sand.png', aspect: 3800 / 1200, radius: 72, arc: 1.55, bottom: 8, opacity: 1, driftX: 0.00034, flat: true },
      { file: '1 ocean sea.png', aspect: 3800 / 1200, radius: 62, arc: 1.7, bottom: -4, opacity: 1, driftX: 0.00052, flat: true },
      { file: '0 ocean wave.png', aspect: 3800 / 1200, radius: 52, arc: 1.9, bottom: -4, opacity: 1, driftX: 0.0007, flat: true },
    ],
  },
};

const _horizonCache = {};
const _blankHorizonTex = makeBlankHorizonTex();
function getHorizonTex(folder, file) {
  const key = `${folder}/${file}`;
  if (!_horizonCache[key]) {
    _horizonCache[key] = loadHorizonTex(`/assets/biomes/${folder}/${file}`);
  }
  return _horizonCache[key];
}

function makeBlankHorizonTex() {
  const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
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
  }

  // distance is the track's world-units-this-frame (speed * delta). geomIndex is
  // the active biome (used as the blend fallback when biomeState is absent).
  update(distance, geomIndex = 0, biomeState = null) {
    this.horizons.setBlend(biomeState || { fromIndex: geomIndex, toIndex: geomIndex, transition: 0 });
    this.horizons.tickScroll(distance);
  }

  // Live-update the sky dome gradient (called each frame by the biome crossfade).
  setSkyColors(topHex, bottomHex) {
    const u = this.sky.material.uniforms;
    u.topColor.value.set(topHex);
    u.bottomColor.value.set(bottomHex);
  }

  getLayerTuning(groupIndex = 1) {
    return this.horizons.getLayerTuning(groupIndex);
  }

  setLayerTuning(groupIndex, layerIndex, tuning) {
    this.horizons.setLayerTuning(groupIndex, layerIndex, tuning);
  }

  // Instantly dress the horizon to one biome (used at startup so the initial
  // backdrop matches the starting biome).
  setBiome(geomIndex) {
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

// --- Horizon backdrops (part B) -----------------------------------------------

// Widescreen horizon coverage (see the build loop in createHorizons): flat
// planes are widened to this multiple of their radius; cylinder bands to this
// many radians. Both cover roughly a 2:1 viewport so the bands' side edges stay
// off-screen on a wide desktop window.
const HORIZON_COVER_WIDTH = 2.1;
const HORIZON_COVER_ARC = 1.65;

function createHorizons(scene) {
  const biomeOrder = BIOMES.map((biome) => biome.name);
  const groups = biomeOrder.map((key, groupIndex) => {
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
      const shouldLoadNow = groupIndex === 0;
      const layerFolder = layer.folder || set.folder;
      const tex = shouldLoadNow ? getHorizonTex(layerFolder, layer.file).clone() : _blankHorizonTex.clone();
      tex.needsUpdate = true;
      if (layer.offsetX) tex.offset.x = layer.offsetX;

      // Widescreen coverage: a wide viewport sees far more horizontally than the
      // square these panoramas were authored for, which left their side edges
      // visible. Widen each band to span ~2:1 and tile the (already seamless,
      // scrolling) image across the extra width via repeat.x, so the art keeps
      // its scale instead of stretching. Layers flagged `single` (a lone moon or
      // sun) are left at their authored width so the feature never duplicates.
      let repeatX = 1;
      let planeWidth = arcLength;
      let thetaLength = arc;
      let segments = 64;
      if (!layer.single) {
        if (layer.flat) {
          planeWidth = Math.max(arcLength, layer.radius * HORIZON_COVER_WIDTH);
          repeatX = planeWidth / arcLength;
        } else {
          thetaLength = Math.max(arc, HORIZON_COVER_ARC);
          repeatX = thetaLength / arc;
          segments = Math.min(192, Math.ceil(64 * (thetaLength / arc)));
        }
      }
      tex.repeat.x = repeatX;

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
        ? new THREE.PlaneGeometry(planeWidth, height)
        : new THREE.CylinderGeometry(
          layer.radius,
          layer.radius,
          height,
          segments,
          1,
          true,
          Math.PI - thetaLength / 2,
          thetaLength
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
        folder: layerFolder,
        file: layer.file,
        loaded: shouldLoadNow,
        driftX: layer.driftX,
        opacity: layer.opacity,
        repeatX,
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

  const preloadRest = () => {
    for (let i = 1; i < groups.length; i++) {
      hydrateGroup(i);
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(preloadRest, { timeout: 2500 });
  } else {
    window.setTimeout(preloadRest, 1200);
  }

  function setGroupOpacity(idx, amount) {
    const group = groups[idx];
    if (amount > 0.001) hydrateGroup(idx);
    group.visible = amount > 0.001;
    for (const layer of group.userData.layers) {
      layer.mat.opacity = layer.opacity * amount;
    }
  }

  function hydrateGroup(idx) {
    const group = groups[idx];
    if (!group) return;
    for (const layer of group.userData.layers) {
      if (layer.loaded) continue;
      const tex = getHorizonTex(layer.folder, layer.file).clone();
      tex.needsUpdate = true;
      tex.offset.x = layer.tex.offset.x;
      tex.repeat.x = layer.repeatX; // keep the widescreen tiling after lazy load
      layer.tex = tex;
      layer.mat.map = tex;
      layer.mat.needsUpdate = true;
      layer.loaded = true;
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
