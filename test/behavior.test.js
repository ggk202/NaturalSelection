import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelOf } from '../src/sim/behavior.js';

const C = (o) => ({ steps: 400, moved: 0, ate: 0, attacked: 0, fled: 0, idle: 0, ...o });

test('labels from counters', () => {
  assert.equal(labelOf(C({ attacked: 40, moved: 300 })), 'hunter');
  assert.equal(labelOf(C({ fled: 20, moved: 300 })), 'fleer');
  assert.equal(labelOf(C({ ate: 8, moved: 300 })), 'forager');
  assert.equal(labelOf(C({ moved: 300 })), 'wanderer');
  assert.equal(labelOf(C({ idle: 350 })), 'idler');
  assert.equal(labelOf(C({ steps: 0 })), null);
});

test('homebody and patroller labels from movement range', () => {
  assert.equal(labelOf(C({ moved: 300, path: 40, maxDist: 8 })), 'homebody');
  assert.equal(labelOf(C({ moved: 300, path: 120, maxDist: 25 })), 'patroller');
  assert.equal(labelOf(C({ moved: 300, path: 120, maxDist: 80 })), 'wanderer');
});

test('world tracks window path and range', async () => {
  const { World } = await import('../src/sim/world.js');
  const { genome, quiet } = await import('./helpers.js');
  const w = new World(quiet);
  const c = w.spawn(genome({}, { throttle: 10 }), 50, 50); c.heading = 0;
  for (let i = 0; i < 40; i++) w.step();
  assert.ok(c.actionCounters.path > 2 && c.actionCounters.maxDist > 2 && c.actionCounters.maxDist <= c.actionCounters.path + 1e-6);
});
