import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { SpeciesTracker } from '../src/sim/species.js';
import { deriveStats } from '../src/sim/body.js';
import { genome, quiet } from './helpers.js';
import { INPUT_NAMES, N_IN } from '../src/sim/neat.js';

const speaker = (w, attention, x = 50, z = 50) => {
  const g = genome({}, { reproduce: -10 }); g.body.attention = attention;
  return w.spawn(g, x, z);
};

test('language I/O and attention gene exist', () => {
  for (const k of ['heard0', 'heard5', 'compassSin', 'compassCos', 'memFoodSin', 'memFoodCos', 'memFoodDist']) assert.ok(INPUT_NAMES.includes(k), k);
  const g = genome(); g.body.attention = 5;
  assert.equal(deriveStats(g.body).attention, 5);
  assert.ok(deriveStats(g.body).upkeep > deriveStats(genome().body).upkeep);
});

test('attention caps word length; a held syllable repeats; silence ends the word', () => {
  const w = new World({ ...quiet, seed: 1 });
  const c = speaker(w, 2);
  for (const s of [0, 1, 2, 3]) w.call(c, 1, s);
  assert.deepEqual(c.word, [0, 1]);
  const d = speaker(w, 3);
  for (let i = 0; i < 25; i++) w.call(d, 1, 2);
  assert.deepEqual(d.word, [2, 2, 2]);
  w.endWord(d);
  assert.deepEqual(d.word, []);
  assert.deepEqual(d.lastWord, [2, 2, 2]);
});

test('listeners hear the last syllables of a word, up to their own attention', () => {
  const w = new World({ ...quiet, seed: 1 });
  const s = speaker(w, 3), l = speaker(w, 2, 52, 50);
  for (const k of [0, 1, 2]) w.call(s, 1, k);
  w.calls = w.newCalls.slice(-1); // one call per step in a real run
  const inp = new Float32Array(N_IN);
  w.sense(l, inp);
  const at = (n) => inp[INPUT_NAMES.indexOf(n)];
  assert.equal(at('heard0'), 2 / 4); // "ru"
  assert.equal(at('heard1'), 3 / 4); // "mi"
  assert.equal(at('heard2'), 0);
});

test('a remembered food place and the compass are sensed', () => {
  const w = new World({ ...quiet, seed: 1 });
  const c = speaker(w, 1);
  c.heading = 0;
  c.map.food[c.map.n * 5 + 8] = 100; // cell (8, 5)
  c.memFood = undefined;
  const inp = new Float32Array(N_IN);
  w.sense(c, inp);
  const at = (n) => inp[INPUT_NAMES.indexOf(n)];
  assert.equal(at('compassCos'), 1);
  assert.ok(at('memFoodDist') < 1);
  assert.equal(w.callContext(c).dir, ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'][(Math.round(Math.atan2(c.memFood.z - 50, c.memFood.x - 50) / (Math.PI / 4)) + 8) % 8]);
});

test('a word used by several speakers for a place enters the lexicon', () => {
  const t = new SpeciesTracker();
  const cs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, genome: genome({ size: 0.5, legs: 3, eyes: 0, mouth: 0.2 }), label: 'wanderer' }));
  t.update(cs, 0);
  const biomes = ['plains', 'forest', 'desert'], dirs = ['north', 'south', 'east', 'west'];
  let step = 0;
  for (let r = 0; r < 8; r++) for (const c of cs.slice(0, 6)) {
    step += 50;
    t.noteWord(c, 'mi-to', { threat: false, food: true, kin: false, biome: 'forest', dir: 'north' }, step);
    for (let b = 0; b < 6; b++) t.noteContext(c, { threat: false, food: b === 0, kin: false, biome: biomes[b % 3], dir: dirs[b % 4] }, step + b);
  }
  const cps = t.update(cs, 5);
  assert.deepEqual(t.species[0].lexicon['mi-to'], ['food', 'forest', 'north']);
  const titles = cps.map((x) => x.title);
  assert.ok(titles.includes('First multi-syllable word') && titles.includes('First word describing a place'), titles.join('|'));
});

test('one speaker repeating a word is not a word', () => {
  const t = new SpeciesTracker();
  const cs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, genome: genome({ size: 0.5, legs: 3, eyes: 0, mouth: 0.2 }), label: 'wanderer' }));
  t.update(cs, 0);
  for (let r = 0; r < 80; r++) { t.noteWord(cs[0], 'ka-ka', { threat: true, food: false, kin: false }, r * 50); t.noteContext(cs[0], { threat: false, food: false, kin: false }, r * 50 + 1); }
  t.update(cs, 5);
  assert.equal(t.species[0].lexicon['ka-ka'], undefined);
});

test('translation: whole words, then syllable by syllable, else unknown', async () => {
  const { translate } = await import('../src/sim/species.js');
  const lex = { 'mi-to': ['food', 'forest'], ka: ['alarm'], ru: ['kin'] };
  assert.equal(translate(lex, [2, 3]), 'food, forest');
  assert.equal(translate(lex, [0, 1]), 'alarm + kin');
  assert.equal(translate(lex, [0, 2]), null);
});
