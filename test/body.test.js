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
