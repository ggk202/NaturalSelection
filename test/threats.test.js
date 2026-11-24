import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { newStrain, infect, startDisaster } from '../src/sim/threats.js';
import { deriveStats } from '../src/sim/body.js';
import { genome, quiet } from './helpers.js';
import { INPUT_NAMES, N_IN } from '../src/sim/neat.js';
import { serializeWorld, deserializeWorld } from '../src/sim/serialize.js';
import { traitsOf } from '../src/sim/genome.js';

const Q = { ...quiet, seed: 3, env: { hazards: false, seasons: false, temperature: false, diseases: false, disasters: false } };
const still = (body = {}) => genome(body, { reproduce: -10, throttle: -10 });

test('apex lineage: carnivores with a hunting instinct exist from the start', () => {
  const w = new World({ seed: 1, initialCreatures: 60 });
  w.step();
  const carn = w.creatures.filter((c) => traitsOf(c.genome).diet > 0.5);
  assert.ok(carn.length >= 8, `carnivores ${carn.length}`);
  assert.ok(carn[0].genome.brain.conns.some((k) => k.from === 1), 'centre ray creature channel wired');
});

test('disease spreads by contact, drains, and leaves immunity', () => {
  const w = new World(Q);
  const a = w.spawn(still(), 50, 50), b = w.spawn(still(), 50.5, 50), far = w.spawn(still(), 90, 90);
  const s = newStrain(w); s.contagion = 3; s.duration = 5;
  infect(w, a, s);
  const e = a.energy;
  for (let i = 0; i < 40; i++) w.step();
  assert.ok(a.energy < e);
  assert.ok(b.sick || (b.immune || []).length, 'neighbour caught it');
  assert.ok(!far.sick);
  for (let i = 0; i < 200; i++) { for (const c of w.creatures) c.energy = 5; w.step(); }
  assert.equal(a.sick, null);
  assert.ok(a.immune.length >= 1);
  assert.equal(infect(w, a, s), false, 'immune');
});

test('resistance costs upkeep and is sensed; sick is an input', () => {
  const g = still(); g.body.resistance = 1;
  assert.ok(deriveStats(g.body).upkeep > deriveStats(still().body).upkeep);
  const w = new World(Q), c = w.spawn(still(), 50, 50);
  infect(w, c, newStrain(w));
  const inp = new Float32Array(N_IN);
  w.sense(c, inp);
  assert.equal(inp[INPUT_NAMES.indexOf('sick')], 1);
});

test('outbreaks start on their own and strains mutate', () => {
  const w = new World({ seed: 5, worldSize: 100, initialCreatures: 40, apexMin: 0, env: { disasters: false } });
  for (let i = 0; i < 95 * 20; i++) w.step();
  assert.ok(w.checkpoints.some((c) => c.kind === 'threat' && /Outbreak/.test(c.title)));
  const s = newStrain(w), k = newStrain(w, s);
  assert.equal(k.parent, s.id);
});

test('wildfire grows, burns food and hurts; drought stops a biome food supply', () => {
  const w = new World({ seed: 2, initialCreatures: 0, respawnMin: 0, apexMin: 0, env: { hazards: false, diseases: false, disasters: false } });
  const h = startDisaster(w, 'wildfire');
  assert.ok(h && h.kind === 'wildfire');
  w.food.push(w.makeFood(h.x + 1, h.z));
  const c = w.spawn(still(), h.x, h.z);
  const e = c.energy;
  for (let i = 0; i < 20; i++) w.step();
  assert.ok(h.r > 2);
  assert.ok(c.energy < e - 2, `energy ${e} -> ${c.energy}`);
  assert.ok(!w.food.some((f) => Math.hypot(w.delta(h.x, f.x), w.delta(h.z, f.z)) < 2));
  for (let i = 0; i < 40 * 20; i++) w.step();
  assert.ok(!w.env.hazards.includes(h), 'burnt out');
  const d = startDisaster(w, 'drought');
  w.food = []; const before = new Set();
  for (let i = 0; i < 300; i++) w.spawnOneFood();
  const fresh = w.food.filter((f) => !before.has(f.id));
  assert.ok(fresh.length > 0 && !fresh.some((f) => w.terrain.biomeAt(f.x, f.z) === d.biome));
});

test('save/load continues identically with disease and disasters', () => {
  const a = new World({ seed: 9, worldSize: 120, initialCreatures: 40 });
  for (let i = 0; i < 200; i++) a.step();
  a.outbreak(); a.disaster('wildfire'); a.disaster('drought');
  const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))));
  for (let i = 0; i < 300; i++) { a.step(); b.step(); }
  assert.equal(b.creatures.length, a.creatures.length);
  assert.deepEqual(b.strains, a.strains);
  assert.deepEqual(b.env.hazards, a.env.hazards);
});
