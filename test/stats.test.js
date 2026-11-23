import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatsRecorder } from '../src/sim/stats.js';
import { World } from '../src/sim/world.js';

test('stats downsample keeps ≤2000', () => {
  const s = new StatsRecorder();
  const w = new World({ initialCreatures: 5 });
  for (let i = 0; i < 5000; i++) { w.time = i * 2; s.sample(w); }
  assert.ok(s.series.length <= 2000 && s.series.length >= 1000, `${s.series.length}`);
  assert.ok(s.series.at(-1).t > 9000);
});

test('sample has expected shape', () => {
  const s = new StatsRecorder();
  const w = new World({ initialCreatures: 20 });
  s.sample(w);
  const p = s.series[0];
  assert.equal(p.pop, 20);
  assert.equal(p.herb + p.carn, 20);
  for (const k of ['size', 'legs', 'eyes', 'speed', 'diet']) assert.equal(typeof p.avg[k], 'number');
  assert.equal(typeof p.labels, 'object');
});

test('world runs tracker, stats and labels', () => {
  const w = new World({ seed: 2 });
  for (let i = 0; i < 25 * 20; i++) w.step();
  assert.ok(w.stats.series.length >= 10);
  assert.ok(w.tracker.species.length > 0);
  assert.ok(w.creatures.every((c) => c.speciesId != null || c.age < 5));
  assert.ok(w.creatures.some((c) => c.label));
  assert.ok(Array.isArray(w.checkpoints));
});

test('sample counts creatures per biome', () => {
  const s = new StatsRecorder();
  const w = new World({ seed: 3 });
  s.sample(w);
  const b = s.series[0].biomes;
  assert.equal(Object.values(b).reduce((a, x) => a + x, 0), w.creatures.length);
  for (const k of ['plains', 'forest', 'wetland', 'lake', 'mountain', 'desert']) assert.equal(typeof b[k], 'number');
});
