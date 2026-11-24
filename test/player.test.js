import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { playerGenome } from '../src/sim/player.js';
import { deriveStats } from '../src/sim/body.js';
import { genome, quiet } from './helpers.js';
import { INPUT_NAMES, N_IN } from '../src/sim/neat.js';

test('customization shapes the body', () => {
  const s = deriveStats(playerGenome({ wings: true, fins: true, grippers: true }).body);
  assert.ok(s.flight > 0 && s.swim > deriveStats(playerGenome({}).body).swim && s.dexterity >= 0.2);
  assert.equal(deriveStats(playerGenome({ template: 'biped', grippers: false }).body).dexterity, 0);
});

test('the player moves and turns from input, never reproduces or ages out', () => {
  const w = new World({ ...quiet, seed: 2 });
  const p = w.spawnPlayer({}, 50, 50);
  assert.equal(w.player, p);
  p.heading = 0;
  w.playerInput.throttle = 1;
  for (let i = 0; i < 20; i++) { p.energy = p.stats.maxEnergy; w.step(); }
  assert.ok(p.x > 50.5, `x ${p.x}`);
  w.playerInput.throttle = 0; w.playerInput.turn = 1;
  const h = p.heading;
  w.step();
  assert.notEqual(p.heading, h);
  p.age = 1000;
  w.step();
  assert.ok(p.alive);
  assert.equal(p.children, 0);
});

test('syllable presses form a word that others hear', () => {
  const w = new World({ ...quiet, seed: 2 });
  const p = w.spawnPlayer({}, 50, 50);
  const g = genome({}, { reproduce: -10 }); g.body.attention = 3;
  const l = w.spawn(g, 52, 50);
  Object.assign(w.playerInput, { newWord: true, speaking: true }); w.playerInput.say.push(2, 3);
  w.step();
  assert.deepEqual(p.word, [2, 3]);
  const inp = new Float32Array(N_IN);
  w.sense(l, inp);
  assert.equal(inp[INPUT_NAMES.indexOf('heard0')], 3 / 4);
  assert.equal(inp[INPUT_NAMES.indexOf('heard1')], 1);
  w.playerInput.speaking = false; // the UI saw a pause
  w.step();
  assert.deepEqual(p.lastWord, [2, 3]);
  assert.deepEqual(p.word, []);
});

test('a physical player is steered directly', () => {
  const w = new World({ ...quiet, seed: 2, locomotion: 'physical', env: { hazards: false, seasons: false, temperature: false } });
  const p = w.spawnPlayer({}, 50, 50);
  for (let i = 0; i < 20; i++) w.step();
  const x0 = p.x, z0 = p.z;
  w.playerInput.throttle = 1;
  for (let i = 0; i < 40; i++) { p.energy = p.stats.maxEnergy; w.step(); }
  assert.ok(Math.hypot(w.delta(x0, p.x), w.delta(z0, p.z)) > 3, 'moved');
  assert.ok(p.upright > 0.7, `upright ${p.upright}`);
});
