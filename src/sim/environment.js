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
  // North edge (z=0) is cold, south edge hot; seasons shift everything.
  temperature(time, x, z) {
    if (!this.cfg.temperature) return 0;
    return clamp(this.cfg.tempAmp * (0.4 * this.season(time) + 0.8 * ((2 * z) / this.worldSize - 1)), -1, 1);
  }
  foodMultiplier(time) { return clamp(1 + this.cfg.foodSeasonAmp * this.season(time), 0, 2); }
}
