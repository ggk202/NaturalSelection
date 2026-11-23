import { RAY_CAP } from './neat.js';
import { BIOMES, BIOME } from './biomes.js';

const TAU = Math.PI * 2;
const angleDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const reach = new Float32Array(RAY_CAP), angles = new Float32Array(RAY_CAP);

// Writes 3 channels per ray (food, creature ±, obstacle) as intensities 1 - d/range; unused rays are 0.
// Forest cells along a ray attenuate visibility (×0.7 each); below 0.25 the ray sees no farther.
export function castRays(world, c, rays, out, offset) {
  const t = world.terrain, st = c.stats;
  const range = st.senseRange * BIOMES[t.biomeAt(c.x, c.z)].sightMul;
  out.fill(0, offset, offset + RAY_CAP * 3);
  const n = Math.max(1, Math.min(rays, RAY_CAP)), full = st.fov >= TAU - 1e-6;
  const spacing = n === 1 ? st.fov : full ? TAU / n : st.fov / (n - 1);
  const half = n === 1 ? st.fov / 2 : spacing / 2;
  const blocked = st.swim < 0.5;

  for (let k = 0; k < n; k++) {
    const a = n === 1 ? 0 : full ? (k - (n - 1) / 2) * spacing : -st.fov / 2 + k * spacing;
    angles[k] = a;
    const h = c.heading + a, hx = Math.cos(h), hz = Math.sin(h);
    let vis = 1, obstacle = 0;
    reach[k] = range;
    for (let d = t.res; d <= range; d += t.res) {
      const x = c.x + hx * d, z = c.z + hz * d, b = t.biomeAt(x, z);
      if (!obstacle) {
        const s = t.slopeAlong(x - hx * t.res, z - hz * t.res, h);
        if ((b === BIOME.lake && blocked) || (s > 0.6 && st.climb < s - 0.4)) obstacle = 1 - d / range;
      }
      if (b === BIOME.forest && (vis *= 0.7) < 0.25) { reach[k] = d; break; }
    }
    // Standing in water counts as an obstacle at distance 0 for non-swimmers.
    if (blocked && t.biomeAt(c.x, c.z) === BIOME.lake) obstacle = 1;
    out[offset + k * 3 + 2] = obstacle;
  }

  const bucket = (dx, dz) => {
    const ang = angleDiff(Math.atan2(dz, dx), c.heading);
    if (n === 1) return Math.abs(ang) <= half ? 0 : -1;
    const k = full ? Math.round(ang / spacing + (n - 1) / 2) : Math.round((ang + st.fov / 2) / spacing);
    const kk = ((k % n) + n) % n;
    return Math.abs(angleDiff(ang, angles[kk])) <= half + 1e-9 ? kk : -1;
  };

  world.foodGrid.query(c.x, c.z, range, (f) => {
    const dx = world.delta(c.x, f.x), dz = world.delta(c.z, f.z), d = Math.hypot(dx, dz);
    const k = bucket(dx, dz);
    if (k < 0 || d > reach[k]) return;
    const v = 1 - d / range, i = offset + k * 3;
    if (v > out[i]) out[i] = v;
  });

  let threat = false;
  world.creatureGrid.query(c.x, c.z, range, (o) => {
    if (o === c) return;
    const dx = world.delta(c.x, o.x), dz = world.delta(c.z, o.z), d = Math.hypot(dx, dz);
    const seenD = t.biomeAt(o.x, o.z) === BIOME.forest ? d / (1 - 0.6 * o.stats.camo) : d;
    const k = bucket(dx, dz);
    if (k < 0 || seenD > reach[k] || seenD > range) return;
    const v = 1 - d / range, i = offset + k * 3 + 1;
    const val = o.stats.attack > st.defense ? -v : o.stats.defense < st.attack ? v : 0.3 * v;
    if (Math.abs(val) > Math.abs(out[i])) out[i] = val;
    if (val < -0.3) threat = true;
  });
  return threat;
}
