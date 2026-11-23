import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { N_IN, RAY_CAP } from '../src/sim/neat.js';
const anyRay = (inp, k, f = (v) => v) => { let m = 0; for (let r = 0; r < RAY_CAP; r++) { const v = f(inp[r * 3 + k]); if (v > m) m = v; } return m; };
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
  const inp = new Float32Array(N_IN);
  w.food.push({ id: 1, x: 48, z: 50, energy: 3 }); // behind (heading 0 = +x)
  w.rebuildGrids(); w.sense(c, inp);
  assert.equal(anyRay(inp, 0), 0);
  w.food[0].x = 52;
  w.rebuildGrids(); w.sense(c, inp);
  assert.ok(inp[0] > 0, 'single centre ray sees food ahead');
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

test('default settings are complete and finite', async () => {
  const { DEFAULT_SETTINGS } = await import('../src/sim/world.js');
  for (const k of ['seed', 'worldSize', 'waterLevel', 'initialCreatures', 'maxCreatures', 'foodRate', 'maxFood', 'foodEnergy', 'mutationRate', 'dt', 'predatorMin', 'respawnMin']) {
    assert.ok(Number.isFinite(DEFAULT_SETTINGS[k]), k);
  }
});

test('brain upkeep charged: bigger brains starve faster', async () => {
  const { mutateBrain } = await import('../src/sim/neat.js');
  const { createRng } = await import('../src/sim/rng.js');
  const w = new World(quiet);
  const small = w.spawn(genome({}, { throttle: -10 }), 50, 50);
  let big = genome({}, { throttle: -10 }), r = createRng(3), id = 5000;
  for (let i = 0; i < 40; i++) big = { ...big, brain: mutateBrain(big.brain, 0.08, r, () => id++, { addNode: 1, addConn: 1 }) };
  const b = w.spawn(big, 60, 60);
  const s0 = small.energy, b0 = b.energy;
  for (let i = 0; i < 20; i++) w.step();
  assert.ok(b0 - b.energy > s0 - small.energy, 'big brain costs more');
});

test('children inherit and mutate brains', () => {
  const w = new World({ ...quiet, mutationRate: 0.5 });
  const p = w.spawn(genome({}, { reproduce: 10, throttle: -10 }), 50, 50);
  p.energy = p.stats.maxEnergy; w.step();
  const kid = w.creatures[1];
  assert.ok(kid && kid.genome.brain !== p.genome.brain);
  assert.equal(kid.brainState.length, kid.genome.brain.nodes.length);
});
