import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { GENES, randomGenome, mutate, cloneGenome, genomeDistance } from '../src/sim/genome.js';
import { BRAIN_WEIGHT_COUNT } from '../src/sim/brain.js';

test('random genome in range', () => {
  const r = createRng(1);
  for (let i = 0; i < 200; i++) {
    const g = randomGenome(r);
    for (const { key, min, max, int } of GENES) {
      const v = g.body[key];
      assert.ok(v >= min && v <= max, `${key}=${v}`);
      if (int) assert.ok(Number.isInteger(v), key);
    }
    assert.equal(g.brain.length, BRAIN_WEIGHT_COUNT);
  }
});

test('mutate rate 0 is identity', () => {
  const r = createRng(2), g = randomGenome(r);
  const m = mutate(g, 0, r);
  assert.deepEqual(m.body, g.body);
  assert.deepEqual([...m.brain], [...g.brain]);
});

test('mutate does not alter input', () => {
  const r = createRng(3), g = randomGenome(r), copy = cloneGenome(g);
  mutate(g, 1, r);
  assert.deepEqual(g.body, copy.body);
  assert.deepEqual([...g.brain], [...copy.brain]);
});

test('distance zero to self, positive to mutant', () => {
  const r = createRng(4), g = randomGenome(r);
  assert.equal(genomeDistance(g, g), 0);
  assert.ok(genomeDistance(g, mutate(g, 1, r)) > 0);
});
