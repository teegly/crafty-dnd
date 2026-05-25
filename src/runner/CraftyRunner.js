import * as THREE from 'three';
import { TrackGenerator } from './TrackGenerator.js';
import { Avatar } from './Avatar.js';
import { mapStateToParams } from './state.js';

// Orchestrates the scene, camera, renderer and animation loop.
// Convention: the avatar stays fixed near the origin and the world scrolls
// toward the camera (+z), the "world moves, runner stays" pattern from Boxy-Run.

const SCENE_COLOR = 0x1c1530;
const TARGET_FPS_MOBILE = 30;

export class CraftyRunner {
  constructor(container, getState) {
    this.container = container;
    this.getState = getState;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_COLOR);
    // Fog gives atmosphere and hides segment pop-in at the far end.
    this.scene.fog = new THREE.Fog(SCENE_COLOR, 10, 45);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    this.camera.position.set(0, 3.2, 9);
    this.camera.lookAt(0, 1.2, -6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, precision: 'mediump' });
    // Cap pixel ratio: the single highest-impact mobile fix the reference repos missed.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Lighting.
    this.scene.add(new THREE.AmbientLight(0x8d7fb5, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.1);
    sun.position.set(4, 10, 6);
    this.scene.add(sun);

    this.track = new TrackGenerator(this.scene);
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
    this.track.update(params.speed * delta);
    this.avatar.update(this.timer.getElapsed());
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
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
