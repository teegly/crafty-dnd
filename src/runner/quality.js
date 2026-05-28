export const QUALITY_PRESETS = {
  low: {
    name: 'low',
    pixelRatioCap: 1,
    antialias: false,
    targetFps: 30,
  },
  balanced: {
    name: 'balanced',
    pixelRatioCap: 1.5,
    antialias: true,
    targetFps: 30,
  },
  high: {
    name: 'high',
    pixelRatioCap: 2,
    antialias: true,
    targetFps: 60,
  },
};

export function resolveQuality(requestedQuality) {
  if (requestedQuality && QUALITY_PRESETS[requestedQuality]) {
    return QUALITY_PRESETS[requestedQuality];
  }

  const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const lowMemory = Number(navigator.deviceMemory || 4) <= 3;
  if (isTouch || lowMemory) {
    return QUALITY_PRESETS.low;
  }

  return QUALITY_PRESETS.balanced;
}
