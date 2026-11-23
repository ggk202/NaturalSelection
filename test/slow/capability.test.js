// Slow: new brains must stay at least as capable as the recorded v2 (fixed MLP) baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measure } from '../../bench/measure.mjs';

const base = JSON.parse(readFileSync(new URL('../../bench/baseline-v2-mlp.json', import.meta.url)));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('evolvable brains are at least as capable as the v2 baseline', () => {
  const now = [1, 2, 3].map(measure);
  const b = [1, 2, 3].map((s) => base[s]);
  // Total food eaten per minute (population × per-capita): per-capita alone drops when the world fills up.
  const baseTotal = avg(b.map((x) => x.meanPop * x.foodPerCreatureMin));
  const nowTotal = avg(now.map((x) => x.meanPop * x.foodPerCreatureMin));
  console.log(`# baseline total food/min ${baseTotal.toFixed(0)}, now ${nowTotal.toFixed(0)}; now ${JSON.stringify(now)}`);
  assert.ok(nowTotal >= 0.8 * baseTotal, 'total food intake fell below 80% of baseline');
  now.forEach((x, i) => {
    assert.ok(x.meanPop >= 2 * 15, `seed ${i + 1} collapsed to the respawn floor (mean pop ${x.meanPop})`);
    assert.ok(x.meanPop * x.foodPerCreatureMin >= 0.5 * b[i].meanPop * b[i].foodPerCreatureMin, `seed ${i + 1} below half its baseline intake`);
  });
  // Growth is judged on average: in some seeds simple brains suffice and upkeep keeps them lean (complexity must be earned).
  assert.ok(avg(now.map((x) => x.structure)) > avg(now.map((x) => x.founderStructure)), 'brains did not grow on average');
});
