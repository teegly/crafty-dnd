import * as THREE from 'three';

// Biome definitions + a sprite-with-fallback loader.
//
// A biome themes a stretch of corridor: a colour palette (fog / sky / floor / wall /
// rail / light tint), a set of three obstacle visuals mapped to the three clearance
// types (low = jump, high = slide, block = dodge), a background scenery id, and an
// icon used to label the junction arrow that leads to it.
//
// "Sprite-with-fallback": every themed visual tries to load a PNG; until/unless it
// loads, a generated static placeholder is shown. If the PNG 404s, the placeholder
// stays — nothing ever breaks when art is missing. Art lives under
// public/sprites/biomes/<id>/<name>.png (see public/sprites/biomes/README.md).
//
// This is the single tuning centre for biome look, mirroring the GAME block in
// GameState.js.

export const BIOME = {
  TEMPLE: 'temple',
  HOSPITAL: 'hospital',
  HIGHWAY: 'highway',
  FOREST: 'forest',
};

// Temple's palette equals the original look, so applying Temple is a visual no-op.
export const BIOMES = {
  temple: {
    id: 'temple', name: 'Temple', icon: '/sprites/biomes/temple/icon.png',
    accent: 0x9dff8c,
    // fog/sky are absolute mood colours; surfaceTint is a MULTIPLIER over the
    // originals; lights LERP from their original colour toward `light` by `lightLerp`.
    // Temple uses an identity multiplier + lightLerp 0, so it is pixel-identical.
    palette: {
      fog: 0x4b4b2e, sky: { top: 0x9aae6b, bottom: 0x182011 },
      surfaceTint: 0xffffff, light: 0xffffff, lightLerp: 0,
    },
    // Temple keeps the generic 3D placeholders (no sprite cards).
    obstacles: {
      low: { sprite: null, placeholder: { label: 'Barrier', color: 0x8a6a4a } },
      high: { sprite: null, placeholder: { label: 'Beam', color: 0x6a4326 } },
      block: { sprite: null, placeholder: { label: 'Foe', color: 0x3a1c1c } },
    },
    scenery: 'temple',
  },
  hospital: {
    id: 'hospital', name: 'Hospital', icon: '/sprites/biomes/hospital/icon.png',
    accent: 0x6fd0ff,
    palette: {
      fog: 0xaebfc8, sky: { top: 0xe6eef2, bottom: 0x9fb2bd },
      surfaceTint: 0xc8d4e0, light: 0xd6e8ff, lightLerp: 0.6,
    },
    obstacles: {
      low: { sprite: '/sprites/biomes/hospital/scalpel.png', placeholder: { label: 'Scalpel', color: 0xcdd6dd } },
      high: { sprite: '/sprites/biomes/hospital/needle.png', placeholder: { label: 'Needle', color: 0xdfe6ee } },
      block: { sprite: '/sprites/biomes/hospital/doctor.png', placeholder: { label: 'Doctor', color: 0xeef3f6 } },
    },
    scenery: 'hospital',
  },
  highway: {
    id: 'highway', name: 'Highway', icon: '/sprites/biomes/highway/icon.png',
    accent: 0xffc24d,
    palette: {
      fog: 0x6b6f7a, sky: { top: 0x9aa6b8, bottom: 0x32363f },
      surfaceTint: 0x9a9ea6, light: 0xb9c2d0, lightLerp: 0.55,
    },
    obstacles: {
      low: { sprite: '/sprites/biomes/highway/tree.png', placeholder: { label: 'Tree', color: 0x4a6b2a } },
      high: { sprite: '/sprites/biomes/highway/building.png', placeholder: { label: 'Building', color: 0x8a8d94 } },
      block: { sprite: '/sprites/biomes/highway/car.png', placeholder: { label: 'Car', color: 0xcc3a3a } },
    },
    scenery: 'highway',
  },
  forest: {
    id: 'forest', name: 'Forest', icon: '/sprites/biomes/forest/icon.png',
    accent: 0x7cff6a,
    palette: {
      fog: 0x2f4a2a, sky: { top: 0x86b06a, bottom: 0x15240f },
      surfaceTint: 0x8fb46a, light: 0x9fd86a, lightLerp: 0.6,
    },
    obstacles: {
      low: { sprite: '/sprites/biomes/forest/mushroom.png', placeholder: { label: 'Mushroom', color: 0xcc4a4a } },
      high: { sprite: '/sprites/biomes/forest/fairy.png', placeholder: { label: 'Fairy', color: 0xbfeaff } },
      block: { sprite: '/sprites/biomes/forest/bug.png', placeholder: { label: 'Bug', color: 0x5a4a2a } },
    },
    scenery: 'forest',
  },
};

export const BIOME_ORDER = [BIOME.TEMPLE, BIOME.HOSPITAL, BIOME.HIGHWAY, BIOME.FOREST];

export function getBiome(id) {
  return BIOMES[id] || BIOMES[BIOME.TEMPLE];
}

// Pick two distinct biomes for a junction's left/right arms, preferring to avoid the
// current biome so a turn always changes the scenery.
export function pickTwoBiomes(currentId) {
  const pool = BIOME_ORDER.filter((id) => id !== currentId);
  const a = pool[Math.floor(Math.random() * pool.length)];
  const rest = BIOME_ORDER.filter((id) => id !== a);
  const b = rest[Math.floor(Math.random() * rest.length)];
  return { left: a, right: b };
}

// --- Sprite-with-fallback loader ------------------------------------------------

const _texCache = new Map(); // url -> THREE.Texture (loaded sprite)
const _matCache = new Map(); // url -> shared MeshBasicMaterial (card)

// A shared alpha-card material for `url`, starting on `placeholderTexture` and
// swapping to the loaded sprite on success. On 404/error it keeps the placeholder
// and never throws. Cached by url so every pooled instance shares one material and
// an async load updates them all at once.
export function spriteCardMaterial(url, { placeholderTexture = null, fog = true } = {}) {
  if (!url) return null;
  if (_matCache.has(url)) return _matCache.get(url);

  const mat = new THREE.MeshBasicMaterial({
    map: placeholderTexture,
    transparent: true,
    alphaTest: 0.18, // matches the vine alpha cards
    depthWrite: false,
    side: THREE.DoubleSide,
    fog,
  });
  mat.userData.spriteLoaded = false;
  _matCache.set(url, mat);

  if (_texCache.has(url)) {
    mat.map = _texCache.get(url);
    mat.userData.spriteLoaded = true;
    mat.needsUpdate = true;
    return mat;
  }

  new THREE.TextureLoader().load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      _texCache.set(url, tex);
      mat.map = tex;
      mat.userData.spriteLoaded = true;
      mat.needsUpdate = true;
    },
    undefined,
    () => {
      // Missing art: keep the placeholder. Never throw.
      mat.userData.spriteLoaded = false;
    }
  );
  return mat;
}

// Shared card material for one biome obstacle role (low/high/block). Returns null for
// roles with no sprite (Temple) so the caller uses its 3D placeholder instead.
export function obstacleCardMaterial(biome, role) {
  const def = biome.obstacles[role];
  if (!def || !def.sprite) return null;
  return spriteCardMaterial(def.sprite, {
    placeholderTexture: labeledCardTexture(def.placeholder.label, def.placeholder.color),
  });
}

// Shared card material for a biome's junction-arrow icon (sprite → labelled chip).
// fog:false so the destination label stays readable as the junction approaches.
export function biomeIconMaterial(biome) {
  return spriteCardMaterial(biome.icon, {
    placeholderTexture: chipTexture(biome.name, biome.accent),
    fog: false,
  });
}

// --- Generated placeholder textures ---------------------------------------------

const _labelCache = new Map();
const _chipCache = new Map();

// A rounded colour card with a label — the static placeholder for an obstacle sprite.
function labeledCardTexture(label, colorHex) {
  const key = `${label}|${colorHex}`;
  if (_labelCache.has(key)) return _labelCache.get(key);
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const col = `#${colorHex.toString(16).padStart(6, '0')}`;
  roundRect(ctx, 18, 18, s - 36, s - 36, 28);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  ctx.fillStyle = pickInk(colorHex);
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, s / 2, s / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _labelCache.set(key, tex);
  return tex;
}

// A small pill with the biome name — the placeholder for a biome icon.
function chipTexture(name, accentHex) {
  const key = `${name}|${accentHex}`;
  if (_chipCache.has(key)) return _chipCache.get(key);
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const col = `#${accentHex.toString(16).padStart(6, '0')}`;
  roundRect(ctx, 8, 30, w - 16, h - 60, 30);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.fillStyle = pickInk(accentHex);
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _chipCache.set(key, tex);
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Black or white ink depending on the card's luminance, for legible labels.
function pickInk(colorHex) {
  const r = (colorHex >> 16) & 255;
  const g = (colorHex >> 8) & 255;
  const b = colorHex & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#16210f' : '#f3f7e8';
}
