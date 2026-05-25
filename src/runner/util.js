// Small shared helpers for the runner.

// Looping sinusoid (pattern borrowed from Boxy-Run's display.js).
// Returns a value oscillating between min and max at the given frequency (Hz).
export function sinusoid(frequency, min, max, phase, time) {
  const amplitude = 0.5 * (max - min);
  const angularFrequency = 2 * Math.PI * frequency;
  const midpoint = min + amplitude;
  return midpoint + amplitude * Math.sin(angularFrequency * time + phase);
}

// Random float in [min, max).
export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// Random element of an array.
export function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Resolve a public/ asset path against the deployment base path. Vite rewrites
// imported/HTML/CSS asset URLs for us, but NOT hardcoded runtime strings like
// textureLoader.load('/textures/x.png'). Wrapping those in assetUrl() keeps them
// working both at the site root and under a sub-path (e.g. GitHub Pages
// /crafty-dnd/). import.meta.env.BASE_URL is the configured base, with a
// trailing slash, statically replaced at build time.
export function assetUrl(path) {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
