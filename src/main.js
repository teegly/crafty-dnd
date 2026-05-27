import { createCraftyRunner } from './runner/index.js';
import { getDefaultState } from './runner/state.js';

// Dev entry. Krusher replaces getState with his real recovery data source.
// The runner polls getState every frame, so mutating this object updates the
// visual live. Try bumping state.level to preview the run-speed ramp.
const state = getDefaultState();
// state.level = 30; // uncomment to preview a higher level

const runner = createCraftyRunner({
  container: document.getElementById('runner'),
  getState: () => state,
});

const previewDistance = Number(new URLSearchParams(window.location.search).get('distance'));
if (Number.isFinite(previewDistance) && previewDistance >= 0) {
  runner.totalDistance = previewDistance;
}

// Local preview/debug handle.
if (import.meta.env.DEV || window.location.hostname === '127.0.0.1') {
  window.__craftyRunner = runner;
}
