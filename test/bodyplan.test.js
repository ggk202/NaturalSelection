import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { TEMPLATES, expandBody, mutateBodyPlan, cloneBodyPlan, bodyPlanDistance, randomBodyPlan, summarizeBody } from '../src/sim/bodyplan.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('templates expand: worm chain, quadruped 4 legs, biped 2 legs', () => {
  assert.equal(expandBody(TEMPLATES.worm()).length, 5); // head + 1 + 3 recursive segments
  assert.ok(summarizeBody(TEMPLATES.worm()).length > 3.5, 'worm is a straight chain, not folded');
  const q = expandBody(TEMPLATES.quadruped());
  assert.equal(q.length, 1 + 1 + 4);
  assert.equal(q.filter((p) => p.node === 2).length, 4);
  assert.equal(expandBody(TEMPLATES.biped()).filter((p) => p.node === 1).length, 2);
});

test('symmetric limbs are mirror images across the z plane', () => {
  const legs = expandBody(TEMPLATES.biped()).filter((p) => p.node === 1);
  const [a, b] = legs;
  assert.ok(close(a.pos[0], b.pos[0]) && close(a.pos[1], b.pos[1]) && close(a.pos[2], -b.pos[2]));
  assert.ok(a.mirror !== b.mirror);
});

test('parts hang off real parents and joints are in range', () => {
  for (const name of Object.keys(TEMPLATES)) {
    const parts = expandBody(TEMPLATES[name]());
    parts.forEach((p, i) => {
      assert.equal(p.index, i);
      if (i === 0) { assert.equal(p.parent, -1); return; }
      assert.ok(p.parent >= 0 && p.parent < i);
      assert.ok(p.joint.lo <= 0 && p.joint.hi >= 0 && Math.abs(Math.hypot(...p.joint.axis) - 1) < 1e-6);
    });
  }
});

test('legs of the quadruped point down from the torso', () => {
  const legs = expandBody(TEMPLATES.quadruped()).filter((p) => p.node === 2);
  for (const l of legs) assert.ok(l.pos[1] < -0.2, `leg y ${l.pos[1]}`);
});

test('maxParts caps deep recursion', () => {
  const p = TEMPLATES.worm(); p.nodes[1].edges[0].recur = 4;
  p.nodes[1].edges.push({ ...p.nodes[1].edges[0], face: 4, symmetric: true, recur: 4 });
  assert.equal(expandBody(p, 24).length, 24);
  assert.ok(expandBody(p, 10).length <= 10);
});

test('degenerate plans: a lone segment', () => {
  assert.equal(expandBody({ nodes: [{ size: [1, 1, 1], covering: 'none', eyes: 0, eyeSize: 0.5, mouth: 0, antennae: 0, gripper: false, edges: [] }] }).length, 1);
});

test('mutation is deterministic, does not alter input, and keeps sizes bounded', () => {
  const base = TEMPLATES.quadruped(), snap = JSON.stringify(base);
  const a = mutateBodyPlan(base, 0.5, createRng(3)), b = mutateBodyPlan(base, 0.5, createRng(3));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(base), snap);
  let p = base; const r = createRng(4);
  for (let i = 0; i < 300; i++) p = mutateBodyPlan(p, 0.3, r);
  for (const part of expandBody(p)) for (const s of part.size) assert.ok(s >= 0.15 && s <= 2.5 + 1e-9);
});

test('distance zero to self, positive between templates', () => {
  const q = TEMPLATES.quadruped();
  assert.equal(bodyPlanDistance(q, cloneBodyPlan(q)), 0);
  assert.ok(bodyPlanDistance(q, TEMPLATES.worm()) > 0.02);
});

test('random plans come from the templates; summaries count limbs', () => {
  const r = createRng(5);
  for (let i = 0; i < 30; i++) assert.ok(expandBody(randomBodyPlan(r)).length >= 3);
  assert.equal(summarizeBody(TEMPLATES.quadruped()).limbs, 4);
});
