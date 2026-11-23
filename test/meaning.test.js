import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeciesTracker } from '../src/sim/species.js';
import { genome } from './helpers.js';

const setup = () => {
  const t = new SpeciesTracker();
  const cs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, genome: genome({ size: 0.5, legs: 3, eyes: 0, mouth: 0.2, diet: 0 }), label: 'wanderer' }));
  t.update(cs, 0);
  return { t, cs };
};
const ctx = (threat = false, food = false, kin = false) => ({ threat, food, kin });
const evaluate = (t, cs, time = 5) => t.update(cs, time);

// Callers' everyday life (base rate) and their calls are recorded on a shared step clock.
function live(t, callers, { syll, callCtx, baseCtx, calls = 12, baseSamples = 60 }) {
  let step = 0;
  for (let r = 0; r < calls; r++) {
    for (const c of callers) {
      step += 40; // calls spaced out so each counts as its own event
      t.noteCall(c, syll, callCtx(r), step);
      for (let b = 0; b < baseSamples / calls; b++) t.noteContext(c, baseCtx(b), step + b);
    }
  }
}

test('an alarm call is detected once when several callers call at threats', () => {
  const { t, cs } = setup();
  live(t, cs.slice(0, 6), { syll: 0, callCtx: (r) => ctx(r % 10 !== 0), baseCtx: (b) => ctx(b % 10 === 0) });
  const cps = evaluate(t, cs);
  assert.ok(cps.some((x) => /Species \d+ evolved an alarm call \("ka"\)/.test(x.title)), cps.map((x) => x.title).join('|'));
  assert.ok(cps.some((x) => x.title === 'First alarm call'));
  assert.deepEqual(t.species[0].lexicon.ka, ['alarm']);
  assert.equal(evaluate(t, cs, 10).filter((x) => /alarm/.test(x.title)).length, 0);
});

test('one creature calling a lot is not a word', () => {
  const { t, cs } = setup();
  live(t, cs.slice(0, 1), { syll: 1, callCtx: () => ctx(true), baseCtx: () => ctx(false), calls: 80 });
  assert.equal(evaluate(t, cs).filter((x) => /call/.test(x.title)).length, 0);
});

test('a constant caller standing beside food proves nothing', () => {
  const { t, cs } = setup();
  // These callers have food in view nearly all the time anyway, calling or not.
  live(t, cs.slice(0, 6), { syll: 2, callCtx: () => ctx(false, true), baseCtx: (b) => ctx(false, b % 20 !== 0) });
  for (const c of cs.slice(6)) for (let b = 0; b < 60; b++) t.noteContext(c, ctx(false, false), 10_000 + b); // rest of species: no food
  assert.equal(evaluate(t, cs).filter((x) => /call/.test(x.title)).length, 0);
});

test('rapid repeats by the same caller count once', () => {
  const { t, cs } = setup();
  for (let s = 0; s < 200; s++) t.noteCall(cs[0], 3, ctx(true), s); // one creature, 200 consecutive steps
  assert.ok(t.species[0].sig.calls[3].n <= 6);
});
