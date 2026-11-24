import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';

const carnivores = (w) => w.creatures.filter((c) => c.genome.body.diet > 0.5).length;

test('bite feeding: attacker gains energy from damage before the kill', async () => {
  const { genome, quiet } = await import('./helpers.js');
  const w = new World(quiet);
  const a = w.spawn(genome({ diet: 1, mouth: 1.5, size: 1.5 }, { throttle: -10, attack: 10 }), 50, 50);
  const p = w.spawn(genome({ size: 2, diet: 0 }, { throttle: -10 }), 50.5, 50);
  p.energy = p.stats.maxEnergy; a.energy = 1;
  w.step();
  assert.ok(p.alive && a.energy > 1, `energy ${a.energy}`);
});

test('seeded predators persist for 4 sim-minutes (predator assist)', () => {
  for (const seed of [1, 2]) {
    const w = new World({ seed });
    for (let i = 0; i < 20 * 60; i++) w.step();
    w.seedPredators(5);
    let min = Infinity;
    for (let i = 0; i < 20 * 240; i++) { w.step(); w.events.length = 0; if (i % 200 === 199) min = Math.min(min, carnivores(w)); }
    assert.ok(min >= 3, `seed ${seed}: carnivores fell to ${min}`);
  }
});

test('predator assist off: none are respawned', () => {
  const w = new World({ seed: 1, predatorMin: 0, apexMin: 0 });
  w.seedPredators(5);
  for (const c of w.creatures) if (c.genome.body.diet > 0.5) w.killCreature(c.id);
  w.step();
  assert.equal(carnivores(w), 0);
});
