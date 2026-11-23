import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCreatureRenderer } from '../src/render/creatures.js';
import { World } from '../src/sim/world.js';

test('instance counts never exceed buffer capacity', () => {
  const w = new World({ initialCreatures: 40 });
  const r = createCreatureRenderer({ add() {} }, 1, () => 0); // room for one creature's worth of parts
  r.update(w);
  const cap = r.bodyMesh.instanceMatrix.count;
  assert.equal(r.bodyMesh.count, cap, 'filled to capacity, not beyond');
  assert.ok(w.creatures.reduce((a, c) => a + 3, 0) > cap);
});
