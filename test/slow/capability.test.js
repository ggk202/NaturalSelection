// Slow: new brains must stay at least as capable as the recorded v2 (fixed MLP) baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measure } from '../../bench/measure.mjs';

const base = JSON.parse(readFileSync(new URL('../../bench/baseline-v2-mlp.json', import.meta.url)));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('2a brains are at least as capable as the v2 baseline', () => {
  const now = [1, 2, 3].map(measure);
  const b = [1, 2, 3].map((s) => base[s]);
  // Total food eaten per minute (population × per-capita): per-capita alone drops when the world fills up.
  const baseTotal = avg(b.map((x) => x.meanPop * x.foodPerCreatureMin));
  const nowTotal = avg(now.map((x) => x.meanPop * x.foodPerCreatureMin));
  console.log(`# baseline total food/min ${baseTotal.toFixed(0)}, now ${nowTotal.toFixed(0)}; now ${JSON.stringify(now)}`);
  assert.ok(nowTotal >= 0.8 * baseTotal, 'total food intake fell below 80% of baseline');
  assert.ok(avg(now.map((x) => x.structure)) > 12, 'brains should grow beyond founder size');
});
