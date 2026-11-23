import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { INPUTS } from '../src/sim/brain.js';
import { genome, quiet } from './helpers.js';

const stop = { throttle: -10 };
function duel(attackerBody) {
  const w = new World(quiet);
  const a = w.spawn(genome(attackerBody, { ...stop, attack: 10 }), 50, 50);
  const p = w.spawn(genome({ size: 0.5, diet: 0 }, stop), 50.3, 50);
  return { w, a, p };
}

test('carnivore kills weaker prey', () => {
  const { w, a, p } = duel({ diet: 1, mouth: 1.5, size: 1.5 });
  const e0 = a.energy;
  for (let i = 0; i < 100 && p.alive; i++) w.step();
  assert.equal(p.alive, false);
  assert.ok(a.energy > e0 + 0.5, `gain ${a.energy - e0}`);
  assert.ok(w.events.some((e) => e.type === 'kill' && e.killerId === a.id && e.victimId === p.id));
  assert.ok(w.events.some((e) => e.type === 'death' && e.id === p.id && e.cause === 'killed'));
  assert.ok(a.actionCounters.attacked > 0);
});

test('herbivore gains little from kill', () => {
  const { w, a, p } = duel({ diet: 0.1, mouth: 1.5, size: 2 });
  const e0 = a.energy;
  for (let i = 0; i < 200 && p.alive; i++) w.step();
  assert.equal(p.alive, false);
  assert.ok(a.energy - e0 < 0.3, `gain ${a.energy - e0}`);
});

test('prey senses threat, predator senses prey', () => {
  const w = new World(quiet);
  const prey = w.spawn(genome({ size: 0.5, diet: 0, eyes: 6 }), 50, 50);
  const pred = w.spawn(genome({ diet: 1, mouth: 1.5, size: 1.5, eyes: 6 }), 53, 50);
  prey.heading = 0; pred.heading = Math.PI;
  const inp = new Float32Array(INPUTS.length);
  w.rebuildGrids();
  w.sense(prey, inp); assert.ok(inp[4] < 1, 'threatDist');
  w.sense(pred, inp); assert.ok(inp[2] < 1, 'preyDist');
});

test('seedPredators works when extinct', () => {
  const w = new World(quiet);
  w.seedPredators(5);
  assert.equal(w.creatures.length, 5);
  for (const c of w.creatures) assert.ok(c.genome.body.diet >= 0.9 && c.stats.digestMeat >= 0.9);
});
