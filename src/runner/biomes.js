import * as THREE from 'three';

// Exterior biome rotation. The corridor (TrackGenerator) is unchanged; only the
// backdrop (Background.js) geometry and the global sky/fog/background colours
// rotate through biomes as the player travels. This module owns the atmosphere
// palettes + timing and the distance -> biome resolution. The per-biome backdrop
// geometry and its material colours live in Background.js.

// Ordered cycle: mountains/winter -> forest -> (loop). Mountains is first so
// the official load starts on the snow biome. Desert is archived for now; its
// backdrop assets and code remain available for a future rework.
export const BIOMES = [
  {
    name: 'mountains',
    palette: { skyTop: 0x8094a6, skyBottom: 0x1b232b, fog: 0x4a545f, fogNear: 9, fogFar: 54, background: 0x1b232b },
  },
  {
    name: 'forest',
    palette: { skyTop: 0x9ab0c4, skyBottom: 0x2a3024, fog: 0x4b4b2e, fogNear: 180, fogFar: 220, background: 0x2a3024 },
  },
];

// World-units per biome (~3 minutes at base speed 10) and the crossfade window at the
// end of each biome. Both tunable.
export const BIOME_DISTANCE = 1800;
export const TRANSITION_DISTANCE = 420;

const _a = new THREE.Color();
const _b = new THREE.Color();

function lerpHex(a, b, t) {
  _a.set(a);
  _b.set(b);
  return _a.lerp(_b, t).getHex();
}

function lerpPalette(pa, pb, t) {
  return {
    skyTop: lerpHex(pa.skyTop, pb.skyTop, t),
    skyBottom: lerpHex(pa.skyBottom, pb.skyBottom, t),
    fog: lerpHex(pa.fog, pb.fog, t),
    fogNear: THREE.MathUtils.lerp(pa.fogNear, pb.fogNear, t),
    fogFar: THREE.MathUtils.lerp(pa.fogFar, pb.fogFar, t),
    background: lerpHex(pa.background, pb.background, t),
  };
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Given the cumulative distance travelled, return which biome's geometry newly
// recycled backdrop clusters should use, plus the crossfaded global colours to
// apply this frame. During the transition window, the old biome remains dominant
// first, then the incoming biome takes over after the midpoint.
export function resolveBiome(totalDistance) {
  const n = BIOMES.length;
  const tf = TRANSITION_DISTANCE / BIOME_DISTANCE;
  const pos = totalDistance / BIOME_DISTANCE;
  const base = ((Math.floor(pos) % n) + n) % n;
  const frac = pos - Math.floor(pos);

  if (frac > 1 - tf) {
    const t = smoothstep((frac - (1 - tf)) / tf);
    const next = (base + 1) % n;
    return {
      geomIndex: t < 0.5 ? base : next,
      fromIndex: base,
      toIndex: next,
      transition: t,
      colors: lerpPalette(BIOMES[base].palette, BIOMES[next].palette, t),
    };
  }
  return { geomIndex: base, fromIndex: base, toIndex: base, transition: 0, colors: { ...BIOMES[base].palette } };
}
