import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { N_IN, newState, initWeights, brainCost, INPUT_NAMES } from '../src/sim/neat.js';
import { recall, remember } from '../src/sim/memory.js';
import { genome, quiet } from './helpers.js';

const id = (name) => INPUT_NAMES.indexOf(name);
const OFF = { seasons: false, temperature: false, hazards: false };

test('map inputs exist', () => {
  for (const k of ['mapFoodAhead', 'mapFoodLeft', 'mapFoodRight', 'mapDangerAhead', 'mapDangerLeft', 'mapDangerRight', 'familiarity']) assert.ok(id(k) >= 0, k);
});

test('taking damage writes danger memory where it happened', () => {
  const w = new World({ ...quiet, env: { ...OFF, hazards: true, hazardCount: 0 } });
  w.addHazard(55, 55, 5); // cell centre (cells are 10 units)
  const c = w.spawn(genome({}, { throttle: -10 }), 55, 55);
  for (let i = 0; i < 10; i++) w.step();
  assert.ok(recall(c.map, 55, 55, 'danger') > 0.2);
  assert.equal(recall(c.map, 80, 80, 'danger'), 0);
});

test('eating writes food memory', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({}, { throttle: -10 }), 55, 55);
  w.food.push({ id: 1, x: 55, z: 55, energy: 3, type: 'plant' });
  w.step();
  assert.ok(recall(c.map, 55, 55, 'food') > 0.2);
});

test('a creature steers away from remembered danger ahead', () => {
  const turnWhen = (danger) => {
    const w = new World(quiet);
    const g = genome({}, { throttle: -10 });
    g.brain.conns.push({ from: id('mapDangerAhead'), to: N_IN + 0, w: 5, on: true, p: 0 });
    const c = w.spawn(g, 50, 50); c.heading = 0;
    if (danger) remember(c.map, 50 + 2 * c.map.cell, 50, 'danger', 1);
    w.step(); w.step();
    return c.heading;
  };
  assert.ok(turnWhen(true) > turnWhen(false) + 0.05);
});

test('children inherit a faded copy of the parent map', () => {
  const w = new World(quiet);
  const p = w.spawn(genome({}, { reproduce: 10, throttle: -10 }), 50, 50);
  remember(p.map, 10, 10, 'food', 1);
  p.energy = p.stats.maxEnergy; w.step();
  const kid = w.creatures[1];
  const v = recall(kid.map, 10, 10, 'food');
  assert.ok(v > 0.3 && v < 0.7, `${v}`);
});

test('reading the map and learning cost energy', () => {
  const g = genome();
  const base = brainCost(g.brain);
  g.brain.conns.push({ from: id('mapFoodAhead'), to: N_IN + 1, w: 1, on: true, p: 0 });
  g.brain.lr = 0.2;
  assert.ok(brainCost(g.brain) > base + 0.0004 + 0.0005);
});

test('learned weights live on the creature and roundtrip', async () => {
  const { serializeWorld, deserializeWorld } = await import('../src/sim/serialize.js');
  const a = new World({ seed: 4 });
  for (let i = 0; i < 300; i++) a.step();
  const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))));
  for (let i = 0; i < 300; i++) { a.step(); b.step(); }
  assert.equal(b.creatures.length, a.creatures.length);
  assert.equal(b.creatures.reduce((s, c) => s + c.x, 0), a.creatures.reduce((s, c) => s + c.x, 0));
  assert.ok(a.creatures.every((c) => c.weights.length === c.genome.brain.conns.length));
});
void newState; void initWeights;
