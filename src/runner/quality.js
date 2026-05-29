// Render quality presets (ported from teegly's perf pass on main).
//
// Each preset controls the renderer pixel-ratio cap, antialiasing, the render
// loop's target FPS, and an ambient particle `density` multiplier. Movement is
// delta-timed, so the FPS cap changes smoothness/cost only, never motion speed.
//
// `density` scales the dust-mote / wisp counts in Particles.js. `high` is 1.0,
// i.e. the original counts, so the default desktop path stays byte-identical to
// the pre-perf-pass look (see resolveQuality below).
export const QUALITY_PRESETS = {
  low: {
    name: 'low',
    pixelRatioCap: 1,
    antialias: false,
    targetFps: 30,
    density: 0.55,
  },
  balanced: {
    name: 'balanced',
    pixelRatioCap: 1.5,
    antialias: true,
    targetFps: 30,
    density: 0.75,
  },
  high: {
    name: 'high',
    pixelRatioCap: 2,
    antialias: true,
    targetFps: 60,
    density: 1,
  },
};

// Resolve the active preset. An explicit `?quality=` value always wins. With no
// override we keep capable desktops on `high` so the embedded AMBIENT view is
// byte-identical to before the perf pass, and only step down to `low` on touch
// or low-memory devices (where the cost matters and the visual delta is hidden
// by the smaller screen). `?quality=balanced` is available for a middle ground.
//
// NOTE: this differs from upstream, which defaults to `balanced` everywhere.
// We bias to byte-identical-by-default because this is a live embed; flip the
// `return QUALITY_PRESETS.high` below to `.balanced` to match upstream.
export function resolveQuality(requestedQuality) {
  if (requestedQuality && QUALITY_PRESETS[requestedQuality]) {
    return QUALITY_PRESETS[requestedQuality];
  }

  const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const lowMemory = Number(navigator.deviceMemory || 4) <= 3;
  if (isTouch || lowMemory) {
    return QUALITY_PRESETS.low;
  }

  return QUALITY_PRESETS.high;
}
