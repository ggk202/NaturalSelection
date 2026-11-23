import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMap, mapIndex, remember, recall, fade, inheritMap, encodeMap, decodeMap } from '../src/sim/memory.js';

test('indexing wraps around the world', () => {
  const m = createMap(200, 10);
  assert.equal(m.n, 20);
  assert.equal(mapIndex(m, 0, 0), mapIndex(m, 200, 200));
  assert.equal(mapIndex(m, -1, 5), mapIndex(m, 199, 5));
  const odd = createMap(95, 10); // non-multiple sizes still cover the world
  for (const x of [0, 94.9, 95, -0.1]) assert.ok(mapIndex(odd, x, x) >= 0 && mapIndex(odd, x, x) < odd.n * odd.n);
});

test('remember saturates and recall is in [-1,1]', () => {
  const m = createMap(100, 10);
  for (let i = 0; i < 50; i++) remember(m, 15, 15, 'food', 0.5);
  assert.equal(recall(m, 15, 15, 'food'), 1);
  remember(m, 15, 15, 'danger', -3);
  assert.equal(recall(m, 15, 15, 'danger'), -1);
  assert.equal(recall(m, 55, 55, 'food'), 0);
});

test('fade decays to zero', () => {
  const m = createMap(100, 10);
  remember(m, 5, 5, 'food', 1);
  for (let i = 0; i < 200; i++) fade(m);
  assert.equal(recall(m, 5, 5, 'food'), 0);
});

test('inheritMap halves and copies', () => {
  const m = createMap(100, 10);
  remember(m, 5, 5, 'food', 1);
  const k = inheritMap(m);
  assert.ok(Math.abs(recall(k, 5, 5, 'food') - 0.5) < 0.01);
  remember(k, 5, 5, 'food', -1);
  assert.equal(recall(m, 5, 5, 'food'), 1, 'parent unaffected');
});

test('encode/decode roundtrip', () => {
  const m = createMap(100, 10);
  remember(m, 5, 5, 'food', 0.7); remember(m, 95, 15, 'danger', 0.3); remember(m, 45, 45, 'visits', 0.2);
  const d = decodeMap(JSON.parse(JSON.stringify(encodeMap(m))));
  for (const ch of ['food', 'danger', 'visits']) assert.deepEqual([...d[ch]], [...m[ch]]);
});
