import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { grab, drop, use, spearBonus, heldOf } from '../src/sim/tools.js';
import { serializeWorld, deserializeWorld } from '../src/sim/serialize.js';
import { genome, quiet } from './helpers.js';
import { deriveStats } from '../src/sim/body.js';
import { INPUT_NAMES, OUTPUTS } from '../src/sim/neat.js';

const hands = (biases = {}) => { const g = genome({}, { reproduce: -10, ...biases }); g.body.nodes[1].gripper = true; return g; };
function setup() {
  const w = new World({ ...quiet, seed: 4 });
  w.objects = [];
  const c = w.spawn(hands(), 50, 50);
  c.heading = 0; c.energy = 5;
  return { w, c };
}
const put = (w, type, x, z, extra = {}) => { const o = { id: w.nextId++, type, x, z, holder: null, ...extra }; w.objects.push(o); w.rebuildGrids(); return o; };
const titles = (w) => w.checkpoints.map((c) => c.title);

test('tool I/O exists', () => {
  for (const k of ['objDist', 'objAngle', 'objType', 'holding', 'nutNear', 'sheltered']) assert.ok(INPUT_NAMES.includes(k), k);
  for (const k of ['grab', 'drop', 'use']) assert.ok(OUTPUTS.includes(k), k);
});

test('grabbing needs grippers', () => {
  const { w, c } = setup();
  put(w, 'stone', 50.5, 50);
  const clumsy = w.spawn(genome({}, { reproduce: -10 }), 50, 50.3);
  assert.equal(grab(w, clumsy), false);
  assert.equal(grab(w, c), true);
  assert.equal(heldOf(w, c).type, 'stone');
});

test('a stone cracks a nut for a big meal', () => {
  const { w, c } = setup();
  put(w, 'stone', 50.5, 50); grab(w, c);
  put(w, 'nut', 50.5, 50);
  const e = c.energy;
  assert.ok(use(w, c));
  assert.ok(c.energy >= e + 5, `${e} -> ${c.energy}`);
  assert.ok(titles(w).includes('First nut cracked with a stone'));
});

test('a thrown stone hurts a creature ahead and lands by it', () => {
  const { w, c } = setup();
  const t = w.spawn(genome({}, { reproduce: -10 }), 55, 50); t.energy = 5;
  put(w, 'stone', 50.5, 50); grab(w, c); w.rebuildGrids();
  assert.ok(use(w, c));
  assert.ok(t.energy < 5);
  assert.equal(c.held, null);
  assert.ok(titles(w).includes('First thrown stone hit'));
});

test('a stick sharpened on a stone is a spear; dropped, it is a trap', () => {
  const { w, c } = setup();
  put(w, 'stick', 50.5, 50); grab(w, c);
  put(w, 'stone', 50.5, 50);
  assert.equal(spearBonus(w, c), 0);
  assert.ok(use(w, c), 'sharpen');
  assert.ok(spearBonus(w, c) > 0);
  drop(w, c);
  const at = [c.x, c.z]; c.x = 90; c.z = 90;
  const v = w.spawn(genome({}, { reproduce: -10 }), 80, 80); v.energy = 3;
  for (let i = 0; i < 70; i++) { v.x = at[0]; v.z = at[1]; c.energy = 5; w.step(); } // walks onto it after it arms
  assert.ok(!v.alive, `victim energy ${v.energy}`);
  assert.ok(titles(w).includes('First trap kill'));
});

test('three placed objects make a shelter that halves damage and cold', () => {
  const { w, c } = setup();
  for (let i = 0; i < 3; i++) { put(w, 'stone', c.x, c.z); assert.ok(grab(w, c)); c.x += 0.6; drop(w, c); }
  assert.ok(titles(w).includes('First shelter built'));
  const inp = new Float32Array(400);
  w.sense(c, inp);
  assert.equal(c.sheltered, true);
});

test('a planted seed grows into a crop that fruits; eating it is a harvest', () => {
  const { w, c } = setup();
  put(w, 'seed', 50.5, 50); grab(w, c); drop(w, c);
  const sprout = w.objects.find((o) => o.type === 'sprout');
  assert.ok(sprout);
  c.x = 90; c.z = 90;
  for (let i = 0; i < 41 * 20; i++) { c.energy = 5; w.step(); }
  assert.equal(sprout.type, 'crop');
  const fruit = w.food.find((f) => f.crop != null);
  assert.ok(fruit);
  c.x = fruit.x; c.z = fruit.z; w.rebuildGrids(); w.eat(c);
  assert.ok(titles(w).includes('First harvest from a planted crop'));
});

test('save/load continues identically with objects in play', () => {
  const a = new World({ seed: 7, worldSize: 120, initialCreatures: 30 });
  for (const c of a.creatures.slice(0, 10)) {
    c.genome = { ...c.genome, body: { ...c.genome.body, nodes: c.genome.body.nodes.map((n) => ({ ...n, gripper: true })) } };
    c.stats = deriveStats(c.genome.body);
  }
  for (let i = 0; i < 300; i++) a.step();
  assert.ok(a.objects.length > 0);
  const h = a.creatures[0]; const o = a.objects.find((x) => x.holder == null && ['stone', 'stick', 'nut'].includes(x.type));
  o.holder = h.id; h.held = o.id;
  const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))));
  for (let i = 0; i < 300; i++) { a.step(); b.step(); }
  assert.equal(b.creatures.length, a.creatures.length);
  assert.deepEqual(b.objects, a.objects);
});
