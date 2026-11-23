import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { INPUTS } from '../src/sim/brain.js';
import { genome, quiet } from './helpers.js';

const sumX = (w) => w.creatures.reduce((s, c) => s + c.x, 0);

test('deterministic', () => {
  const a = new World({ seed: 7 }), b = new World({ seed: 7 });
  for (let i = 0; i < 500; i++) { a.step(); b.step(); }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(sumX(a), sumX(b));
  assert.ok(a.creatures.length > 0);
});

test('starving creature loses energy', () => {
  const w = new World(quiet);
  const c = w.spawn(genome(), 50, 50);
  const e0 = c.energy; w.step();
  assert.ok(c.energy < e0);
});

test('eats food', () => {
  const w = new World(quiet);
  const c = w.spawn(genome(), 50, 50);
  w.food.push({ id: 1, x: 50, z: 50, energy: 3 });
  const e0 = c.energy; w.step();
  assert.equal(w.food.length, 0);
  assert.ok(c.energy > e0 + 2.5);
});

test('reproduces', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({}, { reproduce: 10 }), 50, 50);
  c.energy = c.stats.maxEnergy; w.step();
  assert.equal(w.creatures.length, 2);
  const kid = w.creatures[1];
  assert.equal(kid.parentId, c.id);
  assert.equal(kid.generation, c.generation + 1);
  assert.ok(w.events.some((e) => e.type === 'birth'));
});

test('respects maxCreatures', () => {
  const w = new World({ ...quiet, maxCreatures: 10 });
  w.spawn(genome({}, { reproduce: 10 }), 50, 50);
  for (let i = 0; i < 200; i++) {
    for (const c of w.creatures) c.energy = c.stats.maxEnergy;
    w.step();
    assert.ok(w.creatures.length <= 10);
  }
  assert.equal(w.creatures.length, 10);
});

test('dies when out of energy', () => {
  const w = new World(quiet);
  const c = w.spawn(genome(), 50, 50); c.energy = 0.0001; w.step();
  assert.equal(w.creatures.length, 0);
  assert.ok(w.events.some((e) => e.type === 'death' && e.id === c.id));
});

test('extinction is stable', () => {
  const w = new World({ initialCreatures: 0 });
  for (let i = 0; i < 200; i++) w.step();
  assert.ok(w.food.length <= w.settings.maxFood && w.food.length > 0);
  assert.ok(Math.abs(w.time - 200 * w.settings.dt) < 1e-9);
});

test('senses respect fov', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({ eyes: 0, antennae: 0 }), 50, 50); c.heading = 0;
  const inp = new Float32Array(INPUTS.length);
  w.food.push({ id: 1, x: 48, z: 50, energy: 3 }); // behind (heading 0 = +x)
  w.rebuildGrids(); w.sense(c, inp);
  assert.equal(inp[0], 1);
  w.food[0].x = 52;
  w.rebuildGrids(); w.sense(c, inp);
  assert.ok(inp[0] < 1 && Math.abs(inp[1]) < 0.01);
});

test('wraps around world edges', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({}, { throttle: 10 }), 99.9, 50); c.heading = 0;
  for (let i = 0; i < 10; i++) w.step();
  assert.ok(c.x >= 0 && c.x < 100);
});

test('perf: 400 creatures step time (logged)', () => {
  const w = new World({ initialCreatures: 400, maxCreatures: 400 });
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) w.step();
  console.log(`# avg step ms: ${((performance.now() - t0) / 100).toFixed(2)} (pop ${w.creatures.length})`);
});

test('respawn assist keeps population at respawnMin', () => {
  const w = new World({ ...quiet, respawnMin: 5 });
  w.step();
  assert.equal(w.creatures.length, 5);
});

test('respawn assist off allows extinction', () => {
  const w = new World({ ...quiet, respawnMin: 0 });
  w.step();
  assert.equal(w.creatures.length, 0);
});

test('elite remembers most prolific parents', () => {
  const w = new World({ ...quiet, respawnMin: 0 });
  const c = w.spawn(genome({}, { reproduce: 10 }), 50, 50);
  c.energy = c.stats.maxEnergy; w.step();
  c.energy = 0; w.step();
  assert.equal(w.elite.length, 1);
  assert.equal(w.elite[0].children, 1);
});
