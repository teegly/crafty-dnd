import { assetUrl } from './util.js';

function scheduleIdle(callback) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 1800 });
    return;
  }
  window.setTimeout(callback, 250);
}

export function createQueuedGltfModel(loader, path, onError, { deferStart = false } = {}) {
  let scene = null;
  let started = false;
  let startScheduled = false;
  const pending = [];

  const start = () => {
    if (started) return;
    started = true;
    loader.load(assetUrl(path), (gltf) => {
      scene = gltf.scene;
      for (const { group, attach } of pending) {
        attach(scene, group);
      }
      pending.length = 0;
    }, undefined, (error) => {
      if (onError) onError(error);
      pending.length = 0;
    });
  };
  const requestStart = () => {
    if (!deferStart) {
      start();
      return;
    }
    if (started || startScheduled) return;
    startScheduled = true;
    scheduleIdle(start);
  };

  return {
    start,
    request(group, attach) {
      if (scene) {
        attach(scene, group);
        return;
      }
      pending.push({ group, attach });
      requestStart();
    },
  };
}
