import { CraftyRunner } from './CraftyRunner.js';
import { getDefaultState } from './state.js';

// Public entry point for the visualisation.
//
// Usage (Krusher embeds it like this):
//   import { createCraftyRunner } from './runner/index.js';
//   const runner = createCraftyRunner({
//     container: document.getElementById('runner'),
//     getState: () => myRecoveryState, // { level, items, debuffs, dayEvent }
//   });
//
// getState is polled every frame, so updating the object it returns updates the
// visual live. Returns the runner instance (call runner.dispose() to tear down).
export function createCraftyRunner({ container, getState } = {}) {
  if (!container) {
    throw new Error('createCraftyRunner: a container element is required');
  }
  const stateFn = typeof getState === 'function' ? getState : getDefaultState;
  const runner = new CraftyRunner(container, stateFn);
  runner.start();
  return runner;
}
