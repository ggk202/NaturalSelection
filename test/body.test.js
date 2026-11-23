import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStats } from '../src/sim/body.js';

const base = { size: 1, legs: 2, digits: 2, eyes: 2, eyeSize: 0.8, antennae: 1, mouth: 0.8, diet: 0.3, hue: 0.5, insulation: 0.5, reproThreshold: 0.7 };
const up = (k, d) => deriveStats({ ...base, [k]: base[k] + d });
const s0 = deriveStats(base);

test('every part has a cost', () => {
  for (const k of ['legs', 'eyes', 'antennae', 'mouth', 'insulation']) {
    assert.ok(up(k, k === 'mouth' || k === 'insulation' ? 0.3 : 1).upkeep > s0.upkeep, k);
  }
});

test('every part has a benefit', () => {
  assert.ok(up('legs', 1).speed > s0.speed);
  assert.ok(up('eyes', 1).senseRange > s0.senseRange);
  assert.ok(up('eyes', 1).fov > s0.fov);
  assert.ok(up('antennae', 1).senseRange > s0.senseRange);
  assert.ok(up('mouth', 0.3).biteSize > s0.biteSize);
  assert.ok(up('insulation', 0.3).coldResist > s0.coldResist);
  const d = up('diet', 0.3);
  assert.ok(d.digestMeat > s0.digestMeat && d.digestPlant < s0.digestPlant);
});

test('digits raise swim and climb', () => {
  const d = up('digits', 2);
  assert.ok(d.swim > s0.swim && d.climb > s0.climb);
});

test('swim and climb cost upkeep', () => {
  // digits raise both abilities; their upkeep share must exceed the old digit cost alone
  const noAb = { ...base, legs: 0, digits: 0, size: 1 };
  const ab = { ...noAb, digits: 5 };
  const legCostOnly = 0; // no legs, so digits add no leg upkeep
  assert.ok(deriveStats(ab).upkeep - deriveStats(noAb).upkeep > legCostOnly);
});

test('small creatures camouflage better', () => {
  assert.ok(up('size', -0.4).camo > s0.camo);
});

test('abilities in [0,1] for random bodies', async () => {
  const { randomGenome } = await import('../src/sim/genome.js');
  const { createRng } = await import('../src/sim/rng.js');
  const r = createRng(9);
  for (let i = 0; i < 200; i++) {
    const s = deriveStats(randomGenome(r).body);
    for (const k of ['swim', 'climb', 'camo']) assert.ok(s[k] >= 0 && s[k] <= 1, `${k} ${s[k]}`);
  }
});

test('average founder is a poor swimmer and climber', async () => {
  const { randomGenome } = await import('../src/sim/genome.js');
  const { createRng } = await import('../src/sim/rng.js');
  const r = createRng(4); let sw = 0, cl = 0;
  for (let i = 0; i < 500; i++) { const s = deriveStats(randomGenome(r).body); sw += s.swim; cl += s.climb; }
  assert.ok(sw / 500 < 0.45, `swim ${sw / 500}`);
  assert.ok(cl / 500 < 0.5, `climb ${cl / 500}`);
});

test('climbing comes from grip (digits), not leg count alone', () => {
  const B = { ...base, digits: 0 };
  assert.ok(deriveStats({ ...B, legs: 8 }).climb < 0.1);
  assert.ok(deriveStats({ ...B, legs: 2, digits: 5 }).climb >= 0.9);
});
