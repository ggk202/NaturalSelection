import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrain, mutateBrain, newState, runBrain, learn, initWeights, N_IN, N_OUT } from '../src/sim/neat.js';
import { createRng } from '../src/sim/rng.js';

function oneLink(p, lr = 0.2, w = 0.5) {
  const b = createBrain(createRng(1), 0);
  b.lr = lr;
  b.conns = [{ from: 0, to: N_IN + 1, w, on: true, p }];
  return b;
}
function trial(b, reward, steps = 10) {
  const s = newState(b), pre = newState(b), wts = initWeights(b), i = new Float32Array(N_IN), o = new Float32Array(N_OUT);
  i[0] = 1;
  for (let t = 0; t < steps; t++) { runBrain(b, s, i, o, wts, pre); learn(b, pre, s, wts, reward); }
  return wts[0];
}

test('founders carry learning genes', () => {
  const b = createBrain(createRng(2));
  assert.ok(b.lr >= 0 && b.lr <= 0.3);
  for (const c of b.conns) assert.equal(c.p, 0);
});

test('reward strengthens a plastic co-active link; punishment weakens it', () => {
  assert.ok(trial(oneLink(1), 1) > 0.5);
  assert.ok(trial(oneLink(1), -1) < 0.5);
});

test('plasticity 0 or lr 0 never changes a weight', () => {
  assert.equal(trial(oneLink(0), 1), 0.5);
  assert.equal(trial(oneLink(1, 0), 1), 0.5);
});

test('weights stay clamped to ±4', () => {
  assert.ok(trial(oneLink(1, 0.3), 1, 5000) <= 4);
  assert.ok(trial(oneLink(-1, 0.3), 1, 5000) >= -4);
});

test('working weights do not touch the genome', () => {
  const b = oneLink(1);
  trial(b, 1);
  assert.equal(b.conns[0].w, 0.5);
});

test('mutation evolves lr and plasticity within bounds', () => {
  const r = createRng(3);
  let b = createBrain(r); let id = 2000;
  for (let k = 0; k < 300; k++) b = mutateBrain(b, 0.5, r, () => id++);
  assert.ok(b.lr >= 0 && b.lr <= 0.3);
  assert.ok(b.conns.some((c) => c.p !== 0));
  for (const c of b.conns) assert.ok(c.p >= -1 && c.p <= 1);
});
