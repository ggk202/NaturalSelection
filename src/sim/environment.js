export const DEFAULT_ENV = {
  seasons: true, seasonLength: 120, foodSeasonAmp: 0.7,
  temperature: true, tempAmp: 1,
  hazards: true, hazardCount: 3, hazardDamage: 2,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Environment {
  constructor(env, rng, worldSize, nextId) {
    this.cfg = env;
    this.worldSize = worldSize;
    this.hazards = [];
    if (env.hazards) {
      for (let i = 0; i < env.hazardCount; i++) {
        this.hazards.push({ id: nextId(), x: rng.range(0, worldSize), z: rng.range(0, worldSize), r: rng.range(4, 10) });
      }
    }
  }
  season(time) { return this.cfg.seasons ? Math.sin((2 * Math.PI * time) / this.cfg.seasonLength) : 0; }
  // Map temperature (latitude, elevation, noise) shifted by season and biome; scaled by tempAmp.
  temperature(time, x, z, terrain, biome) {
    if (!this.cfg.temperature) return 0;
    return clamp(this.cfg.tempAmp * (terrain.tempAt(x, z) + 0.4 * this.season(time)) + biome.tempOffset, -1, 1);
  }
  foodMultiplier(time) { return clamp(1 + this.cfg.foodSeasonAmp * this.season(time), 0, 2); }
}
