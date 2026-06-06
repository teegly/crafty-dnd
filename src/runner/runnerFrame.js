import { updatePortalMaterials } from './Props.js';

export function applyBiomeFrame(runner, biome, elapsed, distance = 0) {
  runner.background.setSkyColors(biome.colors.skyTop, biome.colors.skyBottom);
  runner.scene.fog.color.set(biome.colors.fog);
  runner.scene.fog.near = biome.colors.fogNear;
  runner.scene.fog.far = biome.colors.fogFar;
  runner.scene.background.set(biome.colors.background);
  runner.track.setBiome(biome.geomIndex);
  runner.background.update(distance, biome.geomIndex, biome);
  runner.particles.setBiome(biome.geomIndex);
  runner.avatar.update(elapsed);
  updatePortalMaterials(elapsed);
}
