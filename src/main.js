import { createCraftyRunner } from './runner/index.js';
import { getDefaultState } from './runner/state.js';
import { resolveQuality } from './runner/quality.js';
import { createBiomeSwitcher, createOutfitToggle, createInventoryHud } from './uiWidgets.js';
import { createDevViewControls } from './devPanel.js';
import { allowPreviewUrlParams, getDevPreviewUrlParams, getPreviewUrlParams } from './urlParams.js';

// Dev entry. Krusher replaces getState with his real recovery data source.
// The runner polls getState every frame, so mutating this object updates the
// visual live. Try bumping state.level to preview the run-speed ramp.
const state = getDefaultState();
// state.level = 30; // uncomment to preview a higher level
const previewSearchParams = getPreviewUrlParams();
const devSearchParams = getDevPreviewUrlParams();
const allowDebugViewParams = allowPreviewUrlParams();
const quality = resolveQuality(previewSearchParams.get('quality'));

const runner = createCraftyRunner({
  container: document.getElementById('runner'),
  getState: () => state,
  quality,
});

if (previewSearchParams.has('distance')) {
  const previewDistance = Number(previewSearchParams.get('distance'));
  if (Number.isFinite(previewDistance) && previewDistance >= 0) {
    runner.totalDistance = previewDistance;
  }
}

if (devSearchParams.has('fov')) {
  const previewFov = Number(devSearchParams.get('fov'));
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

if (devSearchParams.get('portal') === '1') {
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

if (previewSearchParams.get('paused') === '1') {
  window.setTimeout(() => runner.stop(), 1000);
}
