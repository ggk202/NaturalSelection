import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeciesTracker } from '../src/sim/species.js';
import { genome } from './helpers.js';

const A = { size: 0.5, legs: 3, eyes: 0, mouth: 0.2, diet: 0 };
const B = { size: 2, legs: 8, eyes: 6, mouth: 1.5, diet: 1, insulation: 0 };
const pop = (body, n, label = 'wanderer') => Array.from({ length: n }, () => ({ genome: genome(body), label }));

test('clustering splits distinct genomes', () => {
  const t = new SpeciesTracker();
  const cs = [...pop(A, 10), ...pop(B, 10)];
  t.update(cs, 0);
  assert.equal(t.species.length, 2);
  assert.notEqual(cs[0].speciesId, cs[15].speciesId);
  assert.equal(cs[0].speciesId, cs[9].speciesId);
});

test('new species checkpoint at 10 members', () => {
  const t = new SpeciesTracker();
  assert.equal(t.update(pop(A, 9), 0).length, 0);
  const cps = t.update(pop(A, 12), 5);
  assert.deepEqual(cps.map((c) => c.kind), ['new-species']);
  assert.ok(cps[0].genome && cps[0].avgBody && cps[0].title);
});

test('body-shift checkpoint fires once', () => {
  const t = new SpeciesTracker();
  const cs = pop(A, 12);
  t.update(cs, 0);
  for (const c of cs) c.genome.body.legs = 4;
  const cps = t.update(cs, 5).filter((c) => c.kind === 'body-shift');
  assert.equal(cps.length, 1);
  assert.match(cps[0].title, /legs 3 → 4/);
  assert.equal(t.update(cs, 10).length, 0);
});

test('first carnivores fires', () => {
  const t = new SpeciesTracker();
  const cs = pop(A, 12);
  t.update(cs, 0);
  for (const c of cs) c.genome.body.diet = 0.8;
  const cps = t.update(cs, 5);
  assert.ok(cps.some((c) => c.kind === 'first' && /carnivore/i.test(c.title)));
  assert.ok(cps.some((c) => c.kind === 'body-shift' && /carnivor/i.test(c.title)));
});

test('behavior-shift checkpoint on dominant label change', () => {
  const t = new SpeciesTracker();
  const cs = pop(A, 12, 'wanderer');
  t.update(cs, 0);
  for (const c of cs) c.label = 'hunter';
  const cps = t.update(cs, 5);
  assert.ok(cps.some((c) => c.kind === 'behavior-shift' && /hunter/.test(c.title)));
});

test('extinct species are dropped', () => {
  const t = new SpeciesTracker();
  t.update(pop(A, 12), 0);
  t.update([], 5);
  assert.equal(t.species.length, 0);
});
