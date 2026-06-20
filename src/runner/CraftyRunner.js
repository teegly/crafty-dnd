import * as THREE from 'three';
import { TrackGenerator } from './TrackGenerator.js';
import { Avatar } from './Avatar.js';
import { Background } from './Background.js';
import { Particles } from './Particles.js';
import { mapStateToParams } from './state.js';
import { BIOMES, resolveBiome } from './biomes.js';
import { createPortal } from './Props.js';
import { applyBiomeFrame } from './runnerFrame.js';
import { createPortalAmbienceMesh, resizePortalAmbienceMesh } from './portalAmbience.js';

// Orchestrates the scene, camera, renderer and animation loop.
// Convention: the avatar stays fixed near the origin and the world scrolls
// toward the camera (+z), the "world moves, runner stays" pattern from Boxy-Run.

const VERTICAL_FRAME_OFFSET = -0.22;
const DEFAULT_CAMERA_FOV = 55;
const DEFAULT_VIEW_OFFSET_X = 0;
const DEFAULT_VIEW_OFFSET_Y = 0.04;
const PORTAL_START_Z = -18;
const PORTAL_PREVIEW_Z = -10;
const PORTAL_PASS_Z = -0.35;
const PORTAL_BASE_Y = 0;
const PORTAL_AFTERGLOW_SECONDS = 1.45;
const MAX_STEP_DELTA = 0.05;

export class CraftyRunner {
  constructor(container, getState, { quality } = {}) {
    this.container = container;
    this.getState = getState;
    this.quality = quality || {
      name: 'high',
      pixelRatioCap: 2,
      antialias: true,
      targetFps: 60,
      particleDensity: 1,
      powerPreference: 'high-performance',
    };

    this.scene = new THREE.Scene();
    // Fog/background start on the first biome (mountains) and are crossfaded each
    // frame by the biome rotation (see step). The colour hides segment pop-in at
    // the far end and ties the backdrop to the corridor.
    const startPalette = BIOMES[0].palette;
    this.scene.background = new THREE.Color(startPalette.background); // fallback behind the dome
    this.scene.fog = new THREE.Fog(startPalette.fog, startPalette.fogNear, startPalette.fogFar);

    // Cumulative world-units travelled; drives which biome the exterior shows.
    this.totalDistance = 0;

    this.camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, 1, 0.1, 220);
    this.camera.position.set(0, 1.35, 2.9);
    this.camera.lookAt(0, 1.75, -1.45);
    this.scene.add(this.camera);
    this.viewOffsetX = DEFAULT_VIEW_OFFSET_X;
    this.viewOffsetY = DEFAULT_VIEW_OFFSET_Y;

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.quality.antialias,
      powerPreference: this.quality.powerPreference,
      precision: 'mediump',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
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
    this.particles = new Particles(this.scene, { density: this.quality.particleDensity });
    this.avatar = new Avatar();
    this.scene.add(this.avatar.object3d);
    this.portal = null;
    this.portalTransition = null;
    this.portalAfterglow = 0;
    this.portalAmbience = createPortalAmbienceMesh(this.camera);
    this.camera.add(this.portalAmbience);

    this.timer = new THREE.Timer();

    // Optional FPS cap from quality preset. Movement uses delta time, so motion
    // speed is identical whether or not the cap is active.
    this.capFps = this.quality.targetFps < 60;
    this.frameInterval = 1 / (this.capFps ? this.quality.targetFps : 60);
    this.accumulator = 0;
    this.desiredRunning = false;
    this.isInViewport = true;
    this.isPageVisible = document.visibilityState !== 'hidden';
    this.stats = {
      fps: 0,
      frames: 0,
      lastSampleTime: performance.now(),
      pixelRatio: this.renderer.getPixelRatio(),
      quality: this.quality.name,
    };

    this._onResize = this.resize.bind(this);
    this._onVisibilityChange = this.handleVisibilityChange.bind(this);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this.setupViewportObserver();
    this.resize();
  }

  start() {
    this.desiredRunning = true;
    this.syncAnimationLoop();
  }

  stop() {
    this.desiredRunning = false;
    this.accumulator = 0;
    this.renderer.setAnimationLoop(null);
  }

  syncAnimationLoop() {
    if (this.desiredRunning && this.isInViewport && this.isPageVisible) {
      this.renderer.setAnimationLoop(() => this.tick());
    } else {
      this.renderer.setAnimationLoop(null);
    }
  }

  setupViewportObserver() {
    if (!('IntersectionObserver' in window)) return;
    this.viewportObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      this.isInViewport = Boolean(entry?.isIntersecting);
      this.syncAnimationLoop();
      if (this.isInViewport && !this.desiredRunning) {
        this.renderCurrentFrame();
      }
    }, { threshold: 0.05 });
    this.viewportObserver.observe(this.container);
  }

  handleVisibilityChange() {
    this.isPageVisible = document.visibilityState !== 'hidden';
    this.syncAnimationLoop();
    if (this.isPageVisible && !this.desiredRunning) {
      this.renderCurrentFrame();
    }
  }

  // Deliberate dev/console freeze helper (kept on purpose): halts rendering
  // WITHOUT flipping desiredRunning, so the viewport observer resumes the loop
  // naturally. Not called from app code; used via window.__craftyRunner.
  stopLoopOnly() {
    this.accumulator = 0;
    this.renderer.setAnimationLoop(null);
  }

  setCameraFov(fov) {
    this.camera.fov = Math.min(85, Math.max(35, fov));
    this.updateCameraProjection();
    this.updatePortalAmbienceScale();
    this.renderer.render(this.scene, this.camera);
  }

  resetCameraFov() {
    this.setCameraFov(DEFAULT_CAMERA_FOV);
  }

  setViewOffset(x, y) {
    this.viewOffsetX = Math.min(0.45, Math.max(-0.45, x));
    this.viewOffsetY = Math.min(0.45, Math.max(-0.45, y));
    this.updateCameraProjection();
    this.renderCurrentFrame();
  }

  resetViewOffset() {
    this.setViewOffset(DEFAULT_VIEW_OFFSET_X, DEFAULT_VIEW_OFFSET_Y);
  }

  getLayerTuning(groupIndex = 1) {
    return this.background.getLayerTuning(groupIndex);
  }

  setLayerTuning(groupIndex, layerIndex, tuning) {
    this.background.setLayerTuning(groupIndex, layerIndex, tuning);
    this.renderCurrentFrame();
  }

  setPreviewDistance(distance) {
    this.portalTransition = null;
    this.portalAfterglow = 0;
    this.setPortalAmbience(0, this.timer.getElapsed());
    if (this.portal) this.portal.visible = false;
    this.totalDistance = Math.max(0, distance);
    this.renderCurrentFrame();
  }

  previewPortal() {
    const portal = this.ensurePortal();
    this.portalTransition = {
      targetDistance: this.totalDistance,
      triggered: false,
      previewOnly: true,
    };
    portal.position.set(0, PORTAL_BASE_Y, PORTAL_PREVIEW_Z);
    portal.rotation.y = 0;
    portal.visible = true;
    this.renderCurrentFrame();
  }

  transitionToDistance(distance) {
    if (this.portalTransition) {
      return false;
    }
    const targetDistance = Math.max(0, distance);
    if (Math.abs(targetDistance - this.totalDistance) < 0.001) {
      return false;
    }
    const portal = this.ensurePortal();
    this.portalTransition = {
      targetDistance,
      triggered: false,
    };
    portal.position.set(0, PORTAL_BASE_Y, PORTAL_START_Z);
    portal.rotation.y = 0;
    portal.visible = true;
    this.setPortalAmbience(0.05, this.timer.getElapsed());
    this.start();
    return true;
  }

  ensurePortal() {
    if (!this.portal) {
      this.portal = createPortal();
      this.portal.position.set(0, PORTAL_BASE_Y, PORTAL_START_Z);
      this.scene.add(this.portal);
    }
    return this.portal;
  }

  renderCurrentFrame() {
    const biome = resolveBiome(this.totalDistance);
    const elapsed = this.timer.getElapsed();
    applyBiomeFrame(this, biome, elapsed);
    this.updatePortalAmbience(0, elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  tick() {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), MAX_STEP_DELTA);

    if (this.capFps) {
      this.accumulator += delta;
      if (this.accumulator < this.frameInterval) return;
      this.step(Math.min(this.accumulator, MAX_STEP_DELTA));
      this.accumulator = 0;
    } else {
      this.step(delta);
    }
  }

  step(delta) {
    const params = mapStateToParams(this.getState());
    const elapsed = this.timer.getElapsed();
    const distance = params.speed * delta;

    this.totalDistance += distance;
    this.track.update(distance, elapsed);
    this.updatePortalTransition(distance);

    // Advance the biome cycle and crossfade the global colours. Backdrop geometry
    // swaps per recycled cluster via the geomIndex; lights stay constant so the
    // corridor look is unchanged.
    const biome = resolveBiome(this.totalDistance);
    applyBiomeFrame(this, biome, elapsed, distance);
    this.particles.update(delta, elapsed);
    this.updatePortalAmbience(delta, elapsed);
    this.renderer.render(this.scene, this.camera);
    this.sampleStats();
  }

  updatePortalTransition(distance) {
    if (!this.portalTransition || !this.portal) return;
    const progress = THREE.MathUtils.clamp(
      (this.portal.position.z - PORTAL_START_Z) / (PORTAL_PASS_Z - PORTAL_START_Z),
      0,
      1
    );
    const easedDistance = distance * THREE.MathUtils.lerp(0.72, 1.18, THREE.MathUtils.smoothstep(progress, 0, 1));
    this.portal.position.z += easedDistance;
    this.portal.rotation.y = Math.sin(this.timer.getElapsed() * 1.8) * 0.06;

    if (this.portal.position.z >= PORTAL_PASS_Z && !this.portalTransition.triggered) {
      this.portalTransition.triggered = true;
      if (!this.portalTransition.previewOnly) {
        this.totalDistance = this.portalTransition.targetDistance;
        this.portalAfterglow = PORTAL_AFTERGLOW_SECONDS;
      }
      this.portal.visible = false;
      this.portalTransition = null;
    }
  }

  sampleStats() {
    this.stats.frames += 1;
    const now = performance.now();
    const elapsed = now - this.stats.lastSampleTime;
    if (elapsed < 1000) return;
    this.stats.fps = Math.round((this.stats.frames * 1000) / elapsed);
    this.stats.frames = 0;
    this.stats.lastSampleTime = now;
    this.stats.pixelRatio = this.renderer.getPixelRatio();
  }

  getPerformanceStats() {
    const renderInfo = this.renderer.info.render;
    const memoryInfo = this.renderer.info.memory;
    return {
      fps: this.stats.fps,
      quality: this.stats.quality,
      pixelRatio: Number(this.stats.pixelRatio.toFixed(2)),
      calls: renderInfo.calls,
      triangles: renderInfo.triangles,
      points: renderInfo.points,
      textures: memoryInfo.textures,
      geometries: memoryInfo.geometries,
    };
  }

  updatePortalAmbience(delta, elapsed) {
    let opacity = 0;
    if (this.portalTransition) {
      const progress = THREE.MathUtils.clamp(
        (this.portal.position.z - PORTAL_START_Z) / (PORTAL_PASS_Z - PORTAL_START_Z),
        0,
        1
      );
      opacity = THREE.MathUtils.smoothstep(progress, 0.08, 0.92) * 1.05;
    } else if (this.portalAfterglow > 0) {
      this.portalAfterglow = Math.max(0, this.portalAfterglow - delta);
      const fade = THREE.MathUtils.smoothstep(this.portalAfterglow / PORTAL_AFTERGLOW_SECONDS, 0, 1);
      opacity = fade * 0.85;
    }
    this.setPortalAmbience(opacity, elapsed);
  }

  setPortalAmbience(opacity, elapsed) {
    if (!this.portalAmbience) return;
    this.portalAmbience.visible = opacity > 0.001;
    this.portalAmbience.material.uniforms.uOpacity.value = opacity;
    this.portalAmbience.material.uniforms.uTime.value = elapsed;
  }

  resize() {
    // Fill the container; the host page's CSS decides the shape (wide on
    // desktop, square/portrait on mobile). The camera keeps a fixed vertical
    // FOV, so a wider container just reveals more of the corridor to the sides
    // rather than stretching the image.
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.updateCameraProjection();
    this.updatePortalAmbienceScale();
  }

  updateCameraProjection() {
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[8] = this.viewOffsetX;
    this.camera.projectionMatrix.elements[9] = VERTICAL_FRAME_OFFSET + this.viewOffsetY;
  }

  updatePortalAmbienceScale(mesh = this.portalAmbience) {
    resizePortalAmbienceMesh(this.camera, mesh);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this.viewportObserver) {
      this.viewportObserver.disconnect();
    }
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
