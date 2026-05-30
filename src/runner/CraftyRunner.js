import * as THREE from 'three';
import { TrackGenerator } from './TrackGenerator.js';
import { Avatar } from './Avatar.js';
import { Background } from './Background.js';
import { Particles } from './Particles.js';
import { mapStateToParams } from './state.js';
import { BIOMES, resolveBiome } from './biomes.js';
import { createPortal, updatePortalMaterials } from './Props.js';
import { GameState, MODE, GAME } from './GameState.js';
import { Player } from './Player.js';
import { Input } from './Input.js';
import { Collectibles } from './Collectibles.js';
import { Obstacles } from './Obstacles.js';
import { Turn } from './Turn.js';
import { Hud } from './Hud.js';
import { BIOME, getBiome } from './GameBiomes.js';

// Orchestrates the scene, camera, renderer and animation loop.
// Convention: the avatar stays fixed near the origin and the world scrolls
// toward the camera (+z), the "world moves, runner stays" pattern from Boxy-Run.

const TARGET_FPS_MOBILE = 30;
const VERTICAL_FRAME_OFFSET = -0.22;
const DEFAULT_CAMERA_FOV = 55;
const DEFAULT_VIEW_OFFSET_X = 0;
const DEFAULT_VIEW_OFFSET_Y = 0.04;
const PORTAL_START_Z = -18;
const PORTAL_PREVIEW_Z = -10;
const PORTAL_PASS_Z = -0.35;
const PORTAL_BASE_Y = 0;
const PORTAL_AFTERGLOW_SECONDS = 1.2;

// Map each game biome to a horizon backdrop set so the scenery changes as the player
// turns into a new biome (0 mountains, 1 forest, 2 desert, 3 ocean).
const BIOME_BACKDROP = {
  [BIOME.TEMPLE]: 0, // mountains
  [BIOME.HOSPITAL]: 3, // ocean (calm blue)
  [BIOME.HIGHWAY]: 2, // desert (open road)
  [BIOME.FOREST]: 1, // forest
};

export class CraftyRunner {
  constructor(container, getState, { quality } = {}) {
    this.container = container;
    this.getState = getState;
    this.quality = quality || {
      name: 'balanced',
      pixelRatioCap: 1.5,
      antialias: true,
      targetFps: 30,
    };
    this.isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

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

    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias && !this.isTouchDevice, precision: 'mediump' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    container.appendChild(this.renderer.domElement);

    // Lighting recipe: warm interior candle pools plus cool dappled canopy light
    // entering through broken walls and collapsed ceiling sections. Captured (with
    // base colours) so a game biome can tint them by a multiplier; AMBIENT never
    // tints, so the look is unchanged.
    this.lightTargets = [];
    const addLight = (light) => {
      this.scene.add(light);
      this.lightTargets.push({ light, base: light.color.clone() });
      return light;
    };
    addLight(new THREE.HemisphereLight(0xc2d391, 0x3b2b14, 0.68));
    addLight(new THREE.AmbientLight(0x525639, 0.34));
    const canopy = addLight(new THREE.DirectionalLight(0xd4efaa, 1.05));
    canopy.position.set(-3.5, 12, -4);
    for (const z of [-4, -12, -22]) {
      const candle = addLight(new THREE.PointLight(0xffbd72, 6.4, 13, 2));
      candle.position.set(z === -12 ? 2.5 : -2.5, 1.7, z);
    }
    const runnerFill = addLight(new THREE.PointLight(0xffd08a, 1.7, 5.4, 2));
    runnerFill.position.set(0, 2.2, 1.6);

    // Scrolling corridor content (backdrop + track) lives under one rotatable
    // group so a 90-degree game turn can swing it about the player pivot. At
    // identity rotation child world positions are unchanged, so AMBIENT is
    // byte-identical. Particles, lights and the avatar stay on the scene (fixed).
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.background = new Background(this.worldGroup);
    this.background.setBiome(resolveBiome(this.totalDistance).geomIndex);
    this.track = new TrackGenerator(this.worldGroup);
    this.particles = new Particles(this.scene);
    this.avatar = new Avatar();
    this.scene.add(this.avatar.object3d);
    this.portal = null;
    this.portalTransition = null;
    this.portalAfterglow = 0;
    this.portalAmbience = this.createPortalAmbience();
    this.camera.add(this.portalAmbience);

    // Game layer (inert until Play; AMBIENT path never touches it). In play, the
    // ambient backdrop is frozen to one biome and themed only by a colour tint.
    this._playGeomIndex = 0;
    this._playBiomeState = { fromIndex: 0, toIndex: 0, transition: 0 };
    this.gameState = new GameState();
    this.player = new Player(this.avatar);
    this.collectibles = new Collectibles(this.track, this.gameState);
    this.obstacles = new Obstacles(this.track, this.gameState, { onDeath: () => this.endGame() });
    this.turn = new Turn(this.track, this.worldGroup, this.gameState, this.player, {
      onSwingStart: () => this.hud.flash(),
      onBiomeChange: (id) => this._applyBiome(id),
    });
    this.input = new Input((action) => this._handleAction(action));
    this.hud = new Hud(container, {
      onPlay: () => this.enterPlay(),
      onRestart: () => this.enterPlay(),
      onBack: () => this.exitToAmbient(),
    });
    this.hud.showAmbient();

    this.timer = new THREE.Timer();

    // Optional 30fps cap on coarse-pointer (touch) devices. Movement uses delta
    // time, so motion speed is identical whether or not the cap is active.
    this.capFps = this.isTouchDevice || this.quality.targetFps < 60;
    this.frameInterval = 1 / (this.capFps ? Math.min(this.quality.targetFps, TARGET_FPS_MOBILE) : 60);
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
    // Escape ends the current run (shows the score screen). Active only while playing.
    this._onKeyDown = (e) => {
      if (e.code === 'Escape' && this.gameState.mode === MODE.PLAYING) {
        e.preventDefault();
        this.endGame();
      }
    };
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('keydown', this._onKeyDown);
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
    this.background.setSkyColors(biome.colors.skyTop, biome.colors.skyBottom);
    this.scene.fog.color.set(biome.colors.fog);
    this.scene.fog.near = biome.colors.fogNear;
    this.scene.fog.far = biome.colors.fogFar;
    this.scene.background.set(biome.colors.background);
    this.track.setBiome(biome.geomIndex);
    this.background.update(0, biome.geomIndex, biome);
    this.particles.setBiome(biome.geomIndex);
    this.avatar.update(elapsed);
    updatePortalMaterials(elapsed);
    this.updatePortalAmbience(0, elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  tick() {
    this.timer.update();
    const delta = this.timer.getDelta();

    // The passive AMBIENT widget honours the fps cap (battery on mobile). An active
    // run always steps at full frame-rate so the controls feel responsive: a fast
    // runner capped to 30fps reads as laggy/choppy. stepPlaying clamps its own delta.
    if (this.capFps && this.gameState.mode === MODE.AMBIENT) {
      this.accumulator += delta;
      if (this.accumulator < this.frameInterval) return;
      this.step(this.accumulator);
      this.accumulator = 0;
    } else {
      this.accumulator = 0;
      this.step(delta);
    }
  }

  step(delta) {
    const params = mapStateToParams(this.getState());
    const elapsed = this.timer.getElapsed();

    if (this.gameState.mode === MODE.PLAYING) {
      this.stepPlaying(delta, elapsed, params);
    } else if (this.gameState.mode === MODE.GAME_OVER) {
      this.stepGameOver(delta, elapsed);
    } else {
      this.stepAmbient(delta, elapsed, params);
    }

    this.renderer.render(this.scene, this.camera);
    this.sampleStats();
  }

  // Passive visualisation: the original behaviour (biome rotation + portal). The
  // avatar holds its run cycle; the world scrolls at the recovery-level speed.
  stepAmbient(delta, elapsed, params) {
    const distance = params.speed * delta;
    this.totalDistance += distance;
    this.track.update(distance, elapsed);
    this.updatePortalTransition(distance);

    // Advance the biome cycle and crossfade the global colours. Lights stay
    // constant so the corridor look is unchanged.
    const biome = resolveBiome(this.totalDistance);
    this.background.setSkyColors(biome.colors.skyTop, biome.colors.skyBottom);
    this.scene.fog.color.set(biome.colors.fog);
    this.scene.fog.near = biome.colors.fogNear;
    this.scene.fog.far = biome.colors.fogFar;
    this.scene.background.set(biome.colors.background);

    this.track.setBiome(biome.geomIndex);
    this.background.update(distance, biome.geomIndex, biome);
    this.particles.setBiome(biome.geomIndex);
    this.particles.update(delta, elapsed);
    this.avatar.update(elapsed);
    updatePortalMaterials(elapsed);
    this.updatePortalAmbience(delta, elapsed);
  }

  // Active run: the world scrolls and the player, hazards, cans and turns update.
  // The game biome is a themed tint over the (frozen) ambient backdrop, applied on
  // change rather than per frame; the world freezes while a turn swings.
  stepPlaying(delta, elapsed, params) {
    const d = Math.min(delta, GAME.MAX_DELTA); // clamp so a tab-switch can't teleport
    const swinging = this.turn.isSwinging();
    const speed = this.gameState.playSpeed(params.speed);
    const distance = swinging ? 0 : speed * d;

    this.track.update(distance, elapsed);
    this.background.update(distance, this._playGeomIndex, this._playBiomeState);
    this.particles.update(d, elapsed);
    this.turn.update(d);
    this.player.update(d, elapsed);

    if (!this.turn.isSwinging() && this.gameState.mode === MODE.PLAYING) {
      this.obstacles.update(distance, d, elapsed, this.player);
      this.collectibles.update(distance, d, elapsed, this.player);
      this.gameState.addDistance(distance);
    }
    this.hud.update(this.gameState);
  }

  // Frozen world; keep the air alive and let the avatar play its death pose.
  stepGameOver(delta, elapsed) {
    this.particles.update(Math.min(delta, GAME.MAX_DELTA), elapsed);
    this.avatar.update(elapsed, 'death');
  }

  // Route an input action: at an armed junction left/right commits the turn,
  // otherwise it's a lane switch. Jump/slide always go to the player.
  _handleAction(action) {
    if (this.gameState.mode !== MODE.PLAYING) return;
    if ((action === 'left' || action === 'right') && this.turn.isAwaitingChoice()) {
      this.turn.tryCommit(action);
      return;
    }
    this.player.input(action);
  }

  // Apply a game biome as a themed tint, keeping the existing backdrops: corridor
  // surface tint, sky-dome colours, fog and a light-colour lerp. (We deliberately
  // do NOT swap the backdrop scenery.)
  _applyBiome(id) {
    const biome = getBiome(id);
    this.gameState.currentBiome = id;
    this.track.setBiomeTint(biome);
    this.background.setSkyColors(biome.palette.sky.top, biome.palette.sky.bottom);
    this._applyBiomePalette(biome);
    // During a run: swap the horizon backdrop + atmosphere to match the biome (so the
    // scenery changes when the player turns, not just the tint), and follow the outfit
    // (hospital -> gown). setBiomeOutfit is a no-op if the outfit toggle isn't mounted.
    if (this.gameState.mode === MODE.PLAYING) {
      const geom = BIOME_BACKDROP[id] ?? 0;
      this._playGeomIndex = geom;
      this._playBiomeState = { fromIndex: geom, toIndex: geom, transition: 0 };
      this.background.setBiome(geom);
      this.particles.setBiome(geom);
      this.track.setBiome(geom);
      this.setBiomeOutfit?.(id);
    }
  }

  _applyBiomePalette(biome) {
    const key = new THREE.Color(biome.palette.light);
    const k = biome.palette.lightLerp;
    for (const t of this.lightTargets) t.light.color.copy(t.base).lerp(key, k);
    this.scene.fog.color.set(biome.palette.fog);
    this.scene.background.set(biome.palette.sky.bottom);
  }

  // Show the start screen (title + Play + controls) over the ambient view. The
  // "Run Crafty Run" button lands here; Play then begins the run. cr-menu hides the
  // ambient overlays so only the start screen shows (no fullscreen, unlike play).
  showStartScreen() {
    this.container.classList.add('cr-menu');
    this.hud.showStart();
  }

  enterPlay() {
    this.gameState.startPlay();
    this._applyBiome(BIOME.TEMPLE); // every run starts in the temple
    // Open the fog for play so the corridor and oncoming hazards are readable
    // (ambient fog can be very tight, which would render the run near-black).
    this.scene.fog.near = 18;
    this.scene.fog.far = 120;
    this.player.reset();
    this.player.grantGrace(1.0); // a beat before the first hazard can hit
    this.collectibles.activate();
    this.obstacles.activate();
    this.turn.activate();
    this.input.enable();
    this.container.classList.remove('cr-menu');
    this.container.classList.add('cr-playing'); // CSS expands to fullscreen/widescreen
    this.resize();
    this.hud.showHud();
  }

  endGame() {
    this.gameState.endGame();
    this.input.disable();
    this.hud.showGameOver(this.gameState);
  }

  exitToAmbient() {
    this.gameState.toAmbient();
    this._applyBiome(BIOME.TEMPLE); // restore the temple (identity) tint
    this.input.disable();
    this.collectibles.deactivate();
    this.obstacles.deactivate();
    this.turn.deactivate();
    this.player.reset();
    this.setBiomeOutfit?.(null); // restore the ambient (kit-toggle) outfit
    this.container.classList.remove('cr-playing', 'cr-menu');
    this.resize();
    this.hud.showAmbient();
  }

  updatePortalTransition(distance) {
    if (!this.portalTransition || !this.portal) return;
    this.portal.position.z += distance;
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

  createPortalAmbience() {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - 0.5;
          float radius = length(p);
          float angle = atan(p.y, p.x);
          float swirl = sin(angle * 5.0 - radius * 18.0 + uTime * 5.5);
          float ring = smoothstep(0.42, 0.12, radius);
          float edge = smoothstep(0.72, 0.18, radius);
          vec3 violet = vec3(0.54, 0.18, 1.0);
          vec3 magenta = vec3(1.0, 0.18, 0.86);
          vec3 color = mix(violet, magenta, swirl * 0.5 + 0.5);
          float alpha = (0.2 + max(swirl, 0.0) * 0.34) * ring + edge * 0.16;
          gl_FragColor = vec4(color, alpha * uOpacity);
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.position.set(0, 0, -1);
    mesh.renderOrder = 100;
    this.updatePortalAmbienceScale(mesh);
    return mesh;
  }

  updatePortalAmbience(delta, elapsed) {
    let opacity = 0;
    if (this.portalTransition) {
      const progress = THREE.MathUtils.clamp(
        (this.portal.position.z - PORTAL_START_Z) / (PORTAL_PASS_Z - PORTAL_START_Z),
        0,
        1
      );
      opacity = THREE.MathUtils.smoothstep(progress, 0.12, 1) * 1.15;
    } else if (this.portalAfterglow > 0) {
      this.portalAfterglow = Math.max(0, this.portalAfterglow - delta);
      opacity = (this.portalAfterglow / PORTAL_AFTERGLOW_SECONDS) * 0.95;
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
    // The lens-shift framing is tuned for the AMBIENT square/widescreen view. Game
    // mode wants a plain centred camera (the avatar sits at the bottom centre).
    if (this.gameState && this.gameState.mode !== MODE.AMBIENT) return;
    this.camera.projectionMatrix.elements[8] = this.viewOffsetX;
    this.camera.projectionMatrix.elements[9] = VERTICAL_FRAME_OFFSET + this.viewOffsetY;
  }

  updatePortalAmbienceScale(mesh = this.portalAmbience) {
    if (!mesh) return;
    const distance = Math.abs(mesh.position.z);
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * distance;
    const width = height * (this.camera.aspect || 1);
    mesh.scale.set(width, height, 1);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this.viewportObserver) {
      this.viewportObserver.disconnect();
    }
    if (this.input) this.input.disable();
    if (this.hud) this.hud.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
