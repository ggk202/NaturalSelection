import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { genome, quiet } from './helpers.js';

test('clone copies genome with new id', () => {
  const w = new World(quiet);
  const c = w.spawn(genome({ legs: 5 }), 50, 50);
  const id = w.cloneCreature(c.id);
  const k = w.creatures.find((x) => x.id === id);
  assert.notEqual(id, c.id);
  assert.deepEqual(k.genome.body, c.genome.body);
  assert.notEqual(k.genome, c.genome);
  assert.ok(w.events.some((e) => e.type === 'god' && e.action === 'clone'));
});

test('mutate changes genome and stats', () => {
  const w = new World(quiet);
  const c = w.spawn(genome(), 50, 50);
  const before = JSON.stringify(c.genome.body), s0 = c.stats;
  w.mutateCreature(c.id, 1);
  assert.notEqual(JSON.stringify(c.genome.body), before);
  assert.notEqual(c.stats, s0);
});

test('kill removes', () => {
  const w = new World(quiet);
  const c = w.spawn(genome(), 50, 50);
  w.killCreature(c.id);
  assert.equal(w.creatures.length, 0);
  assert.ok(w.events.some((e) => e.type === 'death' && e.cause === 'god'));
});

test('addFood adds n, even above maxFood up to 2x', () => {
  const w = new World({ ...quiet, maxFood: 10 });
  w.food = [];
  w.addFood(50, 50, 15);
  assert.equal(w.food.length, 15);
  w.addFood(50, 50, 15);
  assert.equal(w.food.length, 20);
});

test('god actions on unknown id are no-ops', () => {
  const w = new World(quiet);
  assert.equal(w.cloneCreature(999), null);
  w.killCreature(999); w.mutateCreature(999);
});
