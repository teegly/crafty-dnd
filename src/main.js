import { createCraftyRunner } from './runner/index.js';
import { getDefaultState } from './runner/state.js';
import { resolveQuality } from './runner/quality.js';
import { createBiomeSwitcher, createOutfitToggle, createInventoryHud } from './uiWidgets.js';
import { createDevViewControls } from './devPanel.js';

// Dev entry. Krusher replaces getState with his real recovery data source.
// The runner polls getState every frame, so mutating this object updates the
// visual live. Try bumping state.level to preview the run-speed ramp.
const state = getDefaultState();
// state.level = 30; // uncomment to preview a higher level
const searchParams = new URLSearchParams(window.location.search);
const quality = resolveQuality(searchParams.get('quality'));

const runner = createCraftyRunner({
  container: document.getElementById('runner'),
  getState: () => state,
  quality,
});

const allowDebugViewParams = import.meta.env.DEV
  || window.location.hostname === '127.0.0.1'
  || window.location.hostname === 'localhost';

if (searchParams.has('distance')) {
  const previewDistance = Number(searchParams.get('distance'));
  if (Number.isFinite(previewDistance) && previewDistance >= 0) {
    runner.totalDistance = previewDistance;
  }
}

if (allowDebugViewParams && searchParams.has('fov')) {
  const previewFov = Number(searchParams.get('fov'));
  if (Number.isFinite(previewFov)) {
    runner.setCameraFov(previewFov);
  }
}

// Each widget mounts independently. A throw in one must not stop the others
// or the debug/dev-panel mounts further down (an unguarded throw here once
// silently killed the dev panel).
const mountWidget = (name, mount) => {
  try {
    mount();
  } catch (err) {
    console.error(`${name} failed`, err);
  }
};
mountWidget('createBiomeSwitcher', () => createBiomeSwitcher(runner));
mountWidget('createInventoryHud', () => createInventoryHud(() => state));
mountWidget('createOutfitToggle', () => createOutfitToggle(runner));

if (allowDebugViewParams && searchParams.get('portal') === '1') {
  window.setTimeout(() => {
    runner.previewPortal();
    runner.stop();
  }, 1000);
}

// Local preview/debug handle.
if (allowDebugViewParams) {
  window.__craftyRunner = runner;
  createDevViewControls(runner);
}

if (searchParams.get('paused') === '1') {
  window.setTimeout(() => runner.stop(), 1000);
}
