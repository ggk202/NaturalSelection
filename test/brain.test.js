import { test } from 'node:test';
import assert from 'node:assert/strict';
import { think, INPUTS, OUTPUTS, BRAIN_WEIGHT_COUNT } from '../src/sim/brain.js';
import { createRng } from '../src/sim/rng.js';

const io = () => [new Float32Array(INPUTS.length), new Float32Array(OUTPUTS.length)];

test('weight count is 188', () => assert.equal(BRAIN_WEIGHT_COUNT, 188));

test('zero weights give neutral output', () => {
  const [i, o] = io(); i.fill(0.7);
  think(new Float32Array(BRAIN_WEIGHT_COUNT), i, o);
  assert.equal(o[0], 0);
  for (let k = 1; k < 4; k++) assert.equal(o[k], 0.5);
});

test('deterministic and in range', () => {
  const r = createRng(5);
  for (let n = 0; n < 100; n++) {
    const w = Float32Array.from({ length: BRAIN_WEIGHT_COUNT }, () => r.gauss() * 3);
    const [i, o] = io(); i.forEach((_, k) => (i[k] = r.range(-1, 1)));
    const a = [...think(w, i, o)], b = [...think(w, i, o)];
    assert.deepEqual(a, b);
    assert.ok(a[0] >= -1 && a[0] <= 1);
    for (let k = 1; k < 4; k++) assert.ok(a[k] >= 0 && a[k] <= 1);
  }
});

test('no allocation: returns out', () => {
  const [i, o] = io();
  assert.equal(think(new Float32Array(BRAIN_WEIGHT_COUNT), i, o), o);
});
