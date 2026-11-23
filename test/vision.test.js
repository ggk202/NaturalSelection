import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { castRays } from '../src/sim/vision.js';
import { RAY_CAP } from '../src/sim/neat.js';
import { BIOME } from '../src/sim/biomes.js';
import { genome, quiet } from './helpers.js';

const buf = () => new Float32Array(RAY_CAP * 3);
const ch = (out, ray, k) => out[ray * 3 + k]; // k: 0 food, 1 creature, 2 obstacle
const T = { seed: 1, initialCreatures: 0, foodRate: 0, maxFood: 0, respawnMin: 0, predatorMin: 0, env: { hazards: false, seasons: false } };

function interior(w, key) {
  const t = w.terrain, id = BIOME[key];
  for (let j = 0; j < t.n; j++) for (let i = 0; i < t.n; i++) {
    let ok = true;
    for (let dj = -4; dj <= 4 && ok; dj++) for (let di = -4; di <= 4 && ok; di++) ok = t.biome[((j + dj + t.n) % t.n) * t.n + ((i + di + t.n) % t.n)] === id;
    if (ok) return { x: i * t.res, z: j * t.res };
  }
  throw new Error(`no ${key}`);
}

test('food straight ahead lights the centre ray only', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({ eyes: 2, eyeSize: 1 }), 50, 50); c.heading = 0;
  w.food.push({ id: 9, x: 53, z: 50, energy: 3, type: 'plant' });
  w.rebuildGrids();
  const out = buf(); castRays(w, c, 5, out, 0);
  assert.ok(ch(out, 0, 0) > 0.5, `centre ${ch(out, 0, 0)}`); // slot 0 = straight ahead
  for (const r of [1, 2, 3, 4]) assert.equal(ch(out, r, 0), 0);
});

test('prey positive, threat negative', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({ eyes: 2, diet: 1, mouth: 1.5, size: 1.2 }), 50, 50); c.heading = 0;
  w.spawn(genome({ size: 0.5, diet: 0 }), 53, 50);
  w.rebuildGrids();
  const out = buf(); castRays(w, c, 5, out, 0);
  assert.ok(ch(out, 0, 1) > 0.3);
  const w2 = new World(quiet);
  const d = w2.spawn(genome({ eyes: 2, size: 0.5, diet: 0 }), 50, 50); d.heading = 0;
  w2.spawn(genome({ size: 2, diet: 1, mouth: 1.5 }), 53, 50);
  w2.rebuildGrids();
  const o2 = buf(); castRays(w2, d, 5, o2, 0);
  assert.ok(ch(o2, 0, 1) < -0.3);
});

test('forest hides at distance but not up close', () => {
  const w = new World(T), p = interior(w, 'forest');
  const c = w.spawn(genome({ eyes: 6, eyeSize: 1.5 }), p.x, p.z); c.heading = 0;
  w.food.push({ id: 1, x: p.x + 2, z: p.z, energy: 3, type: 'plant' });
  w.rebuildGrids();
  let out = buf(); castRays(w, c, 13, out, 0);
  assert.ok(ch(out, 0, 0) > 0, 'near food visible');
  w.food[0].x = p.x + 14; w.rebuildGrids();
  out = buf(); castRays(w, c, 13, out, 0);
  assert.equal(ch(out, 0, 0), 0, 'far food hidden by trees');
});

test('water is an obstacle for non-swimmers only', () => {
  const w = new World(T), p = interior(w, 'lake');
  const poor = w.spawn(genome({ eyes: 1, digits: 0, legs: 4 }), p.x, p.z), good = w.spawn(genome({ eyes: 1, digits: 5, legs: 1, size: 2.5 }), p.x, p.z); // toes need a leg
  poor.heading = good.heading = 0;
  w.rebuildGrids();
  const a = buf(), b = buf();
  castRays(w, poor, 3, a, 0); castRays(w, good, 3, b, 0);
  assert.ok(ch(a, 1, 2) > 0.5);
  assert.equal(ch(b, 1, 2), 0);
});

test('zero-eye creature gets one ray and a full-length buffer', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({ eyes: 0 }), 50, 50); c.heading = 0;
  w.food.push({ id: 9, x: 52, z: 50, energy: 3, type: 'plant' });
  w.rebuildGrids();
  const out = buf().fill(7); castRays(w, c, 1, out, 0);
  assert.ok(ch(out, 0, 0) > 0);
  for (let k = 3; k < out.length; k++) assert.equal(out[k], 0);
});

test('sees across the world wrap', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({ eyes: 2 }), 99, 50); c.heading = 0;
  w.food.push({ id: 9, x: 1.5, z: 50, energy: 3, type: 'plant' });
  w.rebuildGrids();
  const out = buf(); castRays(w, c, 5, out, 0);
  assert.ok(ch(out, 0, 0) > 0.5);
});

test('ray slots are ordered centre-out, so slot 0 is always straight ahead', () => {
  for (const eyes of [1, 2, 3]) {
    const w = new World(quiet);
    const c = w.spawn(genome({ eyes, eyeSize: 1 }), 50, 50); c.heading = 0;
    w.food.push({ id: 9, x: 53, z: 50, energy: 3, type: 'plant' });
    w.rebuildGrids();
    const out = buf(); castRays(w, c, 1 + 2 * eyes, out, 0);
    assert.ok(ch(out, 0, 0) > 0.5, `eyes ${eyes}: slot 0 sees ahead`);
  }
});

test('no vision beyond the field of view edge', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({ eyes: 1, eyeSize: 1 }), 50, 50); c.heading = 0; // fov 1.3 rad
  const a = 0.85; // beyond fov/2 = 0.65
  w.food.push({ id: 9, x: 50 + 3 * Math.cos(a), z: 50 + 3 * Math.sin(a), energy: 3, type: 'plant' });
  w.rebuildGrids();
  const out = buf(); castRays(w, c, 3, out, 0);
  for (let r = 0; r < 3; r++) assert.equal(ch(out, r, 0), 0);
});
