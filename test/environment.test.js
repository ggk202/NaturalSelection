import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { INPUTS } from '../src/sim/brain.js';
import { genome, quiet } from './helpers.js';

const OFF = { seasons: false, temperature: false, hazards: false };
const still = { throttle: -10 };

function energyAfter(env, x, z, body = {}, steps = 40) {
  const w = new World({ ...quiet, env });
  const c = w.spawn(genome(body, still), x, z);
  for (let i = 0; i < steps; i++) w.step();
  return { w, c, e: c.energy };
}

test('toggles off means no effect', () => {
  const a = energyAfter({ ...OFF, tempAmp: 1, hazardDamage: 2 }, 50, 1).e;
  const b = energyAfter({ ...OFF, tempAmp: 5, hazardDamage: 50, hazardCount: 10 }, 50, 1).e;
  assert.equal(a, b);
});

test('cold hurts uninsulated more', () => {
  const env = { ...OFF, temperature: true };
  const bare = { size: 1, insulation: 0 }, warm = { size: 1, insulation: 1 };
  const lossBare = energyAfter(OFF, 50, 1, bare).e - energyAfter(env, 50, 1, bare).e;
  const lossWarm = energyAfter(OFF, 50, 1, warm).e - energyAfter(env, 50, 1, warm).e;
  assert.ok(lossBare > 0.01, `bare ${lossBare}`);
  assert.ok(lossWarm < lossBare);
});

test('heat hurts insulated', () => {
  const env = { ...OFF, temperature: true }, warm = { size: 1, insulation: 1 };
  assert.ok(energyAfter(env, 50, 50, warm).e < energyAfter(OFF, 50, 50, warm).e); // z=W/2 is the hot equator
});

test('hazard drains energy inside only', () => {
  const w = new World({ ...quiet, env: { ...OFF, hazards: true, hazardCount: 0 } });
  w.addHazard(50, 50, 5);
  const inside = w.spawn(genome({}, still), 50, 50), outside = w.spawn(genome({}, still), 80, 80);
  const i0 = inside.energy, o0 = outside.energy;
  for (let i = 0; i < 20; i++) w.step();
  assert.ok((i0 - inside.energy) - (o0 - outside.energy) > 1.5);
});

test('removeHazard removes it', () => {
  const w = new World({ ...quiet, env: { ...OFF, hazards: true, hazardCount: 0 } });
  const id = w.addHazard(50, 50, 5);
  w.removeHazard(id);
  assert.equal(w.env.hazards.length, 0);
});

test('hazards spawn on reseed when enabled', () => {
  const w = new World({ ...quiet, env: { hazards: true, hazardCount: 3 } });
  assert.equal(w.env.hazards.length, 3);
});

test('food varies by season', () => {
  const w = new World({ ...quiet, env: { seasons: true, seasonLength: 100, foodSeasonAmp: 0.7 } });
  assert.ok(w.env.foodMultiplier(25) > 1.5);
  assert.ok(w.env.foodMultiplier(75) < 0.5);
});

test('senses temperature and hazards', () => {
  const w = new World({ ...quiet, env: { ...OFF, temperature: true, hazards: true, hazardCount: 0 } });
  w.addHazard(53, 1, 1);
  const c = w.spawn(genome({ eyes: 4 }), 50, 1);
  const inp = new Float32Array(INPUTS.length);
  w.rebuildGrids(); w.sense(c, inp);
  assert.ok(inp[9] < -0.5, `temp ${inp[9]}`);
  assert.ok(inp[10] < 1, `hazard ${inp[10]}`);
});
