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
