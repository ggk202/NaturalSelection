import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeciesTracker } from '../src/sim/species.js';
import { genome } from './helpers.js';

const setup = () => {
  const t = new SpeciesTracker();
  const cs = Array.from({ length: 12 }, () => ({ genome: genome({ size: 0.5, legs: 3, eyes: 0, mouth: 0.2, diet: 0 }), label: 'wanderer' }));
  t.update(cs, 0);
  return { t, c: cs[0] };
};
const ctx = (threat = false, food = false, kin = false) => ({ threat, food, kin });

test('an alarm call is detected once', () => {
  const { t, c } = setup();
  for (let i = 0; i < 1000; i++) t.noteContext(c, ctx(i % 10 === 0)); // threats 10% of the time
  for (let i = 0; i < 60; i++) t.noteCall(c, 0, ctx(i % 10 !== 0)); // 'ka' with a threat 90%
  const cps = t.update([c, ...Array.from({ length: 11 }, () => c)], 5);
  const alarm = cps.filter((x) => /alarm call/.test(x.title));
  assert.ok(alarm.some((x) => /Species \d+ evolved an alarm call \("ka"\)/.test(x.title)), cps.map((x) => x.title).join('|'));
  assert.ok(cps.some((x) => x.title === 'First alarm call'));
  assert.equal(t.species.find((s) => s.id === c.speciesId).lexicon.ka, 'alarm');
  assert.equal(t.update([c, ...Array.from({ length: 11 }, () => c)], 10).filter((x) => /alarm/.test(x.title)).length, 0);
});

test('fewer than 50 calls never counts as meaning', () => {
  const { t, c } = setup();
  for (let i = 0; i < 1000; i++) t.noteContext(c, ctx(false));
  for (let i = 0; i < 40; i++) t.noteCall(c, 1, ctx(true));
  assert.equal(t.update(Array(12).fill(c), 5).filter((x) => /call/.test(x.title)).length, 0);
});

test('a context at its base rate is not a meaning', () => {
  const { t, c } = setup();
  for (let i = 0; i < 1000; i++) t.noteContext(c, ctx(false, i % 10 < 8)); // food seen 80% anyway
  for (let i = 0; i < 100; i++) t.noteCall(c, 2, ctx(false, i % 10 < 8));
  assert.equal(t.update(Array(12).fill(c), 5).filter((x) => /call/.test(x.title)).length, 0);
});
