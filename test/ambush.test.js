import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { labelOf, emptyCounters } from '../src/sim/behavior.js';
import { newState } from '../src/sim/neat.js';
import { genome, quiet } from './helpers.js';

const hunter = { diet: 1, mouth: 1.5, size: 1.5 };
function setBrain(c, biases) { c.genome = genome(c.genome.body, biases); c.brainState = newState(c.genome.brain); }

function scenario(waitSteps) {
  const w = new World(quiet);
  const a = w.spawn(genome(hunter, { throttle: -10 }), 50, 50);
  const prey = w.spawn(genome({ size: 0.5, diet: 0 }, { throttle: -10 }), 50.5, 50);
  prey.energy = prey.stats.maxEnergy;
  for (let i = 0; i < waitSteps; i++) w.step();
  setBrain(a, { throttle: 10, attack: 10 });
  for (let i = 0; i < 20; i++) w.step();
  return { w, a };
}

test('wait then strike counts as an ambush', () => {
  const { w, a } = scenario(70);
  assert.ok(a.actionCounters.ambushes >= 1);
  assert.ok(w.events.some((e) => e.type === 'ambush' && e.id === a.id));
});

test('attacking without waiting is not an ambush', () => {
  const { a } = scenario(10);
  assert.equal(a.actionCounters.ambushes, 0);
  assert.ok(a.actionCounters.attacked > 0);
});

test('ambusher label outranks hunter', () => {
  assert.equal(labelOf({ ...emptyCounters(), steps: 400, attacked: 40, ambushes: 1 }), 'ambusher');
});

test('first ambush checkpoint', () => {
  const { w } = scenario(70);
  assert.ok(w.checkpoints.some((c) => /first ambush/i.test(c.title)), w.checkpoints.map((c) => c.title).join('|'));
});
