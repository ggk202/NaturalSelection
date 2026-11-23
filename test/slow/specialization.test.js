// Slow: lake residents should out-swim plains residents; mountain residents should out-climb them.
// todo until creatures can hold home ranges (project 2: memory + learning); runs and reports, never fails the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/sim/world.js';

const mean = (w, key, k) => {
  const cs = w.creatures.filter((c) => w.biomeOf(c).key === key);
  return cs.length >= 5 ? cs.reduce((a, c) => a + c.stats[k], 0) / cs.length : null;
};

for (const seed of [1, 2]) {
  test(`seed ${seed}: biome specialists emerge within 20 sim-minutes`, { todo: "home ranges now form (homebody ~30–40%) but body specialists have not emerged in 20 min" }, () => {
    const w = new World({ seed });
    const samples = { swim: [], climb: [] };
    for (let m = 1; m <= 20; m++) {
      for (let i = 0; i < 1200; i++) { w.step(); w.events.length = 0; }
      if (m <= 12) continue; // measure the last 8 minutes
      const sl = mean(w, 'lake', 'swim'), sp = mean(w, 'plains', 'swim');
      const cm = mean(w, 'mountain', 'climb'), cp = mean(w, 'plains', 'climb');
      if (sl != null && sp != null) samples.swim.push(sl - sp);
      if (cm != null && cp != null) samples.climb.push(cm - cp);
    }
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    console.log(`# seed ${seed}: swim lake−plains ${avg(samples.swim).toFixed(2)} (${samples.swim.length}), climb mountain−plains ${avg(samples.climb).toFixed(2)} (${samples.climb.length})`);
    assert.ok(avg(samples.swim) > 0.15, 'swimmers should concentrate in lakes');
    assert.ok(avg(samples.climb) > 0.1, 'climbers should concentrate in mountains');
  });
}
