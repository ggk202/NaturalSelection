import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEMPLATES, expandBody } from '../src/sim/bodyplan.js';
import { N_IN, INPUT_NAMES, OUTPUTS } from '../src/sim/neat.js';
import { biasBrain } from './helpers.js';
import { serializeWorld, deserializeWorld } from '../src/sim/serialize.js';

const P = { seed: 1, worldSize: 100, flat: true, locomotion: 'physical', initialCreatures: 0, foodRate: 0, maxFood: 0, respawnMin: 0, predatorMin: 0, apexMin: 0, env: { hazards: false, seasons: false, temperature: false } };
const plan = (name) => ({ ...TEMPLATES[name](), diet: 0, hue: 0.4, reproThreshold: 0.9 });
const J = (j) => N_IN + OUTPUTS.indexOf(`j${j}`);

// A crude "rhythm" brain: joint j follows the 1 Hz oscillator a quarter cycle after joint j-1 (a travelling wave).
function rhythmBrain(joints, w = 3) {
  const b = biasBrain({ reproduce: -10 });
  for (let j = 0; j < joints; j++) b.conns.push({ from: INPUT_NAMES.indexOf(j % 2 ? 'osc1c' : 'osc1s'), to: J(j), w: j % 4 < 2 ? w : -w, on: true, p: 0 });
  return b;
}
const travel = (name, brain) => {
  const w = new World(P);
  const c = w.spawn({ body: plan(name), brain }, 50, 50);
  for (let i = 0; i < 40; i++) w.step(); // settle onto the ground first
  const x0 = c.x, z0 = c.z;
  for (let i = 0; i < 600; i++) { c.energy = c.stats.maxEnergy; w.step(); }
  return Math.hypot(w.delta(x0, c.x), w.delta(z0, c.z));
};

test('physics inputs and joint outputs exist', () => {
  for (const k of ['osc0s', 'osc0c', 'osc1s', 'upY', 'pitch', 'roll', 'fwdSpeed', 'stamina', 'joint0', 'touch0']) assert.ok(INPUT_NAMES.includes(k), k);
  assert.ok(OUTPUTS.includes('j0') && OUTPUTS.includes('j23'));
});

test('a physical quadruped is built from its parts and stands on the ground', () => {
  const w = new World(P);
  const c = w.spawn({ body: plan('quadruped'), brain: biasBrain({ reproduce: -10 }) }, 50, 50);
  assert.equal(c.ph.bodies.length, expandBody(c.genome.body).length);
  for (let i = 0; i < 40; i++) w.step();
  const root = w.physics.world.getRigidBody(c.ph.bodies[0]).translation();
  assert.ok(Number.isFinite(root.x + root.y + root.z));
  assert.ok(root.y > w.terrain.heightAt(root.x, root.z), `root y ${root.y}`);
  assert.ok(c.alive);
});

// shortcut: crude oscillator brains only shuffle (≈0.3–1.2 units in 30 s, below the spec's "one body length");
// evolved gaits are measured in the slow suite. Here: rhythm clearly moves a body that would otherwise stay put.
for (const name of ['worm', 'quadruped', 'biped']) {
  test(`a rhythm-driven ${name} moves; an idle one stays put`, () => {
    const joints = expandBody(plan(name)).length - 1;
    const moving = travel(name, rhythmBrain(joints)), idle = travel(name, biasBrain({ reproduce: -10 }));
    assert.ok(idle < 0.5, `${name} drifted ${idle.toFixed(2)} while idle`); // a quadruped settles ~0.4 finding its balance
    assert.ok(moving > idle + 0.25, `${name} moved ${moving.toFixed(2)} (idle ${idle.toFixed(2)})`);
  });
}

test('physical worlds are deterministic', () => {
  const run = () => { const w = new World({ ...P, flat: false, initialCreatures: 8 }); for (let i = 0; i < 80; i++) w.step(); return w.creatures.map((c) => [c.x, c.z]); };
  assert.deepEqual(run(), run());
});

test('save/load continues identically in physical mode', () => {
  const a = new World({ ...P, flat: false, initialCreatures: 8 });
  for (let i = 0; i < 60; i++) a.step();
  const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))));
  for (let i = 0; i < 60; i++) { a.step(); b.step(); }
  assert.deepEqual(b.creatures.map((c) => [c.x, c.z]), a.creatures.map((c) => [c.x, c.z]));
});

test('killing a creature removes its bodies from the physics world', () => {
  const w = new World(P);
  const before = w.physics.world.bodies.len();
  const c = w.spawn({ body: plan('quadruped'), brain: biasBrain() }, 50, 50);
  assert.ok(w.physics.world.bodies.len() > before);
  w.killCreature(c.id);
  assert.equal(w.physics.world.bodies.len(), before);
});

test('crossing the world edge teleports the whole body', () => {
  const w = new World(P);
  const c = w.spawn({ body: plan('worm'), brain: biasBrain({ reproduce: -10 }) }, 98, 50);
  for (const h of c.ph.bodies) w.physics.world.getRigidBody(h).setLinvel({ x: 6, y: 0, z: 0 }, true);
  for (let i = 0; i < 20; i++) w.step();
  const xs = c.ph.bodies.map((h) => w.physics.world.getRigidBody(h).translation().x);
  assert.ok(c.x >= 0 && c.x < 100);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 6, `body spread ${xs.map((x) => x.toFixed(1))}`);
});

test('the mouth eats food it touches', () => {
  const w = new World(P);
  const c = w.spawn({ body: plan('quadruped'), brain: biasBrain({ reproduce: -10 }) }, 50, 50);
  for (let i = 0; i < 20; i++) w.step();
  w.food.push({ id: 999, x: c.x, z: c.z, energy: 4, type: 'plant' });
  w.step();
  assert.equal(w.food.length, 0);
});

test('physical worlds hold 3× the food density (slow movers meet less food)', () => {
  const k = new World({ ...P, maxFood: 100, foodRate: 10 }), p = new World({ ...P, locomotion: 'physical', maxFood: 100, foodRate: 10 });
  const kin = new World({ ...P, locomotion: 'kinematic', maxFood: 100, foodRate: 10 });
  assert.equal(p.foodCap, 3 * kin.foodCap);
  assert.equal(p.foodRateNow, 3 * kin.foodRateNow);
  void k;
});

test('overlapping parts cannot launch a creature (no self-collision, speed caps)', () => {
  const w = new World(P);
  const p = plan('quadruped');
  p.nodes[2].size = [0.6, 0.9, 1.4]; // big plate-like legs that overlap each other, as evolved exploiters had
  const c = w.spawn({ body: p, brain: rhythmBrain(expandBody(p).length - 1) }, 50, 50);
  let maxV = 0, maxLift = 0;
  for (let i = 0; i < 400; i++) {
    c.energy = c.stats.maxEnergy; w.step();
    for (const h of c.ph.bodies) {
      const b = w.physics.world.getRigidBody(h), v = b.linvel(), t = b.translation();
      maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
      maxLift = Math.max(maxLift, t.y - w.terrain.heightAt(t.x, t.z));
    }
  }
  assert.ok(maxV <= 12.01, `max speed ${maxV.toFixed(1)}`);
  assert.ok(maxLift < 3, `lifted ${maxLift.toFixed(1)} above ground`);
  assert.ok(c.speed < 4, `creature speed ${c.speed.toFixed(1)}`);
});
