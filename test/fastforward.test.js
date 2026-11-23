import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { runUntil } from '../src/sim/fastforward.js';

const W = (o = {}) => new World({ seed: 2, worldSize: 100, initialCreatures: 40, ...o });
const clock = () => { let t = 0; return { now: () => t, tick: (ms) => (t += ms) }; };

test('stops after the requested simulated time', () => {
  const w = W(), c = clock();
  const r = runUntil(w, { simMinutes: 0.25 }, { maxSteps: 10000, now: c.now, startReal: 0, startTime: 0 });
  assert.equal(r.reason, 'time');
  assert.ok(Math.abs(w.time - 15) < w.settings.dt + 1e-9);
});

test('returns null when the chunk ends first, and continues on the next call', () => {
  const w = W(), c = clock();
  assert.equal(runUntil(w, { simMinutes: 1 }, { maxSteps: 50, now: c.now, startReal: 0, startTime: 0 }), null);
  assert.ok(Math.abs(w.time - 50 * w.settings.dt) < 1e-9);
});

test('population below / above', () => {
  const w = W({ respawnMin: 0 }), c = clock();
  for (const k of w.creatures.slice(5)) w.killCreature(k.id);
  assert.equal(runUntil(w, { popBelow: 10 }, { maxSteps: 10, now: c.now, startReal: 0, startTime: 0 }).reason, 'population');
  const v = W(), c2 = clock();
  assert.equal(runUntil(v, { popAbove: 20 }, { maxSteps: 10, now: c2.now, startReal: 0, startTime: 0 }).reason, 'population');
});

test('checkpoint of a chosen kind, with its title as detail', () => {
  const w = W(), c = clock(), log = [];
  w.emit({ type: 'checkpoint', checkpoint: { kind: 'body-shift', title: 'Species 2: legs 3 → 4' } });
  w.emit({ type: 'checkpoint', checkpoint: { kind: 'first', title: 'First carnivores evolved' } });
  const r = runUntil(w, { checkpoint: 'carnivores' }, { maxSteps: 50, now: c.now, startReal: 0, startTime: 0, log });
  assert.deepEqual(log.slice(0, 2), ['Species 2: legs 3 → 4', 'First carnivores evolved']);
  assert.equal(r && r.reason, 'checkpoint');
  assert.match(r.detail, /carnivore/i);
});

test('trait threshold on the population average', () => {
  const w = W(), c = clock();
  const r = runUntil(w, { trait: { key: 'eyes', op: '>=', value: 0 } }, { maxSteps: 100, now: c.now, startReal: 0, startTime: 0 });
  assert.equal(r.reason, 'trait');
});

test('wall-clock safety stop', () => {
  const w = W(), c = clock();
  const now = () => c.tick(1000); // every query advances 1 s of real time
  assert.equal(runUntil(w, { realMinutes: 0.05 }, { maxSteps: 100000, now, startReal: 0, startTime: 0 }).reason, 'wallclock');
});

test('step size multiplies dt during the run and is restored afterwards', () => {
  const w = W(), c = clock(), dt = w.settings.dt;
  runUntil(w, { simMinutes: 0.1, stepScale: 4 }, { maxSteps: 1000, now: c.now, startReal: 0, startTime: 0 });
  assert.equal(w.settings.dt, dt);
  assert.ok(w.time >= 6 - 1e-9 && w.stepCount <= 6 / (4 * dt) + 1);
});

test('×1 fast-forward is identical to normal stepping', () => {
  const a = W(), b = W(), c = clock();
  for (let i = 0; i < 300; i++) a.step();
  runUntil(b, { simMinutes: 300 * b.settings.dt / 60 }, { maxSteps: 10000, now: c.now, startReal: 0, startTime: 0 });
  assert.deepEqual(b.creatures.map((k) => [k.x, k.z]), a.creatures.map((k) => [k.x, k.z]));
});
