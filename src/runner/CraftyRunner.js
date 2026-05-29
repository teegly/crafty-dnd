import * as THREE from 'three';
import { TrackGenerator } from './TrackGenerator.js';
import { Avatar } from './Avatar.js';
import { Background, PALETTE } from './Background.js';
import { Particles } from './Particles.js';
import { mapStateToParams } from './state.js';
import { GameState, MODE, GAME } from './GameState.js';
import { Hud } from './Hud.js';
import { Player } from './Player.js';
import { Input } from './Input.js';
import { Collectibles } from './Collectibles.js';
import { Obstacles } from './Obstacles.js';
import { Turn } from './Turn.js';
import { BIOME, getBiome } from './Biomes.js';

// Orchestrates the scene, camera, renderer and animation loop.
// Convention: the avatar stays fixed near the origin and the world scrolls
// toward the camera (+z), the "world moves, runner stays" pattern from Boxy-Run.

const TARGET_FPS_MOBILE = 30;

export class CraftyRunner {
  constructor(container, getState, { quality } = {}) {
    this.container = container;
    this.getState = getState;
    // Render quality preset (see quality.js). The default fallback matches the
    // pre-perf-pass renderer exactly (pixel ratio 2, AA on, uncapped 60fps,
    // full particle density) so the AMBIENT embed stays byte-identical unless a
    // lower preset is resolved for touch/low-memory devices or forced via
    // ?quality=.
    this.quality = quality || { name: 'high', pixelRatioCap: 2, antialias: true, targetFps: 60, density: 1 };
    this.isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    this.scene = new THREE.Scene();
    // Amber-green fog gives atmosphere and hides segment pop-in at the far end.
    // The fog colour matches the backdrop mid-tone so distance blends cleanly.
    this.scene.background = new THREE.Color(PALETTE.skyBottom); // fallback behind the dome
    this.scene.fog = new THREE.Fog(PALETTE.fog, 9, 54);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    this.camera.position.set(0, 1.5, 2.9);
    this.camera.lookAt(0, 0.9, -0.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias && !this.isTouchDevice, precision: 'mediump' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    // Cap pixel ratio: the single highest-impact mobile fix the reference repos
    // missed. The cap comes from the quality preset (2 on high = unchanged).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    container.appendChild(this.renderer.domElement);

    // Lighting recipe: warm interior candle pools plus cool dappled canopy light
    // entering through broken walls and collapsed ceiling sections. Lights are
    // captured (with base colours) so a biome can tint them by a multiplier.
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

    // All scrolling corridor content lives under a single rotatable group so a
    // 90° turn can be performed by swinging worldGroup about the player pivot,
    // then rebasing. At identity rotation child world positions are unchanged,
    // so the passive (AMBIENT) visual is byte-identical to before this refactor.
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.background = new Background(this.worldGroup);
    this.track = new TrackGenerator(this.worldGroup);
    // Particles, lights, sky tone and the avatar stay on the scene (fixed): the
    // ambient air and the player must not swing during a turn.
    this.particles = new Particles(this.scene, { density: this.quality.density ?? 1 });
    this.avatar = new Avatar();
    this.scene.add(this.avatar.object3d);

    // Runtime game state (mode/score/lives) + the DOM HUD overlay. The HUD's
    // buttons drive the mode transitions; everything else stays data-driven.
    this.gameState = new GameState();
    this.player = new Player(this.avatar);
    this.collectibles = new Collectibles(this.track, this.gameState);
    this.obstacles = new Obstacles(this.track, this.gameState, { onDeath: () => this.endGame() });
    this.turn = new Turn(this.track, this.worldGroup, this.gameState, this.player, {
      onSwingStart: () => this.hud.flash(), // turns can't fail — no crash hook
      onBiomeChange: (id) => this._applyBiome(id), // re-theme the corridor on the turn
    });
    this.input = new Input((action) => this._handleAction(action));
    this.hud = new Hud(container, {
      onPlay: () => this.enterPlay(),
      onRestart: () => this.enterPlay(),
      onBack: () => this.exitToAmbient(),
    });
    this.hud.showStart();

    this.timer = new THREE.Timer();

    // Frame cap from the quality preset. Touch devices (or any preset below
    // 60fps) cap the loop; high desktop stays uncapped. Movement uses delta
    // time, so motion speed is identical whether or not the cap is active.
    this.capFps = this.isTouchDevice || this.quality.targetFps < 60;
    this.frameInterval = 1 / (this.capFps ? Math.min(this.quality.targetFps, TARGET_FPS_MOBILE) : 60);
    this.accumulator = 0;

    // Loop gating: the animation loop only runs when the runner is *meant* to be
    // running AND its canvas is on-screen AND the page is visible. This stops a
    // background tab or a scrolled-away embed from burning CPU/GPU.
    this.desiredRunning = false;
    this.isInViewport = true;
    this.isPageVisible = document.visibilityState !== 'hidden';

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

  // Start/stop the render loop to match the desired + visibility state. Idempotent.
  syncAnimationLoop() {
    if (this.desiredRunning && this.isInViewport && this.isPageVisible) {
      this.renderer.setAnimationLoop(() => this.tick());
    } else {
      this.accumulator = 0; // avoid a big catch-up step on resume
      this.renderer.setAnimationLoop(null);
    }
  }

  // Pause the loop when the canvas scrolls out of view; resume when it returns.
  setupViewportObserver() {
    if (!('IntersectionObserver' in window)) return;
    this.viewportObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      this.isInViewport = Boolean(entry?.isIntersecting);
      this.syncAnimationLoop();
      // Re-show a correct static frame when scrolled back into view while paused.
      if (this.isInViewport && !this.desiredRunning) this.renderCurrentFrame();
    }, { threshold: 0.05 });
    this.viewportObserver.observe(this.container);
  }

  // Pause the loop when the tab is hidden; resume when it returns.
  handleVisibilityChange() {
    this.isPageVisible = document.visibilityState !== 'hidden';
    this.syncAnimationLoop();
    if (this.isPageVisible && !this.desiredRunning) this.renderCurrentFrame();
  }

  // Render exactly one frame of the current scene state without advancing it.
  // Used to keep a correct still image up while the loop is paused.
  renderCurrentFrame() {
    this.renderer.render(this.scene, this.camera);
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

    if (this.gameState.mode === MODE.PLAYING) {
      this.stepPlaying(delta, elapsed, params);
    } else if (this.gameState.mode === MODE.GAME_OVER) {
      this.stepGameOver(delta, elapsed);
    } else {
      this.stepAmbient(delta, elapsed, params);
    }

    this.renderer.render(this.scene, this.camera);
  }

  // Passive visualisation: identical to the original behaviour.
  stepAmbient(delta, elapsed, params) {
    const distance = params.speed * delta;
    this.track.update(distance);
    this.background.update(distance); // parallax: each layer scales this down
    this.particles.update(delta, elapsed);
    this.avatar.update(elapsed);
  }

  // Active run. (Player movement, collectibles, obstacles and turns are layered
  // in by later phases; for now this drives the scroll + scoring + HUD.)
  stepPlaying(delta, elapsed, params) {
    const d = Math.min(delta, GAME.MAX_DELTA); // clamp: no teleport after a tab-switch
    // The world freezes while the corridor swings through a turn.
    const swinging = this.turn.isSwinging();
    const speed = this.gameState.playSpeed(params.speed);
    const distance = swinging ? 0 : speed * d;

    this.track.update(distance);
    this.background.update(distance);
    this.particles.update(d, elapsed);
    this.turn.update(d); // track junction / advance the swing / rebase / crash
    this.player.update(d, elapsed); // lanes / jump / slide; drives the avatar

    // Hazards, cans and distance run during normal running and the junction
    // approach; only the swing itself (frozen world) pauses them.
    if (!this.turn.isSwinging() && this.gameState.mode === MODE.PLAYING) {
      this.obstacles.update(distance, d, elapsed, this.player);
      this.collectibles.update(distance, d, elapsed, this.player);
      this.gameState.addDistance(distance);
    }
    this.hud.update(this.gameState);
  }

  // Frozen world; keep the air alive and let the avatar play its death anim.
  stepGameOver(delta, elapsed) {
    this.particles.update(Math.min(delta, GAME.MAX_DELTA), elapsed);
    this.avatar.update(elapsed, 'death');
  }

  // Route an input action to whatever currently owns it. At an armed junction,
  // left/right is a turn commit; otherwise it's a lane switch. Jump/slide always
  // go to the player.
  _handleAction(action) {
    if (this.gameState.mode !== MODE.PLAYING) return;
    if ((action === 'left' || action === 'right') && this.turn.isAwaitingChoice()) {
      this.turn.tryCommit(action);
      return;
    }
    this.player.input(action);
  }

  // Apply a biome across the whole scene: corridor tint, scene palette (and, in later
  // phases, obstacles + background). Only ever called from PLAYING paths.
  _applyBiome(id) {
    const biome = getBiome(id);
    this.gameState.currentBiome = id;
    this.track.setBiome(biome);
    this.background.setBiome(biome);
    this._applyBiomePalette(biome);
  }

  _applyBiomePalette(biome) {
    const key = new THREE.Color(biome.palette.light);
    const k = biome.palette.lightLerp;
    for (const t of this.lightTargets) t.light.color.copy(t.base).lerp(key, k);
    this.scene.fog.color.set(biome.palette.fog);
    this.scene.background.set(biome.palette.sky.bottom);
  }

  enterPlay() {
    this.gameState.startPlay();
    this._applyBiome(BIOME.TEMPLE); // every run starts in the temple (restores palette on restart)
    this.player.reset();
    this.player.grantGrace(1.0); // a beat before the first hazard can hit
    this.collectibles.activate();
    this.obstacles.activate();
    this.turn.activate();
    this.input.enable();
    this.container.classList.add('cr-playing'); // CSS expands to widescreen/fullscreen
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
    this._applyBiome(BIOME.TEMPLE); // restore the temple palette for the ambient view
    this.input.disable();
    this.collectibles.deactivate();
    this.obstacles.deactivate();
    this.turn.deactivate();
    this.player.reset(); // recentre the avatar for the ambient view
    this.container.classList.remove('cr-playing');
    this.resize();
    this.hud.showStart();
  }

  resize() {
    // AMBIENT keeps the square 1:1 embed; PLAYING/GAME_OVER fill their (widescreen)
    // container. The container's size itself is driven by the `.cr-playing` CSS.
    const ambient = !this.gameState || this.gameState.mode === MODE.AMBIENT;
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;
    const w = ambient ? Math.min(cw, ch) : cw;
    const h = ambient ? w : ch;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this.viewportObserver) this.viewportObserver.disconnect();
    this.input.disable();
    this.hud.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
