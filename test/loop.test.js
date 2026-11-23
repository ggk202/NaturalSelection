import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStepper } from '../src/loop.js';

test('clamps catch-up steps', () => {
  const s = createStepper();
  assert.ok(s(30, 1, 0.05) <= 8);
  assert.ok(s(0.05, 1, 0.05) <= 8); // backlog dropped, not carried over
  const t = createStepper();
  assert.equal(t(0.05, 1, 0.05), 1);
  assert.ok(createStepper()(30, 4, 0.05) <= 32);
});

test('accumulates fractional frames', () => {
  const s = createStepper();
  let n = 0;
  for (let i = 0; i < 60; i++) n += s(1 / 60, 1, 0.05);
  assert.ok(n >= 19 && n <= 20, `${n}`);
});

test('speed scales steps', () => {
  const s = createStepper();
  let n = 0;
  for (let i = 0; i < 60; i++) n += s(1 / 60, 4, 0.05);
  assert.ok(n >= 79 && n <= 80, `${n}`);
});

test('creature parts: every body part produces geometry', async () => {
  const { placeParts } = await import('../src/render/parts.js');
  const body = { size: 1, legs: 4, digits: 3, eyes: 2, eyeSize: 1, antennae: 2, mouth: 1, diet: 0, hue: 0.3, insulation: 0.5, reproThreshold: 0.7 };
  const parts = placeParts(body);
  const count = (t) => parts.filter((p) => p.type === t).length;
  assert.equal(count('body'), 1);
  assert.equal(count('leg'), 4);
  assert.equal(count('digit'), 12);
  assert.equal(count('eye'), 2);
  assert.equal(count('antenna'), 2);
  assert.equal(count('mouth'), 1);
  for (const p of parts) for (const k of ['position', 'rotation', 'scale']) assert.equal(p[k].length, 3);
});

test('runSteps stops at the time budget', async () => {
  const { runSteps } = await import('../src/loop.js');
  let t = 0, steps = 0;
  const world = { step: () => { steps++; t += 5; } };
  assert.equal(runSteps(world, 64, 12, () => t), 3);
  assert.equal(steps, 3);
  steps = 0;
  assert.equal(runSteps(world, 2, 12, () => t), 2);
});
