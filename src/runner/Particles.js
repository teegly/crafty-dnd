import * as THREE from 'three';
import { randRange, sinusoid } from './util.js';

// Ambient atmosphere: slow-drifting dust motes (one cheap THREE.Points draw
// call) plus a handful of larger glowing "wisps" (additive sprites that bob).
// Both drift gently toward the camera and recycle to the far end, so the air
// always feels alive without spawning/destroying anything per frame.

const MOTE_COUNT = 220;
const WISP_COUNT = 7;
const SNOW_COUNT = 350;

// The volume motes/wisps live in (world units), sized to the visible corridor.
const BOUNDS = { x: 8.5, yMin: 0.25, yMax: 8.5, zNear: 12, zFar: -38 };

export class Particles {
  constructor(scene) {
    this.texture = makeSoftDot();

    this.motes = makeMotes(this.texture);
    scene.add(this.motes.points);

    this.wisps = makeWisps(this.texture);
    for (const w of this.wisps) scene.add(w.sprite);

    // Snow: a fall of white dots that's only visible during the mountains
    // biome. Disabled by default; CraftyRunner toggles via setBiome().
    this.snow = makeSnow(this.texture);
    this.snow.points.visible = false;
    scene.add(this.snow.points);
  }

  // Toggle the snow system based on biome index (0 = mountains).
  setBiome(geomIndex) {
    this.snow.points.visible = geomIndex === 0;
  }

  // delta: seconds since last frame. elapsed: total seconds (for bob phase).
  update(delta, elapsed) {
    const pos = this.motes.geometry.attributes.position;
    const v = this.motes.velocities;
    for (let i = 0; i < MOTE_COUNT; i++) {
      const ix = i * 3;
      pos.array[ix] += Math.sin(elapsed * 0.5 + i) * 0.15 * delta; // gentle sway
      pos.array[ix + 1] += v[i] * delta; // slow vertical drift
      pos.array[ix + 2] += (1.7 + v[i]) * delta; // drift toward camera
      if (pos.array[ix + 2] > BOUNDS.zNear) resetMote(pos.array, ix);
    }
    pos.needsUpdate = true;

    for (const w of this.wisps) {
      w.sprite.position.z += w.speed * delta;
      w.sprite.position.y = w.baseY + sinusoid(w.bobFreq, -0.6, 0.6, w.phase, elapsed);
      if (w.sprite.position.z > BOUNDS.zNear) resetWisp(w);
    }

    if (this.snow.points.visible) {
      const sp = this.snow.geometry.attributes.position;
      const sv = this.snow.velocities;
      for (let i = 0; i < SNOW_COUNT; i++) {
        const ix = i * 3;
        sp.array[ix] += Math.sin(elapsed * 0.8 + i) * 0.25 * delta; // sway
        sp.array[ix + 1] -= sv[i] * delta;                          // fall
        sp.array[ix + 2] += 1.4 * delta;                            // drift toward camera
        if (sp.array[ix + 1] < BOUNDS.yMin || sp.array[ix + 2] > BOUNDS.zNear) {
          sp.array[ix] = randRange(-BOUNDS.x * 1.6, BOUNDS.x * 1.6);
          sp.array[ix + 1] = BOUNDS.yMax * 1.4;
          sp.array[ix + 2] = randRange(BOUNDS.zFar, BOUNDS.zNear);
        }
      }
      sp.needsUpdate = true;
    }
  }
}

function makeSnow(texture) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(SNOW_COUNT * 3);
  const velocities = new Float32Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    const ix = i * 3;
    positions[ix] = randRange(-BOUNDS.x * 1.6, BOUNDS.x * 1.6);
    positions[ix + 1] = randRange(BOUNDS.yMin, BOUNDS.yMax * 1.4);
    positions[ix + 2] = randRange(BOUNDS.zFar, BOUNDS.zNear);
    velocities[i] = randRange(0.7, 1.6);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: texture,
    color: 0xeef2ff,
    size: 0.14,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: true,
  });
  return { points: new THREE.Points(geometry, material), geometry, velocities };
}

function makeMotes(texture) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MOTE_COUNT * 3);
  const velocities = new Float32Array(MOTE_COUNT);
  for (let i = 0; i < MOTE_COUNT; i++) {
    const ix = i * 3;
    positions[ix] = randRange(-BOUNDS.x, BOUNDS.x);
    positions[ix + 1] = randRange(BOUNDS.yMin, BOUNDS.yMax);
    positions[ix + 2] = randRange(BOUNDS.zFar, BOUNDS.zNear);
    velocities[i] = randRange(0.1, 0.6);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    map: texture,
    color: 0xf1d49a,
    size: 0.115,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });

  return { points: new THREE.Points(geometry, material), geometry, velocities };
}

function resetMote(arr, ix) {
  arr[ix] = randRange(-BOUNDS.x, BOUNDS.x);
  arr[ix + 1] = randRange(BOUNDS.yMin, BOUNDS.yMax);
  arr[ix + 2] = BOUNDS.zFar;
}

function makeWisps(texture) {
  const wisps = [];
  for (let i = 0; i < WISP_COUNT; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: i % 3 === 0 ? 0xffbd73 : 0xa7c778, // warm candle dust / mossy fey-green
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const sprite = new THREE.Sprite(material);
    const scale = randRange(0.45, 1.1);
    sprite.scale.set(scale * 1.6, scale, 1);
    const w = {
      sprite,
      baseY: randRange(1.5, 6),
      speed: randRange(0.9, 2.1),
      bobFreq: randRange(0.12, 0.32),
      phase: randRange(0, Math.PI * 2),
    };
    sprite.position.set(randRange(-BOUNDS.x, BOUNDS.x), w.baseY, randRange(BOUNDS.zFar, BOUNDS.zNear));
    wisps.push(w);
  }
  return wisps;
}

function resetWisp(w) {
  w.baseY = randRange(1.5, 6);
  w.speed = randRange(0.9, 2.1);
  w.sprite.position.set(randRange(-BOUNDS.x, BOUNDS.x), w.baseY, BOUNDS.zFar);
}

// A soft round dot drawn to a canvas, reused as the texture for motes + wisps.
function makeSoftDot() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
