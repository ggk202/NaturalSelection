import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { INPUTS } from '../src/sim/brain.js';
import { BIOMES, BIOME } from '../src/sim/biomes.js';
import { genome } from './helpers.js';
import { deriveStats } from '../src/sim/body.js';

const T = { seed: 1, initialCreatures: 0, foodRate: 0, maxFood: 0, respawnMin: 0, predatorMin: 0, env: { hazards: false, seasons: false } };
const IN = Object.fromEntries(INPUTS.map((k, i) => [k, i]));

// Center of a cell whose 7x7 neighbourhood is entirely the given biome.
function interior(w, key, skip = 0) {
  const t = w.terrain, id = BIOME[key];
  for (let j = 0; j < t.n; j++) for (let i = 0; i < t.n; i++) {
    let ok = true;
    for (let dj = -3; dj <= 3 && ok; dj++) for (let di = -3; di <= 3 && ok; di++) {
      ok = t.biome[((j + dj + t.n) % t.n) * t.n + ((i + di + t.n) % t.n)] === id;
    }
    if (ok && skip-- <= 0) return { x: i * t.res, z: j * t.res };
  }
  throw new Error(`no interior ${key}`);
}

test('new inputs exist', () => {
  for (const k of ['biomeFood', 'biomeDanger', 'cover', 'slopeAhead', 'waterAhead', 'tempGradient']) assert.ok(k in IN, k);
  assert.equal(INPUTS.length, 18);
});

test('lake slows and drains non-swimmers; good swimmers cross cheaper', () => {
  const p = interior(new World(T), 'lake');
  const go = { throttle: 10 };
  // measure both over the same steps
  const w2 = new World(T);
  const a = w2.spawn(genome({ digits: 0, legs: 2, size: 1 }, go), p.x, p.z), b = w2.spawn(genome({ digits: 5, legs: 2, size: 1 }, go), p.x, p.z + 1);
  a.heading = b.heading = 0;
  const ax = a.x, bx = b.x, ae = a.energy, be = b.energy;
  for (let i = 0; i < 6; i++) w2.step();
  assert.ok(w2.delta(ax, a.x) < w2.delta(bx, b.x), 'poor swimmer slower');
  assert.ok(ae - a.energy > be - b.energy, 'poor swimmer drains more');
  // and the lake is slower than plains for the same body
  const w3 = new World(T), q = interior(w3, 'plains');
  const c = w3.spawn(genome({ digits: 0, legs: 2, size: 1 }, go), q.x, q.z); c.heading = 0;
  const cx = c.x;
  for (let i = 0; i < 6; i++) w3.step();
  assert.ok(w3.delta(cx, c.x) > w2.delta(ax, a.x), 'plains faster than lake');
});

test('steep slope blocks non-climbers', () => {
  const w = new World(T), t = w.terrain;
  let best = { s: 0 };
  for (let k = 0; k < t.n * t.n; k++) {
    const x = (k % t.n) * t.res, z = Math.floor(k / t.n) * t.res;
    if (t.biomeAt(x, z) === BIOME.lake) continue;
    for (let h = 0; h < 8; h++) { const s = t.slopeAlong(x, z, (h * Math.PI) / 4); if (s > best.s) best = { s, x, z, h: (h * Math.PI) / 4 }; }
  }
  assert.ok(best.s > 0.8, `max slope ${best.s}`);
  const c = w.spawn(genome({ legs: 0, digits: 0 }, { throttle: 10 }), best.x, best.z);
  c.heading = best.h;
  const x0 = c.x, z0 = c.z;
  for (let i = 0; i < 5; i++) w.step();
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.energy));
  assert.ok(Math.hypot(w.delta(x0, c.x), w.delta(z0, c.z)) < 0.05, 'should be blocked');
});

test('forest shortens sight', () => {
  for (const [key, seen] of [['plains', true], ['forest', false]]) {
    const w = new World(T), p = interior(w, key);
    const c = w.spawn(genome({ eyes: 4, eyeSize: 1 }), p.x, p.z); c.heading = 0;
    w.food.push({ id: 999, x: p.x + 0.8 * c.stats.senseRange, z: p.z, energy: 3, type: 'plant' });
    const inp = new Float32Array(INPUTS.length);
    w.rebuildGrids(); w.sense(c, inp);
    assert.equal(inp[IN.foodDist] < 1, seen, key);
  }
});

test('camouflaged prey unseen at distance in forest', () => {
  const w = new World(T), p = interior(w, 'forest');
  const pred = w.spawn(genome({ diet: 1, mouth: 1.5, size: 1.5, eyes: 6, eyeSize: 1.5 }), p.x, p.z); pred.heading = 0;
  const range = pred.stats.senseRange * BIOMES[BIOME.forest].sightMul;
  const prey = w.spawn(genome({ size: 0.5, diet: 0 }), p.x + 0.8 * range, p.z);
  const inp = new Float32Array(INPUTS.length);
  w.rebuildGrids(); w.sense(pred, inp);
  assert.equal(inp[IN.preyDist], 1, 'small prey hidden');
  prey.genome = genome({ size: 1.2, diet: 0 }); prey.stats = deriveStats(prey.genome.body);
  w.sense(pred, inp);
  assert.ok(inp[IN.preyDist] < 1, 'big prey visible');
});

test('food spawns more in fertile biomes, with biome food types', () => {
  const w = new World({ ...T, maxFood: 100000, foodRate: 4000 });
  w.food = [];
  w.spawnFood(1);
  const t = w.terrain, cells = new Array(6).fill(0), food = new Array(6).fill(0);
  for (const b of t.biome) cells[b]++;
  for (const f of w.food) {
    const b = t.biomeAt(f.x, f.z);
    food[b]++;
    assert.equal(f.type, b === BIOME.forest ? 'fruit' : b === BIOME.lake ? 'water' : 'plant');
  }
  const dens = (b) => food[b] / cells[b];
  assert.ok(dens(BIOME.forest) > 2 * dens(BIOME.desert), `forest ${dens(BIOME.forest)} desert ${dens(BIOME.desert)}`);
});

test('spawns avoid lakes', () => {
  const w = new World({ seed: 1, respawnMin: 0 });
  assert.ok(w.creatures.length > 0);
  for (const c of w.creatures) assert.notEqual(w.terrain.biomeAt(c.x, c.z), BIOME.lake);
});

test('temperature colder on mountains', () => {
  const w = new World(T), t = w.terrain;
  const avg = (id) => { let s = 0, n = 0; for (let k = 0; k < t.n * t.n; k++) if (t.biome[k] === id) { s += w.temperatureAt((k % t.n) * t.res, Math.floor(k / t.n) * t.res); n++; } return s / n; };
  assert.ok(avg(BIOME.mountain) < avg(BIOME.plains) - 0.2);
});
