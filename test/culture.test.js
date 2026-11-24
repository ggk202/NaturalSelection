import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { genome, quiet } from './helpers.js';
import { INPUT_NAMES, N_IN } from '../src/sim/neat.js';

const Q = { ...quiet, seed: 3, env: { hazards: false, seasons: false, temperature: false, diseases: false, disasters: false } };
const still = (body = {}) => genome(body, { reproduce: -10, throttle: -10, attack: -10 });

test('a known word that fits the situation replaces the brain\'s syllables', () => {
  const w = new World(Q);
  const c = w.spawn(still(), 50, 50);
  c.genome.body.attention = 3; c.stats.attention = 3;
  c.vocab = { 23: { t: 0.9, f: 0, k: 0, n: 5 } };
  c.threatNear = true;
  w.call(c, 1, 0); w.call(c, 1, 0); w.call(c, 1, 0);
  assert.deepEqual(c.word, [2, 3]);
  w.endWord(c);
  c.threatNear = false;
  w.call(c, 1, 0);
  assert.deepEqual(c.word, [0], 'no fitting word: the brain speaks');
});

test('children inherit the vocabulary at half strength', () => {
  const w = new World(Q);
  const p = w.spawn(still(), 50, 50);
  p.vocab = { 1: { t: 0.8, f: 0, k: 0, n: 10 } };
  p.energy = p.stats.maxEnergy;
  w.reproduce(p);
  const kid = w.creatures.at(-1);
  assert.equal(kid.vocab[1].t, 0.4);
});

test('the player teaches a word: listeners who see danger learn it, then understand it', () => {
  const w = new World(Q);
  const l = w.spawn(still(), 50, 50); l.heading = 0;
  w.spawn(still({ diet: 1, mouth: 1.5, size: 2 }), 53, 50); // a big hunter in plain view
  const p = w.spawnPlayer({}, 51, 52);
  for (let i = 0; i < 80; i++) {
    if (i % 20 === 0) { w.playerInput.newWord = true; w.playerInput.say.push(0); }
    w.playerInput.speaking = true;
    l.energy = 5; p.energy = p.stats.maxEnergy;
    w.step();
  }
  assert.ok(l.vocab[0] && l.vocab[0].t > 0.6, JSON.stringify(l.vocab));
  const inp = new Float32Array(N_IN);
  w.sense(l, inp);
  assert.ok(inp[INPUT_NAMES.indexOf('heardThreat')] > 0.6);
});
