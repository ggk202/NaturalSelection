// Per-biome rules. drain = energy/s lost by creatures lacking the matching ability (lake: swim).
export const BIOMES = [
  { id: 0, key: 'plains', color: 0x8fb35a, fertility: 1, moveMul: 1, sightMul: 1.2, tempOffset: 0, drain: 0 },
  { id: 1, key: 'forest', color: 0x3f7f3a, fertility: 1.6, moveMul: 0.8, sightMul: 0.55, tempOffset: 0, drain: 0 },
  { id: 2, key: 'wetland', color: 0x5f8a6a, fertility: 2, moveMul: 0.45, sightMul: 0.9, tempOffset: 0, drain: 0.03 },
  { id: 3, key: 'lake', color: 0x3b6e8f, fertility: 0.6, moveMul: 0.35, sightMul: 1, tempOffset: 0, drain: 0.25 },
  { id: 4, key: 'mountain', color: 0x8a8378, fertility: 0.4, moveMul: 0.7, sightMul: 1.4, tempOffset: -0.35, drain: 0 },
  { id: 5, key: 'desert', color: 0xd9c27a, fertility: 0.25, moveMul: 0.9, sightMul: 1.3, tempOffset: 0.4, drain: 0 },
];
export const BIOME = Object.fromEntries(BIOMES.map((b) => [b.key, b.id]));
