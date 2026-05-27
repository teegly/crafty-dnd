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

const searchParams = new URLSearchParams(window.location.search);
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

// Local preview/debug handle.
if (import.meta.env.DEV || window.location.hostname === '127.0.0.1') {
  window.__craftyRunner = runner;
  createDevViewControls(runner);
}

if (searchParams.get('paused') === '1') {
  window.setTimeout(() => runner.stop(), 1000);
}

function createDevViewControls(runner) {
  const BIOME_PREVIEWS = [
    { name: 'Winter', distance: 0 },
    { name: 'Forest', distance: 1800 },
  ];

  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.left = '16px';
  panel.style.bottom = '16px';
  panel.style.zIndex = '20';
  panel.style.display = 'grid';
  panel.style.gap = '8px';
  panel.style.minWidth = '220px';
  panel.style.padding = '12px';
  panel.style.border = '1px solid rgba(255,255,255,0.18)';
  panel.style.borderRadius = '8px';
  panel.style.background = 'rgba(12,18,10,0.86)';
  panel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';
  panel.style.backdropFilter = 'blur(8px)';
  panel.style.color = '#edf5e6';
  panel.style.font = '13px system-ui, sans-serif';

  const label = document.createElement('label');
  label.style.display = 'grid';
  label.style.gap = '6px';

  const labelText = document.createElement('span');
  labelText.textContent = 'View zoom';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '65';
  slider.max = '160';
  slider.step = '5';
  slider.value = String(fovToZoom(runner.camera.fov));

  const readout = document.createElement('span');
  readout.style.opacity = '0.78';

  const actions = document.createElement('div');
  actions.style.display = 'grid';
  actions.style.gridTemplateColumns = '1fr 1fr 1fr';
  actions.style.gap = '6px';

  const playback = document.createElement('div');
  playback.style.display = 'grid';
  playback.style.gridTemplateColumns = '1fr 1fr';
  playback.style.gap = '6px';

  const biomeControls = document.createElement('div');
  biomeControls.style.display = 'grid';
  biomeControls.style.gridTemplateColumns = '1fr 1fr';
  biomeControls.style.gap = '6px';

  const lookControls = document.createElement('div');
  lookControls.style.display = 'grid';
  lookControls.style.gridTemplateColumns = '1fr 1fr 1fr';
  lookControls.style.gap = '6px';

  const lookSliders = document.createElement('div');
  lookSliders.style.display = 'grid';
  lookSliders.style.gap = '6px';

  const layerControls = document.createElement('div');
  layerControls.style.display = 'grid';
  layerControls.style.gap = '6px';
  layerControls.style.paddingTop = '4px';

  const makeButton = (text) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.style.border = '1px solid rgba(255,255,255,0.18)';
    button.style.borderRadius = '6px';
    button.style.padding = '7px 8px';
    button.style.background = 'rgba(255,255,255,0.08)';
    button.style.color = '#edf5e6';
    button.style.cursor = 'pointer';
    return button;
  };

  const zoomIn = makeButton('Zoom in');
  const reset = makeButton('Reset');
  const zoomOut = makeButton('Zoom out');
  const play = makeButton('Play');
  const pause = makeButton('Pause');
  const lookLeft = makeButton('Left');
  const lookCenter = makeButton('Center');
  const lookRight = makeButton('Right');
  const lookUp = makeButton('Up');
  const lookDown = makeButton('Down');
  const copyLayerValues = makeButton('Copy layer values');
  const copyCameraValues = makeButton('Copy camera values');

  const cameraReadout = document.createElement('pre');
  cameraReadout.style.margin = '0';
  cameraReadout.style.padding = '8px';
  cameraReadout.style.border = '1px solid rgba(255,255,255,0.18)';
  cameraReadout.style.borderRadius = '6px';
  cameraReadout.style.background = 'rgba(0,0,0,0.35)';
  cameraReadout.style.font = '12px ui-monospace, Menlo, Consolas, monospace';
  cameraReadout.style.whiteSpace = 'pre';
  cameraReadout.style.userSelect = 'text';

  const makeRange = (labelText, value) => {
    const label = document.createElement('label');
    label.style.display = 'grid';
    label.style.gap = '4px';
    const text = document.createElement('span');
    text.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-45';
    input.max = '45';
    input.step = '1';
    input.value = String(value);
    label.append(text, input);
    return input;
  };

  const lookX = makeRange('Look horizontal', Math.round((runner.viewOffsetX ?? 0) * 100));
  const lookY = makeRange('Look vertical', Math.round((runner.viewOffsetY ?? 0) * 100));
  const forestLayers = runner.getForestLayerTuning();
  let selectedLayerIndex = 0;
  const layerButtons = document.createElement('div');
  layerButtons.style.display = 'grid';
  layerButtons.style.gridTemplateColumns = '1fr 1fr';
  layerButtons.style.gap = '6px';
  for (const layer of forestLayers) {
    const button = makeButton(layer.file.replace(/^crop_\d+_/, '').replace('.png', ''));
    button.dataset.layerIndex = String(layer.index);
    button.addEventListener('click', () => {
      selectedLayerIndex = layer.index;
      updateLayerButtons();
      loadLayerControls();
    });
    layerButtons.appendChild(button);
  }
  const layerSize = makeRange('Layer size', 100);
  layerSize.min = '45';
  layerSize.max = '240';
  const layerBottom = makeRange('Layer vertical', forestLayers[0]?.bottom ?? -48);
  layerBottom.min = '-80';
  layerBottom.max = '20';

  const updateLayerButtons = () => {
    for (const button of layerButtons.children) {
      const isSelected = Number(button.dataset.layerIndex) === selectedLayerIndex;
      button.style.background = isSelected ? 'rgba(165,205,55,0.34)' : 'rgba(255,255,255,0.08)';
      button.style.borderColor = isSelected ? 'rgba(210,245,120,0.62)' : 'rgba(255,255,255,0.18)';
    }
  };

  const getSelectedLayer = () => forestLayers[selectedLayerIndex];

  const loadLayerControls = () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layerSize.value = String(Math.round(layer.scale * 100));
    layerBottom.value = String(layer.bottom);
  };

  const applyLayerControls = () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.scale = Number(layerSize.value) / 100;
    layer.bottom = Number(layerBottom.value);
    runner.setForestLayerTuning(layer.index, {
      scale: layer.scale,
      bottom: layer.bottom,
    });
  };

  const updatePreviewUrl = (distance) => {
    const url = new URL(window.location.href);
    url.searchParams.set('distance', String(distance));
    url.searchParams.set('paused', '1');
    url.searchParams.delete('fov');
    window.history.replaceState({}, '', url);
  };

  const setZoom = (value) => {
    const zoom = Math.min(160, Math.max(65, Number(value)));
    runner.setCameraFov(zoomToFov(zoom));
    slider.value = String(Math.round(zoom));
    readout.textContent = `Zoom ${Math.round(zoom)}%`;
    renderCameraReadout();
  };

  const setLook = (x, y) => {
    const nextX = Math.min(45, Math.max(-45, x));
    const nextY = Math.min(45, Math.max(-45, y));
    lookX.value = String(Math.round(nextX));
    lookY.value = String(Math.round(nextY));
    runner.setViewOffset(nextX / 100, nextY / 100);
    renderCameraReadout();
  };

  slider.addEventListener('input', () => setZoom(slider.value));
  zoomIn.addEventListener('click', () => setZoom(Number(slider.value) + 10));
  zoomOut.addEventListener('click', () => setZoom(Number(slider.value) - 10));
  reset.addEventListener('click', () => setZoom(100));
  play.addEventListener('click', () => runner.start());
  pause.addEventListener('click', () => {
    runner.stop();
    runner.renderCurrentFrame();
  });
  lookX.addEventListener('input', () => setLook(Number(lookX.value), Number(lookY.value)));
  lookY.addEventListener('input', () => setLook(Number(lookX.value), Number(lookY.value)));
  lookLeft.addEventListener('click', () => setLook(Number(lookX.value) - 10, Number(lookY.value)));
  lookRight.addEventListener('click', () => setLook(Number(lookX.value) + 10, Number(lookY.value)));
  lookUp.addEventListener('click', () => setLook(Number(lookX.value), Number(lookY.value) + 10));
  lookDown.addEventListener('click', () => setLook(Number(lookX.value), Number(lookY.value) - 10));
  lookCenter.addEventListener('click', () => {
    setLook(0, 0);
    setZoom(100);
  });
  layerSize.addEventListener('input', applyLayerControls);
  layerBottom.addEventListener('input', applyLayerControls);
  const getCameraSnapshot = () => {
    const fov = runner.camera.fov;
    const zoom = fovToZoom(fov);
    return {
      fov: Number(fov.toFixed(2)),
      zoom,
      lookX: Number(lookX.value),
      lookY: Number(lookY.value),
    };
  };

  const renderCameraReadout = () => {
    const snap = getCameraSnapshot();
    cameraReadout.textContent =
      `fov:    ${snap.fov}\n` +
      `zoom:   ${snap.zoom}%\n` +
      `lookX:  ${snap.lookX}\n` +
      `lookY:  ${snap.lookY}`;
  };

  const setCopyButtonState = (button, text, resetText) => {
    button.textContent = text;
    window.setTimeout(() => { button.textContent = resetText; }, 1200);
  };

  const copyTextToClipboard = async (button, text, resetText) => {
    if (!window.isSecureContext || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setCopyButtonState(button, 'Copy failed', resetText);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyButtonState(button, 'Copied', resetText);
    } catch (error) {
      console.warn('Clipboard copy failed', error);
      setCopyButtonState(button, 'Copy failed', resetText);
    }
  };

  copyCameraValues.addEventListener('click', async () => {
    const snap = getCameraSnapshot();
    const text = JSON.stringify(snap, null, 2);
    await copyTextToClipboard(copyCameraValues, text, 'Copy camera values');
  });

  copyLayerValues.addEventListener('click', async () => {
    const values = runner.getForestLayerTuning().map((layer) => ({
      file: layer.file,
      scale: Number(layer.scale.toFixed(3)),
      bottom: Number(layer.bottom.toFixed(2)),
    }));
    const text = JSON.stringify(values, null, 2);
    await copyTextToClipboard(copyLayerValues, text, 'Copy layer values');
  });

  setZoom(slider.value);
  updateLayerButtons();
  loadLayerControls();

  for (const biome of BIOME_PREVIEWS) {
    const button = makeButton(biome.name);
    button.addEventListener('click', () => {
      runner.stop();
      runner.setPreviewDistance(biome.distance);
      updatePreviewUrl(biome.distance);
    });
    biomeControls.appendChild(button);
  }

  label.append(labelText, slider, readout);
  actions.append(zoomIn, reset, zoomOut);
  playback.append(play, pause);
  lookControls.append(lookLeft, lookCenter, lookRight, lookUp, lookDown);
  lookSliders.append(lookX.parentNode, lookY.parentNode);
  layerControls.append(layerButtons, layerSize.parentNode, layerBottom.parentNode, copyLayerValues);
  panel.append(label, actions, lookControls, lookSliders, cameraReadout, copyCameraValues, layerControls, playback, biomeControls);
  renderCameraReadout();
  document.body.appendChild(panel);
}

function zoomToFov(zoom) {
  return 55 * (100 / zoom);
}

function fovToZoom(fov) {
  return Math.round(55 * (100 / fov));
}
