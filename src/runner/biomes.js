import * as THREE from 'three';

// Exterior biome rotation. The corridor (TrackGenerator) is unchanged; only the
// backdrop (Background.js) geometry and the global sky/fog/background colours
// rotate through biomes as the player travels. This module owns the atmosphere
// palettes + timing and the distance -> biome resolution. The per-biome backdrop
// geometry and its material colours live in Background.js.

// Ordered cycle: forest -> mountains -> desert -> (loop). `forest` matches the
// original Background palette so nothing changes at distance 0.
export const BIOMES = [
  {
    name: 'forest',
    palette: { skyTop: 0x9aae6b, skyBottom: 0x182011, fog: 0x4b4b2e, background: 0x182011 },
  },
  {
    name: 'mountains',
    palette: { skyTop: 0x8094a6, skyBottom: 0x1b232b, fog: 0x4a545f, background: 0x1b232b },
  },
  {
    name: 'desert',
    palette: { skyTop: 0xd9aa6a, skyBottom: 0x2e2114, fog: 0x6f5436, background: 0x2e2114 },
  },
  {
    name: 'underwater',
    palette: { skyTop: 0x3f8a9a, skyBottom: 0x0b2330, fog: 0x1d4f59, background: 0x0b2330 },
  },
];

// World-units per biome (~60s at base speed 10) and the crossfade window at the
// end of each biome. Both tunable.
export const BIOME_DISTANCE = 600;
export const TRANSITION_DISTANCE = 120;

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
    background: lerpHex(pa.background, pb.background, t),
  };
}

// Given the cumulative distance travelled, return which biome's GEOMETRY newly
// recycled backdrop clusters should use, plus the (possibly crossfaded) global
// colours to apply this frame. During the transition window at the end of a
// biome, geomIndex flips to the incoming biome (so new clusters arrive as the
// next biome) while the colours lerp from the current biome to the next.
export function resolveBiome(totalDistance) {
  const n = BIOMES.length;
  const tf = TRANSITION_DISTANCE / BIOME_DISTANCE;
  const pos = totalDistance / BIOME_DISTANCE;
  const base = ((Math.floor(pos) % n) + n) % n;
  const frac = pos - Math.floor(pos);

  if (frac > 1 - tf) {
    const t = (frac - (1 - tf)) / tf;
    const next = (base + 1) % n;
    return { geomIndex: next, colors: lerpPalette(BIOMES[base].palette, BIOMES[next].palette, t) };
  }
  return { geomIndex: base, colors: { ...BIOMES[base].palette } };
}
