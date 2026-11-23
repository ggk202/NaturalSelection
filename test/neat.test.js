import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { createBrain, mutateBrain, cloneBrain, brainDistance, brainCost, newState, runBrain, N_IN, N_OUT, RAY_CAP, SCALARS } from '../src/sim/neat.js';

const ids = () => { let n = 1000; return () => n++; };
const io = () => [new Float32Array(N_IN), new Float32Array(N_OUT)];
const hidden = (b) => b.nodes.filter((n) => n.type === 'hid');

test('layout constants', () => {
  assert.equal(N_IN, 3 * RAY_CAP + SCALARS.length);
  assert.equal(N_OUT, 7 + 24); // turn, throttle, attack, reproduce, call, syllA, syllB + 24 joint motors
});

test('founders are minimal', () => {
  const r = createRng(1);
  for (let i = 0; i < 50; i++) {
    const b = createBrain(r);
    assert.equal(hidden(b).length, 0);
    assert.ok(b.conns.length >= 4 && b.conns.length <= 8, `${b.conns.length}`);
    for (const c of b.conns) assert.ok(c.from < N_IN && c.to >= N_IN);
  }
});

test('zero conns gives neutral output', () => {
  const b = createBrain(createRng(1), 0);
  const [i, o] = io(); i.fill(0.8);
  runBrain(b, newState(b), i, o);
  assert.equal(o[0], 0);
  for (let k = 1; k < 4; k++) assert.equal(o[k], 0.5);
});

test('add neuron splits a connection and keeps output near-identical', () => {
  const r = createRng(3), next = ids();
  const b = { nodes: createBrain(r, 0).nodes, conns: [{ from: 0, to: N_IN + 1, w: 1.5, on: true }] };
  let m = b;
  for (let k = 0; k < 200 && hidden(m).length === 0; k++) m = mutateBrain(b, 0.08, createRng(k), next, { addNode: 1, addConn: 0, toggle: 0, removeNode: 0, jitter: 0 });
  assert.equal(hidden(m).length, 1);
  assert.equal(m.conns.find((c) => c.from === 0 && c.to === N_IN + 1).on, false);
  const run = (br) => { const [i, o] = io(); i[0] = 0.3; const s = newState(br); for (let t = 0; t < 30; t++) runBrain(br, s, i, o); return o[1]; };
  assert.ok(Math.abs(run(b) - run(m)) < 0.05, `${run(b)} vs ${run(m)}`);
});

test('remove neuron drops its connections', () => {
  const r = createRng(4), next = ids();
  let b = createBrain(r);
  for (let k = 0; k < 30; k++) b = mutateBrain(b, 0.08, r, next, { addNode: 1, addConn: 1 });
  const before = hidden(b).length;
  const m = mutateBrain(b, 0.08, r, next, { addNode: 0, addConn: 0, toggle: 0, removeNode: 1, jitter: 0 });
  assert.equal(hidden(m).length, before - 1);
  const live = new Set(m.nodes.map((n) => n.id));
  for (const c of m.conns) assert.ok(live.has(c.from) && live.has(c.to));
});

test('activations stay bounded in dense recurrent brains', () => {
  const r = createRng(5), next = ids();
  let b = createBrain(r);
  for (let k = 0; k < 200; k++) b = mutateBrain(b, 0.08, r, next, { addNode: 0.5, addConn: 1 });
  const s = newState(b), [i, o] = io();
  for (let t = 0; t < 10000; t++) { for (let k = 0; k < N_IN; k++) i[k] = r.range(-1, 1); runBrain(b, s, i, o); }
  for (const v of s) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1 + 1e-6);
});

test('memory: a slow self-looping neuron holds a pulse', () => {
  const H = 1000;
  const b = {
    nodes: [...createBrain(createRng(1), 0).nodes, { id: H, type: 'hid', bias: 0, tau: 15 }],
    conns: [{ from: 0, to: H, w: 3, on: true }, { from: H, to: H, w: 2, on: true }, { from: H, to: N_IN + 1, w: 4, on: true }],
  };
  const s = newState(b), [i, o] = io();
  i[0] = 1; for (let t = 0; t < 40; t++) runBrain(b, s, i, o);
  i[0] = 0; for (let t = 0; t < 15; t++) runBrain(b, s, i, o);
  assert.ok(o[1] > 0.8, `throttle still high ${o[1]}`);
});

test('distance zero to self and positive to mutant; cost grows with structure', () => {
  const r = createRng(6), next = ids();
  const b = createBrain(r);
  assert.equal(brainDistance(b, cloneBrain(b)), 0);
  let m = b;
  for (let k = 0; k < 20; k++) m = mutateBrain(m, 0.08, r, next, { addNode: 1, addConn: 1 });
  assert.ok(brainDistance(b, m) > 0);
  assert.ok(brainCost(m) > brainCost(b));
});

test('mutate is deterministic and does not alter input', () => {
  const b = createBrain(createRng(7));
  const snap = JSON.stringify(b);
  const a1 = mutateBrain(b, 0.5, createRng(9), ids()), a2 = mutateBrain(b, 0.5, createRng(9), ids());
  assert.equal(JSON.stringify(a1), JSON.stringify(a2));
  assert.equal(JSON.stringify(b), snap);
});
