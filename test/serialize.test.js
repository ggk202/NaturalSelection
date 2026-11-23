import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { serializeWorld, deserializeWorld, SCHEMA_VERSION } from '../src/sim/serialize.js';

const sumX = (w) => w.creatures.reduce((s, c) => s + c.x, 0);

test('roundtrip continues identically', () => {
  const a = new World({ seed: 11 });
  for (let i = 0; i < 400; i++) a.step();
  a.seedPredators(3);
  const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))));
  for (let i = 0; i < 400; i++) { a.step(); b.step(); }
  assert.equal(b.creatures.length, a.creatures.length);
  assert.equal(sumX(b), sumX(a));
  assert.equal(b.checkpoints.length, a.checkpoints.length);
  assert.equal(b.stats.series.length, a.stats.series.length);
  assert.equal(b.env.hazards.length, a.env.hazards.length);
});

test('serialized form is plain JSON with schemaVersion', () => {
  const o = serializeWorld(new World({ seed: 1 }));
  assert.equal(o.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(o)), o);
});

test('rejects unknown schemaVersion', () => {
  const o = serializeWorld(new World({ seed: 1 }));
  assert.throws(() => deserializeWorld({ ...o, schemaVersion: 99 }), /schema/);
});
