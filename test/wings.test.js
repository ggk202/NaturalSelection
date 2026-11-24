import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, mutateBodyPlan, randomBodyPlan, expandBody } from '../src/sim/bodyplan.js';
import { deriveStats } from '../src/sim/body.js';
import { createRng } from '../src/sim/rng.js';
import { World } from '../src/sim/world.js';
import { biasBrain } from './helpers.js';

const plan = (name) => ({ ...TEMPLATES[name](), diet: 0, hue: 0.4, reproThreshold: 0.9 });
const winged = (flag = 'wing') => { const p = plan('quadruped'); p.nodes.push({ size: [1.4, 0.08, 1.2], covering: 'none', eyes: 0, eyeSize: 0.5, mouth: 0, antennae: 0, gripper: false, [flag]: true, edges: [] });
  p.nodes[0].edges.push({ to: 3, face: 4, u: 0, v: 0, yaw: 0, pitch: 0, axis: 'z', lo: -0.8, hi: 0.8, strength: 1, recur: 1, symmetric: true }); return p; };

test('founders have no wings or fins; mutation toggles them', () => {
  const rng = createRng(3);
  for (let i = 0; i < 20; i++) assert.ok(randomBodyPlan(rng).nodes.every((n) => !n.wing && !n.fin));
  let p = plan('quadruped'), wing = false, fin = false;
  for (let i = 0; i < 400 && !(wing && fin); i++) { p = mutateBodyPlan(p, 0.3, rng); wing ||= p.nodes.some((n) => n.wing); fin ||= p.nodes.some((n) => n.fin); }
  assert.ok(wing && fin);
});

test('wing nodes are kept thin', () => {
  const p = winged(); p.nodes[3].size[1] = 1; p.nodes[3].wing = true;
  const m = mutateBodyPlan(p, 0, createRng(1));
  assert.ok(m.nodes[3].size[1] <= 0.2 * m.nodes[3].size[0] + 1e-9);
  assert.equal(m.nodes[3].size[2], 1.2); // width is free
});

test('wings give flight, fins give swim', () => {
  const base = deriveStats(plan('quadruped')), w = deriveStats(winged('wing')), f = deriveStats(winged('fin'));
  assert.equal(base.flight, 0);
  assert.ok(w.flight > 0.5 && w.flies, `flight ${w.flight}`);
  assert.ok(w.upkeep > base.upkeep);
  assert.ok(f.swim >= base.swim + 0.5, `swim ${f.swim} vs ${base.swim}`);
});

test('kinematic flyers cross water at land speed and do not drown', () => {
  const w = new World({ seed: 2, worldSize: 100, initialCreatures: 0, respawnMin: 0, predatorMin: 0, apexMin: 0 });
  const c = w.spawn({ body: winged(), brain: biasBrain({ reproduce: -10 }) }, 50, 50);
  assert.equal(w.terrainSpeed(c), 1);
  assert.equal(w.biomeDrain(c, { id: 3, drain: 5 }), 0);
});

test('a falling wing plate descends slower than a wingless one', () => {
  const P = { seed: 1, worldSize: 100, flat: true, locomotion: 'physical', initialCreatures: 0, foodRate: 0, maxFood: 0, respawnMin: 0, predatorMin: 0, apexMin: 0, env: { hazards: false, seasons: false, temperature: false } };
  const fall = (body) => {
    const w = new World(P), c = w.spawn({ body, brain: biasBrain({ reproduce: -10 }) }, 50, 50);
    for (const h of c.ph.bodies) { const b = w.physics.world.getRigidBody(h), t = b.translation(); b.setTranslation({ x: t.x, y: t.y + 20, z: t.z }, true); }
    for (let i = 0; i < 20; i++) w.step();
    return w.physics.world.getRigidBody(c.ph.bodies[0]).linvel().y;
  };
  const bare = fall(plan('quadruped')), wing = fall(winged());
  assert.ok(wing > bare + 1, `wing vy ${wing} bare vy ${bare}`);
});
