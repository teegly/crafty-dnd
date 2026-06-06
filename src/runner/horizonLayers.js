export const HORIZON_LAYER_SETS = {
  forest: {
    folder: 'forest/square cropped',
    aspect: 1,
    layers: [
      { file: 'crop_5_forest_sky.png', radius: 106, arc: 1.344, bottom: -80, opacity: 1, driftX: 0.00005, flat: true },
      { file: 'crop_4_forest_mountain.png', radius: 94, arc: 1.35, bottom: -68, opacity: 1, driftX: 0.00016, flat: true },
      { file: 'crop_3_forest_back.png', radius: 82, arc: 1.5, bottom: -71, opacity: 1, driftX: 0.00028, flat: true },
      { file: 'crop_2_forest_mid.png', radius: 70, arc: 1.3104, bottom: -50, opacity: 1, driftX: 0.00046, flat: true },
      { file: 'crop_1_forest_short.png', radius: 61, arc: 1.6168, bottom: -46, opacity: 1, driftX: 0.00062, flat: true },
      { file: 'crop_0_forest_long.png', radius: 52, arc: 2.0056, bottom: -44, opacity: 1, driftX: 0.00072, flat: true },
    ],
  },
  mountains: {
    folder: 'winter',
    aspect: 3800 / 1200,
    layers: [
      { file: '4-sky.png', radius: 112, arc: 2.2, bottom: -52, opacity: 1, driftX: 0.00004, scale: 1.7 },
      { file: '3-backmountain.png', radius: 88, arc: 1.55, bottom: -31, opacity: 0.74, driftX: 0.00015, scale: 2.85 },
      { file: '2-midmountain.png', radius: 76, arc: 1.35, bottom: -31, opacity: 0.66, driftX: 0.0003, scale: 1.9 },
      { file: '1-midforest.png', radius: 62, arc: 1.15, bottom: -31, opacity: 0.54, driftX: 0.00055, scale: 1.18 },
    ],
  },
  desert: {
    folder: 'desert',
    layers: [
      { file: '5_desert_sky.png', aspect: 1900 / 1000, radius: 106, arc: 1.344, bottom: -14, opacity: 1, driftX: 0.00005, flat: true, cover: 3.2 },
      { file: '4_desert_moon.png', aspect: 3800 / 2400, radius: 94, arc: 1.35, bottom: -56, opacity: 1, driftX: 0.00013, flat: true, scale: 1.19, single: true },
      { file: '3_desert_cloud.png', aspect: 1900 / 1000, radius: 84, arc: 1.45, bottom: -13, opacity: 1, driftX: 0.0002, flat: true, cover: 3.2 },
      { file: '2_desert_mountain.png', aspect: 3800 / 1000, radius: 74, arc: 1.42, bottom: 3, opacity: 1, driftX: 0.00032, flat: true, scale: 1.29, cover: 3.2 },
      { file: '1_desert_dunemid.png', aspect: 1900 / 1000, radius: 64, arc: 1.58, bottom: -5, opacity: 1, driftX: 0.0005, flat: true, scale: 1.17, cover: 3.2 },
      { file: '0_desert_dunefrontt.png', aspect: 3800 / 1000, radius: 54, arc: 1.9, bottom: -3, opacity: 1, driftX: 0.00068, flat: true, scale: 0.86, cover: 3.2 },
    ],
  },
  ocean: {
    folder: 'ocean',
    layers: [
      { file: '6 ocean sky and sun.png', aspect: 3800 / 1200, radius: 112, arc: 1.6, bottom: -9, opacity: 1, driftX: 0.00004, flat: true, scale: 1.33, single: true, cover: 3.2 },
      { file: '5 ocean clouds.png', aspect: 3800 / 1200, radius: 102, arc: 1.55, bottom: 9, opacity: 1, driftX: 0.00008, flat: true, scale: 1.04, cover: 3.2 },
      { file: '4 ocean back mountain.png', aspect: 3800 / 1200, radius: 92, arc: 1.5, bottom: -5, opacity: 1, driftX: 0.00016, flat: true, scale: 1.28, cover: 3.2 },
      { file: '3ocean sun light.png', aspect: 3800 / 1200, radius: 82, arc: 1.48, bottom: -57, opacity: 1, driftX: 0.00024, flat: true, scale: 0.58, single: true },
      { file: '2 ocean sand.png', aspect: 3800 / 1200, radius: 72, arc: 1.55, bottom: 8, opacity: 1, driftX: 0.00034, flat: true, cover: 3.2 },
      { file: '1 ocean sea.png', aspect: 3800 / 1200, radius: 62, arc: 1.7, bottom: -4, opacity: 1, driftX: 0.00052, flat: true, cover: 3.2 },
      { file: '0 ocean wave.png', aspect: 3800 / 1200, radius: 52, arc: 1.9, bottom: -4, opacity: 1, driftX: 0.0007, flat: true, cover: 3.2 },
    ],
  },
};
