import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { N_IN, INPUT_NAMES, OUTPUTS } from '../src/sim/neat.js';
import { cloneGenome } from '../src/sim/genome.js';
import { genome, quiet } from './helpers.js';

const I = (n) => INPUT_NAMES.indexOf(n);
const still = { throttle: -10 };
const caller = (syll = 2, loud = 10) => ({ ...still, call: loud, syllA: syll & 1 ? 10 : -10, syllB: syll & 2 ? 10 : -10 });

test('voice outputs and hearing inputs exist', () => {
  for (const o of ['call', 'syllA', 'syllB']) assert.ok(OUTPUTS.includes(o));
  for (const k of ['hear0', 'hear1', 'hear2', 'hear3', 'hearSin', 'hearCos', 'hearKin']) assert.ok(I(k) >= 0, k);
});

function hearing(listenerAt, listenerBody = {}, callerGenome = null, W = 100) {
  const w = new World({ ...quiet, worldSize: W });
  const g = callerGenome || genome({}, caller(2));
  const a = w.spawn(g, 50, 50);
  const b = w.spawn(genome(listenerBody, still), ...listenerAt);
  b.heading = 0;
  w.step(); // a calls
  w.rebuildGrids();
  const inp = new Float32Array(N_IN); w.sense(b, inp);
  return { inp, w, a, b };
}

test('a near creature hears the syllable next step, with direction', () => {
  const { inp } = hearing([60, 50]); // caller is behind (−x) the listener heading +x
  assert.ok(inp[I('hear2')] > 0.3, `hear2 ${inp[I('hear2')]}`);
  for (const k of [0, 1, 3]) assert.equal(inp[I(`hear${k}`)], 0);
  assert.ok(inp[I('hearCos')] < -0.9, 'from behind');
});

test('not heard out of range; antennae extend range', () => {
  assert.equal(hearing([95, 50], { antennae: 0 }, null, 200).inp[I('hear2')], 0);
  assert.ok(hearing([95, 50], { antennae: 4 }, null, 200).inp[I('hear2')] > 0);
});

test('heard across the world wrap', () => {
  const w = new World(quiet);
  w.spawn(genome({}, caller(1)), 98, 50);
  const b = w.spawn(genome({}, still), 3, 50);
  w.step(); w.rebuildGrids();
  const inp = new Float32Array(N_IN); w.sense(b, inp);
  assert.ok(inp[I('hear1')] > 0.3);
});

test('kin calls are recognised', () => {
  const g = genome({}, caller(0));
  const w = new World(quiet);
  w.spawn(g, 50, 50);
  const b = w.spawn(cloneGenome(g), 55, 50);
  w.step(); w.rebuildGrids();
  const inp = new Float32Array(N_IN); w.sense(b, inp);
  assert.ok(inp[I('hearKin')] > 0.9);
});

test('calling costs energy', () => {
  const w = new World(quiet);
  const loud = w.spawn(genome({}, caller(0)), 30, 30), quietOne = w.spawn(genome({}, still), 70, 70);
  const l0 = loud.energy, q0 = quietOne.energy;
  for (let i = 0; i < 20; i++) w.step();
  assert.ok(l0 - loud.energy > q0 - quietOne.energy + 0.03); // 0.05/s at full loudness
  assert.ok(w.callCounts[0] >= 15); // stats sampling resets the counter at t≈0
});

test('calls from a creature that just died do not crash hearing', () => {
  const { w, a, b } = hearing([60, 50]);
  w.killCreature(a.id);
  w.step();
  assert.ok(b.alive);
});

test('founder brains do not start with a voice', async () => {
  const { createBrain, N_IN } = await import('../src/sim/neat.js');
  const { createRng } = await import('../src/sim/rng.js');
  const r = createRng(5);
  for (let i = 0; i < 100; i++) for (const c of createBrain(r).conns) assert.ok(c.to < N_IN + 4);
});
