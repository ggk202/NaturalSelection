import { createRng } from './rng.js';
import { periodicNoise } from './noise.js';
import { BIOME } from './biomes.js';

export const MAX_HEIGHT = 12;
const RES = 2;

const normalize = (a) => {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo || 1);
  return a;
};

// Seeded maps on a wrapping grid. Regenerated from settings on load; never serialized.
export function createTerrain({ seed, worldSize: W, waterLevel = 0.22, flat = false }) {
  const n = Math.max(8, Math.round(W / RES)), res = W / n;
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0); // separate stream: terrain doesn't perturb the world RNG
  const period = Math.max(2, Math.round(W / 50));
  const hN = periodicNoise(rng, period, 4), mN = periodicNoise(rng, period, 3), tN = periodicNoise(rng, period, 2);
  const height = new Float32Array(n * n), moisture = new Float32Array(n * n), temp = new Float32Array(n * n), biome = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i / n) * period, v = (j / n) * period, k = j * n + i;
    height[k] = hN(u, v); moisture[k] = mN(u + 17.3, v + 5.1); temp[k] = tN(u + 3.7, v + 11.9);
  }
  normalize(height); normalize(moisture); normalize(temp);
  const water = waterLevel * MAX_HEIGHT;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    height[k] = flat ? 0 : height[k] ** 1.2 * MAX_HEIGHT;
    // Latitude: z=0 (and the wrapped edge) is the cold pole, z=W/2 the hot equator.
    const lat = -0.8 * Math.cos((2 * Math.PI * j) / n);
    const t = flat ? lat : (temp[k] * 2 - 1) * 0.5 + 0.75 * lat - 0.08 * height[k];
    temp[k] = Math.max(-1, Math.min(1, t));
    const m = moisture[k], h = height[k];
    biome[k] = flat ? BIOME.plains
      : h < water ? BIOME.lake
      : h > 0.68 * MAX_HEIGHT ? BIOME.mountain
      : m > 0.62 && h < water + 0.12 * MAX_HEIGHT ? BIOME.wetland
      : m < 0.4 && temp[k] > -0.05 ? BIOME.desert
      : m > 0.52 ? BIOME.forest
      : BIOME.plains;
    // Steepen peaks so climbing ability matters in the mountains.
    if (biome[k] === BIOME.mountain) height[k] += (h - 0.68 * MAX_HEIGHT) * 2.5;
  }

  const wrapI = (i) => ((i % n) + n) % n;
  const bilinear = (arr, x, z) => {
    const gx = x / res, gz = z / res, x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
    const i0 = wrapI(x0), i1 = wrapI(x0 + 1), j0 = wrapI(z0), j1 = wrapI(z0 + 1);
    const a = arr[j0 * n + i0], b = arr[j0 * n + i1], c = arr[j1 * n + i0], d = arr[j1 * n + i1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  const heightAt = (x, z) => bilinear(height, x, z);
  const biomeAt = (x, z) => biome[wrapI(Math.round(z / res)) * n + wrapI(Math.round(x / res))];
  return {
    res, n, W, waterLevel, waterHeight: water, height, moisture, temp, biome,
    heightAt, biomeAt,
    tempAt: (x, z) => bilinear(temp, x, z),
    isWater: (x, z) => biomeAt(x, z) === BIOME.lake,
    slopeAlong: (x, z, heading) => heightAt(x + Math.cos(heading), z + Math.sin(heading)) - heightAt(x, z),
  };
}
