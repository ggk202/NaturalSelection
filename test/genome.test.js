import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { GENES, randomGenome, mutate, cloneGenome, genomeDistance } from '../src/sim/genome.js';


test('random genome in range', () => {
  const r = createRng(1);
  for (let i = 0; i < 200; i++) {
    const g = randomGenome(r);
    for (const { key, min, max, int } of GENES) {
      const v = g.body[key];
      assert.ok(v >= min && v <= max, `${key}=${v}`);
      if (int) assert.ok(Number.isInteger(v), key);
    }
    assert.ok(g.brain.nodes.length > 0 && g.brain.conns.length > 0);
  }
});

test('mutate rate 0 is identity', () => {
  const r = createRng(2), g = randomGenome(r);
  const m = mutate(g, 0, r);
  assert.deepEqual(m.body, g.body);
  assert.deepEqual(m.brain.conns.map((c) => c.w), g.brain.conns.map((c) => c.w));
});

test('mutate does not alter input', () => {
  const r = createRng(3), g = randomGenome(r), copy = cloneGenome(g);
  mutate(g, 1, r);
  assert.deepEqual(g.body, copy.body);
  assert.equal(JSON.stringify(g.brain), JSON.stringify(copy.brain));
});

test('distance zero to self, positive to mutant', () => {
  const r = createRng(4), g = randomGenome(r);
  assert.equal(genomeDistance(g, g), 0);
  assert.ok(genomeDistance(g, mutate(g, 1, r)) > 0);
});

test('founder brains only wire inputs the creature has, with 4–8 links', async () => {
  const { RAY_CAP, N_IN } = await import('../src/sim/neat.js');
  const r = createRng(11);
  for (let i = 0; i < 200; i++) {
    const g = randomGenome(r), rays = Math.min(RAY_CAP, 1 + 2 * g.body.eyes);
    assert.ok(g.brain.conns.length >= 4 && g.brain.conns.length <= 8);
    for (const c of g.brain.conns) assert.ok(c.from >= RAY_CAP * 3 || Math.floor(c.from / 3) < rays, `link from ray slot ${Math.floor(c.from / 3)} with ${rays} rays`);
    assert.ok(N_IN === RAY_CAP * 3 + 10);
  }
});
