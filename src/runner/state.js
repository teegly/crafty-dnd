// The single data contract for the runner.
// Krusher replaces the getState function passed to createCraftyRunner with his
// real recovery data source later. The object shape stays the same.

export function getDefaultState() {
  return {
    level: 1, // 1 to ~60, gains 1 per day. Drives run speed and distance.
    items: [], // collectibles shown along the track (wired in M2).
    debuffs: [], // ambient effects or obstacles (wired in M2).
    dayEvent: null, // optional flavour spawn for the day (wired in M2).
  };
}

// The ONE place that maps recovery data to visual parameters.
// Keep all tuning here so the render code stays clean.
export function mapStateToParams(state) {
  const safe = state || getDefaultState();
  const level = Math.max(1, safe.level || 1);

  // Run speed ramps gently with level. Units per second (scaled by delta time).
  const baseSpeed = 12;
  const speedPerLevel = 0.35;
  const maxSpeed = 34;
  const speed = Math.min(maxSpeed, baseSpeed + (level - 1) * speedPerLevel);

  return {
    level,
    speed,
    // Consumed in M2:
    items: safe.items || [],
    debuffs: safe.debuffs || [],
    dayEvent: safe.dayEvent || null,
  };
}
