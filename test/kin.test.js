import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { randomGenome, cloneGenome, relatedness, mutate } from '../src/sim/genome.js';
import { intelligence, createBrain, mutateBrain, INPUT_NAMES, N_IN } from '../src/sim/neat.js';
import { World } from '../src/sim/world.js';
import { genome, quiet } from './helpers.js';

test('relatedness: clones 1, mutants high, strangers low', () => {
  const r = createRng(1), g = randomGenome(r);
  assert.equal(relatedness(g, cloneGenome(g)), 1);
  assert.ok(relatedness(g, mutate(g, 0.08, r)) > 0.6);
  let low = 0;
  for (let i = 0; i < 50; i++) low += relatedness(g, randomGenome(r));
  assert.ok(low / 50 < 0.3, `${low / 50}`);
});

test('intelligence grows with structure, learning and map reading', () => {
  const r = createRng(2);
  const b = createBrain(r, 0); b.lr = 0; // empty: random links could already read the map
  const i0 = intelligence(b);
  let big = b, id = 3000;
  for (let k = 0; k < 20; k++) big = mutateBrain(big, 0.08, r, () => id++, { addNode: 1, addConn: 1 });
  assert.ok(intelligence(big) > i0);
  assert.ok(intelligence({ ...b, lr: 0.2 }) > i0);
  const reads = { ...b, conns: [...b.conns, { from: INPUT_NAMES.indexOf('mapFoodAhead'), to: N_IN, w: 1, on: true, p: 0 }] };
  assert.ok(intelligence(reads) > i0 + 2);
});

test('kinNear is high for a clone in view, low for a stranger', () => {
  const kin = (other) => {
    const w = new World(quiet);
    const g = genome({ eyes: 2 });
    const c = w.spawn(g, 50, 50); c.heading = 0;
    w.spawn(other(g), 53, 50);
    w.rebuildGrids();
    const inp = new Float32Array(N_IN); w.sense(c, inp);
    return inp[INPUT_NAMES.indexOf('kinNear')];
  };
  assert.ok(kin((g) => cloneGenome(g)) > 0.9);
  assert.ok(kin(() => randomGenome(createRng(9))) < 0.5);
});
