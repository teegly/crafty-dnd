import * as THREE from 'three';
import { assetUrl } from './util.js';
import { BIOMES } from './biomes.js';
import { HORIZON_LAYER_SETS } from './horizonLayers.js';

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
  const startPalette = BIOMES[0].palette;
  const top = new THREE.Color(startPalette.skyTop);
  const bottom = new THREE.Color(startPalette.skyBottom);

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
// many radians. Cover enough horizontal span for wide preview windows so layer
// side edges stay off-screen across every biome.
const HORIZON_COVER_WIDTH = 3.2;
const HORIZON_COVER_ARC = 3.2;

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
      // visible. Tile repeatable layers across the extra width. Widen `single`
      // layers too, but keep repeat.x at 1 so a lone moon or sun does not copy.
      let repeatX = 1;
      let planeWidth = arcLength;
      let thetaLength = arc;
      let segments = 64;
      if (layer.flat) {
        const coverWidth = layer.cover || HORIZON_COVER_WIDTH;
        planeWidth = Math.max(arcLength, layer.radius * coverWidth);
        if (!layer.single) {
          repeatX = planeWidth / arcLength;
        }
      } else if (!layer.single) {
        thetaLength = Math.max(arc, HORIZON_COVER_ARC);
        repeatX = thetaLength / arc;
        segments = Math.min(192, Math.ceil(64 * (thetaLength / arc)));
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

  function setGroupRenderBase(idx, base) {
    const layers = groups[idx].userData.layers;
    for (let i = 0; i < layers.length; i++) {
      layers[i].mesh.renderOrder = base + i;
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
      const isTransitioning = transition > 0 && fromIndex !== toIndex;
      if (!isTransitioning) {
        visibleGroups = [fromIndex];
        for (let i = 0; i < groups.length; i++) {
          setGroupOpacity(i, i === fromIndex ? 1 : 0);
          setGroupRenderBase(i, -20);
        }
        return;
      }
      // Crossfade: both groups visible and scrolling. The incoming group gets a
      // higher renderOrder base so it composites over the outgoing one (only
      // matters within the transparent pass; corridor sprites sit at 0+).
      visibleGroups = [fromIndex, toIndex];
      for (let i = 0; i < groups.length; i++) {
        if (i === fromIndex) {
          setGroupRenderBase(i, -20);
          setGroupOpacity(i, 1 - transition);
        } else if (i === toIndex) {
          setGroupRenderBase(i, -10);
          setGroupOpacity(i, transition);
        } else {
          setGroupOpacity(i, 0);
        }
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
