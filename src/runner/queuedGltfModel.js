import { assetUrl } from './util.js';

export function createQueuedGltfModel(loader, path, onError) {
  let scene = null;
  let started = false;
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

  return {
    start,
    request(group, attach) {
      if (scene) {
        attach(scene, group);
        return;
      }
      pending.push({ group, attach });
      start();
    },
  };
}
