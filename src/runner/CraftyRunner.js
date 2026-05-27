import * as THREE from 'three';
import { TrackGenerator } from './TrackGenerator.js';
import { Avatar } from './Avatar.js';
import { Background } from './Background.js';
import { Particles } from './Particles.js';
import { mapStateToParams } from './state.js';
import { BIOMES, resolveBiome } from './biomes.js';

// Orchestrates the scene, camera, renderer and animation loop.
// Convention: the avatar stays fixed near the origin and the world scrolls
// toward the camera (+z), the "world moves, runner stays" pattern from Boxy-Run.

const TARGET_FPS_MOBILE = 30;
const VERTICAL_FRAME_OFFSET = -0.14;

export class CraftyRunner {
  constructor(container, getState) {
    this.container = container;
    this.getState = getState;

    this.scene = new THREE.Scene();
    // Fog/background start on the first biome (forest) and are crossfaded each
    // frame by the biome rotation (see step). The colour hides segment pop-in at
    // the far end and ties the backdrop to the corridor.
    const startPalette = BIOMES[0].palette;
    this.scene.background = new THREE.Color(startPalette.background); // fallback behind the dome
    this.scene.fog = new THREE.Fog(startPalette.fog, startPalette.fogNear, startPalette.fogFar);

    // Cumulative world-units travelled; drives which biome the exterior shows.
    this.totalDistance = 0;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
    this.camera.position.set(0, 1.35, 2.9);
    this.camera.lookAt(0, 1.75, -1.45);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, precision: 'mediump' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    // Cap pixel ratio: the single highest-impact mobile fix the reference repos missed.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Lighting recipe: warm interior candle pools plus cool dappled canopy light
    // entering through broken walls and collapsed ceiling sections.
    this.scene.add(new THREE.HemisphereLight(0xc2d391, 0x3b2b14, 0.68));
    this.scene.add(new THREE.AmbientLight(0x525639, 0.34));
    const canopy = new THREE.DirectionalLight(0xd4efaa, 1.05);
    canopy.position.set(-3.5, 12, -4);
    this.scene.add(canopy);
    for (const z of [-4, -12, -22]) {
      const candle = new THREE.PointLight(0xffbd72, 6.4, 13, 2);
      candle.position.set(z === -12 ? 2.5 : -2.5, 1.7, z);
      this.scene.add(candle);
    }
    const runnerFill = new THREE.PointLight(0xffd08a, 1.7, 5.4, 2);
    runnerFill.position.set(0, 2.2, 1.6);
    this.scene.add(runnerFill);

    this.background = new Background(this.scene);
    this.background.setBiome(resolveBiome(this.totalDistance).geomIndex);
    this.track = new TrackGenerator(this.scene);
    this.particles = new Particles(this.scene);
    this.avatar = new Avatar();
    this.scene.add(this.avatar.object3d);

    this.timer = new THREE.Timer();

    // Optional 30fps cap on coarse-pointer (touch) devices. Movement uses delta
    // time, so motion speed is identical whether or not the cap is active.
    this.capFps = window.matchMedia('(pointer: coarse)').matches;
    this.frameInterval = 1 / TARGET_FPS_MOBILE;
    this.accumulator = 0;

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  tick() {
    this.timer.update();
    const delta = this.timer.getDelta();

    if (this.capFps) {
      this.accumulator += delta;
      if (this.accumulator < this.frameInterval) return;
      this.step(this.accumulator);
      this.accumulator = 0;
    } else {
      this.step(delta);
    }
  }

  step(delta) {
    const params = mapStateToParams(this.getState());
    const elapsed = this.timer.getElapsed();
    const distance = params.speed * delta;

    // Advance the biome cycle and crossfade the global colours. Backdrop geometry
    // swaps per recycled cluster via the geomIndex; lights stay constant so the
    // corridor look is unchanged.
    this.totalDistance += distance;
    const biome = resolveBiome(this.totalDistance);
    this.background.setSkyColors(biome.colors.skyTop, biome.colors.skyBottom);
    this.scene.fog.color.set(biome.colors.fog);
    this.scene.fog.near = biome.colors.fogNear;
    this.scene.fog.far = biome.colors.fogFar;
    this.scene.background.set(biome.colors.background);

    this.track.update(distance, elapsed);
    this.track.setBiome(biome.geomIndex);
    this.background.update(distance, biome.geomIndex); // parallax: each layer scales distance down
    this.particles.setBiome(biome.geomIndex);
    this.particles.update(delta, elapsed);
    this.avatar.update(elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    // Keep a square 1:1 viewport per the brief.
    const size = Math.min(this.container.clientWidth, this.container.clientHeight) || 1;
    this.renderer.setSize(size, size, false);
    this.renderer.domElement.style.width = `${size}px`;
    this.renderer.domElement.style.height = `${size}px`;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[9] = VERTICAL_FRAME_OFFSET;
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
