import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { periodicNoise } from '../src/sim/noise.js';
import { createTerrain } from '../src/sim/terrain.js';
import { BIOMES, BIOME } from '../src/sim/biomes.js';

test('noise tiles and stays in [0,1]', () => {
  const f = periodicNoise(createRng(1), 8, 4);
  for (let v = 0; v < 8; v += 0.37) {
    assert.ok(Math.abs(f(0, v) - f(8, v)) < 1e-9);
    assert.ok(Math.abs(f(v, 0) - f(v, 8)) < 1e-9);
    const x = f(v * 1.3, v);
    assert.ok(x >= 0 && x <= 1, `${x}`);
  }
});

test('deterministic', () => {
  const a = createTerrain({ seed: 5, worldSize: 100, waterLevel: 0.32 });
  const b = createTerrain({ seed: 5, worldSize: 100, waterLevel: 0.32 });
  assert.deepEqual([...a.height], [...b.height]);
  assert.deepEqual([...a.biome], [...b.biome]);
});

test('lookups valid for any world size', () => {
  for (const W of [60, 100, 200, 300]) {
    const t = createTerrain({ seed: 2, worldSize: W, waterLevel: 0.32 });
    for (const [x, z] of [[0, 0], [-0.001, 5], [W, W], [W + 5, -3], [W / 2, W / 3]]) {
      assert.ok(Number.isFinite(t.heightAt(x, z)));
      assert.ok(Number.isFinite(t.tempAt(x, z)));
      assert.ok(Number.isFinite(t.slopeAlong(x, z, 1.2)));
      const b = t.biomeAt(x, z);
      assert.ok(b >= 0 && b <= 5, `biome ${b}`);
    }
  }
});

test('heightAt continuous across the wrap', () => {
  const t = createTerrain({ seed: 3, worldSize: 200, waterLevel: 0.32 });
  for (let z = 0; z < 200; z += 13) assert.ok(Math.abs(t.heightAt(199.99, z) - t.heightAt(0.01, z)) < 0.5);
});

test('biome variety across seeds', () => {
  const union = new Set();
  let deserts = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const t = createTerrain({ seed, worldSize: 200, waterLevel: 0.22 });
    const counts = new Array(6).fill(0);
    for (const b of t.biome) counts[b]++;
    const frac = counts.map((c) => c / t.biome.length);
    const present = frac.filter((f) => f >= 0.02).length;
    console.log(`# seed ${seed}: ` + BIOMES.map((b, i) => `${b.key} ${(frac[i] * 100).toFixed(0)}%`).join(' '));
    assert.ok(present >= 4, `seed ${seed} has ${present} biomes`);
    assert.ok(frac[BIOME.lake] <= 0.35, `seed ${seed} is ${frac[BIOME.lake]} lake`);
    if (frac[BIOME.desert] >= 0.03) deserts++;
    frac.forEach((f, i) => f >= 0.02 && union.add(i));
  }
  assert.equal(union.size, 6);
  assert.ok(deserts >= 4, `only ${deserts} seeds have desert`);
});

test('lake cells are below water level', () => {
  const t = createTerrain({ seed: 4, worldSize: 200, waterLevel: 0.32 });
  for (let i = 0; i < t.biome.length; i++) if (t.biome[i] === BIOME.lake) assert.ok(t.height[i] < 0.32 * 12);
});
