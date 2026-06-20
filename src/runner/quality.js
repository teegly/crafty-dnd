export const QUALITY_PRESETS = {
  low: {
    name: 'low',
    pixelRatioCap: 1,
    antialias: false,
    targetFps: 30,
    particleDensity: 0.45,
    powerPreference: 'low-power',
  },
  balanced: {
    name: 'balanced',
    pixelRatioCap: 1.25,
    antialias: true,
    targetFps: 60,
    particleDensity: 0.65,
    powerPreference: 'default',
  },
  high: {
    name: 'high',
    pixelRatioCap: 1.75,
    antialias: true,
    targetFps: 60,
    particleDensity: 1,
    powerPreference: 'high-performance',
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
