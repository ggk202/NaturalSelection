import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStats, paramsFromPlan, planFromParams } from '../src/sim/body.js';
import { TEMPLATES, expandBody } from '../src/sim/bodyplan.js';

const P = { size: 1.2, legs: 4, digits: 2, eyes: 3, eyeSize: 0.8, antennae: 1, mouth: 0.9, diet: 0.3, hue: 0.4, insulation: 0.7, reproThreshold: 0.6 };

test('legacy params roundtrip through a body plan', () => {
  const back = paramsFromPlan(planFromParams(P));
  for (const k of ['legs', 'digits', 'eyes', 'antennae']) assert.equal(back[k], P[k], k);
  for (const k of ['size', 'eyeSize', 'mouth', 'diet', 'hue', 'reproThreshold']) assert.ok(Math.abs(back[k] - P[k]) < 0.02, `${k} ${back[k]}`);
  assert.ok(back.insulation > 0.5, 'fur covering carries insulation');
});

test('plan stats match the legacy stats for converted bodies', () => {
  const a = deriveStats(P), b = deriveStats(planFromParams(P));
  for (const k of ['speed', 'senseRange', 'attack', 'maxEnergy']) assert.ok(Math.abs(a[k] - b[k]) / a[k] < 0.05, `${k} ${a[k]} vs ${b[k]}`);
});

test('templates have sensible stats', () => {
  for (const name of Object.keys(TEMPLATES)) {
    const s = deriveStats(TEMPLATES[name]());
    assert.ok(s.maxEnergy > 2 && s.upkeep > 0 && s.senseRange > 3 && s.mass > 0, name);
    assert.equal(s.joints, expandBody(TEMPLATES[name]()).length - 1);
  }
});

test('dexterity needs a gripper', () => {
  const q = TEMPLATES.quadruped();
  assert.equal(deriveStats(q).dexterity, 0);
  q.nodes[2].gripper = true;
  assert.ok(deriveStats(q).dexterity > 0.3);
});

test('endurance grows with torso mass; coverings cost and help', () => {
  const small = TEMPLATES.quadruped(), big = TEMPLATES.quadruped();
  big.nodes[0].size = big.nodes[0].size.map((s) => s * 1.5);
  assert.ok(deriveStats(big).endurance > deriveStats(small).endurance);
  const furred = TEMPLATES.quadruped(); furred.nodes[0].covering = 'fur';
  const shelled = TEMPLATES.quadruped(); shelled.nodes[0].covering = 'shell';
  const spiky = TEMPLATES.quadruped(); spiky.nodes[0].covering = 'spikes';
  const base = deriveStats(small);
  assert.ok(deriveStats(furred).coldResist > base.coldResist && deriveStats(furred).upkeep > base.upkeep);
  assert.ok(deriveStats(shelled).defense > base.defense && deriveStats(shelled).mass > base.mass);
  assert.ok(deriveStats(spiky).spikes > 0 && deriveStats(spiky).upkeep > base.upkeep);
});
