import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';

test('same seed same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('range bounds', () => {
  const r = createRng(1);
  for (let i = 0; i < 1000; i++) { const v = r.range(2, 5); assert.ok(v >= 2 && v < 5); }
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(r.int(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('gauss stats', () => {
  const r = createRng(3), n = 10000; let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const v = r.gauss(); s += v; s2 += v * v; }
  const mean = s / n, sd = Math.sqrt(s2 / n - mean * mean);
  assert.ok(Math.abs(mean) < 0.05, `mean ${mean}`);
  assert.ok(Math.abs(sd - 1) < 0.05, `sd ${sd}`);
});

test('state roundtrip', () => {
  const r = createRng(9); r.next();
  const s = r.state(); const seq = [r.next(), r.next(), r.next()];
  r.setState(s);
  assert.deepEqual([r.next(), r.next(), r.next()], seq);
});
