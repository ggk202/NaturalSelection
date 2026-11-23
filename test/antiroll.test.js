import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEMPLATES, expandBody, mutateBodyPlan } from '../src/sim/bodyplan.js';
import { N_IN, INPUT_NAMES, OUTPUTS } from '../src/sim/neat.js';
import { createRng } from '../src/sim/rng.js';
import { biasBrain } from './helpers.js';
import { deriveStats } from '../src/sim/body.js';

const P = { seed: 1, worldSize: 100, flat: true, locomotion: 'physical', initialCreatures: 0, foodRate: 0, maxFood: 0, respawnMin: 0, predatorMin: 0, env: { hazards: false, seasons: false, temperature: false } };
const plan = (name) => ({ ...TEMPLATES[name](), diet: 0, hue: 0.4, reproThreshold: 0.9 });
const still = () => biasBrain({ reproduce: -10 });
const bodies = (w, c) => c.ph.bodies.map((h) => w.physics.world.getRigidBody(h));
const spin = (w, c, rate) => { for (const b of bodies(w, c)) b.setAngvel({ x: 0, y: 0, z: rate }, true); };

test('roller detector flags spinning creatures, not still ones', () => {
  const w = new World(P);
  const a = w.spawn({ body: { ...plan('quadruped'), balance: 0 }, brain: still() }, 30, 50), b = w.spawn({ body: plan('quadruped'), brain: still() }, 70, 50); // no reflex fighting the spin
  for (let i = 0; i < 60; i++) { spin(w, a, 8); a.energy = b.energy = 9; w.step(); }
  assert.ok(a.rolling, `spin ${a.spin}`);
  assert.ok(!b.rolling, `spin ${b.spin} upright ${b.upright}`);
  w.time = 0; w.stats.series = [];
  w.stats.sample(w);
  assert.ok(Math.abs(w.stats.series[0].rollers - 0.5) < 1e-9);
});

test("a creature's own parts never collide with each other, but do collide with the ground", () => {
  const w = new World(P);
  const c = w.spawn({ body: plan('quadruped'), brain: still() }, 50, 50);
  const groups = c.ph.bodies.map((h) => w.physics.world.getRigidBody(h).collider(0).collisionGroups());
  const ground = w.physics.heightCollider.collisionGroups();
  const interacts = (g1, g2) => ((g1 >>> 16) & g2) !== 0 && ((g2 >>> 16) & g1) !== 0;
  for (const g of groups) { assert.ok(!interacts(g, groups[0]), 'self'); assert.ok(interacts(g, ground), 'ground'); }
});

test('body speeds are capped', () => {
  const w = new World(P);
  const c = w.spawn({ body: plan('worm'), brain: still() }, 50, 50);
  for (const b of bodies(w, c)) { b.setLinvel({ x: 80, y: 40, z: 0 }, true); b.setAngvel({ x: 0, y: 60, z: 0 }, true); }
  w.step();
  for (const b of bodies(w, c)) { const v = b.linvel(), a = b.angvel(); assert.ok(Math.hypot(v.x, v.y, v.z) <= 12.01 && Math.hypot(a.x, a.y, a.z) <= 10.01); }
});

test('eating needs a steady, upright head', () => {
  const eats = (mess) => {
    const w = new World(P);
    const c = w.spawn({ body: plan('quadruped'), brain: still() }, 50, 50);
    for (let i = 0; i < 30; i++) w.step();
    mess(w, c);
    w.food.push({ id: 999, x: c.x, z: c.z, energy: 4, type: 'plant' });
    w.step();
    return w.food.length === 0;
  };
  assert.ok(eats(() => {}), 'upright and still eats');
  assert.ok(!eats((w, c) => spin(w, c, 9)), 'spinning cannot eat');
  assert.ok(!eats((w, c) => { for (const b of bodies(w, c)) b.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true); }), 'upside-down cannot eat');
});

test('vision blurs while the head spins', () => {
  const w = new World(P);
  const c = w.spawn({ body: plan('quadruped'), brain: still() }, 50, 50);
  for (let i = 0; i < 30; i++) w.step();
  w.food.push({ id: 9, x: c.x + 2 * Math.cos(c.heading), z: c.z + 2 * Math.sin(c.heading), energy: 4, type: 'plant' });
  const inp = new Float32Array(N_IN), sees = () => { w.rebuildGrids(); w.sense(c, inp); let m = 0; for (let r = 0; r < 13; r++) m = Math.max(m, inp[r * 3]); return m; };
  assert.ok(sees() > 0);
  c.spin = 8;
  assert.equal(sees(), 0);
});

test('limbs stay anatomical under mutation: organ-free parts are thinner than long', () => {
  let p = plan('quadruped'); const r = createRng(9);
  p.nodes[2].size = [0.56, 0.84, 1.28]; // the plate-limb shape that evolved into rollers
  p = mutateBodyPlan(p, 0, r);
  for (let i = 0; i < 200; i++) p = mutateBodyPlan(p, 0.4, r);
  for (const part of expandBody(p)) {
    if (part.parent < 0 || part.eyes || part.mouth) continue;
    assert.ok(part.size[1] <= 0.6 * part.size[0] + 1e-9 && part.size[2] <= 0.6 * part.size[0] + 1e-9, part.size.join('x'));
  }
});

test('bulky limbs cost more upkeep than slender ones', () => {
  const slim = plan('quadruped'), bulky = plan('quadruped');
  bulky.nodes[2].size = [0.8, 0.45, 0.45];
  assert.ok(deriveStats(bulky).upkeep > deriveStats(slim).upkeep + 0.002);
});

test('founder walkers stand: an idle quadruped and biped stay upright for 10 s', () => {
  for (const name of ['quadruped', 'biped']) {
    const w = new World(P);
    const c = w.spawn({ body: plan(name), brain: still() }, 50, 50);
    let low = 1;
    for (let i = 0; i < 200; i++) { c.energy = 9; w.step(); if (i > 40) low = Math.min(low, c.upright); }
    assert.ok(low > 0.7, `${name} upright fell to ${low.toFixed(2)}`);
  }
});

test('the balance reflex keeps a rhythm-driven biped upright', () => {
  const run = (balance) => {
    const w = new World(P);
    const p = { ...plan('biped'), balance };
    const b = biasBrain({ reproduce: -10 });
    for (let j = 0; j < expandBody(p).length - 1; j++) b.conns.push({ from: INPUT_NAMES.indexOf(j % 2 ? 'osc1c' : 'osc1s'), to: N_IN + OUTPUTS.indexOf(`j${j}`), w: 3, on: true, p: 0 });
    const c = w.spawn({ body: p, brain: b }, 50, 50);
    let low = 1;
    for (let i = 0; i < 400; i++) { c.energy = 9; w.step(); if (i > 40) low = Math.min(low, c.upright); }
    return low;
  };
  const without = run(0), withReflex = run(0.8);
  assert.ok(withReflex > 0.7, `balanced biped upright fell to ${withReflex.toFixed(2)}`);
  assert.ok(withReflex > without, `reflex ${withReflex.toFixed(2)} vs none ${without.toFixed(2)}`);
});

test('balance is a gene with an energy cost', async () => {
  const { randomGenome, mutate, traitsOf } = await import('../src/sim/genome.js');
  const r = createRng(3);
  for (let i = 0; i < 50; i++) { const b = randomGenome(r).body.balance; assert.ok(b >= 0.4 && b <= 0.8, `${b}`); }
  const lo = { ...plan('quadruped'), balance: 0 }, hi = { ...plan('quadruped'), balance: 1 };
  assert.ok(deriveStats(hi).upkeep > deriveStats(lo).upkeep + 0.01);
  assert.equal(deriveStats(hi).balance, 1);
  let g = { body: hi, brain: biasBrain() };
  for (let i = 0; i < 200; i++) g = mutate(g, 0.5, r);
  assert.ok(traitsOf(g).balance >= 0 && traitsOf(g).balance <= 1);
});
