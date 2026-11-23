import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAPIER, createPhysics } from '../src/sim/physics.js';
import { createTerrain } from '../src/sim/terrain.js';

const terrain = createTerrain({ seed: 1, worldSize: 100, waterLevel: 0.22 });

function drop(ph, x, z) {
  const b = ph.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, terrain.heightAt(x, z) + 2, z).setLinearDamping(4).setAngularDamping(4)); // damped: steep slopes would slide it away
  ph.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3), b);
  return b;
}

test('boxes come to rest on the terrain, including the wrapped margin', () => {
  const ph = createPhysics(terrain);
  const spots = [[20, 30], [70, 55], [-8, 40], [108, 12], [50, -6]];
  const bodies = spots.map(([x, z]) => drop(ph, x, z));
  for (let i = 0; i < 300; i++) ph.step(1 / 60);
  bodies.forEach((b, i) => {
    const t = b.translation(), [x, z] = spots[i];
    const ground = terrain.heightAt(t.x, t.z);
    assert.ok(Math.abs(t.y - (ground + 0.3)) < 0.6, `spot ${x},${z}: y ${t.y.toFixed(2)} vs ground ${ground.toFixed(2)}`);
  });
});

test('identical runs give identical results', () => {
  const run = () => { const ph = createPhysics(terrain); const b = drop(ph, 33, 44); b.setLinvel({ x: 3, y: 0, z: 1 }, true); for (let i = 0; i < 200; i++) ph.step(1 / 60); return b.translation(); };
  assert.deepEqual(run(), run());
});

test('snapshot and restore continue identically', () => {
  const ph = createPhysics(terrain); const b = drop(ph, 33, 44); b.setLinvel({ x: 3, y: 0, z: 1 }, true);
  for (let i = 0; i < 100; i++) ph.step(1 / 60);
  const bytes = ph.snapshot();
  const ph2 = createPhysics(terrain, bytes);
  const b2 = ph2.world.getRigidBody(b.handle);
  for (let i = 0; i < 100; i++) { ph.step(1 / 60); ph2.step(1 / 60); }
  assert.deepEqual(b2.translation(), b.translation());
});
