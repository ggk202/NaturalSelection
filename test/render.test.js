import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCreatureRenderer } from '../src/render/creatures.js';
import { World } from '../src/sim/world.js';

test('instance counts never exceed buffer capacity', () => {
  const w = new World({ initialCreatures: 5 });
  const r = createCreatureRenderer({ add() {} }, 2, () => 0);
  r.update(w.creatures, 0);
  assert.equal(r.bodyMesh.count, 2);
  assert.ok(r.bodyMesh.count <= r.bodyMesh.instanceMatrix.count);
});
